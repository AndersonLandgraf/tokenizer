/**
 * integrations.js — Agent wire-up helpers
 *
 * Injects tokenizer-generated content (fingerprint, terse prefix, etc.)
 * into agent-specific config files so both Claude + GitHub agents pick it up.
 *
 * Claude → reference via `@<path>` in CLAUDE.md (lazy-loads)
 * GitHub agents → auto-detect .github/*.md (agents.md, AGENTS.md, copilot-instructions.md, etc.)
 *                 terse prefix goes at TOP so agents always read it first
 */

const fs = require('fs');
const path = require('path');

const FINGERPRINT_MARKER_START = '<!-- tokenizer:fingerprint:start -->';
const FINGERPRINT_MARKER_END = '<!-- tokenizer:fingerprint:end -->';
const TERSE_MARKER_START = '<!-- tokenizer:terse:start -->';
const TERSE_MARKER_END = '<!-- tokenizer:terse:end -->';
const CLAUDE_REFERENCE = '@.tokenizer/fingerprint.md';

const TERSE_SNIPPET =
  'Respond tersely: no filler/pleasantries/hedging. Fragments OK. ' +
  'Abbreviate: config/auth/db/fn/dep/pkg/dir/env/repo/impl. ' +
  'Symbols: → + = !=. Bullets over paragraphs. ' +
  'Code blocks: never compress. File paths/URLs: exact. Safety warnings: clear.';

// Priority order for auto-detecting the GitHub agent instructions file.
// First existing file wins; fallback creates copilot-instructions.md.
const GITHUB_AGENT_FILE_PRIORITY = [
  'copilot-instructions.md',
  'agents.md',
  'AGENTS.md',
];

/**
 * Detect (or choose) the .github/*.md file to use as agent instructions target.
 * Returns absolute path — file may or may not exist yet.
 */
function detectGithubAgentFile(projectDir) {
  const githubDir = path.join(projectDir, '.github');

  // Check priority list for existing files
  for (const name of GITHUB_AGENT_FILE_PRIORITY) {
    const p = path.join(githubDir, name);
    if (fs.existsSync(p)) return p;
  }

  // Scan for any .md directly inside .github/ (not in subdirs)
  if (fs.existsSync(githubDir)) {
    try {
      const entries = fs.readdirSync(githubDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.md')) {
          return path.join(githubDir, e.name);
        }
      }
    } catch {}
  }

  // Fallback: will be created as copilot-instructions.md
  return path.join(githubDir, 'copilot-instructions.md');
}

/**
 * Wire fingerprint into Claude's CLAUDE.md (as a reference) +
 * auto-detected .github/*.md (as inlined section).
 *
 * Returns: { claude: {status, path}, github: {status, path} }
 */
function wireFingerprint(projectDir) {
  projectDir = path.resolve(projectDir || process.cwd());
  const fingerprintPath = path.join(projectDir, '.tokenizer', 'fingerprint.md');

  if (!fs.existsSync(fingerprintPath)) {
    throw new Error(`fingerprint not found — run fingerprint cmd first: ${fingerprintPath}`);
  }

  const fingerprintContent = fs.readFileSync(fingerprintPath, 'utf8');

  return {
    claude: wireClaudeFingerprint(projectDir),
    github: wireGithubAgentFingerprint(projectDir, fingerprintContent),
  };
}

/**
 * Wire terse-mode prefix into the auto-detected .github/*.md agent instructions file.
 * Prefix goes at TOP so agents always read it first.
 *
 * Returns: { status: 'created' | 'prefixed' | 'updated' | 'already-wired', path }
 */
function wireTersePrefix(projectDir) {
  projectDir = path.resolve(projectDir || process.cwd());
  const targetPath = detectGithubAgentFile(projectDir);
  const githubDir = path.dirname(targetPath);
  if (!fs.existsSync(githubDir)) fs.mkdirSync(githubDir, { recursive: true });

  const block = `${TERSE_MARKER_START}\n${TERSE_SNIPPET}\n${TERSE_MARKER_END}`;

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, block + '\n', 'utf8');
    return { status: 'created', path: targetPath };
  }

  let content = fs.readFileSync(targetPath, 'utf8');
  const markerRegex = new RegExp(
    `${escapeRegex(TERSE_MARKER_START)}[\\s\\S]*?${escapeRegex(TERSE_MARKER_END)}\n?`,
    'g'
  );

  if (markerRegex.test(content)) {
    content = content.replace(markerRegex, block + '\n');
    fs.writeFileSync(targetPath, content, 'utf8');
    return { status: 'updated', path: targetPath };
  }

  // Prefix at top
  fs.writeFileSync(targetPath, block + '\n\n' + content, 'utf8');
  return { status: 'prefixed', path: targetPath };
}

/**
 * Remove terse prefix from the auto-detected .github/*.md file.
 */
function unwireTersePrefix(projectDir) {
  projectDir = path.resolve(projectDir || process.cwd());
  const targetPath = detectGithubAgentFile(projectDir);

  if (!fs.existsSync(targetPath)) return { status: 'not-found', path: targetPath };

  let content = fs.readFileSync(targetPath, 'utf8');
  const markerRegex = new RegExp(
    `\\s*${escapeRegex(TERSE_MARKER_START)}[\\s\\S]*?${escapeRegex(TERSE_MARKER_END)}\\s*`,
    'g'
  );

  if (!markerRegex.test(content)) return { status: 'not-found', path: targetPath };

  content = content.replace(markerRegex, '\n').replace(/^\n+/, '');
  fs.writeFileSync(targetPath, content.trim() + '\n', 'utf8');
  return { status: 'removed', path: targetPath };
}

function wireClaudeFingerprint(projectDir) {
  const claudePath = path.join(projectDir, 'CLAUDE.md');
  const refLine = `## Codebase fingerprint\n${CLAUDE_REFERENCE}`;

  if (!fs.existsSync(claudePath)) {
    fs.writeFileSync(claudePath, `# ${path.basename(projectDir)}\n\n${refLine}\n`, 'utf8');
    return { status: 'created', path: claudePath };
  }

  const content = fs.readFileSync(claudePath, 'utf8');
  if (content.includes(CLAUDE_REFERENCE)) {
    return { status: 'already-wired', path: claudePath };
  }

  const updated = content.trimEnd() + `\n\n${refLine}\n`;
  fs.writeFileSync(claudePath, updated, 'utf8');
  return { status: 'appended', path: claudePath };
}

/**
 * Wire fingerprint into the auto-detected .github/*.md agent instructions file.
 * Appended at end (fingerprint is reference content, not a prefix).
 */
function wireGithubAgentFingerprint(projectDir, fingerprintContent) {
  const targetPath = detectGithubAgentFile(projectDir);
  const githubDir = path.dirname(targetPath);

  const block = [
    FINGERPRINT_MARKER_START,
    '## Codebase fingerprint',
    '',
    fingerprintContent.trim(),
    FINGERPRINT_MARKER_END,
  ].join('\n');

  if (!fs.existsSync(githubDir)) fs.mkdirSync(githubDir, { recursive: true });

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, block + '\n', 'utf8');
    return { status: 'created', path: targetPath };
  }

  const content = fs.readFileSync(targetPath, 'utf8');
  const markerRegex = new RegExp(
    `${escapeRegex(FINGERPRINT_MARKER_START)}[\\s\\S]*?${escapeRegex(FINGERPRINT_MARKER_END)}`,
    'g'
  );

  if (markerRegex.test(content)) {
    const updated = content.replace(markerRegex, block);
    fs.writeFileSync(targetPath, updated, 'utf8');
    return { status: 'updated', path: targetPath };
  }

  const updated = content.trimEnd() + '\n\n' + block + '\n';
  fs.writeFileSync(targetPath, updated, 'utf8');
  return { status: 'appended', path: targetPath };
}

// Backwards-compat alias
const wireCopilotFingerprint = wireGithubAgentFingerprint;

function unwireFingerprint(projectDir) {
  projectDir = path.resolve(projectDir || process.cwd());
  const out = { claude: null, copilot: null };

  const claudePath = path.join(projectDir, 'CLAUDE.md');
  if (fs.existsSync(claudePath)) {
    let content = fs.readFileSync(claudePath, 'utf8');
    const refRegex = /##\s*Codebase fingerprint\s*\n@\.tokenizer\/fingerprint\.md\s*\n?/g;
    if (refRegex.test(content)) {
      content = content.replace(refRegex, '');
      fs.writeFileSync(claudePath, content.trimEnd() + '\n', 'utf8');
      out.claude = { status: 'removed', path: claudePath };
    } else {
      out.claude = { status: 'not-found', path: claudePath };
    }
  }

  // Search all known .github agent files for fingerprint markers
  const githubDir = path.join(projectDir, '.github');
  const candidates = fs.existsSync(githubDir)
    ? fs.readdirSync(githubDir, { withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(e => path.join(githubDir, e.name))
    : [];

  for (const targetPath of candidates) {
    let content = fs.readFileSync(targetPath, 'utf8');
    const markerRegex = new RegExp(
      `\\s*${escapeRegex(FINGERPRINT_MARKER_START)}[\\s\\S]*?${escapeRegex(FINGERPRINT_MARKER_END)}\\s*`,
      'g'
    );
    if (markerRegex.test(content)) {
      content = content.replace(markerRegex, '\n');
      fs.writeFileSync(targetPath, content.trim() + '\n', 'utf8');
      out.github = { status: 'removed', path: targetPath };
      break;
    }
  }
  if (!out.github) out.github = { status: 'not-found' };

  return out;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  wireFingerprint,
  unwireFingerprint,
  wireClaudeFingerprint,
  wireGithubAgentFingerprint,
  wireCopilotFingerprint,  // backwards-compat alias
  wireTersePrefix,
  unwireTersePrefix,
  detectGithubAgentFile,
};
