---
name: tokenizer-fingerprint
description: Generate a compact codebase fingerprint so agents don't re-explore the tree every session
---

# tokenizer-fingerprint — codebase fingerprint cache

Scan project once → cache summary in `.tokenizer/fingerprint.md`. Coding agents read the cache instead of re-exploring the file tree every session. Invalidation is automatic (hash of files + mtimes).

## Usage

- `/tokenizer-fingerprint` — generate/refresh cache
- `/tokenizer-fingerprint --force` — force regeneration
- `/tokenizer-fingerprint --dry-run` — preview without writing
- `/tokenizer-fingerprint --print` — print fingerprint after writing

## What's captured

- Languages + percentages (by bytes)
- Package manager detected (npm, Cargo, pip, etc.)
- Entry points (`package.json.main`, `bin`, common conventions)
- npm scripts
- Runtime dependencies (top 20)
- Config files (tsconfig, eslint, vite, jest, docker, CI workflows)
- Directory tree summary (depth 2)
- SHA-256 hash of tree state → skips regeneration if unchanged

## Integration

**Claude Code** — add to `CLAUDE.md`:

```markdown
## Codebase
@.tokenizer/fingerprint.md
```

**GitHub Copilot / other agents** — inject inline into `.github/copilot-instructions.md`:

```bash
node {{TOKENIZER_ROOT}}/core/cli.js fingerprint --wire
```

This writes the fingerprint content between `<!-- tokenizer:fingerprint:start/end -->` markers. Re-run after structural changes. Use `--unwire` to remove.

Or manually paste `.tokenizer/fingerprint.md` content into any agent instruction file.

## Process

1. Run `node {{TOKENIZER_ROOT}}/core/cli.js fingerprint [dir]`
2. If `cached` → nothing to do, cache valid
3. If `generated` → new fingerprint written, report token cost
4. Wire into agent instruction files (once) via `--wire` flag or manually

## When to use

- First time working on a repo → build fingerprint once
- After major structural changes (new deps, new top-level dirs) → force refresh
- Before handing project to another agent/session
