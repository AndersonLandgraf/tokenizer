/**
 * tokenizer-config.js — shared configuration for tokenizer hooks
 *
 * Priority: TOKENIZER_MODE env var > ~/.config/tokenizer/config.json > default "full"
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_MODES = ['off', 'lite', 'full', 'ultra'];
const DEFAULT_MODE = 'full';

function getConfigFilePath() {
  return path.join(os.homedir(), '.config', 'tokenizer', 'config.json');
}

function getFlagFilePath() {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(configDir, '.tokenizer-active');
}

function resolveMode() {
  // Priority 1: env var
  const envMode = process.env.TOKENIZER_MODE;
  if (envMode && VALID_MODES.includes(envMode.toLowerCase())) {
    return envMode.toLowerCase();
  }

  // Priority 2: config file
  try {
    const configPath = getConfigFilePath();
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.mode && VALID_MODES.includes(config.mode)) {
        return config.mode;
      }
    }
  } catch {
    // ignore config errors
  }

  // Priority 3: flag file (set by slash commands during session)
  try {
    const flagPath = getFlagFilePath();
    if (fs.existsSync(flagPath)) {
      const mode = fs.readFileSync(flagPath, 'utf8').trim();
      if (VALID_MODES.includes(mode)) {
        return mode;
      }
    }
  } catch {
    // ignore flag errors
  }

  return DEFAULT_MODE;
}

function writeFlag(mode) {
  if (!VALID_MODES.includes(mode)) return false;
  try {
    const flagPath = getFlagFilePath();
    const flagDir = path.dirname(flagPath);
    if (!fs.existsSync(flagDir)) {
      fs.mkdirSync(flagDir, { recursive: true });
    }
    // Atomic write via temp file
    const tmpPath = flagPath + '.tmp';
    fs.writeFileSync(tmpPath, mode, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, flagPath);
    return true;
  } catch {
    return false;
  }
}

function readFlag() {
  try {
    const flagPath = getFlagFilePath();
    if (fs.existsSync(flagPath)) {
      const mode = fs.readFileSync(flagPath, 'utf8').trim();
      if (VALID_MODES.includes(mode)) return mode;
    }
  } catch {
    // ignore
  }
  return null;
}

module.exports = {
  VALID_MODES,
  DEFAULT_MODE,
  resolveMode,
  writeFlag,
  readFlag,
  getFlagFilePath,
  getConfigFilePath,
};
