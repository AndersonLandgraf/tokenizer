#!/bin/bash
# tokenizer-statusline.sh — Shows tokenizer mode in Claude Code status line

FLAG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
FLAG_FILE="$FLAG_DIR/.tokenizer-active"

if [ -f "$FLAG_FILE" ]; then
  MODE=$(cat "$FLAG_FILE" 2>/dev/null)
  case "$MODE" in
    lite)  echo "TKN:lite" ;;
    full)  echo "TKN:full" ;;
    ultra) echo "TKN:ultra" ;;
    off)   echo "" ;;
    *)     echo "" ;;
  esac
fi
