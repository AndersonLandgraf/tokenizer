/**
 * fingerprint.js — Codebase fingerprint generator
 *
 * Scans a project once + caches a compact summary so coding agents don't
 * re-explore the tree on every session. Output: `.tokenizer/fingerprint.md`
 * (human/agent readable) + `.tokenizer/fingerprint.json` (machine readable).
 *
 * Invalidation: cache hash derived from file tree + mtime. If nothing
 * changed, regeneration is a no-op.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', '.next',
  '.nuxt', '.cache', '.venv', 'venv', '__pycache__', '.pytest_cache',
  '.tokenizer', 'coverage', '.turbo', '.parcel-cache', 'vendor',
]);

const IGNORE_FILES = new Set([
  '.DS_Store', 'Thumbs.db', '.env', '.env.local',
]);

const CODE_EXTENSIONS = {
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.jsx': 'JavaScript',
  '.py': 'Python', '.rb': 'Ruby', '.go': 'Go', '.rs': 'Rust',
  '.java': 'Java', '.kt': 'Kotlin', '.swift': 'Swift',
  '.c': 'C', '.cpp': 'C++', '.cc': 'C++', '.h': 'C', '.hpp': 'C++',
  '.cs': 'C#', '.php': 'PHP', '.sh': 'Shell', '.ps1': 'PowerShell',
  '.lua': 'Lua', '.r': 'R', '.scala': 'Scala', '.ex': 'Elixir',
  '.exs': 'Elixir', '.erl': 'Erlang', '.clj': 'Clojure',
  '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.vue': 'Vue',
  '.svelte': 'Svelte',
};

const MANIFEST_FILES = {
  'package.json': 'npm/Node.js',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'Yarn',
  'requirements.txt': 'Python (pip)',
  'pyproject.toml': 'Python (Poetry/PEP 621)',
  'Pipfile': 'Python (Pipenv)',
  'Cargo.toml': 'Rust (Cargo)',
  'go.mod': 'Go Modules',
  'pom.xml': 'Java (Maven)',
  'build.gradle': 'Gradle',
  'build.gradle.kts': 'Gradle (Kotlin)',
  'Gemfile': 'Ruby (Bundler)',
  'composer.json': 'PHP (Composer)',
  'mix.exs': 'Elixir (Mix)',
  'deno.json': 'Deno',
  'bun.lockb': 'Bun',
};

const CONFIG_FILES = [
  'tsconfig.json', 'jsconfig.json', '.eslintrc', '.eslintrc.json', '.eslintrc.js',
  '.prettierrc', '.prettierrc.json', 'vite.config.js', 'vite.config.ts',
  'webpack.config.js', 'rollup.config.js', 'next.config.js', 'nuxt.config.js',
  'jest.config.js', 'jest.config.ts', 'vitest.config.js', 'vitest.config.ts',
  'playwright.config.ts', 'Dockerfile', 'docker-compose.yml', '.github/workflows',
];

function walkTree(rootDir, maxDepth = 4) {
  const tree = [];
  const files = [];

  function walk(dir, depth, relBase = '') {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && !['.github', '.vscode'].includes(entry.name)) continue;
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (IGNORE_FILES.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(relBase, entry.name).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        tree.push({ type: 'dir', path: relPath, depth });
        walk(fullPath, depth + 1, relPath);
      } else if (entry.isFile()) {
        let stat;
        try { stat = fs.statSync(fullPath); } catch { continue; }
        tree.push({ type: 'file', path: relPath, depth, size: stat.size, mtime: stat.mtimeMs });
        files.push({ path: relPath, abs: fullPath, size: stat.size, mtime: stat.mtimeMs });
      }
    }
  }

  walk(rootDir, 0);
  return { tree, files };
}

function detectLanguages(files) {
  const counts = {};
  let totalBytes = 0;

  for (const f of files) {
    const ext = path.extname(f.path).toLowerCase();
    const lang = CODE_EXTENSIONS[ext];
    if (!lang) continue;
    counts[lang] = counts[lang] || { files: 0, bytes: 0 };
    counts[lang].files += 1;
    counts[lang].bytes += f.size;
    totalBytes += f.size;
  }

  return Object.entries(counts)
    .map(([lang, data]) => ({
      lang,
      files: data.files,
      bytes: data.bytes,
      percent: totalBytes > 0 ? Math.round((data.bytes / totalBytes) * 100) : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

function detectPackageManagers(rootDir, files) {
  const detected = [];
  for (const f of files) {
    const basename = path.basename(f.path);
    if (MANIFEST_FILES[basename] && f.path === basename) {
      detected.push({ file: basename, system: MANIFEST_FILES[basename] });
    }
  }
  return detected;
}

function readPackageJson(rootDir) {
  const pkgPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const content = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(content);
    return {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      main: pkg.main,
      bin: pkg.bin,
      scripts: pkg.scripts ? Object.keys(pkg.scripts) : [],
      dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
      devDependencies: pkg.devDependencies ? Object.keys(pkg.devDependencies) : [],
    };
  } catch {
    return null;
  }
}

function findEntryPoints(rootDir, files, pkg) {
  const entries = [];
  if (pkg?.main) entries.push({ kind: 'main', path: pkg.main });
  if (pkg?.bin) {
    if (typeof pkg.bin === 'string') entries.push({ kind: 'bin', path: pkg.bin });
    else for (const [name, p] of Object.entries(pkg.bin)) entries.push({ kind: `bin:${name}`, path: p });
  }

  const commonEntries = ['index.js', 'index.ts', 'main.py', 'main.go', 'main.rs', 'app.js', 'app.ts', 'server.js'];
  for (const e of commonEntries) {
    if (files.find(f => f.path === e)) entries.push({ kind: 'entry', path: e });
  }

  const srcEntries = ['src/index.js', 'src/index.ts', 'src/main.js', 'src/main.ts', 'src/app.ts', 'src/app.js'];
  for (const e of srcEntries) {
    if (files.find(f => f.path === e)) entries.push({ kind: 'entry', path: e });
  }

  return entries;
}

function findConfigFiles(files) {
  const configs = [];
  for (const f of files) {
    const basename = path.basename(f.path);
    if (CONFIG_FILES.some(c => c === basename || c === f.path || f.path.startsWith(c + '/'))) {
      configs.push(f.path);
    }
  }
  return configs;
}

function summarizeTree(tree, maxLines = 40) {
  // Show only directories + top-level files (depth 0-2)
  const lines = [];
  const dirs = tree.filter(t => t.type === 'dir' && t.depth <= 2);
  const topFiles = tree.filter(t => t.type === 'file' && t.depth === 0);

  for (const d of dirs.slice(0, maxLines - topFiles.length)) {
    const indent = '  '.repeat(d.depth);
    lines.push(`${indent}${path.basename(d.path)}/`);
  }
  for (const f of topFiles.slice(0, 10)) {
    lines.push(path.basename(f.path));
  }
  return lines;
}

function computeFingerprintHash(files) {
  const hash = crypto.createHash('sha256');
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sorted) {
    hash.update(`${f.path}:${f.size}:${Math.floor(f.mtime)}`);
  }
  return hash.digest('hex').slice(0, 16);
}

function generateFingerprint(rootDir) {
  rootDir = path.resolve(rootDir || process.cwd());

  const { tree, files } = walkTree(rootDir);
  const languages = detectLanguages(files);
  const packageManagers = detectPackageManagers(rootDir, files);
  const pkg = readPackageJson(rootDir);
  const entryPoints = findEntryPoints(rootDir, files, pkg);
  const configs = findConfigFiles(files);
  const treeSummary = summarizeTree(tree);
  const hash = computeFingerprintHash(files);

  const totalFiles = files.length;
  const totalCodeFiles = files.filter(f => CODE_EXTENSIONS[path.extname(f.path).toLowerCase()]).length;
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  return {
    hash,
    generated: new Date().toISOString(),
    rootDir,
    stats: {
      totalFiles,
      totalCodeFiles,
      totalBytes,
    },
    languages,
    packageManagers,
    package: pkg,
    entryPoints,
    configs,
    treeSummary,
  };
}

function renderMarkdown(fp) {
  const lines = [];
  lines.push(`# Codebase Fingerprint`);
  lines.push('');
  lines.push(`Generated: ${fp.generated}`);
  lines.push(`Hash: \`${fp.hash}\``);
  lines.push('');

  lines.push(`## Project`);
  if (fp.package) {
    lines.push(`- Name: \`${fp.package.name || '(unnamed)'}\``);
    if (fp.package.version) lines.push(`- Version: \`${fp.package.version}\``);
    if (fp.package.description) lines.push(`- Description: ${fp.package.description}`);
  }
  lines.push(`- Files: ${fp.stats.totalFiles} (${fp.stats.totalCodeFiles} code files)`);
  lines.push(`- Size: ${Math.round(fp.stats.totalBytes / 1024)} KB`);
  lines.push('');

  if (fp.languages.length > 0) {
    lines.push(`## Languages`);
    for (const l of fp.languages.slice(0, 5)) {
      lines.push(`- ${l.lang}: ${l.files} files (~${l.percent}%)`);
    }
    lines.push('');
  }

  if (fp.packageManagers.length > 0) {
    lines.push(`## Package Manager`);
    for (const pm of fp.packageManagers) {
      lines.push(`- ${pm.system} (\`${pm.file}\`)`);
    }
    lines.push('');
  }

  if (fp.entryPoints.length > 0) {
    lines.push(`## Entry Points`);
    for (const e of fp.entryPoints) {
      lines.push(`- ${e.kind}: \`${e.path}\``);
    }
    lines.push('');
  }

  if (fp.package?.scripts?.length > 0) {
    lines.push(`## Scripts`);
    lines.push(`\`${fp.package.scripts.join('`, `')}\``);
    lines.push('');
  }

  if (fp.package?.dependencies?.length > 0) {
    lines.push(`## Runtime Dependencies (${fp.package.dependencies.length})`);
    lines.push(fp.package.dependencies.slice(0, 20).map(d => `\`${d}\``).join(', ')
      + (fp.package.dependencies.length > 20 ? `, … +${fp.package.dependencies.length - 20} more` : ''));
    lines.push('');
  }

  if (fp.configs.length > 0) {
    lines.push(`## Config Files`);
    for (const c of fp.configs.slice(0, 10)) {
      lines.push(`- \`${c}\``);
    }
    lines.push('');
  }

  if (fp.treeSummary.length > 0) {
    lines.push(`## Structure`);
    lines.push('```');
    for (const line of fp.treeSummary) lines.push(line);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

function writeFingerprint(rootDir, options = {}) {
  rootDir = path.resolve(rootDir || process.cwd());
  const cacheDir = path.join(rootDir, '.tokenizer');
  const jsonPath = path.join(cacheDir, 'fingerprint.json');
  const mdPath = path.join(cacheDir, 'fingerprint.md');

  // Check if existing fingerprint is still valid
  if (!options.force && fs.existsSync(jsonPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const { files } = walkTree(rootDir);
      const currentHash = computeFingerprintHash(files);
      if (existing.hash === currentHash) {
        return { status: 'cached', hash: currentHash, path: mdPath };
      }
    } catch {
      // Fall through to regenerate
    }
  }

  const fp = generateFingerprint(rootDir);
  const md = renderMarkdown(fp);

  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(fp, null, 2), 'utf8');
  fs.writeFileSync(mdPath, md, 'utf8');

  const mdTokens = Math.ceil(md.length / 4);

  return {
    status: 'generated',
    hash: fp.hash,
    path: mdPath,
    jsonPath,
    tokens: mdTokens,
    stats: fp.stats,
  };
}

module.exports = {
  generateFingerprint,
  writeFingerprint,
  renderMarkdown,
  computeFingerprintHash,
};
