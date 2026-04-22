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

Add to project's `CLAUDE.md` to auto-load:

```markdown
## Codebase
@.tokenizer/fingerprint.md
```

Claude reads referenced files on demand — fingerprint loads only when relevant.

## Process

1. Run `node {{TOKENIZER_ROOT}}/core/cli.js fingerprint [dir]`
2. If `cached` returned → nothing to do, cache is valid
3. If `generated` → new fingerprint written, report token cost
4. Optionally advise user to reference `@.tokenizer/fingerprint.md` in CLAUDE.md

## When to use

- First time working on a repo → build fingerprint once
- After major structural changes (new deps, new top-level dirs) → force refresh
- Before handing project to another agent/session
