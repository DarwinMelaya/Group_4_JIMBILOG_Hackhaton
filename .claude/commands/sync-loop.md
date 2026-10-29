---
description: Catch me up on what the loop has done since I was last here, then resume work on the next open items
argument-hint: [pause | resume | "just the summary" | "skip to work"]
---

# Sync Loop

The user is back on this project. Do two things, in order: **catch them up**, then **get the loop moving again**. If `$ARGUMENTS` says summary-only, stop after part 1; if it says skip-to-work, keep part 1 to two sentences.

If `$ARGUMENTS` is `pause` or `resume`, skip everything else: flip the `**Status:**` line in `LOOP.md` (`paused (<reason>, <date>)` or back to `active` — this is a human-initiated change, so it is allowed), append a Sync log entry, confirm to the user, and stop.

## 1. Catch up (report, don't touch anything yet)

1. Read `LOOP.md` in full — Status, goal, stop condition, bounds, and the `## Open`, `## Done`, `## Blocked` sections. If Status is `halted`, lead the summary with the monitor's reason.
2. Establish what changed since the user was last here: `git log --oneline` since the last sync (record each sync as a line at the bottom of `LOOP.md` under `## Sync log`, and read the previous entry to know where to diff from; if there is no sync log yet, use the last ~15 commits), plus any items that moved between sections.
3. Give the user a short, plain-language status:
   - What got **done**, with the evidence the checker recorded.
   - What is **blocked** and why — these need the user's input; ask the specific questions.
   - What is still **open**, in the order the loop would take it.
   - Whether the **stop condition** is met, and how the loop is tracking against its bounds — computed from `## Cycle log` (cycle count, elapsed time, Done per recent cycle), not estimated.
4. Append a `## Sync log` entry to `LOOP.md`: date, current HEAD commit, one-line status.

## 2. Resume (only after the summary is delivered)

5. Only resume if `**Status:**` is `active`. If it is `paused` or `halted`, ask the user whether to set it back to `active` first — after a halt, that decision is theirs alone. If anything in `## Blocked` was just unblocked by the user's answers, move it back to `## Open` with the new context.
6. If `## Open` is empty, refill it by following the `## Discovery` section in `LOOP.md` — its sources and its dedupe rule — before working.
7. Then run cycles exactly as `/loop-cycle` defines them — invoke it rather than improvising a cycle here. It runs the maker on one item, the checker as the only path to `## Done`, and the monitor when the `**Monitor cadence:**` field says it is due.
8. Keep invoking `/loop-cycle` while the user is present. Stop when the stop condition is met, a bound is hit, everything left is blocked on the user, or the user says stop.

Never mark work done yourself, never skip the checker, and never act on blocked items without the user's answer — same rules as every other cycle.
