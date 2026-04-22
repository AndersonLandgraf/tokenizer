# tokenizer-compress — file compression for token efficiency

Compress any agent config/instruction file into dense, token-efficient format. Works across all coding agents — CLAUDE.md, .cursorrules, AGENTS.md, copilot-instructions.md, GEMINI.md, .clinerules, .windsurfrules, .roorules, .continuerules, custom agents/, prompts/, rules/ dirs, etc.

## Usage
- `/tokenizer-compress <filepath>` — compress single file
- `/tokenizer-compress --all` — auto-detect + compress ALL agent config files in project
- `/tokenizer-compress --restore <filepath>` — restore from backup
- `/tokenizer-compress --dry-run <filepath>` — preview savings without writing

## Supported File Types
Any `.md`, `.txt`, `.mdc`, `.yml`, `.yaml` file used as agent instructions:
- Root files: CLAUDE.md, AGENTS.md, GEMINI.md, CONVENTIONS.md, rules.md, agents.md, instructions.md
- Agent dirs: .claude/skills/, .cursor/rules/, .windsurf/rules/, .cline/rules/, .roo/rules/, .continue/rules/, .codex/
- GitHub: .github/copilot-instructions.md, .github/copilot/*.md
- Custom dirs: agents/, prompts/, rules/, instructions/, context/ (and hidden variants)
- Legacy files: .cursorrules, .windsurfrules, .clinerules, .roorules, .continuerules, .augment-guidelines

## Process

1. Read target file
2. Back up original → `<filename>.original.md`
3. Apply compression rules below
4. Write compressed version
5. Report: original tokens (estimate) → compressed tokens → savings %

## Compression Rules

### Structure
- Convert prose paragraphs → bullet points
- Remove blank lines between bullets (single newline only)
- Collapse multi-level nesting when inner level has single item
- Keep markdown headings (#, ##) — they're cheap + aid parsing

### Language
- Drop articles (a, an, the)
- Drop filler words (just, really, basically, simply, actually, please, note that, keep in mind, remember to, make sure to, important to note)
- Replace phrases with abbreviations:
  - "for example" → "eg"
  - "that is" → "ie"
  - "and so on" → "etc"
  - "in order to" → "to"
  - "make sure" → "ensure"
  - "as well as" → "+"
  - "instead of" → "vs"
  - "such as" → "eg"
  - "because of" → "b/c"
  - "with respect to" → "re"
  - "should not" → "don't"
  - "do not" → "don't"
  - "does not" → "doesn't"
  - "cannot" → "can't"
  - "will not" → "won't"
- Use standard abbreviations: config, auth, db, fn, dep, pkg, dir, env, repo, impl, init, param, arg, req, res, err, msg, util, lib, dev, prod
- Use symbols where natural: → & + = != ~ @

### Preserve Exactly
- Code blocks (``` fenced) — never touch contents
- File paths, URLs, commands
- Variable names, function names, class names
- Version numbers
- Regex patterns

### Semantic
- Remove redundant explanations — if rule is self-evident, don't explain why
- Merge duplicate/overlapping instructions
- Remove "obvious" instructions (eg "write clean code", "follow best practices")
- Remove examples if rule is unambiguous without them
- Keep examples only when compression format itself needs demonstration

## Example

### Before
```markdown
## Important Notes

Please make sure that you always use TypeScript for all new files that you create
in this project. We use strict mode, so make sure to enable it. Also, remember to
add proper error handling for all async operations because we've had issues with
unhandled promise rejections in the past. In addition to that, please use the
existing utility functions in the `src/utils/` directory instead of creating new ones.
```

### After
```markdown
## Rules
- All new files: TypeScript, strict mode
- All async ops: add error handling (past unhandled rejection issues)
- Use existing `src/utils/` fns — don't create new ones
```

## Restore
To restore original: `/tokenizer-compress --restore <filepath>` copies `<filename>.original.md` back.
