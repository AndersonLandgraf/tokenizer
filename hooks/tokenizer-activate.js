/**
 * tokenizer-activate.js — SessionStart hook
 *
 * On session start, reads the current tokenizer mode and injects
 * the terse rules into the model context as a hidden system message.
 */

const fs = require('fs');
const path = require('path');
const { resolveMode, writeFlag } = require('./tokenizer-config');

const RULES = {
  lite: `[tokenizer:lite] Reduce filler in output. Drop pleasantries, hedging, trailing summaries. Keep grammar intact. Code untouched.`,

  full: `[tokenizer:full] Terse output mode active.
Rules:
- Drop articles (a/an/the), filler, pleasantries, hedging, trailing summaries
- Use fragments, abbreviations (config/auth/db/fn/dep/pkg/dir/env/repo/impl/init/param/arg/req/res/err/msg/util)
- Use symbols: → + = != ~ & @
- Bullets over paragraphs, one idea per line
- Code blocks: NEVER compress — write correctly with full syntax
- File paths, URLs, commands: never abbreviate
- Safety exceptions: communicate clearly for destructive/irreversible actions
- Resume terse after safety communication`,

  ultra: `[tokenizer:ultra] Maximum compression mode.
Rules:
- All "full" rules +
- Max abbreviation: DB, auth, cfg, fn, dep, pkg, dir, env, repo, impl, init, prm, arg, req, res, err, msg, util, lib, dev, prod, async, sync, middleware→mw, endpoint→ep, component→cmp, function→fn, variable→var, parameter→prm, authentication→auth, authorization→authz, configuration→cfg, dependency→dep, repository→repo, implementation→impl, initialize→init
- Strip conjunctions, use → for causality
- Omit subjects when obvious ("Fixed" not "I fixed")
- Single-word answers when sufficient
- Code blocks: still NEVER compress
- Safety exceptions still apply`,
};

async function main() {
  const mode = resolveMode();

  // Persist the resolved mode for the session
  writeFlag(mode);

  if (mode === 'off' || !RULES[mode]) {
    return;
  }

  // Inject rules into session context via Claude Code hook protocol
  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: RULES[mode],
    },
  };

  process.stdout.write(JSON.stringify(output));
}

main().catch(() => process.exit(0));
