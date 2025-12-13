#!/usr/bin/env zsh

# Wrapper to run batch-import and notify on completion (macOS).
# Usage:
#   OPENROUTER_API_KEY=... OPENROUTER_MODEL=... LLM_MAX_TOKENS=1800 \ 
#   ./scripts/run-import-with-notify.sh private/import/补充导入_split

set -u

INPUT_DIR="${1:-private/import/补充导入_split}"
shift || true

pnpm tsx scripts/batch-import.ts "$INPUT_DIR" "$@"
STATUS=$?

if command -v osascript >/dev/null 2>&1; then
  if [ $STATUS -eq 0 ]; then
    osascript -e 'display notification "批量导入完成" with title "群看板" sound name "Submarine"'
    # Extra beep to ensure audibility
    osascript -e 'beep 2' >/dev/null 2>&1
    if command -v afplay >/dev/null 2>&1; then
      afplay -v 2 /System/Library/Sounds/Ping.aiff >/dev/null 2>&1
    fi
  else
    osascript -e 'display notification "批量导入失败，请查看日志" with title "群看板" sound name "Basso"'
    osascript -e 'beep 2' >/dev/null 2>&1
    if command -v afplay >/dev/null 2>&1; then
      afplay -v 2 /System/Library/Sounds/Basso.aiff >/dev/null 2>&1
    fi
  fi
fi

exit $STATUS
