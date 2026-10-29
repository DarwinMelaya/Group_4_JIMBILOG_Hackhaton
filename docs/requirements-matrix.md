# KALINGA requirements traceability matrix (initial, S0)

Status as of 2026-10-29: **all implementation status = `not started`** (no application code exists; see `docs/S0_AUDIT.md`). This initial version maps each source requirement to a feature ID, planned loop item, and a status category. Route/component, data model, API, acceptance criterion and test columns are summarized by reference and are refined (with real file paths and test names) as each slice lands. Nothing here is verified.

## Legend
Status categories (master prompt 0.4): `approved` (owner decision or approved brand direction), `documented` (stated in the brief/master prompt as a requirement), `assumption` (engineering recommendation, not in source), `partner-verification-required`, `medical-review-required`, `legal-review-required`, `deferred` (out of MVP). A row may carry two categories; the first is primary.
Sources: BR = Project Brief section; MP = master prompt section; BG = Brand Guide v1.0 section; OD = owner decision. Tests: T1-T17 = master prompt section 15 list. Impl = `not started` for every row.

## 1. Owner decisions
| Req | Requirement | Source | Feature | Loop item(s) | Category | Impl |
|---|---|---|---|---|---|---|
| OD-1 | Full-stack vertical slices; design foundation inside first slice | MP final decisions | all | S0-S9 | approved | not started |
| OD-2 | Preserve existing repo; no destructive reset | MP final decisions | all | S0-1, S0-2 | approved | not started |
| OD-3 | Fixed Home/Learn/Clinics/Menu mobile nav | MP, BG 6/8 | F01 | S1-2 | approved | not started |
| OD-4 | Reference + independent secret; no public account | MP | F06/F07 | S5-1, S5-2 | approved | not started |
| OD-5 | Ages 15-17 via approved SOP; real under-18 disabled until artifact | MP | F12 | S5-1, S7-1 | approved; legal-review-required; partner-verification-required | not started |
| OD-6 | English + Filipino, switch, key-based catalogs | MP | F11 | S1-3 | approved; medical-review-required | not started |
| OD-7 | Fictitious DEMO clinics/content only | MP | F04, F02 | S2-1, S4-1 | approved | not started |
| OD-8 | Local-first; mock-only notifications | MP | F08 | S1-1, S8-1 | approved | not started |

## 2. Public features (MP section 4; BR section 7)
| Req | Requirement | Source | Feature | Planned route / API / data | Loop item(s) | Tests | Category | Impl |
|---|---|---|---|---|---|---|---|---|
| F01-a | Anonymous entry, no auth/cookie wall/email capture | MP F01, BR 10.1 | F01 | `/`, all public routes | S1-2 | T1 | documented | not started |
| F01-b | Home hero, CTAs Explore Testing Options / Learn About STIs, how-it-works, no-diagnosis disclaimer, urgent link | MP F01, BG 6 | F01 | `/` | S1-2 | T1 | documented; medical-review-required (urgent copy) | not started |
| F01-c | Fixed 4-item bottom nav with safe area; desktop top nav; Menu (Privacy, Help/FAQs, About, language, Status Lookup) with focus trap/Escape | MP F01, BG 6 | F01 | AppShell, BottomNav, MenuDrawer | S1-2 | T1, T2 | approved | not started |
| F01-d | Not-found, loading, error, offline, install states; no sensitive state in history/query | MP F01 | F01 | router, error boundary | S1-2, S1-4 | T1, T12 | documented | not started |
| F01-e | Language switch consistent across public pages | MP F01, F11 | F01/F11 | menu | S1-3 | T15 | documented | not started |
| F02-a | Topic hub: STI basics, common STIs, symptoms, transmission, prevention, testing, treatment/follow-up, privacy, myths/FAQ, clinic expectations, when to seek care | MP F02, BR 7.1 | F02 | `/learn`; `GET /api/v1/articles` | S2-1, S2-2 | T3 | documented; medical-review-required | not started |
| F02-b | Article structure: summary, expandable detail, citations, reviewer, last-reviewed, next step | MP F02, BG 7.1 | F02 | `/learn/:slug`; `articles`, `article_localizations` | S2-1, S2-2 | T3 | documented; medical-review-required | not started |
| F02-c | Editorial workflow draft, under review, medically approved, published, archived; version history; stale flag; never publish placeholder as reviewed; DEMO banner | MP F02, A04 | F02/A04 | admin article endpoints; SQL publish constraint | S2-1, S7-1, S7-2 | T3 | documented; medical-review-required | not started |
| F02-d | Per-locale review and publication status; no inheritance from English | MP F02, F11 | F02/F11 | `article_localizations` | S2-1, S1-3 | T3, T15 | documented; medical-review-required | not started |
| F02-e | Separate urgent possible recent HIV exposure path; no symptom checker | MP F02, BR 8 | F02/F03 | `/urgent-care` | S2-2, S3-1 | T4, T14 | documented; medical-review-required | not started |
| F03-a | Optional pathway, skippable any time, not a gate | MP F03, BR 7.2 | F03 | `/testing-options` | S3-2 | T4 | documented | not started |
| F03-b | Stage 1 multi-select concerns (recognition, judgment, disclosure, cost, distance, unfamiliar procedure); no identity/sexual history/symptoms | MP F03, BR 7.2 | F03 | pathway UI; `POST /api/v1/clinic-matches` | S3-1, S3-2 | T4 | documented | not started |
| F03-c | Stage 2 review/edit/back; 72h HIV exposure checkpoint triggering PEP guidance, not persisted | MP F03, BG 9 | F03 | pathway UI | S3-1, S3-2 | T4, T14 | documented; medical-review-required | not started |
| F03-d | Stage 3 matched clinics with reasons, limits, unknowns ("Not confirmed"); change priorities, reset, browse all | MP F03, MP 9 | F03 | match service | S3-1, S3-2 | T4, T5 | documented | not started |
| F03-e | Deterministic explainable matching, no risk scores; selections in-memory only | MP F03, 9 | F03 | match service | S3-1 | T4 | documented | not started |
| F04-a | Directory search by facility/location/municipality/service with filters (service, price, appointment method, identity/consent, privacy, travel) | MP F04, BR 7.3 | F04 | `/clinics`; `GET /api/v1/clinics` | S4-1, S4-2 | T5 | documented | not started |
| F04-b | Result fields, last-verified date, unknown labels | MP F04 | F04 | ClinicCard | S4-2 | T5 | documented; partner-verification-required | not started |
| F04-c | Debounce/reset, zero-match, no-clinics-in-area, referral suggestions, error/offline states | MP F04 | F04 | clinics UI | S4-2 | T5 | documented | not started |
| F04-d | No map dependency; directions only with verified coordinates | MP F04 | F04 | n/a | S4-2 | T5 | documented | not started |
| F04-e | Admin publish/unpublish and ownership moderation | MP F04, A02 | F04/A02 | admin clinics endpoints | S7-1, S7-2 | T5 | documented | not started |
| F05-a | Profile fields: description, address, contacts, hours (Asia/Manila), services, fees, booking channels, ID/age/consent requirements, preparation, verification date/source/scope | MP F05, BR 7.3, BG 7.4 | F05 | `/clinics/:slug`; `GET /api/v1/clinics/:slug` | S4-1, S4-2 | T5 | documented; partner-verification-required | not started |
| F05-b | Privacy practices as Provider confirmed / Not confirmed; no blanket "100% confidential/anonymous" | MP F05, BG 9 | F05 | `clinic_privacy_practices` | S4-1, S4-2 | T5 | documented; partner-verification-required | not started |
| F05-c | Request Appointment only for participating clinics with validated booking config; else alternative contact | MP F05 | F05/F06 | `clinic_booking_config` | S4-1, S5-1 | T5, T14 | documented | not started |
| F05-d | Draft/unpublished/unverified content hidden from public | MP F05 | F05 | RLS + publish guard | S4-1 | T5 | documented | not started |
| F06-a | Pre-submission disclosure: supported low-disclosure options, fields, why, who receives, contact, restrictions, cancellation, request-only | MP F06, BR 10.3 | F06 | `/clinics/:slug/request`; `GET .../booking-requirements` | S5-1, S5-2 | T6 | documented | not started |
| F06-b | Dynamic schema-driven form, minimal fields; never collect symptoms/status/results/history/precise DOB/ID without justification | MP F06 | F06 | `clinic_booking_config` | S5-1 | T6 | documented; legal-review-required | not started |
| F06-c | Ages 15-17 per approved SOP; `policy_not_configured`; real minor submissions blocked | MP F06, F12 | F06/F12 | policy adapter | S5-1 | T14 | approved; legal-review-required | not started |
| F06-d | Preferred date/time = preference only; Asia/Manila; advance window; never "Booked" on submit | MP F06, BG 7.5 | F06 | DateTimePreferenceField | S5-1, S5-2 | T6 | documented | not started |
| F06-e | Server: validation, rate limits, CSPRNG reference, idempotency key, transaction, audit without personal detail | MP F06, 8 | F06 | `POST /api/v1/appointment-requests` | S5-1 | T6 | documented | not started |
| F06-f | After submit: Pending Clinic Review, reference + separate >=256-bit secret shown once, hashed at rest, constant-time compare, uniform failures, throttling, no URL/log/cache/storage, no-store, no insecure recovery | MP F06, 8 | F06 | response; `appointment_requests` | S5-1, S5-2 | T6, T7 | documented | not started |
| F06-g | Never imply confirmed before staff; user cancel/withdraw where permitted | MP F06 | F06/F07 | `.../cancel`, `.../withdraw` | S5-2, S6-2 | T6, T8 | documented; partner-verification-required | not started |
| F07-a | Statuses pending_review, confirmed, alternative_required, cancelled only | MP F07, BG 8 | F07 | `appointment_status_events` | S5-1, S6-2 | T8 | documented | not started |
| F07-b | Staff queue scoped to own clinics; filter by safe metadata; minimal record; confirm/alternative/cancel with server validation, optimistic lock, audit | MP F07, A03 | F07 | `/staff/appointments`; staff endpoints | S6-2, S6-3 | T8 | documented | not started |
| F07-c | Public lookup via reference + secret; neutral copy; confirmed date/time + prep; alternatives with next action | MP F07 | F07 | `/request/status`; `POST .../lookup` | S5-2, S6-3 | T7 | documented | not started |
| F07-d | Explicit transition matrix, race protection, no auto-confirm | MP F07 | F07 | status PATCH | S6-2 | T8 | documented | not started |
| F08-a | Confirmed-request preparation details (location, time, ID/consent, what to expect, contact/cancel, fallback) | MP F08, BR 7.5 | F08 | AppointmentStatusCard | S6-3, S8-1 | T9 | documented; partner-verification-required | not started |
| F08-b | Optional opt-in neutral reminders; mock transport; no STI/HIV wording; idempotency, expiry, short delivery log; honest "not available" UI; no push prompt on first visit | MP F08, BR 7.5 | F08 | `notification_preferences`, `notification_jobs`; `POST .../notification-preferences` | S8-1 | T9, T16 | documented | not started |
| F09-a | Provider-led results retrieval guidance; no results/diagnoses stored | MP F09, BR 7.6 | F09 | `/care` | S8-1 | T10 | documented; medical-review-required | not started |
| F09-b | Treatment/referral/follow-up directory info; `GET /api/v1/referrals` | MP F09 | F09 | `clinic_referrals` | S4-1, S8-1 | T10 | documented; partner-verification-required | not started |
| F09-c | Attendance flag only with institutional approval | MP F09, A03 | F09/A03 | restricted flag | S8-2 | T11 | partner-verification-required; deferred | not started |
| F10-a | Privacy notice, FAQ (anonymous browsing vs confidential request vs anonymous testing, age caveats, reference safety) | MP F10, BG 8/9 | F10 | `/privacy`, `/help` | S1-2 (placeholder), S9-2 | T1 | documented; legal-review-required | not started |
| F10-b | About: exact expansion; affiliations only if confirmed; tagline provisional | MP F10, BG 1 | F10 | `/about` | S1-2 | T15 | documented; partner-verification-required | not started |
| F10-c | Feedback/help contact without health details; spam protection; no invented contacts | MP F10 | F10 | help route | S9-2 | T1 | assumption | not started |
| F11-a | Typed en/fil catalogs, stable IDs, parity/parameter/escape tests, `lang` annotations, 320px expansion, locale formats, no silent missing-key fallback | MP F11, 2 | F11 | catalogs | S1-3 | T15 | documented | not started |
| F11-b | Only language preference persists; per-locale content review state; demo labeling in both languages | MP F11 | F11 | locale store | S1-3, S2-1 | T15 | documented; medical-review-required | not started |
| F12-a | Versioned clinic-scoped minor policy engine (eligible, not_eligible, policy_missing, additional_process_required); evidence ID/version, effective date, clinic mapping; demo policies rejected in non-demo | MP F12, 7 | F12 | `minor_booking_policies`, `_steps` | S5-1, S7-1 | T14 | approved; legal-review-required | not started |
| F12-b | Tests: adult bypass, missing policy, happy path, additional process, disabled clinic, unauthorized config, disclosure before collection, age minimization; no universal consent rule | MP F12 | F12 | policy tests | S5-1, S7-1 | T14 | documented | not started |
| F12-c | Gate `APPROVED_SOP_ARTIFACT_MISSING` recorded | MP 17.3 | F12 | `docs/minor-booking-policy-and-evidence.md` (later) | S9-2 | T14 | documented | not started (gate open) |

## 3. Administrative and institutional (MP section 5; BR 6, 7.7)
| Req | Requirement | Source | Feature | Loop item(s) | Tests | Category | Impl |
|---|---|---|---|---|---|---|---|
| A01-a | Roles clinic_staff, clinic_manager, provincial_admin, content_reviewer, technical_admin; matrix documented; server + RLS enforcement; clinic-scoped views | MP A01 | A01 | S6-1, S7-1 | T8 | assumption; partner-verification-required | not started |
| A01-b | Technical admin has no automatic booking plaintext access; least privilege; separation of duty | MP A01, 11 | A01 | S6-1, S7-1 | T8 | documented | not started |
| A01-c | Supabase Auth, invitations, disable/reactivate, session expiry, secure reset, MFA where feasible; no client-supplied roles; suspended states; audit | MP A01, BR 9 | A01 | S6-1, S7-1 | T8 | documented; gap G-AUTH (dev equivalent) | not started |
| A02-a | Clinic manager edits drafts (name, contacts, address, hours, services, prices, channels, required fields, confidentiality/youth, referrals, age/ID/consent, evidence, last-confirmed) | MP A02, BR 7.3 | A02 | S4-1, S7-1, S7-2 | T5 | documented | not started |
| A02-b | Provincial admin verifies/publishes/unpublishes with source/date/scope; critical changes return to pending verification; stale queue; preview; change tracking; optimistic concurrency | MP A02 | A02 | S7-1, S7-2 | T5 | documented; partner-verification-required | not started |
| A03-a | Clinic-scoped inbox, counts, list/detail, restricted fields, confirm/alternative/cancel, time zone, optional attendance, race protection; no external calendar/booking engine | MP A03 | A03 | S6-2, S6-3 | T8 | documented | not started |
| A04-a | Author/editor roles, medical review workflow, references, review dates, revisions, publication status, freshness, urgent-notice versioning; human medical reviewers only | MP A04 | A04 | S2-1, S7-1, S7-2 | T3 | documented; medical-review-required | not started |
| A05-a | Province-wide directory review queue and completeness/freshness indicators | MP A05 | A05 | S7-1, S7-2 | T5 | documented | not started |
| A05-b | Aggregate metrics with defined denominators; small-cell suppression; no reidentifying drilldown; approved aggregate CSV only | MP A05, BR 7.7 | A05 | S8-2 | T11 | documented; partner-verification-required | not started |
| A05-c | Anonymous voluntary survey, unbound from bookings | MP A05 | A05 | S8-2 | T11 | assumption | not started |
| A06-a | Feature flags, partner onboarding, roles, audit events, backup/restore drill, monitoring, rate-limit metrics, incident response, retention jobs, export/delete process, secret rotation, release checklist; no read-all panel | MP A06 | A06 | S1-1, S7-1, S9-2 | T13 | documented; legal-review-required | not started |
| A07-a | Privacy-preserving pilot instrumentation with explicit event definitions; no cross-service profile | MP A07, BR 12 | A07 | S8-2 | T11 | documented | not started |
| A07-b | Pre-pilot baseline/target/consent/retention/granularity/evaluation documentation; uptake is "to be evaluated" | MP A07, BR 12 | A07 | S9-2 | n/a | documented; deferred (pilot) | not started |
| A07-c | B2B2C: essential information and navigation free; paid options are future, no paywalls/payments in MVP | MP A07, BR 13 | A07 | none (constraint) | n/a | documented; deferred | not started |

## 4. Brief-only scope and limitations (BR 8, 10, 14)
| Req | Requirement | Source | Handling | Category | Impl |
|---|---|---|---|---|---|
| B-1 | Does not diagnose, replace clinical consultation, interpret labs, guarantee anonymous testing, assume every clinic supports online scheduling | BR 14, MP 0.6 | Constraint in copy and tests across all slices | documented | not started |
| B-2 | Out of scope: automated appointment integrations, home testing, telemedicine, digital results, detailed clinical records | BR 14 | Not built | deferred | n/a |
| B-3 | Urgent possible recent HIV exposure prioritizes PEP assessment over booking | BR 8, BG 9 | Always-visible urgent entry | documented; medical-review-required | not started |
| B-4 | Anonymous browsing and confidential appointments are distinct from anonymous testing | BR 10 | Copy and FAQ | documented | not started |
| B-5 | Retention policies for appointment info justified by operational/legal needs; no invented universal period | BR 10.8, MP 7 | Configurable retention; no default claim | legal-review-required | not started |
| B-6 | Hosting/data flows reviewed for Philippine Data Privacy Act | BR 9 | Release gate | legal-review-required | not started |
| B-7 | Institution roles (PHO, DOH MIMAROPA, municipal offices, schools) are proposed only | BR 6, MP 1 | Never represent as confirmed | partner-verification-required | not started |
| B-8 | Roadmap phases 1-6 (research, design, MVP, pilot, evaluation, expansion) | BR 11 | Only Phase 3 (MVP build) is in this loop | deferred (phases other than 3) | n/a |

## 5. Brand and UX (BG; MP section 3)
| Req | Requirement | Source | Loop item(s) | Tests | Category | Impl |
|---|---|---|---|---|---|---|
| BR-1 | Palette B tokens exactly (#34496D, #586AA7, #E9EDFC, #D78FA3, #F4C9AA, #FAFBFE, #1D2C43, #52627B, #DDE3F0), spacing/radius/touch tokens | MP 3, BG 3, 10 | S1-2 | T2 | approved | not started |
| BR-2 | Plus Jakarta Sans headings (600-700), Inter body (400-600), type scale 36/44, 30/38, 24/32, 20/28, 16/24, 14/21, 16/24 button, 12/18; font-display swap | MP 3, BG 4 | S1-2 | T2 | approved | not started |
| BR-3 | Lucide outline icons, 24px, 2px stroke, labeled; named anchors | MP 3, BG 4 | S1-2 | T2 | approved | not started |
| BR-4 | Soft geometric vector illustration; no fear imagery, anatomy clichés, patient imagery | MP 3, BG 5 | S1-2 | design QA (manual) | approved | not started |
| BR-5 | 8px rhythm, 16px mobile gutters, radii 12/16/24, min 44x44, visible borders, subtle shadows | MP 3, BG 5 | S1-2, S1-5 | T2 | approved | not started |
| BR-6 | Symbolic K mark: recolor an approved editable master; PNG is shape reference only; otherwise labeled temporary text wordmark; variants and 32/48/64 tests; maskable icon after approval | MP 3, BG 2 | S1-2, S1-4 | T12 | approved; gate (logo master missing) | not started |
| BR-7 | Literal title KALINGA, no diacritics; long form only in About/institutional; tagline provisional | MP 3, BG 1 | S1-2 | T15 | approved | not started |
| BR-8 | Voice: supportive, never "Your appointment is booked!" or "100% anonymous" | BG 1 | S1-3 on | T6, T15 | approved | not started |
| BR-9 | Component library with states (AppShell ... Toast/LiveRegion list) | MP 3, BG 8 | S1-2 onward | T2 | documented | not started |
| BR-10 | Responsive 320-1440, centered stepper for pathway, mobile single column, desktop split hero | MP 3, 10, BG 6 | S1-2, S1-5, S3-2 | T1, T2 | documented | not started |
| BR-11 | Accessibility WCAG 2.2 AA: contrast 4.5/3, keyboard, focus, labels, error text, 200% zoom, reduced motion, no color-only status | MP 3, BG 9 | S1-5 onward | T2 | documented | not started |

## 6. Engineering, PWA and data (MP sections 2, 7, 8, 10, 12)
| Req | Requirement | Source | Loop item(s) | Tests | Category | Impl |
|---|---|---|---|---|---|---|
| E-1 | Workspaces, TS config, ESLint, Vitest, `.env.example`, `.gitignore`, `npm run verify` | MP 2, 12; LOOP.md | S0-2 | verify | assumption | not started |
| E-2 | Express + Zod `/api/v1`, centralized errors, correlation IDs, redacted structured logs, security headers, CORS, body limits, rate limits | MP 2, 8 | S1-1 | T13 | documented | not started |
| E-3 | SQL migrations with constraints/indexes/RLS; full entity set (organizations ... feature_flags) | MP 7 | S1-1, S2-1, S4-1, S5-1, S6-1, S7-1, S8-1, S8-2 | T8 | documented | not started |
| E-4 | `GET /api/v1/public/config` and `GET /api/v1/public/locales` | MP 8 | S1-1, S1-5 | T1 | documented | not started |
| E-5 | OpenAPI 3.1 contract and typed shared schemas | MP 8, 13 | S1-1 onward; `docs/api-contract.md` in S9-2 | contract QA | documented | not started |
| E-6 | PWA: manifest, versioned service worker, public-only cache, offline message, no caching of private data, cache purge | MP 10 | S1-4 | T12 | documented | not started |
| E-7 | Forms: label-first, inline validation, React Hook Form acceptable; single fetching strategy | MP 2 | S1-5 onward | T1 | assumption | not started |
| E-8 | Server-enforced flags (`DEMO_MODE`, `CLINICAL_CONTENT_APPROVED`, `ALLOW_REAL_BOOKING_REQUESTS`, `REAL_MINOR_BOOKING_ENABLED`, `NOTIFICATION_TRANSPORT`, `REAL_NOTIFICATIONS_ENABLED`), startup validator, CI fails on demo flags in release config | MP 12 | S0-2, S1-1 | T13 | documented | not started |
| E-9 | Seed: DEMO CLINIC A/B etc., unmistakable labels, no real names/addresses/fees; production starts with no clinics | MP 12 | S2-1, S4-1 | T5 | approved | not started |
| E-10 | Clinic onboarding checklist | MP 12 | S9-2 (docs) | n/a | documented; partner-verification-required | not started |
| E-11 | Local-first DB: documented equivalent to Supabase (PGlite), RLS gap flagged | MP 2, OD-8 | S1-1 | T8 | approved | not started |
| E-12 | Delivery docs: implementation-status, slice-test-evidence, launch-gates, README run guide | MP 13, 17 | S1-5, S9-2 | docs exist | documented | not started |

## 7. Test matrix (MP section 15) coverage map
| Test | Subject | Planned in |
|---|---|---|
| T1 | Public access, nav semantics, keyboard order, CTAs | S1-2, S1-5 |
| T2 | Palette/layout/fonts, 200% zoom, 44px, contrast, reduced motion, icon labels | S1-2, S1-5 |
| T3 | Articles topic/search/empty, no unreviewed publishing | S2-1, S2-2 |
| T4 | Pathway select/review/skip/match/unknown/reset/no persistence/urgent | S3-1, S3-2 |
| T5 | Directory filters, claims, stale data, published only, explicit unknowns | S4-1, S4-2 |
| T6 | Booking disclosure, validation, timezone, not-confirmed, replay, no-store | S5-1, S5-2 |
| T7 | Reference+secret lookup, invalid, throttling, cache safety | S5-2 |
| T8 | Staff auth, IDOR, RLS, transitions, concurrency | S6-1, S6-2 |
| T9 | Neutral reminders opt-in/out/failure | S8-1 |
| T10 | Care pages store no results | S8-1 |
| T11 | Metrics denominators, suppression, redacted export | S8-2 |
| T12 | PWA install/update/public cache/offline/stale warning | S1-4 |
| T13 | Privacy/security scans, dependency audit, no secrets/medical data | S0-2 (audit), each slice, S9 |
| T14 | Full E2E journeys incl. urgent, non-participating clinic, demo minor path, disabled real-minor path | S9-1 |
| T15 | EN/FIL parity and formats | S1-3 |
| T16 | Mock notification adapter cases | S8-1 |
| T17 | Existing-repo preservation (no deleted/overwritten files) | S0-1, S0-2, every cycle |

## 8. Release gates (MP section 16, BG 10) — all open, none evidenced
Final logo master; confirmed healthcare agreements and owners; verified clinic facts with dates/sources; qualified clinical review (articles, urgent PEP, referral guidance); legal/privacy review including approved minor SOP and clinic mappings; security audit, least privilege/RLS, secure appointment access, backups/restore; WCAG 2.2 AA audit, usability sessions with 15-24-year-olds, slow network and small phone checks; pilot operating procedure; no demo fixtures/identities/mock sends/unchecked demo flags in production. Category: `partner-verification-required`, `medical-review-required`, `legal-review-required`. Delivered as `docs/launch-gates.md` in S9-2 (no readiness claim).
