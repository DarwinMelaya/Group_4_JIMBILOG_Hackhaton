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

# 1. ## Open has no work items left (bullet lines; HTML comments don't count).
if awk '/^## Open/{f=1;next} /^## /{f=0} f' "$LOOP_FILE" | grep -qE '^[[:space:]]*- '; then
  echo "stop-check: ## Open still has items — not done."
  exit 1
fi

# 2. EDIT: the project's real verification — the same command as the stop
#    condition. e.g. npm test  |  make check  |  pytest -q  |  cargo test -q
if [ ! -f package.json ] || ! npm run verify --silent; then
  echo "stop-check: project check failed — not done."
  exit 1
fi

echo "stop-check: Open empty and check green — stop condition met."
exit 0
