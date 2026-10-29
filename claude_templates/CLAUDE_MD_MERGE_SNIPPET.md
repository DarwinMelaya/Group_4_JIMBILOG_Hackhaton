# KALINGA — excerpt for integrating with existing CLAUDE.md

> Do not overwrite the existing repository's `CLAUDE.md`. Merge these facts selectively after inspecting local project conventions.

- Product: KALINGA — Knowledge and Access Link for STI Navigation, Guidance, and Assistance; mobile-first English/Filipino PWA serving Marinduque in initial scope.
- Requirements: `docs/KALINGA_Project_Brief.md`; approved design: `docs/KALINGA_Brand_Guidelines_v1.0.pdf`; implementation master: `docs/KALINGA_Claude_Code_Master_Skill_Loop_Prompt_v2_FINAL.md`.
- Integrate into the existing KALINGA codebase; do not reset or reskeletonize. Implement **full-stack vertical slices** UI/API/DB/tests.
- Locked mobile bar: Home, Learn, Clinics, Menu. Palette B, Plus Jakarta Sans/Inter, Lucide outline, soft geometric vectors, accessible keyboard and 44px controls.
- No public account. Confidential booking request status via reference + independent high-entropy secret. A pending request is not a confirmed appointment. Never store STI diagnoses/results.
- Ages 15–17: implement existing approved clinic-specific SOP only when its actual artifact is available. Until then, real minor bookings disabled; demo policy tests permitted.
- Local demo fixtures only; never represent clinics, medical content, affiliations or logo master as verified. Mock-only notifications, no external sending by default.
- `en` and `fil` UI catalogs; medical translations require separate human clinical approval.
- Never deploy, send real notifications, use real patient data, modify shared infrastructure or do destructive Git/DB operations without user approval.
- Check `docs/implementation-status.md` and `docs/slice-test-evidence.md` when resuming. Use `.claude/skills/` bounded checks and record actual commands/results.
