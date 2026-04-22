# Claude Code — tokenizer install

## Hooks (add to ~/.claude/settings.json)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "node <tokenizer-path>/hooks/tokenizer-activate.js",
        "description": "tokenizer: activate terse mode"
      }
    ],
    "UserPromptSubmit": [
      {
        "command": "node <tokenizer-path>/hooks/tokenizer-tracker.js",
        "description": "tokenizer: mode tracking + reinforcement"
      }
    ]
  }
}
```

## Rules (copy to project)
```bash
cp <tokenizer-path>/adapters/claude/rules.md .claude/rules/tokenizer.md
```

## Skills
Skills in `skills/` dir are Claude Code native — work automatically when plugin installed.
