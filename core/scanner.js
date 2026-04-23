/**
 * scanner.js — Agent-agnostic config file scanner
 *
 * Detects all known AI coding agent config files + custom instruction
 * directories (agents/, prompts/, rules/, etc.) in a project tree.
 *
 * Usage:
 *   const { scanProject } = require('./scanner');
 *   const results = await scanProject('/path/to/project');
 */

const fs = require('fs');
const path = require('path');

// ─── Known agent file patterns ───────────────────────────────────────────────
// Each entry: { agent, patterns (globs relative to project root), description }

const AGENT_PATTERNS = [
  // ── Claude Code ──
  { agent: 'claude', pattern: 'CLAUDE.md', desc: 'Claude root instructions' },
  { agent: 'claude', pattern: '**/CLAUDE.md', desc: 'Claude scoped instructions', recursive: true },
  { agent: 'claude', pattern: '.claude/settings.json', desc: 'Claude settings' },
  { agent: 'claude', pattern: '.claude/skills/*/SKILL.md', desc: 'Claude skills' },
  { agent: 'claude', pattern: '.claude/rules/*.md', desc: 'Claude rules' },
  { agent: 'claude', pattern: '.claude/projects/*/memory/*.md', desc: 'Claude memory files' },

  // ── Cursor ──
  { agent: 'cursor', pattern: '.cursorrules', desc: 'Cursor rules (legacy)' },
  { agent: 'cursor', pattern: '.cursor/rules/*.md', desc: 'Cursor rules' },
  { agent: 'cursor', pattern: '.cursor/rules/*.mdc', desc: 'Cursor rules (mdc)' },

  // ── Windsurf ──
  { agent: 'windsurf', pattern: '.windsurfrules', desc: 'Windsurf rules (legacy)' },
  { agent: 'windsurf', pattern: '.windsurf/rules/*.md', desc: 'Windsurf rules' },

  // ── Cline ──
  { agent: 'cline', pattern: '.clinerules', desc: 'Cline rules (legacy)' },
  { agent: 'cline', pattern: '.cline/rules/*.md', desc: 'Cline rules' },

  // ── Codex (OpenAI) ──
  { agent: 'codex', pattern: '.codex/instructions.md', desc: 'Codex instructions' },
  { agent: 'codex', pattern: 'AGENTS.md', desc: 'Codex/agents root file' },
  { agent: 'codex', pattern: '**/AGENTS.md', desc: 'Codex scoped agents file', recursive: true },

  // ── GitHub agents (.github/*.md — copilot-instructions.md, agents.md, AGENTS.md, etc.) ──
  { agent: 'copilot', pattern: '.github/copilot-instructions.md', desc: 'Copilot instructions' },
  { agent: 'copilot', pattern: '.github/agents.md', desc: 'GitHub agent instructions' },
  { agent: 'copilot', pattern: '.github/AGENTS.md', desc: 'GitHub agent instructions' },
  { agent: 'copilot', pattern: '.github/copilot/*.md', desc: 'Copilot prompt files' },

  // ── Gemini ──
  { agent: 'gemini', pattern: 'GEMINI.md', desc: 'Gemini root instructions' },
  { agent: 'gemini', pattern: '.gemini/settings.json', desc: 'Gemini settings' },
  { agent: 'gemini', pattern: '.gemini/styles/*.md', desc: 'Gemini style files' },

  // ── Aider ──
  { agent: 'aider', pattern: '.aider.conf.yml', desc: 'Aider config' },
  { agent: 'aider', pattern: 'CONVENTIONS.md', desc: 'Aider conventions' },

  // ── Continue ──
  { agent: 'continue', pattern: '.continue/config.json', desc: 'Continue config' },
  { agent: 'continue', pattern: '.continue/rules/*.md', desc: 'Continue rules' },
  { agent: 'continue', pattern: '.continuerules', desc: 'Continue rules (legacy)' },

  // ── Augment ──
  { agent: 'augment', pattern: '.augment/config.json', desc: 'Augment config' },
  { agent: 'augment', pattern: '.augment-guidelines', desc: 'Augment guidelines' },

  // ── Roo Code ──
  { agent: 'roo', pattern: '.roo/rules/*.md', desc: 'Roo Code rules' },
  { agent: 'roo', pattern: '.roorules', desc: 'Roo Code rules (legacy)' },

  // ── Generic / Custom ──
  { agent: 'generic', pattern: 'agents.md', desc: 'Generic agents file' },
  { agent: 'generic', pattern: 'rules.md', desc: 'Generic rules file' },
  { agent: 'generic', pattern: 'RULES.md', desc: 'Generic rules file' },
  { agent: 'generic', pattern: 'instructions.md', desc: 'Generic instructions' },
  { agent: 'generic', pattern: 'INSTRUCTIONS.md', desc: 'Generic instructions' },
  { agent: 'generic', pattern: 'CONTEXT.md', desc: 'Generic context file' },
  { agent: 'generic', pattern: 'CONVENTIONS.md', desc: 'Generic conventions' },
];

// ── Custom directories that may contain prompt/agent/rule files ──
const CUSTOM_DIRS = [
  { dir: 'agents', desc: 'Custom agents directory' },
  { dir: '.agents', desc: 'Custom agents directory (hidden)' },
  { dir: 'prompts', desc: 'Custom prompts directory' },
  { dir: '.prompts', desc: 'Custom prompts directory (hidden)' },
  { dir: 'rules', desc: 'Custom rules directory' },
  { dir: '.rules', desc: 'Custom rules directory (hidden)' },
  { dir: 'instructions', desc: 'Custom instructions directory' },
  { dir: '.instructions', desc: 'Custom instructions directory (hidden)' },
  { dir: 'context', desc: 'Custom context directory' },
  { dir: '.context', desc: 'Custom context directory (hidden)' },
];

// ── Compressible file extensions ──
const COMPRESSIBLE_EXTENSIONS = ['.md', '.txt', '.mdc', '.yml', '.yaml'];

/**
 * Estimate token count from text content.
 * Uses chars/4 as rough approximation (works for English text).
 */
function estimateTokens(content) {
  return Math.ceil(content.length / 4);
}

/**
 * Classify token count into severity.
 */
function classifySize(tokens) {
  if (tokens > 1500) return 'BLOATED';
  if (tokens > 500) return 'HEAVY';
  return 'OK';
}

/**
 * Recursively find files matching a simple glob pattern.
 * Supports: exact names, *.ext, dir/*, dir/**.
 * Not a full glob implementation — covers the patterns we need.
 */
function findFiles(rootDir, pattern, recursive = false) {
  const results = [];

  function walk(dir, depth) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      if (entry.isFile()) {
        if (matchPattern(relPath, pattern)) {
          results.push(fullPath);
        }
      } else if (entry.isDirectory() && !entry.name.startsWith('node_modules') && entry.name !== '.git') {
        // For ** patterns or recursive flag, walk subdirectories
        if (recursive || pattern.includes('**/')) {
          walk(fullPath, depth + 1);
        }
        // For patterns like .cursor/rules/*.md, walk if path is a prefix of pattern
        else if (pattern.includes('/')) {
          const patternParts = pattern.split('/');
          const relParts = relPath.split('/');
          // Descend if pattern dir segments start with what we have so far
          if (relParts.length < patternParts.length) {
            let matches = true;
            for (let i = 0; i < relParts.length; i++) {
              const pp = patternParts[i];
              if (pp === '*' || pp === relParts[i]) continue;
              if (pp.includes('*')) {
                const regex = new RegExp('^' + pp.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                if (regex.test(relParts[i])) continue;
              }
              matches = false;
              break;
            }
            if (matches) walk(fullPath, depth + 1);
          }
        }
      }
    }
  }

  walk(rootDir, 0);
  return results;
}

/**
 * Simple pattern matching for our use cases.
 * Handles: exact names, *.ext, dir/*.ext, **\/ prefix (any depth).
 */
function matchPattern(filePath, pattern) {
  // Handle ** wildcard (any depth)
  if (pattern.startsWith('**/')) {
    const rest = pattern.slice(3);
    // Match if rest matches the path OR any suffix of the path
    const parts = filePath.split('/');
    for (let i = 0; i < parts.length; i++) {
      const suffix = parts.slice(i).join('/');
      if (matchExact(suffix, rest)) return true;
    }
    return false;
  }

  return matchExact(filePath, pattern);
}

function matchExact(filePath, pattern) {
  const patParts = pattern.split('/');
  const fileParts = filePath.split('/');

  if (patParts.length !== fileParts.length) return false;

  return patParts.every((pat, i) => {
    if (pat === '*') return true;
    if (pat.includes('*')) {
      const regex = new RegExp('^' + pat.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      return regex.test(fileParts[i]);
    }
    return pat === fileParts[i];
  });
}

/**
 * Scan custom directories for compressible files.
 */
function scanCustomDirs(rootDir) {
  const results = [];

  for (const { dir, desc } of CUSTOM_DIRS) {
    const dirPath = path.join(rootDir, dir);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) continue;

    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!COMPRESSIBLE_EXTENSIONS.includes(ext)) continue;
      // Skip .original.<ext> backups from prior compression
      if (/\.original\.[^.]+$/.test(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const tokens = estimateTokens(content);
        results.push({
          agent: 'custom',
          desc: `${desc}: ${entry.name}`,
          path: fullPath,
          relativePath: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
          tokens,
          severity: classifySize(tokens),
          content,
        });
      } catch {
        // skip unreadable files
      }
    }
  }

  return results;
}

/**
 * Main scan function. Finds all agent config files in a project.
 *
 * Returns: {
 *   files: [{ agent, desc, path, relativePath, tokens, severity, content }],
 *   byAgent: { claude: [...], cursor: [...], ... },
 *   totalTokens: number,
 *   recommendations: string[],
 * }
 */
async function scanProject(rootDir) {
  rootDir = path.resolve(rootDir);
  const files = [];
  const seen = new Set();

  // Scan known agent patterns
  for (const { agent, pattern, desc, recursive } of AGENT_PATTERNS) {
    const found = findFiles(rootDir, pattern, recursive);
    for (const filePath of found) {
      const realPath = path.resolve(filePath);
      if (seen.has(realPath)) continue;
      seen.add(realPath);

      // Skip any .original.<ext> backup files
      if (/\.original\.[^.]+$/.test(realPath)) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const tokens = estimateTokens(content);
        files.push({
          agent,
          desc,
          path: filePath,
          relativePath: path.relative(rootDir, filePath).replace(/\\/g, '/'),
          tokens,
          severity: classifySize(tokens),
          content,
        });
      } catch {
        // skip unreadable
      }
    }
  }

  // Scan custom directories
  const customFiles = scanCustomDirs(rootDir);
  for (const f of customFiles) {
    const realPath = path.resolve(f.path);
    if (seen.has(realPath)) continue;
    seen.add(realPath);
    files.push(f);
  }

  // Group by agent
  const byAgent = {};
  for (const f of files) {
    if (!byAgent[f.agent]) byAgent[f.agent] = [];
    byAgent[f.agent].push(f);
  }

  // Total tokens
  const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);

  // Generate recommendations
  const recommendations = [];
  for (const f of files) {
    if (f.severity === 'BLOATED') {
      recommendations.push(`Compress ${f.relativePath} (~${f.tokens} tokens) → run /tokenizer-compress ${f.relativePath}`);
    } else if (f.severity === 'HEAVY') {
      recommendations.push(`Review ${f.relativePath} (~${f.tokens} tokens) for redundant instructions`);
    }
  }

  // Check for duplicate instructions across agents
  const agents = Object.keys(byAgent);
  if (agents.length > 2) {
    recommendations.push(`${agents.length} agents detected — check for duplicated instructions across agent configs`);
  }

  return { files, byAgent, totalTokens, recommendations };
}

module.exports = {
  scanProject,
  estimateTokens,
  classifySize,
  AGENT_PATTERNS,
  CUSTOM_DIRS,
  COMPRESSIBLE_EXTENSIONS,
};
