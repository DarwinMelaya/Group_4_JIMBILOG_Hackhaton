#!/usr/bin/env bash
# Tests for stop-check.sh Open-section counting (S1-11).
# Uses temp LOOP files via LOOP_FILE and STOP_CHECK_ONLY_OPEN=1 so the project
# verification (npm run verify) is never run from here. Run from anywhere:
#   bash scripts/test-stop-check.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STOP="$ROOT/stop-check.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fails=0
n=0

# expect <name> <expected-exit> <loop-file-content>
expect() {
  local name="$1" want="$2" content="$3" got
  n=$((n + 1))
  printf '%s\n' "$content" > "$TMP/LOOP.md"
  (cd "$TMP" && LOOP_FILE="$TMP/LOOP.md" STOP_CHECK_ONLY_OPEN=1 bash "$STOP" >/dev/null 2>&1)
  got=$?
  if [ "$got" -eq "$want" ]; then
    echo "ok   - $name"
  else
    echo "FAIL - $name (expected exit $want, got $got)"
    fails=$((fails + 1))
  fi
}

expect "empty Open passes" 0 '# Loop
## Open

## Done
- [S0] done item evidence: x'

expect "single-line comment bullet ignored" 0 '## Open
<!-- - not real -->
## Done'

expect "multi-line comment bullets ignored" 0 '## Open
<!-- guidance
- hidden bullet
* hidden star
1. hidden number
-->
## Done'

expect "bullet after multi-line comment end is counted" 1 '## Open
<!-- guidance
- hidden
--> - real item
## Done'

expect "inline comment before text, real item survives" 1 '## Open
- <!-- note --> real item
## Done'

expect "dash item counted" 1 '## Open
- item
## Done'

expect "star item counted" 1 '## Open
* item
## Done'

expect "numbered item counted" 1 '## Open
1. item
## Done'

expect "numbered paren item counted" 1 '## Open
2) item
## Done'

expect "indented sub-item counted" 1 '## Open
   - nested
## Done'

expect "items only in other sections do not count" 0 '## Open

## Done
- [S0] a
* b
1. c
## Blocked
- blocked item'

expect "bold line and rule are not items" 0 '## Open
**Note:** text
---
## Done'

expect "Open as last section is counted" 1 '## Done
- x
## Open
- last section item'

n=$((n + 1))
if (cd "$TMP" && LOOP_FILE="$TMP/does-not-exist.md" STOP_CHECK_ONLY_OPEN=1 bash "$STOP" >/dev/null 2>&1); then
  echo "FAIL - missing LOOP file must not pass"
  fails=$((fails + 1))
else
  echo "ok   - missing LOOP file does not pass"
fi

echo "test-stop-check: $((n - fails))/$n passed"
[ "$fails" -eq 0 ]
