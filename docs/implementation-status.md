# KALINGA implementation status

Local DEMO prototype. **Nothing here is a readiness claim**; see `docs/launch-gates.md` for what is still required before real use. All clinics, articles and translations are DEMO and unreviewed, Filipino text is draft, reminders are mock-only, and a booking submission is a request, not a confirmation.

## What is built, per slice

| Slice | Built (DEMO) | Main code locations |
|---|---|---|
| S0 | Repo audit, architecture, decision log, threat model, requirements matrix, workspaces, ESLint, Vitest, `npm run verify` | `docs/`, `package.json`, `scripts/` |
| S1 | PGlite DB and migrations, `GET /api/v1/public/config`, error envelope and request IDs, Palette B shell with 4-item nav, EN/FIL catalogs and switch, safe PWA shell (public-only cache, offline page, update prompt), axe tests, web security-header config, env/log hardening | `apps/api/src/{db,http,env.ts}`, `apps/web/src/{i18n,pwa,components}`, `apps/web/public/` |
| S2 | Articles with per-locale review state and publish-safety constraint, DEMO seed, list/detail/search API, Learn UI, urgent PEP banner | `apps/api/src/articles/`, `apps/web/src/pages/{Learn,Article}.tsx` |
| S3 | Stateless pathway match service and API (urgent bypass, unknowns flagged), skippable pathway UI | `apps/api/src/pathway/`, `apps/web/src/pages/Pathway.tsx` |
| S4 | Clinics schema, publishing guard, fictitious DEMO Clinic A/B, directory API, search/filters UI, profile with verification freshness and "Not confirmed" labels | `apps/api/src/clinics/`, `apps/web/src/pages/{Clinics,ClinicProfile}.tsx` |
| S5 | Booking request API (reference plus separate once-shown secret, hashed, idempotency, rate limits, minor-policy adapter failing closed), POST-only status lookup with throttling and generic failures, booking and lookup UI | `apps/api/src/booking/`, `apps/web/src/pages/{BookingRequest,AppointmentLookup}.tsx` |
| S6 | Dev-equivalent staff auth (G-AUTH), clinic memberships, cross-clinic negative tests, queue/detail API with guarded transitions and optimistic concurrency, staff dashboard UI | `apps/api/src/staff/`, `apps/web/src/` staff pages |
| S7 | Governance: clinic verification evidence, per-locale editorial review, staff invitations and roles, minor-SOP artifact registry (mapping alone does not enable real minors), audit log, admin UI | `apps/api/src/governance/`, `apps/web/src/{admin,pages/admin}` |
| S8 | Care navigation pages (no results stored), opt-in neutral reminders on a mock transport with a DEMO outbox, privacy-preserving metrics with small-cell suppression and redacted CSV export, admin report page | `apps/api/src/{notifications,reports}/`, `apps/web/src/pages/Care.tsx` |
| S9 | Playwright end-to-end suite (3 specs), this documentation set (S9-2). S9-3 (code-review and security-review fixes) is handled by a separate item and is not described here. | `e2e/`, `playwright.config.ts`, `docs/` |
| Assistant | Rule-based DEMO assistant widget (floating button on every public page, route-aware chips, urgent first, honest "no clinician connected" human handoff, no invented contacts). No LLM, no network. | `apps/web/src/assistant/` |

## Real test evidence

Last known full `npm run verify` (recorded in the loop, 2026-10-30, Windows 11):

| Check | Result |
|---|---|
| API tests (Vitest) | 388 passed |
| Web tests (Vitest, jsdom, includes axe) | 461 passed |
| Shared package tests | 17 passed |
| `npm run test:loop` (stop-check harness) | 14 of 14 |
| Lint, typecheck, build | green |
| Playwright e2e (`npm run test:e2e`), Chromium, desktop viewport | 9 of 9 passed |

Counts change as S9-3 lands; re-run `npm run verify` for the current figure. Earlier per-slice detail is in `docs/slice-test-evidence.md`.

## NOT tested (do not infer otherwise)

- Real devices, including slow Android phones and iOS Safari; no mobile-viewport Playwright run.
- Screen readers (NVDA, JAWS, VoiceOver, TalkBack) and manual keyboard audits.
- Colour contrast in a real browser (axe in jsdom has `color-contrast` disabled; only token-pair arithmetic was checked).
- Slow or lossy networks, PWA install and offline behavior on real devices.
- Load or stress testing.
- Penetration testing; security review so far is by code reading and unit tests.
- Real Supabase Auth, real Postgres RLS under JWT claims, deployment, TLS, backups and restore.
- Any real notification provider (none exists in the code).
- Clinical, linguistic and legal review (none has occurred).
- The e2e suite is not safe against a long-lived seeded server; it expects a fresh in-memory DB.

## Manual run path

1. Prerequisites and `npm install`: see `docs/run-guide.md`.
2. `npm run dev` then open http://localhost:5173.
3. Public journey: Home, Learn, article, Pathway (optional), Clinics, DEMO Clinic A, Request appointment. Save the reference and the secret shown once.
4. Staff journey: `/staff/login` as `staff.a@demo.invalid` (password in `docs/run-guide.md`), open the request, confirm with a date/time.
5. Visitor: `/appointments/lookup` with reference and secret to see the decision.
6. Admin: `/admin/login` as `provincial@demo.invalid` or `admin.a@demo.invalid`: clinics, content, staff, minor SOP, reports.
7. Open the DEMO assistant (floating button at bottom right) and try the urgent and "talk to a real person" prompts.
8. `npm run verify`, then `npm run test:e2e:install` once and `npm run test:e2e`.

## Known gaps

See `docs/launch-gates.md` (all open), `docs/decision-log.md` (D-025 onwards for G-AUTH) and `docs/threat-model.md` (residual risks). Privacy, help and about routes are still placeholders, and a dedicated `docs/api-contract.md` (OpenAPI) has not been written.
