const assert = require('assert');
const path = require('path');
const { scanProject, estimateTokens, classifySize } = require('../core/scanner');
const { mkTempDir, rmDir, write } = require('./helpers');

module.exports = {
  async 'scanner: detects CLAUDE.md'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, 'CLAUDE.md'), '# test project\nrules go here');
      const result = await scanProject(tmp);
      const claudeFile = result.files.find(f => f.relativePath === 'CLAUDE.md');
      assert.ok(claudeFile, 'CLAUDE.md detected');
      assert.strictEqual(claudeFile.agent, 'claude');
    } finally {
      rmDir(tmp);
    }
  },

  async 'scanner: detects copilot-instructions.md'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, '.github', 'copilot-instructions.md'), 'be terse');
      const result = await scanProject(tmp);
      const copilot = result.files.find(f => f.relativePath === '.github/copilot-instructions.md');
      assert.ok(copilot, 'copilot-instructions.md detected');
      assert.strictEqual(copilot.agent, 'copilot');
    } finally {
      rmDir(tmp);
    }
  },

  async 'scanner: skips .original backup files'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, 'CLAUDE.md'), 'compressed');
      write(path.join(tmp, 'CLAUDE.original.md'), 'original backup');
      const result = await scanProject(tmp);
      const backup = result.files.find(f => f.relativePath === 'CLAUDE.original.md');
      assert.ok(!backup, '.original.md backup NOT returned');
    } finally {
      rmDir(tmp);
    }
  },

  'estimateTokens: approximates chars / 4'() {
    assert.strictEqual(estimateTokens('a'.repeat(100)), 25);
    assert.strictEqual(estimateTokens('a'.repeat(4)), 1);
    assert.strictEqual(estimateTokens(''), 0);
  },

  'classifySize: boundaries'() {
    assert.strictEqual(classifySize(100), 'OK');
    assert.strictEqual(classifySize(500), 'OK');
    assert.strictEqual(classifySize(501), 'HEAVY');
    assert.strictEqual(classifySize(1500), 'HEAVY');
    assert.strictEqual(classifySize(1501), 'BLOATED');
  },

  async 'scanner: groups files by agent + totals tokens'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, 'CLAUDE.md'), 'a'.repeat(400));
      write(path.join(tmp, '.github', 'copilot-instructions.md'), 'b'.repeat(200));
      const result = await scanProject(tmp);
      assert.ok(result.byAgent.claude, 'has claude group');
      assert.ok(result.byAgent.copilot, 'has copilot group');
      assert.ok(result.totalTokens >= 150, `totalTokens ${result.totalTokens} >= 150`);
    } finally {
      rmDir(tmp);
    }
  },
};
