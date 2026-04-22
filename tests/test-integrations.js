const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { writeFingerprint } = require('../core/fingerprint');
const { wireFingerprint, unwireFingerprint } = require('../core/integrations');
const { mkTempDir, rmDir, write, read } = require('./helpers');

function setupFingerprint(tmp) {
  write(path.join(tmp, 'index.js'), '// entry');
  writeFingerprint(tmp);
}

module.exports = {
  'wireFingerprint: creates CLAUDE.md if missing'() {
    const tmp = mkTempDir();
    try {
      setupFingerprint(tmp);
      const result = wireFingerprint(tmp);
      assert.strictEqual(result.claude.status, 'created');
      const content = read(path.join(tmp, 'CLAUDE.md'));
      assert.ok(content.includes('@.tokenizer/fingerprint.md'), 'claude reference injected');
    } finally {
      rmDir(tmp);
    }
  },

  'wireFingerprint: appends to existing CLAUDE.md'() {
    const tmp = mkTempDir();
    try {
      setupFingerprint(tmp);
      write(path.join(tmp, 'CLAUDE.md'), '# existing\n\nsome rules');
      const result = wireFingerprint(tmp);
      assert.strictEqual(result.claude.status, 'appended');
      const content = read(path.join(tmp, 'CLAUDE.md'));
      assert.ok(content.includes('some rules'), 'existing content preserved');
      assert.ok(content.includes('@.tokenizer/fingerprint.md'), 'reference appended');
    } finally {
      rmDir(tmp);
    }
  },

  'wireFingerprint: idempotent for CLAUDE.md'() {
    const tmp = mkTempDir();
    try {
      setupFingerprint(tmp);
      wireFingerprint(tmp);
      const result = wireFingerprint(tmp);
      assert.strictEqual(result.claude.status, 'already-wired');
    } finally {
      rmDir(tmp);
    }
  },

  'wireFingerprint: creates .github/copilot-instructions.md if missing'() {
    const tmp = mkTempDir();
    try {
      setupFingerprint(tmp);
      const result = wireFingerprint(tmp);
      assert.strictEqual(result.copilot.status, 'created');
      const content = read(path.join(tmp, '.github', 'copilot-instructions.md'));
      assert.ok(content.includes('tokenizer:fingerprint:start'), 'copilot block injected');
      assert.ok(content.includes('Codebase Fingerprint') || content.includes('Codebase fingerprint'), 'fingerprint content inlined');
    } finally {
      rmDir(tmp);
    }
  },

  'wireFingerprint: appends to existing copilot-instructions.md'() {
    const tmp = mkTempDir();
    try {
      setupFingerprint(tmp);
      write(path.join(tmp, '.github', 'copilot-instructions.md'), '# be terse\nexisting rules');
      const result = wireFingerprint(tmp);
      assert.strictEqual(result.copilot.status, 'appended');
      const content = read(path.join(tmp, '.github', 'copilot-instructions.md'));
      assert.ok(content.includes('existing rules'), 'preserved existing content');
      assert.ok(content.includes('tokenizer:fingerprint:start'), 'block appended');
    } finally {
      rmDir(tmp);
    }
  },

  'wireFingerprint: updates existing block on re-run'() {
    const tmp = mkTempDir();
    try {
      setupFingerprint(tmp);
      wireFingerprint(tmp);

      // Modify project → regenerate fingerprint → re-wire
      write(path.join(tmp, 'added.js'), '// new');
      writeFingerprint(tmp, { force: true });
      const result = wireFingerprint(tmp);
      assert.strictEqual(result.copilot.status, 'updated', 'block updated in place');

      const content = read(path.join(tmp, '.github', 'copilot-instructions.md'));
      // Only one block should exist
      const matches = content.match(/tokenizer:fingerprint:start/g) || [];
      assert.strictEqual(matches.length, 1, 'only one fingerprint block');
    } finally {
      rmDir(tmp);
    }
  },

  'unwireFingerprint: removes references from both agents'() {
    const tmp = mkTempDir();
    try {
      setupFingerprint(tmp);
      wireFingerprint(tmp);
      const result = unwireFingerprint(tmp);
      assert.strictEqual(result.claude.status, 'removed');
      assert.strictEqual(result.copilot.status, 'removed');

      const claudeContent = read(path.join(tmp, 'CLAUDE.md'));
      assert.ok(!claudeContent.includes('@.tokenizer/fingerprint.md'), 'claude ref removed');

      const copilotContent = read(path.join(tmp, '.github', 'copilot-instructions.md'));
      assert.ok(!copilotContent.includes('tokenizer:fingerprint'), 'copilot block removed');
    } finally {
      rmDir(tmp);
    }
  },

  'wireFingerprint: errors when fingerprint missing'() {
    const tmp = mkTempDir();
    try {
      // No setupFingerprint — should throw
      let errored = false;
      try { wireFingerprint(tmp); } catch { errored = true; }
      assert.ok(errored, 'throws when fingerprint not generated');
    } finally {
      rmDir(tmp);
    }
  },
};
