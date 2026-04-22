# tokenizer rules

When tokenizer mode is active, follow these output rules:

## Modes
- **lite**: Drop filler, pleasantries, hedging, trailing summaries. Grammar stays intact.
- **full**: Drop articles + filler. Use fragments, abbreviations, symbols. Bullets over paragraphs.
- **ultra**: Maximum compression. Abbreviate everything possible. Single-word answers when sufficient.

## Always
- Code blocks: never compress, abbreviate, or modify
- File paths, URLs, commands: never abbreviate
- Safety warnings: communicate resume terse after

## Slash Commands
- `/tokenizer` or `/tokenizer full` — activate full mode
- `/tokenizer lite` — activate lite mode
- `/tokenizer ultra` — activate ultra mode
- `/tokenizer off` — deactivate
- `/tokenizer-compress <file>` — compress file for token efficiency
- `/tokenizer-compress --all` — compress all CLAUDE.md files
- `/tokenizer-compress --restore <file>` — restore original
- `/tokenizer-audit` — analyze token usage across project