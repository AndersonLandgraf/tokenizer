/**
 * integrations.js — Agent wire-up helpers
 *
 * Injects tokenizer-generated content (fingerprint, audit reports, etc.)
 * into agent-specific config files so both Claude + Copilot pick it up
 * automatically.
 *
 * Claude → reference via `@<path>` in CLAUDE.md (Claude lazy-loads referenced files)
 * Copilot → append content to .github/copilot-instructions.md (Copilot loads all of it)
 */

const fs = require('fs');
const path = require('path');

const FINGERPRINT_MARKER_START = '<!-- tokenizer:fingerprint:start -->';
const FINGERPRINT_MARKER_END = '<!-- tokenizer:fingerprint:end -->';
const CLAUDE_REFERENCE = '@.tokenizer/fingerprint.md';

/**
 * Wire fingerprint into Claude's CLAUDE.md (as a reference) +
 * Copilot's copilot-instructions.md (as inlined section).
 *
 * Returns: { claude: {status, path}, copilot: {status, path} }
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
    copilot: wireCopilotFingerprint(projectDir, fingerprintContent),
  };
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

function wireCopilotFingerprint(projectDir, fingerprintContent) {
  const copilotDir = path.join(projectDir, '.github');
  const copilotPath = path.join(copilotDir, 'copilot-instructions.md');

  const block = [
    FINGERPRINT_MARKER_START,
    '## Codebase fingerprint',
    '',
    fingerprintContent.trim(),
    FINGERPRINT_MARKER_END,
  ].join('\n');

  if (!fs.existsSync(copilotDir)) fs.mkdirSync(copilotDir, { recursive: true });

  if (!fs.existsSync(copilotPath)) {
    fs.writeFileSync(copilotPath, block + '\n', 'utf8');
    return { status: 'created', path: copilotPath };
  }

  const content = fs.readFileSync(copilotPath, 'utf8');
  const markerRegex = new RegExp(
    `${escapeRegex(FINGERPRINT_MARKER_START)}[\\s\\S]*?${escapeRegex(FINGERPRINT_MARKER_END)}`,
    'g'
  );

  if (markerRegex.test(content)) {
    const updated = content.replace(markerRegex, block);
    fs.writeFileSync(copilotPath, updated, 'utf8');
    return { status: 'updated', path: copilotPath };
  }

  const updated = content.trimEnd() + '\n\n' + block + '\n';
  fs.writeFileSync(copilotPath, updated, 'utf8');
  return { status: 'appended', path: copilotPath };
}

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

  const copilotPath = path.join(projectDir, '.github', 'copilot-instructions.md');
  if (fs.existsSync(copilotPath)) {
    let content = fs.readFileSync(copilotPath, 'utf8');
    const markerRegex = new RegExp(
      `\\s*${escapeRegex(FINGERPRINT_MARKER_START)}[\\s\\S]*?${escapeRegex(FINGERPRINT_MARKER_END)}\\s*`,
      'g'
    );
    if (markerRegex.test(content)) {
      content = content.replace(markerRegex, '\n');
      fs.writeFileSync(copilotPath, content.trim() + '\n', 'utf8');
      out.copilot = { status: 'removed', path: copilotPath };
    } else {
      out.copilot = { status: 'not-found', path: copilotPath };
    }
  }

  return out;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  wireFingerprint,
  unwireFingerprint,
  wireClaudeFingerprint,
  wireCopilotFingerprint,
};
