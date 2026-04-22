# tokenizer

Full-stack token optimizer for Claude Code. Compresses inputs, outputs, and workflow overhead.

Unlike tools that only make the model "talk terse," tokenizer optimizes the **entire pipeline**: what the model reads (CLAUDE.md, skills, MCP schemas, memory), what it writes (output), and helps you find where tokens are wasted.

## What it does

| Layer | What | Savings |
|-------|------|---------|
| **Input compression** | Compresses CLAUDE.md, memory files, docs into dense format | ~40-60% input tokens |
| **Output terse mode** | Context-aware terse output (prose compressed, code untouched) | ~50-70% output tokens |
| **Audit & stats** | Scans project for token bloat, suggests fixes | Identifies waste |
| **MCP audit** | Estimates MCP tool schema load per server, flags heavy ones | Cuts hidden schema tax |
| **Fingerprint cache** | Pre-scans codebase, caches summary so agents don't re-explore | Skips repeat exploration |
| **Auto-compact** | Nudges when conversation context is getting heavy | Prevents context overflow |

---

## Table of Contents

- [Requirements](#requirements)
- [Setup — Claude Code](#setup--claude-code)
- [Setup — GitHub Copilot](#setup--github-copilot)
- [Usage](#usage)
- [Configuration](#configuration)
- [Modes Compared](#modes-compared)
- [How It Saves Tokens](#how-it-saves-tokens)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Requirements

- **Node.js** ≥ 18 (hooks run as Node scripts)
- **Claude Code CLI** (for Claude integration) — install: https://docs.claude.com/claude-code
- **GitHub Copilot** (for Copilot integration) — VS Code or JetBrains extension

Clone this repo somewhere stable (you'll reference its path in config):

```bash
git clone https://github.com/<your-org>/tokenizer.git ~/tools/tokenizer
```

Use an absolute path. On Windows use forward slashes or double-escaped backslashes in JSON.

---

## Setup — Claude Code

Two install paths: **plugin** (recommended) or **manual**.

### Option A — Plugin install (recommended)

From inside the tokenizer directory:

```bash
claude plugins install .
```

That registers skills (`tokenizer`, `tokenizer-compress`, `tokenizer-audit`), slash commands, and hooks automatically.

Verify:

```bash
claude plugins list
```

You should see `tokenizer` in the list. Skip to [Usage](#usage).

### Option B — Manual setup

Do this if you're not using the plugin system, or want per-project control.

#### Step 1 — Register hooks

Open (or create) `~/.claude/settings.json` and merge in the `hooks` block. Replace `<tokenizer-path>` with the absolute path where you cloned this repo:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "node <tokenizer-path>/hooks/tokenizer-activate.js",
        "description": "tokenizer: activate terse mode at session start"
      }
    ],
    "UserPromptSubmit": [
      {
        "command": "node <tokenizer-path>/hooks/tokenizer-tracker.js",
        "description": "tokenizer: per-turn reinforcement"
      }
    ]
  }
}
```

If `~/.claude/settings.json` already has a `hooks` block, merge — don't replace. JSON forbids duplicate keys.

#### Step 2 — Install project rules

Copy the rules file into your project's `.claude/rules/` directory so terse mode stays injected:

```bash
mkdir -p .claude/rules
cp <tokenizer-path>/adapters/claude/rules.md .claude/rules/tokenizer.md
```

#### Step 3 — Install slash commands (optional)

If the plugin system didn't pick them up, symlink or copy the command files:

```bash
mkdir -p ~/.claude/commands
cp <tokenizer-path>/commands/*.md ~/.claude/commands/
```

#### Step 4 — Install skills (optional)

Same pattern for skills:

```bash
mkdir -p ~/.claude/skills
cp -r <tokenizer-path>/skills/* ~/.claude/skills/
```

#### Step 5 — Verify

Start a new Claude Code session. You should see a `SessionStart` notice indicating terse mode active. Test:

```
/tokenizer lite
```

Claude should acknowledge and drop filler in subsequent output.

### Uninstall (Claude)

Remove the hook entries from `~/.claude/settings.json`, delete `.claude/rules/tokenizer.md` from your project, and run `claude plugins uninstall tokenizer` if installed as a plugin.

---

## Setup — GitHub Copilot

Copilot doesn't support runtime hooks, so integration is **instructions-only**: a single file that Copilot reads as context.

### Step 1 — Create the instructions file

From your project root:

```bash
mkdir -p .github
cp <tokenizer-path>/adapters/copilot/copilot-instructions.md .github/copilot-instructions.md
```

Copilot auto-loads `.github/copilot-instructions.md` when the setting `github.copilot.chat.codeGeneration.useInstructionFiles` is enabled (default: on in recent versions).

### Step 2 — Or append to an existing instructions file

If you already have a `.github/copilot-instructions.md`, append the tokenizer snippet instead of overwriting:

```bash
cat <tokenizer-path>/adapters/copilot/copilot-snippet.txt >> .github/copilot-instructions.md
```

### Step 3 — Enable in VS Code (if not already)

Open VS Code settings (`Ctrl+,`), search for `copilot instruction files`, ensure **GitHub › Copilot › Chat › Code Generation: Use Instruction Files** is checked.

### Step 4 — Verify

Open Copilot Chat in your project and ask a simple question (eg: "explain this function"). Responses should come back terse — fragments, abbreviations, no trailing summary.

### Limitations (Copilot)

- No per-turn reinforcement — Copilot may drift back to verbose over long sessions. Re-prompt with "stay terse" if it does.
- No dynamic mode switching (lite/full/ultra). Copilot runs whatever the instructions file specifies. Edit `.github/copilot-instructions.md` to change intensity.
- Skills and `/tokenizer-compress`/`/tokenizer-audit` slash commands are **Claude-only**. For Copilot, use terse mode only.

### Uninstall (Copilot)

Delete `.github/copilot-instructions.md` (or remove the tokenizer section if you merged it with other instructions).

---

## Usage

### Terse Mode (Claude)

```
/tokenizer           → activate full terse mode (default)
/tokenizer lite      → mild: drop filler, keep grammar
/tokenizer full      → moderate: fragments, abbreviations, symbols
/tokenizer ultra     → maximum: abbreviate everything possible
/tokenizer off       → back to normal
```

Natural language also works:
- "activate tokenizer" / "tokenizer on"
- "tokenizer ultra"
- "stop tokenizer" / "normal mode"

### Compress Files (Claude)

```
/tokenizer-compress ./CLAUDE.md            → compress single file
/tokenizer-compress --all                  → compress all agent-config files in project
/tokenizer-compress --dry-run ./CLAUDE.md  → preview savings, no write
/tokenizer-compress --restore ./CLAUDE.md  → restore from .original.md backup
```

### Audit Token Usage (Claude)

```
/tokenizer-audit     → scan project: agent configs + MCP schema load
/tokenizer-mcp       → MCP server audit only
```

Output example:

```
tokenizer audit
================
claude:
  ./CLAUDE.md                    ~320 tokens  OK
  ./src/api/CLAUDE.md            ~2100 tokens BLOATED

MCP servers:
  github                         ~9100 tokens  HEAVY  [user]
  filesystem                     ~3850 tokens  HEAVY  [project]
  sequential-thinking             ~350 tokens  LIGHT  [user]

Total context overhead: ~15720 tokens/request

Recommendations:
- Compress ./src/api/CLAUDE.md (save ~1000 tokens)
- MCP server "github" loads ~9100 tokens — disable if not used often
```

### Fingerprint Cache (Claude)

Scan repo once → cache compact summary so agents don't re-explore the tree every session.

```
/tokenizer-fingerprint             → generate or refresh cache
/tokenizer-fingerprint --force     → force regeneration
/tokenizer-fingerprint --dry-run   → preview without writing
```

Output lands at `.tokenizer/fingerprint.md`. Reference it from CLAUDE.md so Claude loads it on demand:

```markdown
## Codebase
@.tokenizer/fingerprint.md
```

Includes: languages, package manager, entry points, npm scripts, top 20 runtime deps, config files (tsconfig, eslint, vite, docker, CI), directory tree summary. Invalidation is automatic — SHA of file tree + mtimes; rerunning is a no-op if nothing changed.

---

## Configuration

### Environment Variable

```bash
export TOKENIZER_MODE=full  # lite | full | ultra | off
```

### Config File

Create `~/.config/tokenizer/config.json`:

```json
{
  "mode": "full"
}
```

### Priority

1. `TOKENIZER_MODE` env var
2. `~/.config/tokenizer/config.json`
3. Session flag (set by slash commands)
4. Default: `full`

---

## Modes Compared

### Lite
> Bug in auth middleware. The token expiry check uses `<` instead of `<=`.

### Full
> Bug in auth middleware — token expiry uses `<` not `<=`. Fixing.

### Ultra
> auth mw bug: expiry `<` → `<=`. Fix:

### Code (all modes)
Code is **never** compressed. It stays exactly correct in all modes.

---

## How It Saves Tokens

**Input side:**
- CLAUDE.md compression removes ~40-60% of tokens while preserving all instructions
- Audit identifies bloated config files you didn't know were costing tokens every request
- Scoped CLAUDE.md recommendations prevent loading irrelevant rules

**Output side:**
- Terse mode eliminates filler words, pleasantries, hedging, redundant summaries
- Context-aware: code stays clean, only prose is compressed
- Per-turn reinforcement prevents the model from drifting back to verbose

**Workflow:**
- Auto-compact nudge prevents paying for heavy context when it could be compressed
- Audit reveals hidden token costs in MCP tool schemas and unused skills

---

## Troubleshooting

**Claude — terse mode not activating**
- Check `~/.claude/settings.json` has the hooks registered and paths are absolute
- Run `node <tokenizer-path>/hooks/tokenizer-activate.js` directly to see if it errors
- Verify Node.js ≥ 18: `node --version`

**Claude — `/tokenizer` command not found**
- Plugin not installed, or command files not in `~/.claude/commands/`
- Re-run `claude plugins install .` from the tokenizer directory

**Copilot — still verbose**
- Confirm `.github/copilot-instructions.md` exists and contains the tokenizer snippet
- In VS Code: reload window (`Ctrl+Shift+P` → "Reload Window") after adding the file
- Check setting `github.copilot.chat.codeGeneration.useInstructionFiles` is enabled

**Compression broke a file**
- Restore from backup: `/tokenizer-compress --restore <filepath>`
- Backups live alongside originals as `<filename>.original.md`

---

## License

MIT
