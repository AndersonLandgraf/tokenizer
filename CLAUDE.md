# tokenizer

Token optimization plugin for Claude Code + GitHub Copilot. Compresses input context + terse output + audit tooling.

## Dual-agent parity — REQUIREMENT

Every feature must ship with implementations for BOTH agents:
- **Claude Code** (hooks, skills, slash commands, CLAUDE.md injection)
- **GitHub Copilot** (`.github/copilot-instructions.md`, prompt files @ `.github/prompts/`, context files)

Both agents support MCP (Claude Code natively, Copilot via VS Code ≥1.98 using `.vscode/mcp.json`). If a feature ever IS agent-specific, document the gap + provide the closest analog for the other agent.

Workflow when adding a feature:
1. Build core engine in `core/` (agent-agnostic)
2. Wire up for Claude → skill + slash command + hook if needed
3. Wire up for Copilot → adapter file in `adapters/copilot/` + inject reference into `.github/copilot-instructions.md`
4. Test on both agents
5. Document the Copilot limitation if parity isn't possible

## Structure
- `skills/tokenizer/` — core terse mode skill
- `skills/tokenizer-compress/` — file compression skill
- `skills/tokenizer-audit/` — token audit/stats skill
- `skills/tokenizer-fingerprint/` — codebase fingerprint cache skill
- `core/` — engine (compressor, scanner, MCP auditor, fingerprint)
- `hooks/` — session activation, per-turn tracking, statusline
- `commands/` — slash command definitions
- `rules/` — activation rules injected into context
- `adapters/claude/` — Claude Code adapter (rules + install guide)
- `adapters/copilot/` — GitHub Copilot adapter (instructions file + snippet)
- `install.js` — installer (global or per-project)
- `settings-template.json` — reference hooks config
