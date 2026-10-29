---
name: kalinga-next-slice
description: Owner-controlled implementation of exactly one KALINGA full-stack vertical feature slice from the final master prompt.
disable-model-invocation: true
---

Implement **only** KALINGA slice `$ARGUMENTS` using `docs/KALINGA_Claude_Code_Master_Skill_Loop_Prompt_v2_FINAL.md` and the original source documents.

1. Inspect existing repository, Git working tree, current requirements matrix, decision register, latest tests and implementation-status records. Do not overwrite unrelated code or run destructive commands.
2. Resolve the slice requirement from §14 of the master prompt; record its user flow, API contract, migrations/queries/RLS if applicable, English/Filipino UI, acceptance criteria, safety gates and non-goals. Do not reinterpret the eight final owner decisions.
3. Baseline existing commands; distinguish pre-existing failures from regressions. Keep scope to this vertical slice; refactor only what is necessary.
4. Implement real **local** UI → validated API → isolated local database interaction, role controls if needed, typed state, accessible states and tests. Use obviously fictitious data; no real patient records, messaging or clinic claims.
5. Apply `kalinga-design-qa`, `kalinga-api-contract-qa`, `kalinga-privacy-security-qa` and `kalinga-i18n-clinical-qa` as relevant; execute actual available test/build/browser commands. Fix root causes, re-run, and stop after 3 unexplained attempts with blocker analysis.
6. Update requirements matrix, decision log (evidence only), implementation status and test evidence. Record commands/output summaries and a reproducible demo path.
7. Report: slice outcome; changed files; tests **run** and pass/fail; observable flow; privacy, localization and accessibility findings; missing external SOP/medical/clinic evidence; recommended next slice.

Never publish, deploy, change shared systems, send real notifications, accept real under-18 booking without approved SOP evidence, or claim fictitious data is verified.
