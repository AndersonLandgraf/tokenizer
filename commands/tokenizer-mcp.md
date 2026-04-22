---
description: Audit MCP server config + estimate schema token cost
argument-hint: [dir]
---

Run tokenizer MCP audit. Arguments: $ARGUMENTS (optional dir, default cwd).

Execute: `node {{TOKENIZER_ROOT}}/core/cli.js mcp $ARGUMENTS`

Summarize terseley:
- List servers, tokens per server, scope (project/user)
- Flag HEAVY servers (>3000 tokens)
- Suggest disabling unused servers — project-scoped `.mcp.json` beats global
