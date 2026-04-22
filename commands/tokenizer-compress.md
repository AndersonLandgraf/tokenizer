---
description: Compress agent config files for token efficiency
argument-hint: <filepath> | --all | --dry-run <file> | --restore <file>
---

Compress file(s) via tokenizer CLI. Arguments: $ARGUMENTS

Run the appropriate command:
- For `--restore <file>`: `node {{TOKENIZER_ROOT}}/core/cli.js restore <file>`
- Otherwise: `node {{TOKENIZER_ROOT}}/core/cli.js compress $ARGUMENTS`

Flags the user can pass: `--all`, `--dry-run`, `--lite`, `--ultra`, `--structured`.

Report before → after tokens + savings % terseley. Don't re-explain the flags unless asked.
