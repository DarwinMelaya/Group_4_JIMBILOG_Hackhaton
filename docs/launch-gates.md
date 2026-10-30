# KALINGA launch gates (pilot-readiness blockers)

This document lists what must be true, with evidence, before KALINGA may be used by real people. **It makes no readiness claim.** Every gate below is currently **OPEN** unless a row says otherwise. The repository is a local DEMO prototype: all clinics, articles, translations, staff accounts and reminders are fictitious or unreviewed. Status vocabulary: `OPEN` (no evidence), `PARTIAL` (prototype control exists, evidence still required), `LIMITATION` (known behavior to accept or fix before launch).

Evidence for what was actually run is in `docs/implementation-status.md` and `docs/slice-test-evidence.md`. Requirement-level status is in `docs/requirements-matrix.md`.

## 1. Clinical and language review

| ID | Gate | Status | Required evidence |
|---|---|---|---|
| LG-01 | Qualified clinical/medical review of every article, the urgent possible-HIV-exposure (PEP) guidance, referral and results-retrieval guidance, **separately for each locale (English, Filipino)**. Approval is never inherited from English. | OPEN | Named human reviewer, credentials, date, version, per-locale approval record in the editorial workflow; `CLINICAL_CONTENT_APPROVED` only then. All current content is DEMO and unreviewed. |
| LG-02 | Filipino linguistic review (tone, reading level, health terms) in addition to clinical review | OPEN | Reviewer sign-off. All Filipino text in the catalogs is a machine-assisted draft flagged unreviewed in the UI. |
| LG-03 | Urgent 72-hour exposure copy reviewed by a clinician and an owner-approved referral path | OPEN | Same as LG-01. The app deliberately gives assessment guidance only and no invented contact numbers. |

## 2. Partners and clinic facts

| ID | Gate | Status | Required evidence |
|---|---|---|---|
| LG-04 | Confirmed partner agreements and owners (PHO, DOH MIMAROPA, municipal offices, clinics). Institutional roles in the brief are proposals only. | OPEN | Signed agreements; named data owners. No real partner is named anywhere in the prototype. |
| LG-05 | Verified clinic facts (services, fees, hours, ID/consent rules, privacy practices) with source, date and scope for each published clinic | OPEN | Evidence records via the verification workflow. Both clinics in the seed are fictitious (DEMO Clinic A/B). Production must start with no clinics. |
| LG-06 | Four-eyes approval for clinic verification | LIMITATION | The same admin can currently add and accept verification evidence. Add a second-person approval, or accept the risk in writing. |

## 3. Legal, privacy and minors

| ID | Gate | Status | Required evidence |
|---|---|---|---|
| LG-07 | Legal/privacy review of data flows, hosting, retention and processor terms (data processing agreement) under the Philippine Data Privacy Act (RA 10173). Applicability and obligations **to be verified by counsel**. | OPEN | Counsel memo; DPA with hosting provider; privacy notice and FAQ text approved. The current privacy and help pages are placeholders. |
| LG-08 | Data retention periods decided by the owner/counsel (no universal period is invented in this repository) and retention enforcement operated and tested | OPEN | Written retention schedule; scheduled job or runbook with test evidence. |
| LG-09 | **Owner-approved minor-booking SOP artifact (ages 15-17) is missing: gate `APPROVED_SOP_ARTIFACT_MISSING`.** Real 15-17 booking stays disabled. Under 15 is refused. | OPEN | An approved SOP document with ID, version, effective date and per-clinic mapping, accepted by counsel and the partner clinic. A recorded mapping alone does not enable real minor booking, and DEMO policies are rejected outside demo mode. `REAL_MINOR_BOOKING_ENABLED` must remain off until then. |

## 4. Brand

| ID | Gate | Status | Required evidence |
|---|---|---|---|
| LG-10 | Logo master approval. The reference PNG is a **shape reference only**; the app uses a labeled temporary text wordmark. | OPEN | Approved editable master file; icon variants (32/48/64, maskable) generated from it and checked. |

## 5. Authentication and access

| ID | Gate | Status | Required evidence |
|---|---|---|---|
| LG-11 | Real staff/admin authentication (gap **G-AUTH**). Today: a dev-equivalent (scrypt passwords, server-side sessions, CSRF token, lockout). Supabase Auth, invitations, MFA, session policy are not implemented or tested. | OPEN | Supabase Auth (or approved equivalent) integrated; MFA for admin roles; reset flow; tests. |
| LG-12 | Row Level Security as an enforced boundary. In the prototype RLS policies are written and tested in PGlite with DB roles, but **the API connects as the owner**, so server-side scope checks are the real control. | OPEN | API connecting as a non-owner role with JWT claims, RLS tests on the real Postgres, penetration test of cross-clinic access. |
| LG-13 | DEMO flags and accounts off. `DEMO_MODE=false`, no `@demo.invalid` accounts, no DEMO seed, `CLINICAL_CONTENT_APPROVED` set only with evidence, `NOTIFICATION_TRANSPORT` real only after LG-18. The API refuses `DEMO_MODE=true` when `NODE_ENV` is staging or production. | PARTIAL | Release checklist run on the target environment; no demo fixtures present. |
| LG-14 | Lockout trade-off decided: throttling/lockout on lookup and staff login can be abused to deny service to a legitimate user (someone can deliberately trigger a lockout for a reference or account). | LIMITATION | Owner decision and tuning; monitoring of rate-limit metrics. |
| LG-15 | Idempotent replay reveals the reference. Replaying a booking request with the same idempotency key returns the same reference (the secret is shown once only). Accept or change. | LIMITATION | Documented acceptance, or a design change reviewed by security. |
| LG-16 | Trust-proxy configuration. The client key for rate limiting uses `req.ip` with Express defaults (no `trust proxy`), so behind a reverse proxy or CDN all visitors can share one key, or a spoofed header must not be trusted. | OPEN | Explicit `trust proxy` setting matching the real topology, with a test. |

## 6. Production infrastructure

| ID | Gate | Status | Required evidence |
|---|---|---|---|
| LG-17 | Production infra: hosting, TLS, secrets management (`BOOKING_SECRET_KEY` etc. required outside demo), security headers applied at the real web host (`apps/web/public/_headers` is a documented config, untested on a live host), backups configured and **restore tested**, monitoring, logging with redaction verified | OPEN | Deployment runbook; restore drill record; header scan of the live host. Nothing has been deployed. |
| LG-18 | Notification providers. Reminders are **mock-only**; there is no real SMS or e-mail code. A real provider requires a privacy and content review of neutral templates and an opt-in flow review. | OPEN | Provider contract, DPA, template review, delivery tests. |
| LG-19 | Incident response plan (breach handling, contacts, notification duties to be verified by counsel), secret rotation, on-call | OPEN | Written and exercised plan. |

## 7. Quality evidence not yet produced

| ID | Gate | Status | Required evidence |
|---|---|---|---|
| LG-20 | Accessibility testing (WCAG 2.2 AA) on real devices and with screen readers (NVDA/JAWS, VoiceOver, TalkBack) and rendered-contrast checks in browsers. Only jsdom axe and token arithmetic have been run. | OPEN | Audit report and fixes. |
| LG-21 | Performance on slow Android devices and slow networks; PWA install/offline on real devices | OPEN | Measured results (for example Lighthouse and device runs). |
| LG-22 | Usability sessions with the 15-24 target audience | OPEN | Session notes and changes made. |
| LG-23 | Load testing | OPEN | Test report against the real deployment. |
| LG-24 | Independent penetration test and dependency audit on the release build | OPEN | Report and remediation. |
| LG-25 | Pilot operating procedure, onboarding checklist and evaluation plan (baseline, targets, consent, retention). Uptake outcomes are "to be evaluated", not claimed. | OPEN | Approved documents. |

## 8. Honest summary of the current state

- Everything visible is DEMO: clinics, articles, translations, staff accounts (only exist in demo mode), and reminders (mock-only, nothing is sent).
- A booking submission is a **request, not a confirmation**; only clinic staff can confirm it.
- Filipino text is draft and unreviewed.
- No clinical, legal, security, accessibility or performance review has taken place. Passing `npm run verify` does not change any gate above.
