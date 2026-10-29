---
name: kalinga-implementation-loop
description: Bounded implementation and verification pattern for KALINGA changes involving a frontend, API, database or application workflow.
---

For the active requirement ID:

1. Read the actual source requirement and final owner decision; inspect the relevant existing code rather than assuming greenfield.
2. Define 1-3 observable end-to-end acceptance conditions and the smallest full-stack implementation to satisfy them; name the relevant UI states, API, data migration, permissions and localization keys.
3. Run baseline checks and capture failures; implement focused changes without introducing unrelated features.
4. Verify with real commands: typecheck, lint, unit, API, migration/RLS integration, E2E or browser screenshot/inspection, accessibility and security tests as supported by the repo. Mark any skipped check as NOT RUN.
5. For failures, diagnose and repair; never delete/relax tests to get a green badge. After three unresolved attempts, stop and record the precise blocker.
6. Update `docs/requirements-matrix.md`, `docs/implementation-status.md` and `docs/slice-test-evidence.md` with evidence. Ensure local UI→API→DB demonstration actually works; don't declare done because a screen renders.
7. Preserve all launch flags: demo-only partners/content, mock-only notifications, provider-confirmed status changes and the approved-minor-SOP evidence gate.

Return an accurate DONE / PARTIAL / BLOCKED outcome with commands and evidence.
