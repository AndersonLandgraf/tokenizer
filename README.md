# tokenizer

Full-stack token optimizer for AI coding agents. Compresses inputs, outputs, and workflow overhead — works with Claude Code, GitHub Copilot, Cursor, Windsurf, and any agent that reads instruction files.

Unlike tools that only make the model "talk terse," tokenizer optimizes the **entire pipeline**: what the agent reads (instruction files, MCP schemas, memory), what it writes (output), and helps you find where tokens are wasted.

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

Two layers: **instructions file** (terse mode + rules) + **MCP** (audit tooling via VS Code ≥ 1.98).

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

### Step 3 — MCP audit server (VS Code ≥ 1.98, optional)

Copilot supports MCP via `.vscode/mcp.json`. Add the tokenizer audit server to get `/tokenizer-audit` and `/tokenizer-fingerprint` tooling inside Copilot Chat:

```json
{
  "servers": {
    "tokenizer": {
      "type": "stdio",
      "command": "node",
      "args": ["<tokenizer-path>/core/mcp-server.js"]
    }
  }
}
```

Reload VS Code after saving. Verify with `/mcp list` in Copilot Chat — `tokenizer` should appear.

### Step 4 — Enable instruction files in VS Code (if not already)

Open VS Code settings (`Ctrl+,`), search for `copilot instruction files`, ensure **GitHub › Copilot › Chat › Code Generation: Use Instruction Files** is checked.

### Step 5 — Verify

Open Copilot Chat and ask a simple question (eg: "explain this function"). Responses should come back terse — fragments, abbreviations, no trailing summary.

### Notes (Copilot)

- Terse mode is always-on from the instructions file. Change intensity by editing `.github/copilot-instructions.md`.
- No dynamic mode switching (lite/full/ultra) without MCP — the instructions file sets the baseline.
- If Copilot drifts verbose over long sessions, re-prompt: "stay terse, no filler."

### Uninstall (Copilot)

Delete `.github/copilot-instructions.md` (or remove the tokenizer section if you merged it). Remove the `tokenizer` entry from `.vscode/mcp.json` if added.

---

## Usage

### Terse Mode

**Claude Code** — slash commands:

```
/tokenizer           → activate full terse mode (default)
/tokenizer lite      → mild: drop filler, keep grammar
/tokenizer full      → moderate: fragments, abbreviations, symbols
/tokenizer ultra     → maximum: abbreviate everything possible
/tokenizer off       → back to normal
```

Natural language also works: "activate tokenizer", "tokenizer ultra", "stop tokenizer".

**GitHub Copilot / other agents** — edit `.github/copilot-instructions.md` to set intensity, or use the MCP server to toggle dynamically (VS Code ≥ 1.98).

### Compress Files

Works on any agent instruction file — CLAUDE.md, copilot-instructions.md, AGENTS.md, .cursorrules, etc.

**Claude Code:**
```
/tokenizer-compress ./CLAUDE.md                         → compress single file
/tokenizer-compress --all                               → compress all agent-config files in project
/tokenizer-compress --dry-run ./CLAUDE.md               → preview savings, no write
/tokenizer-compress --restore ./CLAUDE.md               → restore from .original.md backup
```

**Any agent (CLI):**
```bash
node <tokenizer-path>/core/cli.js compress ./CLAUDE.md
node <tokenizer-path>/core/cli.js compress --all
node <tokenizer-path>/core/cli.js compress --dry-run .github/copilot-instructions.md
```

### Audit Token Usage

**Claude Code:**
```
/tokenizer-audit     → scan project: agent configs + MCP schema load
/tokenizer-mcp       → MCP server audit only
```

**GitHub Copilot (MCP):**  
Available as MCP tools when the tokenizer MCP server is configured. Ask Copilot Chat: "run tokenizer audit".

**CLI (any agent):**
```bash
node <tokenizer-path>/core/cli.js audit
node <tokenizer-path>/core/cli.js mcp
```

Output example:

```
tokenizer audit
================
Claude:
  ./CLAUDE.md                    ~320 tokens  OK
  ./src/api/CLAUDE.md            ~2100 tokens BLOATED

Copilot:
  .github/copilot-instructions.md  ~450 tokens  OK

MCP servers:
  github                         ~9100 tokens  HEAVY  [user]
  filesystem                     ~3850 tokens  HEAVY  [project]
  sequential-thinking             ~350 tokens  LIGHT  [user]

Total context overhead: ~15720 tokens/request

Recommendations:
- Compress ./src/api/CLAUDE.md (save ~1000 tokens)
- MCP server "github" loads ~9100 tokens — disable if not used often
```

### Fingerprint Cache

Scan repo once → cache compact summary so agents don't re-explore the tree every session.

**Claude Code:**
```
/tokenizer-fingerprint             → generate or refresh cache
/tokenizer-fingerprint --force     → force regeneration
/tokenizer-fingerprint --dry-run   → preview without writing
```

**CLI (any agent):**
```bash
node <tokenizer-path>/core/cli.js fingerprint
node <tokenizer-path>/core/cli.js fingerprint --force
```

Output lands at `.tokenizer/fingerprint.md`. Reference it from your agent's instruction file:

**Claude Code** (`CLAUDE.md`):
```markdown
## Codebase
@.tokenizer/fingerprint.md
```

**GitHub Copilot** (`.github/copilot-instructions.md`):
```markdown
<!-- tokenizer:fingerprint:start -->
[Fingerprint content is injected here by `node core/cli.js fingerprint --wire`]
<!-- tokenizer:fingerprint:end -->
```

Or run `node <tokenizer-path>/core/cli.js fingerprint --wire` to inject automatically into both files.

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
- Instruction file compression removes ~40-60% of tokens while preserving all rules (CLAUDE.md, copilot-instructions.md, .cursorrules, etc.)
- Audit identifies bloated config files costing tokens every request
- Fingerprint cache prevents agents from re-exploring the file tree — one-time scan, reused every session

**Output side:**
- Terse mode eliminates filler words, pleasantries, hedging, redundant summaries
- Context-aware: code stays exact, only prose is compressed
- Per-turn reinforcement (Claude hooks) or always-on instruction (Copilot) prevents drift back to verbose

**MCP:**
- Audit reveals hidden token costs in MCP tool schemas — each server loads 350–9100 tokens per request
- Disabling unused MCP servers is the highest-leverage optimization (schemas can't be compressed, only pruned)

---

## Troubleshooting

**Claude Code — terse mode not activating**
- Check `~/.claude/settings.json` has hooks registered with absolute paths
- Run `node <tokenizer-path>/hooks/tokenizer-activate.js` directly to check for errors
- Verify Node.js ≥ 18: `node --version`

**Claude Code — `/tokenizer` command not found**
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
