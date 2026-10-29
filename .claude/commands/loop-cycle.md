---
description: Run exactly one cycle of this project's engineering loop — status check, one item through maker and checker, monitor if due, state written
allowed-tools: Bash(cat:*), Bash(git log:*), Bash(date:*), Bash(bash lint-loop.sh:*), Bash(bash stop-check.sh:*)
---

# Loop Cycle

Run one cycle of this project's loop. This file is the only definition of a cycle: every trigger (/goal, /loop, a scheduled task, a GitHub Action, /sync-loop's resume) runs cycles by invoking this command, so no trigger improvises its own.

## Context

- Loop state: !`cat LOOP.md 2>/dev/null || echo "LOOP.md missing — do not work; say the loop is not set up and point the user at /loop-engineering"`
- State-file lint: !`bash lint-loop.sh 2>&1 || echo "^ lint failed — LOOP.md is malformed; fixing it is this cycle's first job (see Orient)"`
- Recent commits: !`git log --oneline -15 2>/dev/null`
- Now (UTC): !`date -u +%Y-%m-%dT%H:%M:%SZ`

## The cycle

Follow `LOOP.md`'s `## Rules` throughout; on any conflict, Rules win.

1. **Status gate.** If `**Status:**` is not `active`, do nothing — report why and end with `CYCLE: halted`.
2. **Orient.** If the state-file lint above failed, `LOOP.md` is malformed — reconciling it is this cycle's item, ahead of anything in `## Open`. Then per the Rules: if the working tree is dirty, reconcile first; if the baseline is red, restoring it is this cycle's item.
3. **Refill.** If `## Open` is empty, refill it per `## Discovery` (sources + dedupe rule). If it is still empty, confirm the loop is finished by running the stop condition as a command — `bash stop-check.sh` (exit 0), not by reading the header prose. Only on exit 0, say so and end with `CYCLE: complete`.
4. **Make.** Run **loop-maker** on the top `## Open` item. It does that one item and records its handoff under the item line.
5. **Check.** Run **loop-checker** on the maker's work. It alone moves the item to `## Done`, commits or restores per the Rules, and appends the `## Cycle log` line that closes the cycle.
6. **Watch.** If the monitor is due (`**Monitor cadence:**` counted against `## Cycle log`), run **loop-monitor**. Same for the code-review and security-audit cadences in the header — findings become new `## Open` items.
7. **Report.** One short paragraph: the item, what the maker did, the checker's verdict and evidence. End your reply with exactly one line so scripts can read the outcome: `CYCLE: done`, `CYCLE: rejected`, `CYCLE: blocked`, `CYCLE: halted`, or `CYCLE: complete`.

One cycle per invocation. Never start a second item; the trigger decides whether another cycle runs.
