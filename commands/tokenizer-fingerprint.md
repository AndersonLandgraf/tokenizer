---
description: Generate/refresh codebase fingerprint cache
argument-hint: [dir] [--force] [--dry-run] [--print]
---

Run tokenizer fingerprint. Arguments: $ARGUMENTS (optional dir + flags).

Execute: `node {{TOKENIZER_ROOT}}/core/cli.js fingerprint $ARGUMENTS`

Report status terseley:
- If `cached` → fingerprint is up-to-date, no work needed.
- If `generated` → new fingerprint at `.tokenizer/fingerprint.md`. Mention token cost.

Suggest referencing `.tokenizer/fingerprint.md` from CLAUDE.md via `@.tokenizer/fingerprint.md` so agent reads it without re-exploring the tree.
