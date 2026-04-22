---
description: Analyze token usage across agent config files
argument-hint: [dir]
---

Run tokenizer audit. Arguments: $ARGUMENTS (optional dir, default cwd).

Execute: `node {{TOKENIZER_ROOT}}/core/cli.js audit $ARGUMENTS`

Summarize findings terseley. List BLOATED + HEAVY files. Suggest `/tokenizer-compress <file>` for top offenders.
