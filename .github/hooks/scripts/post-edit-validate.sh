#!/bin/bash
# Post-edit validation hook for Copilot
# Runs after file edits to catch issues early
# Called by .github/hooks/post-edit.json
#
# DESIGN: This must be FAST (< 5s). Only surgical, single-file checks.
# Heavy validation (full import suite, endpoints) lives in pre-commit and CI.
#
# Protocol: VS Code hooks receive JSON via stdin and expose tool_input
# properties as env vars (e.g. $TOOL_INPUT_FILE_PATH for tool_input.filePath).
# Matchers are currently ignored by VS Code — we filter tool_name ourselves.

# Read hook input JSON from stdin (required to extract tool_name and handle multi_replace)
INPUT_JSON=$(cat)
EXIT_CODE=0
ERRORS=""

# Extract tool_name to filter — matchers are ignored, so all PostToolUse events arrive here
TOOL_NAME=$(echo "$INPUT_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)

# Only process file-edit tools
case "$TOOL_NAME" in
  replace_string_in_file|create_file|multi_replace_string_in_file) ;;
  *) exit 0 ;;
esac

# Extract file path(s)
# - Single-file tools: use $TOOL_INPUT_FILE_PATH env var (set by VS Code) with stdin fallback
# - multi_replace: must parse stdin for replacements[].filePath
if [ "$TOOL_NAME" = "multi_replace_string_in_file" ]; then
  FILES=$(echo "$INPUT_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
seen = set()
for r in data.get('tool_input', {}).get('replacements', []):
    p = r.get('filePath', '')
    if p and p not in seen:
        seen.add(p)
        print(p)
" 2>/dev/null)
elif [ -n "$TOOL_INPUT_FILE_PATH" ]; then
  FILES="$TOOL_INPUT_FILE_PATH"
else
  FILES=$(echo "$INPUT_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('filePath',''))" 2>/dev/null)
fi

# Nothing to validate
if [ -z "$FILES" ]; then
  exit 0
fi

# Resolve Python
if [ -f ".venv/bin/python" ]; then
  PY=".venv/bin/python"
else
  PY="python3"
fi

# Validate each file
while IFS= read -r FILE; do
  [ -z "$FILE" ] && continue
  [ ! -f "$FILE" ] && continue

  # --- React components: check Rules of Hooks on this file only ---
  if echo "$FILE" | grep -qE '\.tsx$'; then
    if command -v npx &>/dev/null && [ -x "node_modules/.bin/eslint" ]; then
      LINT_OUT=$(npx eslint "$FILE" --rule 'react-hooks/rules-of-hooks: error' --no-error-on-unmatched-pattern 2>&1)
      if [ $? -ne 0 ]; then
        ERRORS="${ERRORS}HOOKS_VIOLATION in $FILE\n"
        EXIT_CODE=2
      fi
    fi
  fi

  # --- Python files: syntax check only (fast, no imports) ---
  if echo "$FILE" | grep -qE '\.py$' && echo "$FILE" | grep -qE '^app/'; then
    $PY -m py_compile "$FILE" 2>/dev/null
    if [ $? -ne 0 ]; then
      ERRORS="${ERRORS}SYNTAX_ERROR in $FILE\n"
      EXIT_CODE=2
    fi
  fi
done <<< "$FILES"

# Output JSON per VS Code hooks protocol
if [ $EXIT_CODE -ne 0 ]; then
  echo "{\"decision\":\"block\",\"reason\":\"Post-edit validation failed\",\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"$(echo -e "$ERRORS" | sed 's/"/\\"/g' | tr '\n' ' ')\"}}" 2>/dev/null
fi

exit $EXIT_CODE
