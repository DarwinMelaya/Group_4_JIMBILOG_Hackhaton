# KALINGA threat model (initial, S0)

Status: design-time analysis. No code exists; no control below is implemented or tested yet. Mitigation columns state the planned control and the slice that will deliver and test it. Source: master prompt sections 4-8, 11; brief section 10.

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
| ID | Threat (master prompt list) | Planned mitigation | Slice / test |
|---|---|---|---|
| T-01 | Lost or shared device exposes booking info | Reference + secret kept in memory only; no localStorage or persistent session storage; hide/reveal with shared-device warning; `no-store`; service worker bypass for API; clear/leave control | S5, tests 7, 12 |
| T-02 | Guessed or enumerated references | Reference alone returns nothing; secret >= 256 bits CSPRNG; hashed/HMAC at rest; constant-time compare; uniform generic failure; per-IP and per-reference throttling and lockout; 429 with retry guidance | S5-2, test 7 |
| T-03 | Secret leakage via URL, logs, referrer, analytics, cache | POST body lookup only; no secret in URL; log redaction; no third-party analytics; `Referrer-Policy: no-referrer`; `no-store` | S1-1, S5, test 13 |
| T-04 | Broad staff query / over-collection | Clinic-scoped membership checks plus RLS; minimal list fields; payload only on detail; field-level visibility | S6, test 8 |
| T-05 | IDOR across clinics | Server scope check on every staff route; swapped-ID negative tests; RLS defense in depth | S6-1, test 8 |
| T-06 | Technical admin reads patient bookings | Role denies payload access; encrypted/minimized payload; separation of duty | S6/S7 |
| T-07 | Unverified or stale clinic facts shown as verified | Facts carry source+date or display "Not confirmed"; publish guard constraint in SQL; stale-review queue; demo clinics unmistakably fake | S4, S7 |
| T-08 | Minor booking without approved policy | Server-side policy adapter fails closed (`policy_not_configured`); real minor submissions disabled; demo policy rejected in non-demo config; no client bypass | S5-1, S7-1, test 14 |
| T-09 | Browser history / URL leaks of sensitive journey | No sensitive state in URLs or query strings; pathway selections in memory; neutral document titles | S1-2, S3 |
| T-10 | Lock-screen or message disclosure | Neutral templates (no STI/HIV/clinic name); explicit opt-in; mock transport only; preview | S8-1, test 9, 16 |
| T-11 | XSS | React escaping; strict CSP; no `dangerouslySetInnerHTML` with content; sanitized rich text if ever added; escaped i18n interpolation | S1, test 13/15 |
| T-12 | CSRF on staff actions | Same-site cookies with CSRF token or custom-header scheme for session-authenticated mutations; CORS least privilege | S6-1 |
| T-13 | Injection (SQL) | Parameterized queries only; Zod validation; allowlisted filters and bounded pagination | S1-1 on |
| T-14 | External map or font referrers | No map dependency in MVP; fonts self-hosted or trusted provider with `swap`; no external requests carrying sensitive state | S1-2 |
| T-15 | Analytics re-identification / small cells | Aggregate counters only; small-cell suppression threshold; no per-visitor profile; redacted CSV; no drilldown | S8-2, test 11 |
| T-16 | Supply chain (npm dependencies, CDN) | Lockfile committed by owner; audit in verify/CI; minimal dependencies; no unpinned CDN scripts | S0-2, S9 |
| T-17 | Replay / duplicate submission, offline retry | Single-use idempotency keys; transactional create; no false success on network failure | S5-1, test 6 |
| T-18 | Status races and unauthorized transitions | Explicit transition matrix; version/ETag optimistic lock; atomic audit event; fail closed | S6-2, test 8 |
| T-19 | Demo data or flags reaching production | Startup validator refusing unsafe flags in staging/production; CI check for demo flags; DEMO labels everywhere | S0-2, S1-1, S9 |
| T-20 | Unreviewed medical text published | Publish-safety SQL constraint; per-locale review state; workflow requiring human reviewer; DEMO banner | S2, S7 |
| T-21 | Urgent PEP path buried or blocked | Always-visible entry on Home/Learn/Pathway/Clinics; bypasses matching; copy review-gated | S1-2, S2-2, S3 |
| T-22 | Staff account compromise | scrypt-hashed passwords, session expiry, lockout/throttle, audit; Supabase Auth with MFA required for real deployment (gap G-AUTH) | S6-1 |
| T-23 | Audit/log leakage | Audit events contain no booking payload; log redaction tests | S6-2, test 13 |
| T-24 | Service worker caches private data | Public-only allowlist caching; explicit bypass; cache purge on update/logout; test | S1-4, test 12 |
| T-25 | Falsely implying confirmation/anonymity | Copy rules: "request is pending clinic review"; never "booked" or "100% anonymous"; tests for wording | S5, S6 |
| T-26 | Fake successes / mock sends shown as real | Mock-only labels in UI; no real transport code | S8-1 |

## 5. Residual risks and known gaps
- Supabase Auth, MFA and real JWT-claim RLS are not testable locally (G-AUTH).
- Encryption at rest, KMS and backup/restore drills are documentation-only until a real deployment exists.
- No pen-test, legal (Data Privacy Act) or clinical review has occurred; none is claimed.
- Physical-device and Android/Safari testing evidence is absent until performed.
- This model is initial and must be revisited after S5, S6 and S9.
