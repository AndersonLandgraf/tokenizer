---
description: Toggle tokenizer terse mode (lite/full/ultra/off)
argument-hint: [lite|full|ultra|off]
---

Activate tokenizer mode. Arguments: $ARGUMENTS (default "full" if empty). Valid: lite, full, ultra, off.

Steps:
1. Parse mode from $ARGUMENTS (fallback "full").
2. Write mode string to `~/.claude/.tokenizer-active` (create dir if needed) — this persists mode across turns.
3. Apply rules from `~/.claude/skills/tokenizer/SKILL.md` to all subsequent responses until mode changes or session ends.
4. Reply with one terse confirmation line (e.g. `[tokenizer:full active]`).
