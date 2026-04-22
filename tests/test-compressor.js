const assert = require('assert');
const path = require('path');
const { compress, compressFile, restoreFile } = require('../core/compressor');
const { mkTempDir, rmDir, write, read } = require('./helpers');

module.exports = {
  'compress: drops filler words'() {
    const input = 'Please make sure that you always handle errors properly.';
    const { compressed } = compress(input);
    assert.ok(!compressed.toLowerCase().includes('please'), 'should drop "please"');
    assert.ok(!compressed.toLowerCase().includes('make sure'), 'should drop "make sure"');
  },

  'compress: preserves fenced code blocks exactly'() {
    const input = [
      'Use this function please:',
      '```js',
      'function addNumbers(a, b) {',
      '  return a + b;',
      '}',
      '```',
      'It is really important that you call it correctly.',
    ].join('\n');
    const { compressed } = compress(input);
    assert.ok(compressed.includes('function addNumbers(a, b)'), 'should preserve fn signature');
    assert.ok(compressed.includes('return a + b;'), 'should preserve fn body');
    assert.ok(!compressed.includes('really'), 'should drop filler');
  },

  'compress: preserves inline code'() {
    const input = 'Call the `myFunction` in the `src/utils.ts` file please.';
    const { compressed } = compress(input);
    assert.ok(compressed.includes('`myFunction`'), 'should preserve inline code');
    assert.ok(compressed.includes('`src/utils.ts`'), 'should preserve file path');
    assert.ok(!compressed.toLowerCase().includes('please'), 'should drop filler');
  },

  'compress: reports token savings'() {
    const input = 'Please make sure that you really understand this concept thoroughly.';
    const result = compress(input);
    assert.ok(result.originalTokens > result.compressedTokens, 'should reduce tokens');
    assert.ok(result.savings > 0, 'should report positive savings');
  },

  'compress: ultra mode abbreviates technical terms'() {
    const input = 'Check the configuration for the authentication middleware in the database.';
    const { compressed } = compress(input, { level: 'ultra' });
    assert.ok(/\bauth\b/i.test(compressed), 'should abbreviate authentication → auth');
    assert.ok(/\bmw\b/i.test(compressed), 'should abbreviate middleware → mw');
    assert.ok(/\bDB\b/.test(compressed), 'should abbreviate database → DB');
    assert.ok(/\bcfg\b/i.test(compressed), 'should abbreviate configuration → cfg');
  },

  'compress: lite mode keeps articles'() {
    const input = 'This is really the best approach for the function.';
    const { compressed } = compress(input, { level: 'lite' });
    assert.ok(!compressed.toLowerCase().includes('really'), 'lite drops filler');
    assert.ok(/\bthe\b/i.test(compressed), 'lite preserves articles');
  },

  'compressFile: creates .original backup + writes compressed'() {
    const tmp = mkTempDir();
    try {
      const file = path.join(tmp, 'test.md');
      const content = 'Please make sure that you really do this properly.';
      write(file, content);

      const result = compressFile(file);
      assert.ok(result.backupPath.endsWith('.original.md'), 'backup path has .original.md');
      assert.ok(result.originalTokens > result.compressedTokens, 'compression reduced tokens');

      const backed = read(result.backupPath);
      assert.strictEqual(backed, content, 'backup preserves original exactly');

      const compressed = read(file);
      assert.notStrictEqual(compressed, content, 'file was compressed in-place');
    } finally {
      rmDir(tmp);
    }
  },

  'restoreFile: restores from .original backup + removes backup'() {
    const tmp = mkTempDir();
    try {
      const file = path.join(tmp, 'test.md');
      const original = 'Please make sure you do this properly.';
      write(file, original);

      compressFile(file);
      const result = restoreFile(file);

      const restored = read(file);
      assert.strictEqual(restored, original, 'content restored exactly');
      assert.ok(!require('fs').existsSync(result.removed), 'backup removed');
    } finally {
      rmDir(tmp);
    }
  },
};
