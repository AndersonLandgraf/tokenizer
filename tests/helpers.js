/**
 * Test helpers — temp dir creation/cleanup.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function mkTempDir(prefix = 'tokenizer-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function write(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

module.exports = { mkTempDir, rmDir, write, read };
