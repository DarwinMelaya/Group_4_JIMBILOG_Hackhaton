#!/usr/bin/env bash
# Stop check — the loop's stop condition AS A COMMAND, not a sentence.
# Exit 0 == the loop is genuinely done. Any other exit == keep going.
#
# The runner (loop.sh) runs THIS to confirm the model's "CYCLE: complete"
# before it believes it. A model that thinks it is done does not get to end
# the loop on its own say-so — this command does. This is the difference
# between "looks done" and a stop condition with teeth.
#
# Run from the repo root (loop.sh and /loop-cycle both do). Fill in the EDIT
# line with the same command LOOP.md's **Stop condition:** names.

set -uo pipefail
LOOP_FILE="${LOOP_FILE:-LOOP.md}"

# 1. ## Open has no work items left. Same HTML-comment stripping as
#    lint-loop.sh (comments, including multi-line ones, are guidance, not
#    state), then any list item counts as work: "- x", "* x", "1. x", "1) x"
#    (indented sub-items too).
#
#    Test guard: STOP_CHECK_ONLY_OPEN=1 makes this script exit right after
#    this Open check with its result (1 = Open has items, 0 = Open empty)
#    WITHOUT running the project verification in step 2. It exists only so
#    scripts/test-stop-check.sh can test the counting; never set it in the loop.
if [ ! -f "$LOOP_FILE" ]; then
  echo "stop-check: $LOOP_FILE not found — not done."
  exit 1
fi
open_items="$(awk '
  { line=$0
    if (inc) { if (line ~ /-->/) { sub(/.*-->/, "", line); inc=0 } else { next } }
    while (line ~ /<!--/) {
      if (line ~ /<!--.*-->/) { sub(/<!--.*-->/, "", line) }
      else { sub(/<!--.*/, "", line); inc=1 }
    }
    print line
  }' "$LOOP_FILE" \
  | awk '/^## Open[[:space:]]*$/{f=1;next} /^## /{f=0} f' \
  | grep -cE '^[[:space:]]*([-*]|[0-9]+[.)])[[:space:]]' || true)"
if [ "${open_items:-0}" -gt 0 ]; then
  echo "stop-check: ## Open still has items — not done."
  exit 1
fi
if [ "${STOP_CHECK_ONLY_OPEN:-}" = "1" ]; then
  echo "stop-check: ## Open empty (STOP_CHECK_ONLY_OPEN=1, verification skipped)."
  exit 0
fi

# 2. EDIT: the project's real verification — the same command as the stop
#    condition. e.g. npm test  |  make check  |  pytest -q  |  cargo test -q
if [ ! -f package.json ] || ! npm run verify --silent; then
  echo "stop-check: project check failed — not done."
  exit 1
fi

echo "stop-check: Open empty and check green — stop condition met."
exit 0
