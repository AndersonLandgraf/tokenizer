const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { generateFingerprint, writeFingerprint, computeFingerprintHash, renderMarkdown } = require('../core/fingerprint');
const { mkTempDir, rmDir, write } = require('./helpers');

module.exports = {
  'generateFingerprint: detects JS project'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, 'package.json'), JSON.stringify({
        name: 'test-app',
        version: '1.0.0',
        main: 'src/index.js',
        scripts: { test: 'jest', build: 'vite build' },
        dependencies: { react: '^18.0.0', express: '^4.0.0' },
      }));
      write(path.join(tmp, 'src', 'index.js'), 'console.log("hello");');
      write(path.join(tmp, 'README.md'), '# test app');

      const fp = generateFingerprint(tmp);
      assert.ok(fp.hash.length === 16, 'hash is 16 chars');
      assert.strictEqual(fp.package.name, 'test-app');
      assert.ok(fp.package.scripts.includes('test'), 'scripts captured');
      assert.ok(fp.package.dependencies.includes('react'), 'deps captured');
      const jsLang = fp.languages.find(l => l.lang === 'JavaScript');
      assert.ok(jsLang, 'detected JavaScript');
      assert.ok(jsLang.files >= 1, 'at least 1 JS file');
    } finally {
      rmDir(tmp);
    }
  },

  'generateFingerprint: detects Python project'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, 'requirements.txt'), 'flask\nrequests');
      write(path.join(tmp, 'main.py'), 'print("hi")');
      const fp = generateFingerprint(tmp);
      const py = fp.languages.find(l => l.lang === 'Python');
      assert.ok(py, 'detected Python');
      const pm = fp.packageManagers.find(p => p.system.includes('pip'));
      assert.ok(pm, 'detected pip');
    } finally {
      rmDir(tmp);
    }
  },

  'generateFingerprint: picks up entry point from package.json main'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, 'package.json'), JSON.stringify({ name: 'x', main: 'lib/entry.js' }));
      write(path.join(tmp, 'lib', 'entry.js'), '// entry');
      const fp = generateFingerprint(tmp);
      const main = fp.entryPoints.find(e => e.kind === 'main');
      assert.ok(main, 'main entry found');
      assert.strictEqual(main.path, 'lib/entry.js');
    } finally {
      rmDir(tmp);
    }
  },

  'generateFingerprint: picks up common entry files'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, 'index.ts'), '// root');
      write(path.join(tmp, 'src', 'index.ts'), '// src');
      const fp = generateFingerprint(tmp);
      const paths = fp.entryPoints.map(e => e.path);
      assert.ok(paths.includes('index.ts'), 'detects index.ts');
      assert.ok(paths.includes('src/index.ts'), 'detects src/index.ts');
    } finally {
      rmDir(tmp);
    }
  },

  'writeFingerprint: creates .tokenizer dir + json + md'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, 'hello.js'), '// x');
      const result = writeFingerprint(tmp);
      assert.strictEqual(result.status, 'generated');
      assert.ok(fs.existsSync(path.join(tmp, '.tokenizer', 'fingerprint.json')));
      assert.ok(fs.existsSync(path.join(tmp, '.tokenizer', 'fingerprint.md')));
    } finally {
      rmDir(tmp);
    }
  },

  'writeFingerprint: cache hit when nothing changed'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, 'hello.js'), '// x');
      const first = writeFingerprint(tmp);
      assert.strictEqual(first.status, 'generated');

      const second = writeFingerprint(tmp);
      assert.strictEqual(second.status, 'cached', 'second call hits cache');
      assert.strictEqual(first.hash, second.hash);
    } finally {
      rmDir(tmp);
    }
  },

  'writeFingerprint: cache invalidates on new file'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, 'hello.js'), '// x');
      const first = writeFingerprint(tmp);

      // Add a new file → hash should change
      write(path.join(tmp, 'added.js'), '// new');
      const second = writeFingerprint(tmp);
      assert.strictEqual(second.status, 'generated', 'regenerates on new file');
      assert.notStrictEqual(first.hash, second.hash, 'hash changed');
    } finally {
      rmDir(tmp);
    }
  },

  'writeFingerprint: --force regenerates'() {
    const tmp = mkTempDir();
    try {
      write(path.join(tmp, 'hello.js'), '// x');
      writeFingerprint(tmp);
      const forced = writeFingerprint(tmp, { force: true });
      assert.strictEqual(forced.status, 'generated', 'force always regenerates');
    } finally {
      rmDir(tmp);
    }
  },

  'computeFingerprintHash: deterministic'() {
    const files = [
      { path: 'a.js', size: 100, mtime: 1000 },
      { path: 'b.js', size: 200, mtime: 2000 },
    ];
    const h1 = computeFingerprintHash(files);
    const h2 = computeFingerprintHash([...files].reverse()); // sorted inside
    assert.strictEqual(h1, h2, 'order-independent');
  },

  'renderMarkdown: produces readable output'() {
    const fp = {
      hash: 'abc123',
      generated: '2026-04-21T00:00:00Z',
      rootDir: '/test',
      stats: { totalFiles: 5, totalCodeFiles: 3, totalBytes: 2048 },
      languages: [{ lang: 'JavaScript', files: 3, bytes: 2000, percent: 98 }],
      packageManagers: [{ file: 'package.json', system: 'npm/Node.js' }],
      package: null,
      entryPoints: [],
      configs: [],
      treeSummary: ['src/', 'index.js'],
    };
    const md = renderMarkdown(fp);
    assert.ok(md.includes('# Codebase Fingerprint'));
    assert.ok(md.includes('abc123'));
    assert.ok(md.includes('JavaScript'));
    assert.ok(md.includes('npm/Node.js'));
  },
};
