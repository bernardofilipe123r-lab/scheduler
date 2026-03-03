#!/bin/bash
# Post-edit validation hook for Copilot
# Runs after file edits to catch issues early
# Called by .github/hooks/post-edit.json

set -e

FILE="$1"
EXIT_CODE=0

# Resolve Python
if [ -f ".venv/bin/python" ]; then
  PY=".venv/bin/python"
else
  PY="python3"
fi

# --- React components: check Rules of Hooks ---
if echo "$FILE" | grep -qE '\.tsx$'; then
  if command -v npx &>/dev/null; then
    npx eslint "$FILE" --rule 'react-hooks/rules-of-hooks: error' --no-error-on-unmatched-pattern 2>/dev/null
    if [ $? -ne 0 ]; then
      echo "HOOKS_VIOLATION: React hooks called after early return in $FILE"
      EXIT_CODE=2
    fi
  fi
fi

# --- Python files: quick import check ---
if echo "$FILE" | grep -qE '\.py$' && echo "$FILE" | grep -qE '^app/'; then
  if [ -f "scripts/validate_api.py" ]; then
    $PY scripts/validate_api.py --imports 2>/dev/null
    if [ $? -ne 0 ]; then
      echo "IMPORT_ERROR: Python import validation failed after editing $FILE"
      EXIT_CODE=2
    fi
  fi
fi

exit $EXIT_CODE
