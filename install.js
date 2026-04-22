#!/usr/bin/env node

/**
 * install.js — Install tokenizer into Claude Code (global) or adapter into project.
 *
 * Modes:
 *   --global           Install skills + commands + hooks into ~/.claude/
 *   (no flag)          Install per-project adapter rules (auto-detect agents in cwd)
 *   --agent <name>     Install for a specific agent in cwd
 *   --list             List detected agents in cwd
 *   --uninstall        Remove tokenizer (pair with --global for global uninstall)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TOKENIZER_ROOT = __dirname;
const SKILLS = ['tokenizer', 'tokenizer-compress', 'tokenizer-audit', 'tokenizer-fingerprint'];
const COMMANDS = ['tokenizer', 'tokenizer-compress', 'tokenizer-audit', 'tokenizer-fingerprint', 'tokenizer-mcp'];

// ── fs helpers ──

function copyDir(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rmDir(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

// ── global install ──

function forwardSlash(p) {
  return p.replace(/\\/g, '/');
}

function cliPathForCommands() {
  // Used inside command markdown — forward slashes work on win via node.
  return forwardSlash(TOKENIZER_ROOT);
}

function installGlobal() {
  const home = os.homedir();
  const claudeDir = path.join(home, '.claude');
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

  console.log(`Installing tokenizer globally → ${claudeDir}\n`);

  // 1. Skills
  const skillsDst = path.join(claudeDir, 'skills');
  if (!fs.existsSync(skillsDst)) fs.mkdirSync(skillsDst, { recursive: true });
  for (const skill of SKILLS) {
    const src = path.join(TOKENIZER_ROOT, 'skills', skill);
    const dst = path.join(skillsDst, skill);
    if (!fs.existsSync(src)) {
      console.log(`  [SKIP] Skill source missing: ${src}`);
      continue;
    }
    rmDir(dst);
    copyDir(src, dst);
    console.log(`  [OK] Skill → ~/.claude/skills/${skill}/`);
  }

  // 2. Commands (with path substitution)
  const cmdsDst = path.join(claudeDir, 'commands');
  if (!fs.existsSync(cmdsDst)) fs.mkdirSync(cmdsDst, { recursive: true });
  const rootPath = cliPathForCommands();
  for (const cmd of COMMANDS) {
    const src = path.join(TOKENIZER_ROOT, 'commands', `${cmd}.md`);
    const dst = path.join(cmdsDst, `${cmd}.md`);
    if (!fs.existsSync(src)) {
      console.log(`  [SKIP] Command source missing: ${src}`);
      continue;
    }
    const body = fs.readFileSync(src, 'utf8').replace(/\{\{TOKENIZER_ROOT\}\}/g, rootPath);
    fs.writeFileSync(dst, body);
    console.log(`  [OK] Command → ~/.claude/commands/${cmd}.md`);
  }

  // 3. Hooks → settings.json
  const settingsPath = path.join(claudeDir, 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (err) {
      console.log(`  [ERROR] Could not parse settings.json — aborting hook install: ${err.message}`);
      return;
    }
  }
  if (!settings.hooks) settings.hooks = {};

  const activateCmd = `node "${forwardSlash(path.join(TOKENIZER_ROOT, 'hooks', 'tokenizer-activate.js'))}"`;
  const trackerCmd = `node "${forwardSlash(path.join(TOKENIZER_ROOT, 'hooks', 'tokenizer-tracker.js'))}"`;

  ensureHook(settings.hooks, 'SessionStart', activateCmd);
  ensureHook(settings.hooks, 'UserPromptSubmit', trackerCmd);

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(`  [OK] Hooks merged → ~/.claude/settings.json`);

  console.log(`\nDone. Restart Claude Code to load new commands, skills, and hooks.`);
  console.log(`Then try: /tokenizer full   or   /tokenizer-audit   or   /tokenizer-compress --all --dry-run`);
}

function ensureHook(hooks, event, cmd) {
  hooks[event] = hooks[event] || [];
  // Flat format: each entry has {hooks: [{type, command}]}
  for (const entry of hooks[event]) {
    const inner = entry && entry.hooks;
    if (Array.isArray(inner)) {
      for (const h of inner) {
        if (h && h.command === cmd) return; // already installed
      }
    }
    // Legacy flat {command} entries
    if (entry && entry.command === cmd) return;
  }
  hooks[event].push({ hooks: [{ type: 'command', command: cmd }] });
}

function uninstallGlobal() {
  const home = os.homedir();
  const claudeDir = path.join(home, '.claude');
  console.log(`Uninstalling tokenizer globally from ${claudeDir}\n`);

  for (const skill of SKILLS) {
    const dst = path.join(claudeDir, 'skills', skill);
    if (fs.existsSync(dst)) {
      rmDir(dst);
      console.log(`  [OK] Removed skill ${skill}`);
    }
  }
  for (const cmd of COMMANDS) {
    const dst = path.join(claudeDir, 'commands', `${cmd}.md`);
    if (fs.existsSync(dst)) {
      fs.unlinkSync(dst);
      console.log(`  [OK] Removed command ${cmd}.md`);
    }
  }

  const settingsPath = path.join(claudeDir, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.hooks) {
        for (const event of ['SessionStart', 'UserPromptSubmit']) {
          if (!settings.hooks[event]) continue;
          settings.hooks[event] = settings.hooks[event].filter(entry => {
            const inner = entry && entry.hooks;
            if (Array.isArray(inner)) {
              return !inner.some(h => h && typeof h.command === 'string' && h.command.includes('tokenizer'));
            }
            if (entry && typeof entry.command === 'string') {
              return !entry.command.includes('tokenizer');
            }
            return true;
          });
          if (settings.hooks[event].length === 0) delete settings.hooks[event];
        }
        if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
      }
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log(`  [OK] Removed hooks from settings.json`);
    } catch (err) {
      console.log(`  [ERROR] Could not update settings.json: ${err.message}`);
    }
  }
  console.log(`\nDone. Restart Claude Code.`);
}

// ── per-project adapter (legacy) ──

const AGENT_DETECTORS = {
  claude: ['.claude', 'CLAUDE.md'],
  copilot: ['.github/copilot-instructions.md', '.github/copilot'],
};

function detectAgents(projectDir) {
  const detected = [];
  for (const [agent, markers] of Object.entries(AGENT_DETECTORS)) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(projectDir, marker))) {
        detected.push(agent);
        break;
      }
    }
  }
  return detected;
}

function installClaudeProject(projectDir) {
  const rulesDir = path.join(projectDir, '.claude', 'rules');
  if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });
  const src = path.join(TOKENIZER_ROOT, 'adapters', 'claude', 'rules.md');
  const dst = path.join(rulesDir, 'tokenizer.md');
  fs.copyFileSync(src, dst);
  console.log(`  [OK] Installed rules → .claude/rules/tokenizer.md`);
  return true;
}

function installCopilotProject(projectDir) {
  const dst = path.join(projectDir, '.github', 'copilot-instructions.md');
  const snippetPath = path.join(TOKENIZER_ROOT, 'adapters', 'copilot', 'copilot-snippet.txt');
  const snippet = fs.readFileSync(snippetPath, 'utf8');

  if (fs.existsSync(dst)) {
    const existing = fs.readFileSync(dst, 'utf8');
    if (existing.includes('tokenizer: terse output mode')) {
      console.log(`  [SKIP] Already installed in .github/copilot-instructions.md`);
      return true;
    }
    fs.appendFileSync(dst, '\n' + snippet);
    console.log(`  [OK] Appended to .github/copilot-instructions.md`);
  } else {
    const dir = path.dirname(dst);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dst, snippet.trim() + '\n');
    console.log(`  [OK] Created .github/copilot-instructions.md`);
  }
  return true;
}

function installAdapter(agent, projectDir) {
  switch (agent) {
    case 'claude': return installClaudeProject(projectDir);
    case 'copilot': return installCopilotProject(projectDir);
    default:
      console.log(`  [SKIP] No adapter for: ${agent}`);
      return false;
  }
}

// ── CLI ──

function main() {
  const args = process.argv.slice(2);
  const projectDir = process.cwd();

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
tokenizer installer

  node install.js --global            Install skills + commands + hooks into ~/.claude/
  node install.js --global --uninstall  Remove everything installed globally

  node install.js                     Install per-project adapter rules (auto-detect)
  node install.js --agent claude      Install per-project adapter for a specific agent
  node install.js --agent all         All supported adapters (project-local)
  node install.js --list              List detected agents in cwd
  node install.js --uninstall         Remove per-project adapter
    `);
    return;
  }

  if (args.includes('--global')) {
    if (args.includes('--uninstall')) uninstallGlobal();
    else installGlobal();
    return;
  }

  if (args.includes('--list')) {
    const detected = detectAgents(projectDir);
    console.log(`Detected agents in ${projectDir}:`);
    if (detected.length === 0) console.log('  (none detected)');
    else detected.forEach(a => console.log(`  - ${a}`));
    console.log(`\nSupported: ${Object.keys(AGENT_DETECTORS).join(', ')}`);
    return;
  }

  if (args.includes('--uninstall')) {
    console.log(`Uninstalling per-project tokenizer from ${projectDir}...\n`);
    const fp = path.join(projectDir, '.claude/rules/tokenizer.md');
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      console.log(`  [OK] Removed .claude/rules/tokenizer.md`);
    }
    console.log(`  [INFO] Remove copilot snippet manually if present.`);
    return;
  }

  const agentIdx = args.indexOf('--agent');
  let agents;
  if (agentIdx !== -1 && args[agentIdx + 1]) {
    const target = args[agentIdx + 1];
    agents = target === 'all' ? Object.keys(AGENT_DETECTORS) : [target];
  } else {
    agents = detectAgents(projectDir);
    if (agents.length === 0) {
      console.log('No coding agents detected in this directory.');
      console.log('Use --agent <name> or --global to install.');
      return;
    }
  }

  console.log(`Installing tokenizer adapter in ${projectDir}...\n`);
  for (const agent of agents) {
    console.log(`${agent}:`);
    installAdapter(agent, projectDir);
    console.log('');
  }
  console.log('Done.');
}

main();
