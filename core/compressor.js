/**
 * compressor.js — Text compression engine for token efficiency
 *
 * Applies rule-based transformations to reduce token count in
 * markdown/text files while preserving meaning and code blocks.
 *
 * This is a deterministic, no-LLM-needed compressor for common patterns.
 * For deeper semantic compression, use the LLM-based skill.
 */

const fs = require('fs');
const path = require('path');

// ── Phrase replacements (longer phrases first to avoid partial matches) ──
const PHRASE_MAP = [
  // Multi-word → short
  ['in order to', 'to'],
  ['make sure to', 'ensure'],
  ['make sure that', 'ensure'],
  ['keep in mind that', 'note:'],
  ['keep in mind', 'note:'],
  ['it is important to note that', 'note:'],
  ['important to note that', 'note:'],
  ['please note that', 'note:'],
  ['note that', 'note:'],
  ['remember to', 'ensure'],
  ['remember that', 'note:'],
  ['with respect to', 're'],
  ['as well as', '+'],
  ['in addition to', '+'],
  ['in addition', 'also'],
  ['for example', 'eg'],
  ['for instance', 'eg'],
  ['such as', 'eg'],
  ['that is to say', 'ie'],
  ['that is', 'ie'],
  ['instead of', 'vs'],
  ['as opposed to', 'vs'],
  ['because of', 'b/c'],
  ['due to the fact that', 'b/c'],
  ['and so on', 'etc'],
  ['and more', 'etc'],
  ['et cetera', 'etc'],
  ['should not', "don't"],
  ['do not', "don't"],
  ['does not', "doesn't"],
  ['cannot', "can't"],
  ['will not', "won't"],
  ['is not', "isn't"],
  ['are not', "aren't"],
  ['would not', "wouldn't"],
  ['could not', "couldn't"],
  ['has not', "hasn't"],
  ['have not', "haven't"],
  ['did not', "didn't"],
  ['please make sure', 'ensure'],
  ['you should always', 'always'],
  ['you should', ''],
  ['you need to', ''],
  ['you must', 'must'],
  ['you can', 'can'],
  ['make sure', 'ensure'],
  ['be sure to', 'ensure'],
];

// ── Filler words to remove (with word boundaries) ──
const FILLER_WORDS = [
  'please', 'just', 'simply', 'basically', 'actually', 'really',
  'certainly', 'definitely', 'obviously', 'clearly', 'essentially',
  'generally speaking', 'as a general rule', 'it goes without saying',
  'needless to say', 'of course', 'as you know', 'as we know',
];

// ── Article removal ──
const ARTICLES = ['the', 'a', 'an'];

/**
 * Extract code blocks from text, replacing them with placeholders.
 * Returns { text, blocks } where blocks[i] corresponds to placeholder __CODE_BLOCK_i__.
 */
function extractCodeBlocks(text) {
  const blocks = [];
  const result = text.replace(/```[\s\S]*?```/g, (match) => {
    const idx = blocks.length;
    blocks.push(match);
    return `__CODE_BLOCK_${idx}__`;
  });

  // Also extract inline code
  const result2 = result.replace(/`[^`\n]+`/g, (match) => {
    const idx = blocks.length;
    blocks.push(match);
    return `__CODE_BLOCK_${idx}__`;
  });

  return { text: result2, blocks };
}

/**
 * Restore code blocks from placeholders.
 */
function restoreCodeBlocks(text, blocks) {
  return text.replace(/__CODE_BLOCK_(\d+)__/g, (_, idx) => blocks[parseInt(idx)]);
}

/**
 * Apply phrase replacements.
 */
function applyPhraseReplacements(text) {
  let result = text;
  for (const [from, to] of PHRASE_MAP) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, to);
  }
  return result;
}

/**
 * Remove filler words.
 */
function removeFillerWords(text) {
  let result = text;
  for (const filler of FILLER_WORDS) {
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Remove filler + optional following comma/space
    const regex = new RegExp(`\\b${escaped}\\b[,]?\\s*`, 'gi');
    result = result.replace(regex, '');
  }
  return result;
}

/**
 * Remove articles (a, an, the) except at sentence start when it'd be weird.
 */
function removeArticles(text) {
  let result = text;
  for (const article of ARTICLES) {
    // Remove article mid-sentence (preceded by space)
    const regex = new RegExp(`(?<=\\s)${article}\\s+`, 'gi');
    result = result.replace(regex, '');
  }
  return result;
}

/**
 * Collapse multiple spaces/blank lines.
 */
function collapseWhitespace(text) {
  return text
    .replace(/[ \t]+/g, ' ')           // Multiple spaces → single
    .replace(/\n{3,}/g, '\n\n')        // 3+ newlines → 2
    .replace(/^\s+$/gm, '')            // Blank lines with spaces
    .trim();
}

/**
 * Structural transform: convert prose to dense bullets/tables.
 * Applied only when options.structured === true.
 *
 * Transformations:
 * 1. Strip section lead-ins ("This section describes X")
 * 2. Convert numbered prose steps (1. ... 2. ...) to bullets
 * 3. Convert "Please X. Please Y. Please Z." patterns to bullets
 * 4. Collapse short paragraphs after headings into inline bullets
 * 5. Strip redundant intros like "Here are the..."
 */
function applyStructuredTransform(text) {
  let result = text;

  // 1. Strip section lead-ins — common verbose patterns after headings
  const leadIns = [
    /^(This (section|document|skill|prompt|guide|agent) (is used to|describes|explains|helps|provides|is designed to)[^\n.]*\.)\s*/gim,
    /^(In this (section|document|guide),?[^\n.]*\.)\s*/gim,
    /^(Here (is|are) (the|some)[^\n.]*:)\s*/gim,
    /^(The following (is|are|describes)[^\n.]*:)\s*/gim,
    /^(When you (are )?perform(ing)?[^,\n]*, please make sure that you follow these steps carefully(and in order)?:)\s*/gim,
    /^(It is (really |very )?important (to note )?that[^\n.]*\.)\s*/gim,
  ];
  for (const regex of leadIns) {
    result = result.replace(regex, '');
  }

  // 2. Convert numbered prose steps into bullet lists
  // Pattern: "1. Long prose sentence.\n\n2. Another long prose sentence."
  // → "- Long prose sentence.\n- Another long prose sentence."
  result = result.replace(/^(\d+)\.\s+/gm, '- ');

  // 3. Strip "Please make sure..." / "Please X" at start of sentences → imperative
  result = result.replace(/\bPlease (make sure that you |ensure that you |ensure you |)/gi, '');
  result = result.replace(/\bYou (should|need to|must) (always |)/gi, '');
  result = result.replace(/\bMake sure that you (always |)/gi, '');

  // 4. Collapse "In addition to that," / "Also," / "Furthermore," connectors
  result = result.replace(/^(In addition to that,?|Also,?|Furthermore,?|Moreover,?|Additionally,?)\s+/gim, '- ');

  // 5. Convert "A X is Y. A X should Z." → bullet definitions
  // Keep this conservative — only for explicit "is a" patterns
  // (skipped for now — too risky of introducing bugs)

  // 6. Strip empty bullet lines + merge with following line
  result = result.replace(/^-\s*$/gm, '');

  // 7. Collapse consecutive single-sentence paragraphs into bullet list
  // Look for 2+ paragraphs each being a single short sentence
  const paragraphs = result.split(/\n\n+/);
  const collapsed = [];
  let buffer = [];

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    if (buffer.length >= 2 && buffer.every(p => p.length < 200 && !p.startsWith('-') && !p.startsWith('#') && !p.startsWith('```') && !p.includes('\n'))) {
      // Convert to bullets
      collapsed.push(buffer.map(p => `- ${p}`).join('\n'));
    } else {
      collapsed.push(buffer.join('\n\n'));
    }
    buffer = [];
  };

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    // Skip headings, existing bullets, code blocks
    if (trimmed.startsWith('#') || trimmed.startsWith('-') || trimmed.startsWith('```') || trimmed.startsWith('__CODE_BLOCK_')) {
      flushBuffer();
      collapsed.push(trimmed);
    } else {
      buffer.push(trimmed);
    }
  }
  flushBuffer();

  result = collapsed.join('\n\n');

  return result;
}

/**
 * Remove redundant/obvious instructions that most agents already know.
 */
function removeObvious(text) {
  const obvious = [
    /^[-*]\s*(write|follow|use)\s+(clean|good|best|proper)\s+(code|practices|conventions).*$/gim,
    /^[-*]\s*follow\s+best\s+practices.*$/gim,
    /^[-*]\s*write\s+clean\s+(and\s+)?maintainable\s+code.*$/gim,
    /^[-*]\s*use\s+meaningful\s+variable\s+names.*$/gim,
    /^[-*]\s*keep\s+code\s+(clean|readable|organized).*$/gim,
  ];

  let result = text;
  for (const regex of obvious) {
    result = result.replace(regex, '');
  }
  return result;
}

/**
 * Main compression function.
 *
 * Options:
 *   level: 'lite' | 'full' | 'ultra' (default: 'full')
 *
 * Returns: { compressed, originalTokens, compressedTokens, savings }
 */
function compress(text, options = {}) {
  const level = options.level || 'full';
  const originalTokens = Math.ceil(text.length / 4);

  // Extract code blocks (protected from compression)
  const { text: stripped, blocks } = extractCodeBlocks(text);

  let result = stripped;

  // Optional structured pass — runs BEFORE phrase replacement for cleaner output
  if (options.structured) {
    result = applyStructuredTransform(result);
  }

  // All levels: phrase replacements + filler removal
  result = applyPhraseReplacements(result);
  result = removeFillerWords(result);

  if (level === 'full' || level === 'ultra') {
    result = removeArticles(result);
    result = removeObvious(result);
  }

  if (level === 'ultra') {
    // Additional abbreviations for ultra mode
    const ultraReplacements = [
      [/\bconfiguration\b/gi, 'cfg'],
      [/\bauthentication\b/gi, 'auth'],
      [/\bauthorization\b/gi, 'authz'],
      [/\bdatabase\b/gi, 'DB'],
      [/\bfunction\b/gi, 'fn'],
      [/\bdependency\b/gi, 'dep'],
      [/\bdependencies\b/gi, 'deps'],
      [/\bpackage\b/gi, 'pkg'],
      [/\bpackages\b/gi, 'pkgs'],
      [/\bdirectory\b/gi, 'dir'],
      [/\bdirectories\b/gi, 'dirs'],
      [/\benvironment\b/gi, 'env'],
      [/\brepository\b/gi, 'repo'],
      [/\bimplementation\b/gi, 'impl'],
      [/\binitialize\b/gi, 'init'],
      [/\binitialization\b/gi, 'init'],
      [/\bparameter\b/gi, 'param'],
      [/\bparameters\b/gi, 'params'],
      [/\bargument\b/gi, 'arg'],
      [/\barguments\b/gi, 'args'],
      [/\bmiddleware\b/gi, 'mw'],
      [/\bendpoint\b/gi, 'ep'],
      [/\bendpoints\b/gi, 'eps'],
      [/\bcomponent\b/gi, 'cmp'],
      [/\bcomponents\b/gi, 'cmps'],
      [/\bdevelopment\b/gi, 'dev'],
      [/\bproduction\b/gi, 'prod'],
      [/\basynchronous\b/gi, 'async'],
      [/\bsynchronous\b/gi, 'sync'],
      [/\bapplication\b/gi, 'app'],
      [/\bdocumentation\b/gi, 'docs'],
      [/\btypescript\b/gi, 'TS'],
      [/\bjavascript\b/gi, 'JS'],
    ];

    for (const [regex, replacement] of ultraReplacements) {
      result = result.replace(regex, replacement);
    }
  }

  // Clean up whitespace
  result = collapseWhitespace(result);

  // Restore code blocks
  result = restoreCodeBlocks(result, blocks);

  const compressedTokens = Math.ceil(result.length / 4);
  const savings = originalTokens > 0
    ? Math.round((1 - compressedTokens / originalTokens) * 100)
    : 0;

  return {
    compressed: result,
    originalTokens,
    compressedTokens,
    savings,
  };
}

/**
 * Compress a file in-place, backing up the original.
 */
function compressFile(filePath, options = {}) {
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  const content = fs.readFileSync(absPath, 'utf8');
  const result = compress(content, options);

  // Backup original
  const ext = path.extname(absPath);
  const base = absPath.slice(0, -ext.length);
  const backupPath = `${base}.original${ext}`;

  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, content, 'utf8');
  }

  // Write compressed
  fs.writeFileSync(absPath, result.compressed, 'utf8');

  return {
    ...result,
    backupPath,
    filePath: absPath,
  };
}

/**
 * Restore a file from its .original backup.
 */
function restoreFile(filePath) {
  const absPath = path.resolve(filePath);
  const ext = path.extname(absPath);
  const base = absPath.slice(0, -ext.length);
  const backupPath = `${base}.original${ext}`;

  if (!fs.existsSync(backupPath)) {
    throw new Error(`No backup found: ${backupPath}`);
  }

  const content = fs.readFileSync(backupPath, 'utf8');
  fs.writeFileSync(absPath, content, 'utf8');
  fs.unlinkSync(backupPath);

  return { restored: absPath, removed: backupPath };
}

module.exports = {
  compress,
  compressFile,
  restoreFile,
  estimateTokens: (text) => Math.ceil(text.length / 4),
};
