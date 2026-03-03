#!/bin/bash
# Post-edit validation hook for Copilot
# Runs after file edits to catch issues early
# Called by .github/hooks/post-edit.json
#
# DESIGN: This must be FAST (< 5s). Only surgical, single-file checks.
# Heavy validation (full import suite, endpoints) lives in pre-commit and CI.

FILE="$1"
EXIT_CODE=0

# Resolve Python
if [ -f ".venv/bin/python" ]; then
  PY=".venv/bin/python"
else
  PY="python3"
fi

# --- React components: check Rules of Hooks on this file only ---
if echo "$FILE" | grep -qE '\.tsx$'; then
  if command -v npx &>/dev/null; then
    npx eslint "$FILE" --rule 'react-hooks/rules-of-hooks: error' --no-error-on-unmatched-pattern 2>/dev/null
    if [ $? -ne 0 ]; then
      echo "HOOKS_VIOLATION: React hooks called after early return in $FILE"
      EXIT_CODE=2
    fi
  fi
fi

# --- Python files: syntax check only (fast, no imports) ---
if echo "$FILE" | grep -qE '\.py$' && echo "$FILE" | grep -qE '^app/'; then
  $PY -c "import py_compile; py_compile.compile('$FILE', doraise=True)" 2>/dev/null
  if [ $? -ne 0 ]; then
    echo "SYNTAX_ERROR: Python syntax error in $FILE"
    EXIT_CODE=2
  fi
fi

exit $EXIT_CODE
