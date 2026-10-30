# KALINGA threat model (initial, S0)

Status (updated S9-2): the controls below were first planned at S0; the last column now records what the DEMO prototype implements, from reading the code listing and tests (cited by file). "implemented-demo" means code and automated tests exist, not that the control was independently reviewed or penetration tested. Nothing is claimed ready for real use; see `docs/launch-gates.md`. Source: master prompt sections 4-8, 11; brief section 10.

## 1. Assets
| Asset | Sensitivity |
|---|---|
| Appointment request payload (provider-required fields, preferred time) | High: reveals interest in STI services |
| Booking reference and independent access secret | High: the secret is the sole bearer credential for status |
| Staff credentials and sessions | High |
| Clinic facts (services, privacy practices, verification) | Integrity-critical: false claims can cause harm |
| Minor-booking policy artifacts and mappings | High integrity |
| Notification destinations (opt-in only) | High |
| Audit events, aggregate metrics | Medium: must not re-identify |
| Article review state, urgent PEP copy | Integrity-critical |
| Pathway selections (concerns, 72h exposure choice) | High: never persisted server-side |

Out of scope by design: diagnoses, test results, clinical records (never stored).

## 2. Actors
Anonymous visitor (possibly a minor); shared-device user; attacker guessing references; malicious or curious staff; staff from another clinic; technical admin; automated bots; supply-chain attacker; passive network observer.

## 3. Trust boundaries
Browser/device to API; API to database; staff session boundary; clinic to clinic scope; admin to booking data; app to notification transport (mock only); app to third-party assets (fonts, maps).

## 4. Threats and planned mitigations (STRIDE-oriented)
| ID | Threat (master prompt list) | Planned mitigation | Slice / test | Status (S9-2) and evidence |
|---|---|---|---|---|
| T-01 | Lost or shared device exposes booking info | Reference + secret kept in memory only; no localStorage or persistent session storage; hide/reveal with shared-device warning; `no-store`; service worker bypass for API; clear/leave control | S5, tests 7, 12 | implemented-demo: secret held in component memory only (`apps/web/src/pages/BookingRequest.tsx`, `apps/web/src/staff/StaffSession.tsx` comments and tests); API `no-store` (`apps/api/src/http/middleware.ts`); SW bypasses API (`apps/web/public/sw.js`). Real-device check open |
| T-02 | Guessed or enumerated references | Reference alone returns nothing; secret >= 256 bits CSPRNG; hashed/HMAC at rest; constant-time compare; uniform generic failure; per-IP and per-reference throttling and lockout; 429 with retry guidance | S5-2, test 7 | implemented-demo: `apps/api/src/booking/{crypto,access,rate-limit}.ts`. Lockout can be abused for DoS (LG-14); proxy key issue (LG-16) |
| T-03 | Secret leakage via URL, logs, referrer, analytics, cache | POST body lookup only; no secret in URL; log redaction; no third-party analytics; `Referrer-Policy: no-referrer`; `no-store` | S1-1, S5, test 13 | implemented-demo: POST-only lookup, redacting logger (`apps/api/src/http/logger.ts`), `Referrer-Policy: no-referrer` (`apps/web/public/_headers`). Live-host header scan open |
| T-04 | Broad staff query / over-collection | Clinic-scoped membership checks plus RLS; minimal list fields; payload only on detail; field-level visibility | S6, test 8 | implemented-demo: `apps/api/src/staff/{booking-queue,repository}.ts`. Enforced by server checks, not RLS (API runs as owner) |
| T-05 | IDOR across clinics | Server scope check on every staff route; swapped-ID negative tests; RLS defense in depth | S6-1, test 8 | implemented-demo: cross-clinic negative tests (`apps/api/src/staff/queue.test.ts`, `governance/authz-matrix.test.ts`). Pen test open |
| T-06 | Technical admin reads patient bookings | Role denies payload access; encrypted/minimized payload; separation of duty | S6/S7 | partial: role matrix denies technical/provincial admin booking reads (`apps/api/src/governance/authz-matrix.test.ts`); no payload encryption |
| T-07 | Unverified or stale clinic facts shown as verified | Facts carry source+date or display "Not confirmed"; publish guard constraint in SQL; stale-review queue; demo clinics unmistakably fake | S4, S7 | partial: publish guard and evidence workflow (`supabase/migrations/0003_clinics.sql`, `0006_governance.sql`, `apps/api/src/governance/clinic-governance.ts`); real verification evidence open (LG-05, LG-06) |
| T-08 | Minor booking without approved policy | Server-side policy adapter fails closed (`policy_not_configured`); real minor submissions disabled; demo policy rejected in non-demo config; no client bypass | S5-1, S7-1, test 14 | implemented-demo: `apps/api/src/booking/minor-policy.ts`, `governance/minor-sop.ts`; real 15-17 booking stays off (LG-09) |
| T-09 | Browser history / URL leaks of sensitive journey | No sensitive state in URLs or query strings; pathway selections in memory; neutral document titles | S1-2, S3 | implemented-demo: pathway state in memory, no query strings (`apps/api/src/pathway/`, `apps/web/src/pages/Pathway.tsx`); not browser-verified |
| T-10 | Lock-screen or message disclosure | Neutral templates (no STI/HIV/clinic name); explicit opt-in; mock transport only; preview | S8-1, test 9, 16 | implemented-demo (mock only): neutral templates `apps/api/src/notifications/render.ts` and `neutrality.test.ts`; no real transport exists (LG-18) |
| T-11 | XSS | React escaping; strict CSP; no `dangerouslySetInnerHTML` with content; sanitized rich text if ever added; escaped i18n interpolation | S1, test 13/15 | implemented-demo: no `dangerouslySetInnerHTML` in app code (grep), CSP in `apps/web/public/_headers`, helmet in `apps/api/src/app.ts`; CSP not tested on a live host |
| T-12 | CSRF on staff actions | Same-site cookies with CSRF token or custom-header scheme for session-authenticated mutations; CORS least privilege | S6-1 | implemented-demo: CSRF token plus same-origin check on staff/admin mutations (`apps/api/src/staff/middleware.ts`, `governance/routes.ts`); cookie path across `/api/v1/admin` was exercised in e2e |
| T-13 | Injection (SQL) | Parameterized queries only; Zod validation; allowlisted filters and bounded pagination | S1-1 on | implemented-demo: parameterized queries and Zod validation in `apps/api/src/*/repository.ts`; no SQL scanner run |
| T-14 | External map or font referrers | No map dependency in MVP; fonts self-hosted or trusted provider with `swap`; no external requests carrying sensitive state | S1-2 | implemented-demo: no map dependency; fonts and assets served locally; CSP `default-src 'self'` |
| T-15 | Analytics re-identification / small cells | Aggregate counters only; small-cell suppression threshold; no per-visitor profile; redacted CSV; no drilldown | S8-2, test 11 | implemented-demo: small-cell suppression and CSV neutralisation (`apps/api/src/reports/suppress.ts`, `reports.ts`); S9-3 may refine suppression |
| T-16 | Supply chain (npm dependencies, CDN) | Lockfile committed by owner; audit in verify/CI; minimal dependencies; no unpinned CDN scripts | S0-2, S9 | partial: lockfile present, minimal dependencies; no audit run recorded in evidence for the release build (LG-24) |
| T-17 | Replay / duplicate submission, offline retry | Single-use idempotency keys; transactional create; no false success on network failure | S5-1, test 6 | implemented-demo: idempotency key and transactional create (`apps/api/src/booking/repository.ts`); replay reveals the reference (LG-15) |
| T-18 | Status races and unauthorized transitions | Explicit transition matrix; version/ETag optimistic lock; atomic audit event; fail closed | S6-2, test 8 | implemented-demo: transition matrix, `If-Match` version lock, atomic audit (`apps/api/src/staff/decisions.ts`, `booking-queue.ts`) |
| T-19 | Demo data or flags reaching production | Startup validator refusing unsafe flags in staging/production; CI check for demo flags; DEMO labels everywhere | S0-2, S1-1, S9 | partial: startup validator (`apps/api/src/env.ts`, `env.hardening.test.ts`) and DEMO labels; no CI release-config check in a real pipeline (LG-13) |
| T-20 | Unreviewed medical text published | Publish-safety SQL constraint; per-locale review state; workflow requiring human reviewer; DEMO banner | S2, S7 | implemented-demo: CHECK constraint (`supabase/migrations/0002_articles.sql`) and per-locale review (`apps/api/src/governance/content-review.ts`); no human reviewer has approved anything |
| T-21 | Urgent PEP path buried or blocked | Always-visible entry on Home/Learn/Pathway/Clinics; bypasses matching; copy review-gated | S1-2, S2-2, S3 | implemented-demo: `apps/web/src/components/UrgentPepBanner.tsx`, pathway bypass, e2e urgent flow; copy not clinically reviewed (LG-01, LG-03) |
| T-22 | Staff account compromise | scrypt-hashed passwords, session expiry, lockout/throttle, audit; Supabase Auth with MFA required for real deployment (gap G-AUTH) | S6-1 | partial: scrypt, sessions, lockout, audit (`apps/api/src/staff/password.ts`, `auth.test.ts`); Supabase Auth and MFA open (G-AUTH, LG-11) |
| T-23 | Audit/log leakage | Audit events contain no booking payload; log redaction tests | S6-2, test 13 | implemented-demo: audit metadata holds role/outcome/count only (`apps/api/src/staff/audit.ts`, `governance/audit.ts`), logger redaction test (`http/logger.test.ts`) |
| T-24 | Service worker caches private data | Public-only allowlist caching; explicit bypass; cache purge on update/logout; test | S1-4, test 12 | implemented-demo: public-only allowlist (`apps/web/public/cache-policy.js`, `pwa.test.ts`); not checked on real devices |
| T-25 | Falsely implying confirmation/anonymity | Copy rules: "request is pending clinic review"; never "booked" or "100% anonymous"; tests for wording | S5, S6 | implemented-demo: request-not-confirmation wording with tests (`apps/web/src/pages/booking.test.tsx`, e2e); copy not reviewed by counsel or clinicians |
| T-26 | Fake successes / mock sends shown as real | Mock-only labels in UI; no real transport code | S8-1 | implemented-demo: mock-only labels; `selectTransport` throws for any real transport (`apps/api/src/notifications/mock-transport.ts`) |

## 5. Residual risks and known gaps
- Supabase Auth, MFA and real JWT-claim RLS are not testable locally (G-AUTH).
- Encryption at rest, KMS and backup/restore drills are documentation-only until a real deployment exists.
- No pen-test, legal (Data Privacy Act) or clinical review has occurred; none is claimed.
- Physical-device and Android/Safari testing evidence is absent until performed.
- S9-3 (code-review and security-review fixes) runs separately; re-read the status column after it lands.
- Open operational items (trust-proxy configuration, lockout DoS trade-off, four-eyes clinic verification, replay reveals reference) are in `docs/launch-gates.md`.
