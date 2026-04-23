# GitHub agent instructions — tokenizer install

## Auto-install (recommended)

```bash
node <tokenizer-path>/install.js
```

Auto-detects `.github/*.md` in this priority order:
1. `.github/copilot-instructions.md` (if exists)
2. `.github/agents.md`
3. `.github/AGENTS.md`
4. First `.md` found in `.github/`
5. Creates `.github/copilot-instructions.md` as fallback

Terse prefix is injected at TOP of the file so agents always read it first.

## Manual install

```bash
mkdir -p .github
# prefix to top of whichever .github/*.md you use:
cat <tokenizer-path>/adapters/copilot/copilot-snippet.txt | cat - .github/agents.md > /tmp/t && mv /tmp/t .github/agents.md
```

## Uninstall

Removes prefix markers automatically:
```bash
node <tokenizer-path>/install.js --uninstall
```
