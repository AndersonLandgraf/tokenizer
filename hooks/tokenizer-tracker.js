/**
 * tokenizer-tracker.js — UserPromptSubmit hook
 *
 * Runs on every user prompt. Handles:
 * 1. Detecting /tokenizer mode-switch commands in natural language
 * 2. Per-turn reinforcement of terse mode (prevents drift)
 * 3. Auto-compact nudge when conversation seems heavy
 */

const { resolveMode, writeFlag, readFlag, VALID_MODES } = require('./tokenizer-config');

// Patterns to detect mode switching in natural language
const ACTIVATE_PATTERNS = [
  /\btokenizer\s+(on|activate|enable)\b/i,
  /\b(activate|enable|start)\s+tokenizer\b/i,
  /\btokenizer\s+mode\s+(on|full|lite|ultra)\b/i,
];

const DEACTIVATE_PATTERNS = [
  /\btokenizer\s+(off|deactivate|disable)\b/i,
  /\b(deactivate|disable|stop)\s+tokenizer\b/i,
  /\btokenizer\s+mode\s+off\b/i,
  /\bnormal\s+mode\b/i,
];

const MODE_SWITCH_PATTERN = /\btokenizer\s+(lite|full|ultra)\b/i;

function detectModeSwitch(prompt) {
  // Check deactivation first
  for (const pat of DEACTIVATE_PATTERNS) {
    if (pat.test(prompt)) return 'off';
  }

  // Check specific mode switch
  const modeMatch = prompt.match(MODE_SWITCH_PATTERN);
  if (modeMatch) return modeMatch[1].toLowerCase();

  // Check generic activation
  for (const pat of ACTIVATE_PATTERNS) {
    if (pat.test(prompt)) return 'full';
  }

  return null;
}

// Minimal per-turn reinforcement messages (kept tiny to save tokens)
const REINFORCEMENT = {
  lite: '[tokenizer:lite active — drop filler+pleasantries, keep grammar]',
  full: '[tokenizer:full — terse fragments, abbrevs, symbols. Code untouched.]',
  ultra: '[tokenizer:ultra — max compress prose. Code untouched.]',
};

async function main() {
  // Read user prompt from stdin
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }

  const prompt = data.prompt || data.message || '';

  // Check for mode switching
  const switchTo = detectModeSwitch(prompt);
  if (switchTo) {
    writeFlag(switchTo);
    if (switchTo === 'off') {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: '[tokenizer deactivated — normal output mode]',
        },
      }));
      return;
    }
  }

  // Get current mode
  const mode = switchTo || readFlag() || resolveMode();

  if (mode === 'off' || !REINFORCEMENT[mode]) {
    return;
  }

  // Per-turn reinforcement (tiny, hidden)
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: REINFORCEMENT[mode],
    },
  }));
}

main().catch(() => process.exit(0));
