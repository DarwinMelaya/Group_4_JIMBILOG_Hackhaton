#!/usr/bin/env bash
# lint-loop — is LOOP.md structurally TRUE, not just present?
# Exit 0 == the state file's own invariants hold. This turns "is the map
# still true?" from something the model eyeballs every cycle into a command.
#
# It checks the file's SHAPE, not the correctness of the work — verifying the
# work is the checker's job. Run it at the top of every cycle (/loop-cycle
# does) and in CI, so a Done line with no evidence or an illegal Status fails
# a command the day it happens, instead of rotting silently in the history.
#
# Usage: ./lint-loop.sh [path-to-LOOP.md]   (default LOOP.md, resolved from cwd)

set -uo pipefail
FILE="${1:-LOOP.md}"
fail=0
err() { echo "lint-loop: FAIL: $*"; fail=1; }

[ -f "$FILE" ] || { echo "lint-loop: FAIL: $FILE not found"; exit 1; }

# HTML comments are guidance, not state — a live LOOP.md often keeps the
# template's <!-- ... --> notes, including an illustrative cycle line. Strip
# them before analyzing so example text is never linted as real content.
CLEAN="$(awk '
  { line=$0
    if (inc) { if (line ~ /-->/) { sub(/.*-->/, "", line); inc=0 } else { next } }
    while (line ~ /<!--/) {
      if (line ~ /<!--.*-->/) { sub(/<!--.*-->/, "", line) }
      else { sub(/<!--.*/, "", line); inc=1 }
    }
    print line
  }' "$FILE")"
section() { printf '%s\n' "$CLEAN" | awk -v h="$1" '$0==h{f=1;next} /^## /{f=0} f'; }

# 1. Exactly one **Status:** line, and its value begins with a legal state.
status_count="$(printf '%s\n' "$CLEAN" | grep -cE '^\*\*Status:\*\*' || true)"
[ "$status_count" = "1" ] || err "expected exactly one **Status:** line, found $status_count"
printf '%s\n' "$CLEAN" | grep -qE '^\*\*Status:\*\* (active|paused|halted)( |$|\()' \
  || err "**Status:** must begin with active, paused, or halted"

# 2. Required sections all present.
for s in "## Open" "## Done" "## Blocked" "## Cycle log"; do
  printf '%s\n' "$CLEAN" | grep -qF "$s" || err "missing required section: $s"
done

# 3. Every bullet under ## Done carries evidence — no green, no Done.
while IFS= read -r line; do
  trimmed="${line#"${line%%[![:space:]]*}"}"
  case "$trimmed" in
    '- '*) printf '%s' "$trimmed" | grep -qF 'evidence:' \
             || err "Done item without evidence: ${trimmed:0:70}" ;;
  esac
done < <(section "## Done")

# 4. Every bullet under ## Cycle log is a parseable cycle or monitor line.
while IFS= read -r line; do
  trimmed="${line#"${line%%[![:space:]]*}"}"
  case "$trimmed" in
    '- '*)
      if printf '%s' "$trimmed" | grep -qE '\| cycle [0-9]+ \|'; then
        { printf '%s' "$trimmed" | grep -qF 'maker:' && printf '%s' "$trimmed" | grep -qF 'checker:'; } \
          || err "cycle line missing maker:/checker: ${trimmed:0:70}"
      elif printf '%s' "$trimmed" | grep -qF '| monitor |'; then
        :
      else
        err "unparseable cycle-log line: ${trimmed:0:70}"
      fi ;;
  esac
done < <(section "## Cycle log")

if [ "$fail" -eq 0 ]; then echo "lint-loop: OK ($FILE)"; fi
exit "$fail"
