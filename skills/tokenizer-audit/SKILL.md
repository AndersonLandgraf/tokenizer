# tokenizer-audit — token usage analysis

Scan project for ALL agent config files + report where tokens are spent. Agent-agnostic — detects Claude, Copilot, and any custom instruction dirs.

## Usage
User invokes: `/tokenizer-audit`

## Process

1. **Scan all agent config files** using core scanner:
   - CLAUDE.md (root + scoped), .claude/skills/, .claude/projects/*/memory/
   - .github/copilot-instructions.md, .github/copilot/*.md
   - Generic: agents.md, rules.md, AGENTS.md, INSTRUCTIONS.md, CONVENTIONS.md
   - Custom dirs: agents/, prompts/, rules/, instructions/, context/ (+ hidden variants)
   - Estimate token count per file (chars / 4)
   - Flag > 500 tokens as HEAVY, > 1500 as BLOATED

2. **Scan MCP config** — count registered tools, flag if > 20

3. **Cross-agent analysis** — detect duplicate instructions across agent configs

## Output Format

```
tokenizer audit
================

Claude:
  ./CLAUDE.md                         ~320 tokens  OK
  ./src/api/CLAUDE.md                 ~2100 tokens BLOATED
  .claude/skills/tokenizer/SKILL.md   ~380 tokens  OK

Copilot:
  .github/copilot-instructions.md     ~450 tokens  OK

Custom dirs:
  agents/api-agent.md                 ~670 tokens  HEAVY
  prompts/review.md                   ~200 tokens  OK

MCP tools: 12 registered              OK (< 20)

Total context overhead: ~4120 tokens/request

Recommendations:
- Compress ./src/api/CLAUDE.md (save ~1000 tokens)
- Review agents/api-agent.md for redundant instructions
```

## Recommendations Engine
- BLOATED files → suggest `/tokenizer-compress <file>`
- Duplicate instructions across files → suggest consolidation
- High MCP tool count → suggest disabling unused servers
- Large memory dir → suggest cleanup
