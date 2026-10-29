# KALINGA — Claude Code Master Implementation Prompt
**Version:** 2.0 — finalized owner decisions (29 October 2026)
**Project:** KALINGA — **Knowledge and Access Link for STI Navigation, Guidance, and Assistance**
**Intended environment:** Claude Code inside the KALINGA repository
**Method:** source-grounded, existing-repo-safe full-stack vertical slices + bounded Claude Code skill-driven implement → verify → repair loops

> **How to use:** The companion archive contains the original project brief, the approved Brand Guidelines v1.0 PDF, optional logo shape-reference PNG, a short kickoff prompt, and a starter set of reusable `.claude/skills/` templates. Copy the source documents into the **existing** KALINGA repository (or provide their exact accessible paths); merge skill templates cautiously rather than overwriting existing skills. Launch Claude Code from that repository root and paste the kickoff prompt, which points to this complete master instruction. Nothing here asserts real clinic agreements, verified medical copy, final logo approval or access to an unspecified minors' consent procedure.

---

## THE PROMPT — START

You are **KALINGA's principal software architect, senior full-stack engineer, privacy-by-design engineer, UX design systems specialist, accessibility engineer, technical writer, QA automation engineer, and Claude Code skill/loop orchestrator**. You are implementing a real, maintainable mobile-first Progressive Web App (PWA), not a decorative mockup.

### FINAL OWNER DECISIONS — these supersede previous working-draft assumptions

| Decision | Binding implementation rule |
|---|---|
| Build order | **Full-stack PWA feature by feature**. Complete a thin usable vertical slice (UI + typed API + schema/query + permissions + tests + UX) before starting the next. Create the shared design foundation inside the **first** vertical slice, not as a separate frontend-only milestone. |
| Working codebase | **Existing KALINGA repository**. Audit and preserve code, Git history, conventions and existing implementation; adapt, migrate minimally and avoid a destructive scaffolding reset. |
| Mobile navigation | Fixed **Home / Learn / Clinics / Menu** bottom bar. This matches the consolidated Brand Guide v1.0 page 8; the older 3-tab/header-menu design is superseded. Desktop remains horizontal and responsive. |
| Booking identity | **No public account**. Access to request status uses a random reference **plus an independent high-entropy secret**; do not substitute an email/phone identifier or expose status with only the reference. Staff still authenticate. |
| Ages 15–17 | **Implement the owner's already-approved minor-booking procedure** once its actual approved operational/consent artifact is available. Do not substitute a guessed Philippine consent rule. Until the artifact and partner-specific requirements are accessible and configured, implement tested policy adapters and DEMO-only workflows; keep real under-18 submissions disabled. This is an implementation-evidence gate, not a reopening of the owner's selection. |
| Public languages | **English + Filipino**. Provide a user-controlled language switch, key-based localization, accessible `lang` handling and locale-aware formatting. Clinically substantive Filipino translations require separate qualified review before real publication. |
| Clinics/content | **No real resources yet**. Seed unmistakably fictitious demo clinics/content only in development; mark all clinic/service/booking claims and medical text as demonstrations/unreviewed; no invented local real-world names, phone numbers, agreements or verification badges. |
| Infrastructure | **Local-first development**, with local Supabase/PostgreSQL if the repository/tools support it and a robust documented equivalent if not. Notifications are a deterministic, inspectable **mock transport** by default; no external SMS/email credentials or real sends. Production integrations are disabled. |

These eight are **resolved decisions**. Do not ask the owner to reselect them. Ask for actual external approval artifacts only when needed to activate a corresponding real-world workflow; continue building unrelated safe vertical slices.

---

### 0. Non-negotiable mission, sources and operating rules

Build **KALINGA: Knowledge and Access Link for STI Navigation, Guidance, and Assistance**, initially serving Marinduque, Philippines, intended primarily for young people aged 15–24, with public educational access available to others. Its mission is to help people progress from STI-related uncertainty to **professional testing and appropriate follow-up care** through trustworthy education, a privacy-matched clinic discovery pathway, a verified directory, and confidential appointment *requests* reviewed by participating clinics.

Before doing anything else:

1. Open the **existing** KALINGA repository and inspect `pwd`, Git status/branch, manifests/lockfiles, current routes, app/backend/database, tests, `.claude` config and existing documentation. **Preserve existing work.** Never blindly run `npm create vite`, replace `package.json`, delete source trees, change lockfile families, reset Git, drop a database or refactor unrelated code. If the repository is empty only after verification, report that exception and follow an adapted scaffold plan.
2. Read completely and treat as source-of-truth:
   - `docs/KALINGA_Project_Brief.md` — complete product features, stakeholders, workflows, scope and pilot evaluation requirements.
   - `docs/KALINGA_Brand_Guidelines_v1.0.pdf` — brand identity, approved colors, typography, icons, visual direction, UX and release gates.
3. If these exact paths do not exist, search locally for the two user-supplied documents and report the resolved paths. If genuinely inaccessible, **do not invent their content**; stop at a documented source blocker and ask for the documents. Do not claim you reviewed attachments that you could not read.
4. Maintain a **requirements traceability matrix** mapping every source requirement to feature ID, route/component, data model, API, acceptance criterion, test and implementation status. Distinguish `approved`, `documented`, `assumption`, `partner-verification-required`, `medical-review-required`, `legal-review-required`, and `deferred`.
5. Precedence: **explicit final owner decisions above** for implementation choices → original Project Brief for functional scope, medical boundaries, operational intent → approved Brand Guidelines v1.0 for visual design and UX → this prompt for engineering elaboration → existing code as implementation evidence. Preserve both source documents verbatim; record any real conflict rather than inventing a policy. Never represent a provisional partner, medical claim, logo asset, appointment availability, legal consent procedure or clinic policy as verified.
6. Do not build diagnosis, symptom-based diagnostic scoring, lab-result interpretation, clinician replacement, home testing, telemedicine, digital laboratory results or full clinical records into the first version. Do not imply STI testing is guaranteed anonymous. Do not force visitor accounts for education or clinic discovery.
7. The result must be a functional, tested development build with real backend integration where safe and authorized; unverified external integrations and institutional relationships remain explicitly gated. **No fake successes or simulated bookings presented as real.** Seed data must be clearly labeled fictitious and kept out of production.
8. Work in **bounded goal-driven vertical-slice loops**. For each feature: inspect → map acceptance → implement UI, backend, database and tests → execute checks → inspect real rendered UI/API behavior/accessibility/security → repair and re-check → record evidence. Keep a usable integrated development build after each slice. Limit repeated attempts on the same unexplained failure to three before documenting root cause or escalating. Never run an uncontrolled infinite loop, autonomous public deployment or hidden background agent.
9. Do not silently expand scope or launch publicly. Only propose or implement optional capabilities once source scope and user approval allow them. Prioritize a correct, auditable MVP over speculative advanced features.

### 1. Source-grounded product boundaries

**Must deliver:** public no-login information hub; optional privacy-matched pathway; verified clinic discovery and profiles; provider-specific confidential appointment request; manual staff confirmation and alternative guidance; reference-based private status lookup; preparation guidance and opt-in neutral reminders when supported; provider-led result retrieval / treatment / referral navigation; clinic staff dashboard; provincial content/directory oversight; technical administration; privacy-preserving aggregate reporting; accessibility; mobile-first PWA.

**Must not imply:** that a preferred request time is a reserved real-time slot, a pending request is a confirmed appointment, any arbitrary clinic is participating, an unknown confidentiality practice is verified, or a source document constitutes medical/legal/institutional sign-off.

**Jurisdiction:** Philippines, initial pilot Marinduque. Relevant institution names in source documents, including Provincial Health Office (PHO), municipal health offices, DOH MIMAROPA, schools and clinics, describe *proposed* roles; none should be represented as confirmed without explicit agreement.

**Safety exception:** possible HIV exposure within the past **72 hours** must surface clear, prominent urgent professional PEP-assessment guidance, bypassing routine matching/booking friction; do not diagnose, advise treatment eligibility, or invent local emergency contacts. All production medical copy and actual routing require qualified clinical review before deployment. The urgent path must be accessible from home, education, pathway and clinic flow, not buried in a stepper.

### 2. Required engineering architecture and working assumptions

Use the source-recommended stack **but inspect and integrate with the existing repository first**. Prefer consistent working code over gratuitous migrations. Do not introduce a second frontend router, ORM, validation framework, auth provider or styling system without an architecture decision and evidence of need:

- **Frontend:** React + Vite + TypeScript, React Router, accessible component primitives; responsive CSS based on official design tokens. Tailwind CSS is acceptable **only** if it maps all styling to the authorized tokens and does not introduce ad-hoc off-brand defaults. Icons: `lucide-react` only for product UI unless a justified exception is documented.
- **Backend:** Node.js + Express + TypeScript, versioned REST endpoints under `/api/v1`, strict request/response validation using Zod or equivalent, centralized error handlers, structured redacted logs, correlation IDs, protected staff routes and per-clinic authorization.
- **Data:** Supabase PostgreSQL with SQL migrations, defensible relational schema, SQL constraints, indexes, authorization policies and documented retention. Use Supabase Auth for authenticated staff and technical/provincial admins; **do not require Supabase Auth for public browsing or one-time-reference appointment requesting**. Enforce PostgreSQL Row Level Security where relevant, and server-side scope checks regardless of UI behavior. Service-role credentials must never reach browser bundles.
- **PWA:** manifest, installability, responsive viewport behavior, versioned service worker, offline fallback for non-sensitive public material, network-aware states, and safety-conscious cache policy. No caching of appointment submissions, access tokens, clinic staff data, API private responses, notification contents or personal booking fields. No tracking-sensitive data in analytics, URLs, logs or crash reports.
- **Forms/data access:** use accessible label-first forms, clear inline validation, server validation, least required fields and typed API contracts; a form library such as React Hook Form is fine. Use a single documented fetching strategy (e.g. TanStack Query) for authenticated/public server state.
- **Testing:** Vitest + React Testing Library for frontend and shared logic; Supertest or comparable test harness for Express APIs; PostgreSQL integration tests with representative scoped policies; Playwright for end-to-end browser flows; axe-based automated accessibility checks; TypeScript checks, lint, build and audit in CI.
- **Deployment:** environment-based configuration with `.env.example`; separate staging/production with secret management, TLS and reviewed data-residency/security requirements. No production deployment without the release gates in §16.
- **Local-first:** reuse existing local scripts, container recipes, Supabase CLI or development Postgres. If Supabase CLI/Docker is available, wire reproducible local database migrations, policy tests and staff-auth development. If not, provide an equivalent local, isolated backend development procedure and clearly flag missing real RLS/auth integration until it can run. Keep mock-notification transport default and inspectable, and prohibit real sends without an explicit new decision.
- **Localization:** use typed English (`en`) and Filipino (`fil`) message catalogs, stable message IDs, locale switching and explicit untranslated-key reporting. Avoid translating STI medical guidance on the fly or marking unreviewed translated text medically approved. Keep translation state per content revision and locale.

For a greenfield codebase a transparent monorepo is reasonable, **but this is an existing repo**: first document the actual layout and map these logical locations to it. Only restructure when required, migration-safe and justified. Reference layout (not an instruction to replace existing files):

```text
apps/
  web/                 # React/Vite public PWA + role-scoped admin UI
  api/                 # Node/Express API
packages/
  shared/              # TypeScript API contracts, Zod schemas, enums, nonclinical utilities
supabase/
  migrations/          # Schema, constraints, policies, indexes
  seeds/               # Fictitious DEVELOPMENT ONLY fixtures
docs/
  KALINGA_Project_Brief.md
  KALINGA_Brand_Guidelines_v1.0.pdf
  requirements-matrix.md
  architecture.md
  threat-model.md
  data-dictionary.md
  api-contract.md
  design-system.md
  clinic-onboarding-checklist.md
  minor-booking-policy-and-evidence.md
  localization-review-matrix.md
  clinical-review-checklist.md
  launch-gates.md
  decision-log.md
  implementation-status.md
  slice-test-evidence.md
CLAUDE.md               # concise persistent engineering context
.claude/
  skills/
    kalinga-implementation-loop/SKILL.md
    kalinga-design-qa/SKILL.md
    kalinga-privacy-security-qa/SKILL.md
    kalinga-api-contract-qa/SKILL.md
    kalinga-i18n-clinical-qa/SKILL.md
    kalinga-next-slice/SKILL.md
```

Adapt the layout to a pre-existing repo when necessary. Keep source documents untouched. Favor cohesive feature slices over boilerplate generation.

### 3. Locked KALINGA brand/design foundation

Implement the brand guide **exactly as approved**. Do not swap the palette for green, generic hospital blue, a default violet Tailwind theme, or design-template styling. The brand is reassuring, compassionate, trustworthy, empowering, discreet, conversational and never childish.

**Exact CSS tokens:**

```css
:root {
  --color-indigo: #34496D;       /* Deep Indigo: primary brand/headings/nav */
  --color-periwinkle: #586AA7;   /* interactive accents and pathway progress */
  --color-lavender: #E9EDFC;     /* Cloud Lavender supportive panels */
  --color-rose: #D78FA3;         /* Dusty Rose limited compassion accents */
  --color-peach: #F4C9AA;        /* Peach Glow limited warm highlights */
  --color-white: #FAFBFE;        /* Canvas White app background */
  --color-ink: #1D2C43;          /* Slate Ink primary copy */
  --color-muted: #52627B;        /* Muted Blue Gray secondary copy */
  --color-border: #DDE3F0;       /* Soft Border field/divider strokes */
  --space-unit: 8px;
  --radius-button: 12px;
  --radius-card: 16px;
  --radius-feature: 24px;
  --touch-target: 44px;
}
```

- Primary filled CTA: Deep Indigo with white. Use Periwinkle with white *only after contrast is verified for each rendered state*; Slate Ink on pale accents. Add dedicated functional success, warning, error and focus tokens only after contrast checks; never rely on color alone.
- Typography: **Plus Jakarta Sans** for headings (600–700) and **Inter** for body/interface (400–600). Use `font-display: swap` and fallback sans-serif. Approved mobile scale: display 36/44 700, H1 30/38 700, H2 24/32 600, H3 20/28 600, body 16/24 400, supporting 14/21 400, button 16/24 600, metadata 12/18 500 (font-size/line-height in pixels).
- Icons: **Lucide outline**, 24px default, rounded 2px stroke, adjacent labels, keyboard/screen-reader-friendly. Anchors: `BookOpen` Learn, `ShieldCheck` Privacy, `MapPin` Clinics, `CalendarCheck` Appointments, `HeartHandshake` Care, `MessageCircle` Guidance.
- Visuals: restrained, soft geometric **vectors**, paths, gentle curves, destination markers, occasionally inclusive people. No fear-based imagery, anatomical clichés, fake clinical photographs, STI stereotypes, decorative health logos or patient-identifying imagery.
- Layout: 8px rhythm, optional 4px micro-adjustment; 16px mobile gutters; constrained desktop containers and responsive columns; button 12px radius, cards 16px, panels 20–24px, minimum 44×44px controls; subtle shadows only where functional, visible borders, semantic structure.
- Brand mark: **Symbolic K** with a flowing pathway and subtle care/growth imagery. The current PDF's colored logo is **shape reference only, not final approved artwork**. Recolor a legitimately available editable master to Indigo #34496D main K, Periwinkle #586AA7 pathway, Rose/Peach limited accents; do not trace/reconstruct from a low-resolution screenshot if no usable master is available. If unavailable, use a clearly labeled temporary text wordmark and an approved placeholder icon; record a blocked branding gate. Create or request final horizontal, stacked, icon-only, monochrome, reversed, SVG/PNG variants and test 32/48/64px, maskable PWA icon. Never declare a placeholder approved.
- Use the literal title **KALINGA**, no diacritics; full long-form expansion in About/institutional content, not crammed into small navigation or icons. The current tagline **“Care without judgment. Guidance without fear.”** is provisional pending wording approval.

**UX / navigation foundation:** Gentle Guidance: a welcoming mobile hero, prominent `Explore Testing Options` and `Learn About STIs` actions, unobtrusive confidential-information explanation, and always-visible access to urgent care. **Locked mobile bottom bar: Home / Learn / Clinics / Menu**, four text-labeled items in that order with safe-area support. `Menu` opens accessible secondary routes including Privacy, Help/FAQs, About and request status; do not invent a fifth permanent tab. Desktop: top horizontal navigation and split hero. Use a focused centered stepper for privacy matching regardless of desktop width; don't force an overly wide wizard. Design intentional loading, empty, error, offline, success, keyboard-focus, pending and alternative-request states.

**Component system to implement and story/test:** AppShell, Header, BottomNav, MenuDrawer, Button (primary/secondary), IconButton, TextField, Select, Checkbox, RadioGroup, SearchInput, FilterChip, StatusPill with text label, TopicCard, ClinicCard, ServiceBadge, VerificationDisclosure, PrivacyNotice, AccessibleDialog, Stepper, Alert, UrgentCareBanner, EmptyState, LoadingSkeleton, FormErrorSummary, ConsentDisclosure, AppointmentStatusCard, DateTimePreferenceField, FAQAccordion, ResponsiveTable, DashboardStat, Pagination, Toast/LiveRegion. For each: default, hover where appropriate, focus-visible, disabled, loading, selected, validation/empty/error and narrow-mobile responsiveness.

**Logo shape-reference asset:** If the bundled `assets/kalinga_logo_reference.png` exists, inspect it visually as a **shape reference** alongside page 4 of the Brand Guide; it is not evidence of a signed-off SVG master or a license/approval for recolored production use. Keep final icon/wordmark design and maskable asset generation behind the existing brand approval gate; do not claim a finished logo merely because a PNG exists.

**Bilingual experience:** Put an English / Filipino language switch in the accessible menu (and desktop menu). Localize every public navigation label, CTA, consent/privacy explanation, booking reference instruction, status, error, empty state and reminder template; localize date/time/currency sensibly, keep timezone `Asia/Manila`, use correct `html lang`, and avoid changing the exact uppercase brand `KALINGA` or official acronym expansion. Content records have locale, translation version and separate human medical review status; a reviewed English article never automatically approves its Filipino translation. Development demo translations remain prominently unreviewed and demo-labeled.

**Access target:** WCAG 2.2 AA; ordinary text >=4.5:1 and applicable UI/graphic indicators >=3:1. Keyboard navigation; visible focus; labels; ARIA only when native semantics are insufficient; accessible error text/live region; logical headings; screen reader labels; 200% zoom/text resize; reduced motion; small phones and Android browsers; slow/intermittent network. Avoid disclosing sensitive subject matter in document titles or notifications where the user expects discretion, subject to clear navigation and accessibility.

### 4. Complete user-visible functional specification

For each subsection, implement pages/components, real data contracts or explicitly development-only fixtures, validation, API, authorization, accessibility, empty/error/loading states, instrumentation guardrails and tests. Use feature IDs in commits/docs and requirements matrix.

#### F01 — Anonymous landing, public access and navigation
- Anonymous entry: Home, Learn, Clinics, Menu, privacy/help/about without auth prompt, cookie-wall or email capture. Include English/Filipino switch and consistent locale across public pages.
- Home responsive split illustration + copy; primary `Explore Testing Options`, secondary `Learn About STIs`; meaningful `How KALINGA works`, supported privacy claims, clear no-diagnosis disclaimer and immediate urgent PEP-assessment link.
- Four-item mobile fixed bottom nav **Home / Learn / Clinics / Menu**, with safe area and no collision with CTA/keyboard; desktop semantic top nav and accessible expanded menu for Privacy, Help/FAQs, About, language choice and Status Lookup. The Menu must support focus trap/return and Escape dismissal.
- Route-level `not found`, loading, recoverable error, offline fallback and save/install PWA states. Never retain sensitive journey state in public history/query strings.

#### F02 — Medically reviewed STI information hub
- Search/browse topic cards covering STI basics, common STIs, symptoms and asymptomatic infection, transmission, prevention, testing, treatments/follow-up, confidentiality/privacy, myths and FAQs, clinic expectations, when to seek a professional.
- Article structure: descriptive title, concise plain-language summary, expandable deeper information, risk/urgency context only where clinically reviewed, citations/references, medically reviewed status/reviewer, last-reviewed date, recommended next step (clinic/pathway) and accessible reading layout. Every localized version carries its own review and publication status; do not auto-publish Filipino by inheriting English approval.
- Content editorial workflow: draft → under review → medically approved → published → archived; privileged publishing, version history, moderation/revision metadata, stale-review flag. **Never publish placeholder or AI-authored medical content as medically reviewed.** In development, label sample articles `DEMO — NOT CLINICALLY REVIEWED` with banner; publication requires clinician approval.
- Explicitly provide a separate urgent possible recent HIV exposure information path with review-required PEP language. Avoid symptom-checker diagnosis.

#### F03 — Optional three-stage Privacy-Matched Testing Pathway
- Entry: clear optional invitation, not a gate; users can `Skip and browse all clinics` at any time.
- Stage 1: multi-select concerns — being recognized, judgment/stigma, unintended disclosure/confidentiality, cost, distance/transport, unfamiliar booking/testing procedure; include accessible, reversible selection and calm explanations. Do not require entering sexual history, diagnosis, symptoms or identity.
- Stage 2: summarize/review selections, edit/back, optional urgency checkpoint for **possible HIV exposure within previous 72 hours**. Urgency choice should trigger the prominently accessible PEP-assessment guidance immediately without requiring clinic matching or a standard appointment first. Do not persist exposure selection in durable analytics or clinical records.
- Stage 3: show matched clinics with transparent textual reasons based on verified service and privacy facts, plus limitations/unknowns. Show match reason and unmet/unknown concerns. Controls: change priorities, reset and browse all.
- Matching must be a documented **explainable deterministic filter/ranking**, not a black-box diagnostic risk score. Query only documented service and clinic facts; never generate or infer privacy guarantees. Mandatory service/location filters must be separately expressed; `unknown` privacy facts must display as **Not confirmed**, not treated as safe or fabricated.
- Keep selections client-side in memory for the current session only by default. Clear on exit/reset; no cross-session identity tracking or personally identifiable matching logs.

#### F04 — Verified participating clinic directory and discovery
- Search by facility/location, municipality and service; optional controlled filters: available verified HIV/STI service categories, published prices, appointment method, identity/consent requirements, confirmed privacy practices, distance/municipality/travel considerations.
- Results include name, category/services, municipality, contact and published address, known pricing, last verified date and status (provider-confirmed/needs verification); distinguish unknown data with explicit labels.
- Accessible search debounce/reset/clear, meaningful zero matches, no participating-clinics-in-area state, service-unavailable referral suggestions, error/offline state and support for slow connectivity. No fictitious locations or unverified providers as real records.
- No map dependency needed for first delivery; accessible contact/address and optional external map/directions only when grounded in verified coordinates/address.
- Admin moderation of listing publish/unpublish and clinic profile ownership.

#### F05 — Clinic profile and verified privacy disclosures
- Detail page fields: name, public description, municipality/barangay/address, phone/approved contacts, operating hours/time zone, mapped service categories and availability, published fees/free/unknown labels, supported booking channels, published ID/age/consent requirements, preparation/arrival guidance, current verification date/source/scope, clinic-managed update history where safe.
- Show documented confidentiality/youth-friendly practices as explicit `Provider confirmed`, `Not confirmed/Unknown` or equivalent; no “100% confidential/anonymous” blanket claims. Explain exactly what low-disclosure, pseudonym or reference-booking options the specific clinic actually supports.
- Provide access to `Request appointment` **only** for currently participating clinics with a validated booking configuration. Otherwise show accurate alternative contact/referral instructions.
- Protect draft, unpublished and unverified content from public visibility, except a deliberately approved public `Not yet confirmed` indicator for a listed field.

#### F06 — Confidential provider-specific appointment request
- Begin with selected clinic; **before** collecting/sending details, show: whether low-disclosure/pseudonym/reference request supported, what data fields provider requires, why, who receives it, contact method, restrictions/consent, cancellation procedure, and whether appointment is only a request.
- Dynamic, schema-driven form from **approved clinic configuration**; collect only required fields. Never request symptoms, HIV status, test results, sexual history, precise DOB or government ID unless explicitly legally and operationally justified, clinically/legally reviewed and approved. For ages **15–17**, implement the **existing approved policy exactly from its actual owner-supplied procedural artifact** (eligibility, participant information, permitted channels, any approved consent/assent/guardian requirements, evidence to be collected, disclosures, staff review and exceptional outcomes). Search the repo first for this artifact. If none is accessible, build a versioned `minor_booking_policy` adapter, explicit `policy_not_configured` server error, admin configuration UI, and thoroughly tested DEMO policy fixtures; **block real minor appointment submission** until its approved content and specific clinic mapping are entered. Do not equate this evidence gate to a request for a new decision. Public education and clinic browsing always remain accessible.
- Preferred date/time ranges must be labeled **preference only**; no simulated real-time slot/availability. Validate date/time in `Asia/Manila`, min/max advance window, business rules and server constraints; never show “Booked” on initial submit.
- Server: CSRF/auth/session considerations as appropriate, input validation, rate limits, anti-bot controls balanced against accessibility, short-lived idempotency keys, safe server-side reference generation using CSPRNG, persistence transaction, staff notification workflow when configured, audit event without personal detail.
- After submit: show `Pending Clinic Review`, a non-secret random reference **and separately generated high-entropy access secret**, clear instructions for saving each and consequences of losing the secret. Public reference alone must **never** expose private appointment details. Generate ≥256 bits of independent CSPRNG entropy for the secret (`crypto.randomBytes(32)` or equivalent), store only its server-side hash/HMAC verifier with sound secret-key management, use constant-time comparison and uniform lookup failures, throttle enumeration and never place secret values in URLs, analytics, referrers, logs, browser cache, service worker, localStorage or persistent session storage. Prefer POST body for lookup and only in-memory transient form state; shared-device clear/leave controls and no-store HTTP responses. Do not offer insecure email/phone-based secret recovery without a separately approved identity-verification mechanism.
- Do not imply `confirmed` until authorized clinic staff does so. User needs a way to cancel/withdraw where permitted by clinic workflow and technical policy; log and propagate to staff safely.

#### F07 — Request status, clinic review and alternative instructions
- Scope status states to documented options: `pending_review`, `confirmed`, `alternative_required`, `cancelled` (only where configured). Do not introduce statuses with legal/operational consequences unless approved.
- Clinic staff queue: view only requests belonging to authorized clinic(s); filter/search by safe metadata; open minimal record; confirm with actual date/time/visit instruction, propose alternate date or method/instructions, or cancel if clinic supports it; all transitions validated on server with optimistic concurrency/versioning and transaction audit.
- Status lookup for public: verified reference+secret and neutral copy; reveal only safe minimal information after authorization. A clinic-confirmed request must display confirmed date/time and preparation; alternatives require a clear next action. No private data in generic email/SMS reminders.
- Define explicit allowed transition matrix and tests; block arbitrary jumps, race conditions and multiple simultaneous staff confirmations. Do not auto-confirm when staff is offline.

#### F08 — Appointment preparation and neutral reminders
- Once confirmed, provide clinic-specific arrival location, visit time, ID/consent/what-to-bring requirements, what to expect, contact/cancellation methods, and fallback instructions if clinic changes scheduling.
- Reminders **optional and user-controlled**. **Local development defaults to an inspectable mock notification adapter only**; no actual email or SMS is sent, and the UI must say so in demo mode. Provider methods: `none` baseline, email/SMS as separately configured and available. Capture only contact data necessary for chosen method and explicit opt-in. A neutral template must never say STI, HIV, testing, sensitive clinic name or diagnosis by default on a lock screen; allow preview and user preference. Delayed/retried sending must use idempotency, expiry and a short safe delivery log.
- If real notifications are not configured, implement honest `not available in this environment` UI; the mock adapter can show deterministic event records in local dev tooling **only**, not present them as delivered messages. Keep feature flags and a provider interface for later approved transports. Avoid browser push permission prompts on initial anonymous visit.

#### F09 — Results, treatment and follow-up service navigation
- Explain how to **obtain results from the healthcare provider** without storing/displaying clinical results. Offer provider-approved follow-up and additional-testing/treatment/referral directory information, where service exists. Clear disclaimer clinical decisions remain with licensed professionals.
- Links to clinic contacts/referrals may be shown after a confirmed visit or on public educational pages, without recording diagnoses. Never expose or infer user's STI status. Result status, diagnosis, medications, prescriptions, lab attachments and results interpretation are **out of MVP**.
- Where an attendance update exists, staff may flag `attended` as a separate restricted operational observation **only with institutional approval** and privacy justification, not a public-facing inferred diagnosis.

#### F10 — Help, privacy, accessibility and transparency
- Accessible privacy notice and plain-language disclosure explanations; FAQ about anonymous browsing vs confidential requests vs anonymous testing, age/consent procedure caveats, reference-key safety, clinic verification, information changes, how to seek assistance and access emergency/urgent evaluation.
- About page: exact expansion `Knowledge and Access Link for STI Navigation, Guidance, and Assistance`, geographic scope and institutional affiliations only when confirmed; provisional tagline flagged internally.
- Feedback/help contact route without unnecessarily soliciting health details; spam/rate limit protection and staffed contact configuration. Do not publish invented contact details or fictional support service.

#### F11 — English and Filipino localization as a cross-cutting feature
- Global accessible language switch (`English` / `Filipino`), persistence **only** for language preference (not health pathway choices), per-locale translations for Home, Learn, Pathway, Clinics, booking, status, help/privacy, staff-facing messages where relevant, and neutral mock notifications.
- Translation catalogs must be keyed and typechecked; show tests for completeness, parameter parity, escaped interpolation, RTL-independent focus order, text expansion at 320px, date/time formats and screen-reader language annotations. No silent missing-key fallback that hides untranslated medical instructions.
- Store medical article review status **per language/version**; label demo material in both languages. Health-critical warnings and age/consent text require qualified translation review before real launch. If a real public translation is unavailable, show transparent unavailability and the reviewed locale option rather than machine-inventing medical guidance.

#### F12 — Approved minor-booking policy integration (ages 15–17)
- The owner has selected an **already-approved workflow**. The actual authorization/consent SOP is an implementation dependency, **not a policy Claude is allowed to compose**. Inspect repository docs and partner configurations; create a concise mapping of each approved step to screens, required fields, evidence, staff actions, allowed outcomes and retention. Preserve provider-by-provider variability.
- Implement a versioned, clinic-scoped policy engine with `eligible` / `not_eligible` / `policy_missing` / `additional_process_required` or equivalent documented outcomes. Require positive approval evidence ID/version, valid effective date and explicitly configured clinic mapping before real minor booking is enabled. Development demo policies are clearly labeled and rejected by non-demo release configurations.
- Test adult bypass, multiple minor age bands only when policy defines them, missing policy, approved simulated happy path, additional-process path, disabled clinic, unauthorized configuration, disclosure before collection, and age data minimization. Avoid requiring an actual date of birth unless the approved clinic SOP legally/operationally requires it. Never claim one universal Philippine age-of-consent rule.

### 5. Complete administrative and institutional functional specification

#### A01 — Staff identity and permission model
- Roles (proposed, confirm with institutional partners): `clinic_staff`, `clinic_manager`, `provincial_admin`, `content_reviewer`, `technical_admin`. Define the exact matrix in docs, protect every operation server-side and via appropriate RLS. Staff only sees clinic(s) to which they belong. Technical admin can operate infrastructure but should not automatically get patient booking plaintext access. Follow principle of least privilege and separation of duty.
- Supabase Auth for staff, securely managed invitations/disable/reactivation, role/org claims validated server-side, session expiry, secure reset and MFA where feasible. No role assignment from client parameters. Include inactive/suspended states and audit trails.

#### A02 — Clinic listing management
- Clinic manager edit drafts for name, contacts, address/municipality/barangay, operating hours, categories/services, prices/cost unknown, supported booking channels, minimum required request fields, youth/confidentiality procedures, referral options, age/ID/consent requirements, evidence and last-confirmed date.
- Provincial administrator verifies/publishes/unpublishes and documents verification source/date/scope. Any changed critical claim returns to pending verification. Keep public-facing `unknown` where not confirmed; build stale-verification review queue.
- Include safe admin preview, validation, change tracking and optimistic concurrency.

#### A03 — Appointment operations
- Clinic-scoped inbox, status counts, list/detail, restricted request-field visibility, confirm/alternative/cancel transitions, scheduling time zone, optional attendance reporting, contact handling according to clinic policy and race-condition protections. No automatic clinic booking engine or external-calendar integration in first release.

#### A04 — Educational content/editorial workflow
- Author/editor roles and medical review workflow, references, review dates, revision history, publication status, content freshness and urgent notice versioning; medical reviewers must be authorized human professionals, not an AI self-certification. Only approved content may be public in a real pilot.

#### A05 — Provincial directory oversight and aggregate reporting
- Province-wide directory review queue, completeness/freshness indicators, aggregate counts of page/content access, clinic search, request submission, clinic confirmations, reported attendance and referrals/follow-up information access **only where sufficiently reliable and privacy-preserving**.
- Define denominators precisely: e.g., request rate from eligible clinic-search sessions, confirmation rate from submitted requests, attendance rate from confirmed appointments with provider-reported outcome. Avoid false causal claims about increased testing. Define minimum suppression threshold for small cells, no drilldown that can reidentify sensitive young users and no raw personal identifiers in export. Provide CSV only for approved aggregate datasets.
- Privacy-confidence and usability evaluation can use voluntarily submitted, anonymous survey items; do not bind public survey results to clinical booking identities.

#### A06 — Technical administration and operations
- Configuration/feature flags, partner onboarding, user roles, audit events, backup/restore documented drill, monitoring, rate-limit metrics, incident response plan, retention jobs, data export/delete request process subject to policy, secrets rotation and release-gate checklist. No unrestricted read-all panel by default.

#### A07 — Pilot evaluation and sustainability requirements
- Instrument **only privacy-preserving** information engagement, progression from information to clinic profile, clinic-search-to-request conversion, request-to-confirmation, confirmation-to-reported-attendance, optional survey-based privacy confidence/usability and referral/follow-up information engagement; choose explicit event definitions and no cross-service user profile.
- Before controlled pilot, document baseline, target definitions, sampling/consent, retention, allowable report granularity, missing-data handling, monitoring and evaluation method. Explain that increased real-world testing uptake is **to be evaluated**, not a guaranteed result.
- Preserve the project brief's **B2B2C** sustainability model as a business consideration: **essential STI information and clinic navigation remain free to students and the public**. Potential institution-funded directory management, aggregate dashboards, outreach/campaign tools, grants and sponsorships are **future commercial options subject to partner validation**, not invented subscriptions, payment processing or paywalls in MVP.

### 6. Public and admin route map (proposed; adapt existing routes)

```text
/                            Home
/learn                       STI information topic hub
/learn/:slug                 Medically reviewed article (drafts unpublished)
/testing-options             Privacy-Matched Pathway (three optional stages)
/clinics                     Search + filtering + matching result option
/clinics/:slug               Provider profile
/clinics/:slug/request       Transparent booking requirements + request form
/request/submitted           Pending notice (render from protected ephemeral/lookup flow)
/request/status              Reference + secret lookup
/appointment/:safeContext    Authenticated-by-secret appointment detail if securely implemented
/care                        Result retrieval, referral and follow-up navigation
/privacy                     Privacy notice and disclosure explanations
/help                        FAQ and support
/about                       KALINGA expansion and product scope
/urgent-care                 Urgent assessment/PEP guidance (review-gated)
/staff/login                 Staff authentication
/staff                       Clinic operations dashboard
/staff/appointments          Clinic-scoped queue
/staff/appointments/:id      Restricted detail and actions
/staff/clinic                Clinic profile/edit drafts
/admin                       Provincial overview
/admin/clinics               Verify/manage participating listings
/admin/content               Editorial workflow
/admin/reports               Aggregate metrics
/admin/access                Least-privilege staff administration
/admin/audit                 Restricted redacted events
```

Routes must have role guards, safe redirect logic, error boundaries, lazy-loading where appropriate and nonrevealing metadata. Handle deep links and PWA refreshes correctly. Secure status links must not be stored as browser persistent state or shared in analytics.

### 7. PostgreSQL schema, security and lifecycle

Design SQL migrations (with constraints, foreign keys, unique indexes, timestamp/time zone discipline and RLS) for at least:

| Entity | Essential fields / considerations |
|---|---|
| `organizations` | ID, organization type, name, partner status, timestamps; never infer agreements |
| `staff_memberships` | auth user ID, organization/clinic ID, role, status, invitation/audit references; multiple clinics only if authorized |
| `clinics` | ID, slug, owning organization, public address/contact, municipality, status, last verified source/date, editorial/version columns |
| `clinic_hours` | day/time windows, timezone `Asia/Manila`, closure/exception support if provider-approved |
| `clinic_services` | clinic ID, service category, available/unknown, optional fee/currency/notes, published status and verification evidence |
| `clinic_privacy_practices` | practice key, `confirmed`/`unknown`/`not_supported`, verification source/date, youth-friendliness claims backed by evidence |
| `clinic_booking_config` | enabled, method, dynamic required-field schema, low-disclosure option, provider-specific legal/age/ID consent disclosure, preferred time rules |
| `minor_booking_policies` | versioned provider-specific eligibility/consent procedure reference, approval evidence/source, reviewed/effective dates, enabled flag, guarded demo status; no assumed universal legal requirements |
| `minor_booking_policy_steps` | if necessary: ordered approved steps, required disclosure/field definitions, staff review dependencies, retention classification and localized copy review state |
| `clinic_referrals` | originating clinic, available referred service/provider, noninvented contact/instructions and verification info |
| `articles` | slug, topic, summary/body, references, version, review workflow, reviewer ID, reviewed date, publish status |
| `article_localizations` | article ID, locale `en` or `fil`, version, localized content, translation provenance, distinct medical reviewer/approved date, publication status |
| `appointment_requests` | internal UUID, clinic ID, random public reference, hash of access secret, encrypted/minimized provider-required payload, preference window, status, version, retention expiry, created/updated timestamps |
| `appointment_status_events` | request ID, previous/current status, authorized actor ID, neutral structured reason codes, timestamps, minimum necessary audit metadata |
| `notification_preferences` | request ID, explicit opt-in, allowed channel, minimal encrypted destination, consent time, disabled time |
| `notification_jobs` | template key, scheduled time, send status, retries, expiry; no diagnostic/message-body data in generic logs |
| `audit_events` | actor/role, action, entity ID, request/correlation ID, timestamp, redacted metadata and retention policy |
| `aggregate_metrics_daily` | date, coarse feature/action categories, aggregated numeric counters, suppression controls; no sensitive per-visitor profile |
| `feature_flags` | low-disclosure support, reminder channels, demo mode, real minor booking approval evidence, pilot/release controls, urgent copy reviewed flag and other optional integrations |

You may separate tables to improve normalization and authorization. **Do not include test results, diagnoses or full clinical records.** Never put an access secret in plaintext database/logs. Consider pgcrypto/application encryption choices and key ownership; secrets/KMS not stored in app repo; backups encrypted; every sensitive field justified in data dictionary. Implement deletion/retention as configurable approved schedules; do not invent a universal retention period. Document data flow and threat model (lost/shared device, guessed references, booking enumeration, broad staff query, unverified clinic fields, minor booking, browser history, screen notifications, CSRF/XSS/IDOR, external map referrers, analytics re-identification and supply chain).

### 8. REST API contract with examples and exact security expectations

Implement typed endpoints, documented with OpenAPI 3.1 and versioned responses. These are suggested endpoint shapes, not externally approved contracts; adjust naming coherently while preserving all behaviors:

```text
PUBLIC READ
GET    /api/v1/public/config
GET    /api/v1/articles?topic=&q=&page=
GET    /api/v1/articles/:slug
GET    /api/v1/clinics?q=&municipality=&service=&cost=&privacy=&page=
GET    /api/v1/clinics/:slug
GET    /api/v1/clinics/:slug/booking-requirements?ageGroup=
GET    /api/v1/referrals?service=&municipality=
POST   /api/v1/clinic-matches          (stateless, validated concern keys)
GET    /api/v1/public/locales           (English/Filipino availability metadata)

CONFIDENTIAL REQUEST ACCESS
POST   /api/v1/appointment-requests     (provider-specific validated minimal fields)
POST   /api/v1/appointment-access/lookup  (reference + independent secret)
POST   /api/v1/appointment-access/cancel  (scoped verified secret + policy)
POST   /api/v1/notification-preferences   (scoped verified secret, explicit opt-in)
POST   /api/v1/appointment-access/withdraw (only if clinic procedure supports it; alias/cancel if appropriate)

AUTHENTICATED STAFF
GET    /api/v1/staff/me
GET    /api/v1/staff/clinics
GET    /api/v1/staff/appointments
GET    /api/v1/staff/appointments/:id
PATCH  /api/v1/staff/appointments/:id/status
GET    /api/v1/staff/clinic/:id
PATCH  /api/v1/staff/clinic/:id/draft
GET    /api/v1/staff/clinic/:id/minor-booking-policy (clinic-scoped, approval evidence redacted as necessary)

AUTHORIZED PROVINCIAL / EDITORIAL ADMIN
GET    /api/v1/admin/clinics/review-queue
GET    /api/v1/admin/minor-booking-policies
POST   /api/v1/admin/minor-booking-policies (requires verified approved artifact, role gate)
POST   /api/v1/admin/clinics/:id/verify
POST   /api/v1/admin/clinics/:id/publish
POST   /api/v1/admin/clinics/:id/unpublish
GET    /api/v1/admin/articles
POST   /api/v1/admin/articles
PATCH  /api/v1/admin/articles/:id
POST   /api/v1/admin/articles/:id/submit-review
POST   /api/v1/admin/articles/:id/approve-review
POST   /api/v1/admin/articles/:id/publish
GET    /api/v1/admin/reports/aggregate
GET    /api/v1/admin/audit
```

API conventions:
- Input/output schemas, pagination and sort bounds; dates ISO 8601 and appointment localization to `Asia/Manila`; narrow allowlisted filters, server-side output filtering by role.
- `POST /clinic-matches` accepts only non-identifying concerns/service filters, returns reason codes, service facts, unknowns and match explanations. No symptoms or health risk scores.
- Server validates minor eligibility and **approval evidence/version** atomically before accepting a real under-18 request; no client-only bypass. Demo-mode policy works solely on development fixtures.
- Public appointment creation response **never** claims confirmation. Use `201` with a neutral pending state and cryptographic lookup material shown only as needed; do not expose secret in `GET` paths or third-party trackers.
- Errors use safe stable codes and localized/plain-language copy; return generic messages for reference lookup failure to reduce enumeration; implement `429` with sensible retry guidance. Do not leak server errors, SQL, tokens or booking fields.
- Require authorization + org scope for all staff actions, test IDOR by swapping IDs. Enforce DB RLS as defense in depth. Never rely on hidden frontend routes as access control.
- Appointment status patch requires expected version/ETag or equivalent optimistic lock, valid transition, actor authorization, and atomic audit event.
- Set standard security headers, CORS least privilege, strong CSP compatible with web fonts, body limits, parameterized queries, request rate limits, TLS-only secrets, no-store private responses and logging redaction.

**Concrete public booking protocol:** `POST /appointment-requests` includes provider ID, approved required fields, preferred local schedule (`Asia/Manila`), optional age group/policy acknowledgments, a single-use idempotency key and optional notification preference. Response returns `status=pending_review`, a public reference, and an independently generated secret **once** in a `Cache-Control: no-store` response. The client renders the reference and secret with a hide/reveal affordance and a clear shared-device warning; neither goes into URLs. Later `POST /appointment-access/lookup` accepts `{ reference, secret }` and returns only provider-approved minimal status/visit details after verification. Staff confirmation is an explicit separate authorized transition. Test all error paths including duplicate submission, offline retry, lost secret, concurrency and unauthorized cross-clinic status updates.

**Local mock delivery protocol:** implement a `NotificationTransport` interface with `DisabledTransport` and `MockTransport` in development. Persist only minimal, expiry-bound demo events, assert exact neutral content and opted-in recipients in tests, expose simulated send outcomes only in protected local tooling; never send real traffic, never enable production by changing frontend flags, and make negative/failure paths deterministic.

### 9. Matching algorithm (explainable, verifiable, nonclinical)

1. Filter by confirmed participating/public clinic and requested service / municipality when supplied. Do not suggest unavailable services as available.
2. Map optional concern keys to **explicitly documented provider attributes** (confidentiality explanation, supported reduced-disclosure booking, youth-friendly practice documentation, fee disclosure, location/travel, explained procedure).
3. Rank with deterministic, transparent priority; do **not** present scores as medical advice or guarantee matching suitability. Preserve `unknown` distinctly and display `We could not verify this detail` next to it.
4. Render `Why this clinic may fit` with verified positive facts, `What remains unknown` and useful next steps, last-verification date and full profile link. Provide no-result fallback to wider directory/referral options.
5. Test selected vs skipped concerns, no published clinics, stale/unverified fields, unavailable service, overlapping concerns, deterministic order and urgency interruption.

### 10. PWA foundation, offline and privacy-sensitive browser behavior

- Exact app name, manifest `name: "KALINGA"`, short name `KALINGA`, description appropriate for discreteness, theme matching Indigo and a maskable icon **only once artwork approved**. Install prompts optional and unobtrusive.
- Cache only safe, public, versioned static assets and specifically approved public content; private `/staff`, `/admin`, booking API, secrets and personal state use `Cache-Control: no-store` and explicit service-worker bypass. Purge old caches after updates and on logout. Avoid third-party analytics SDKs with uncontrolled collection.
- Responsive mobile-first sizes: test 320, 360, 390, 768, 1024, 1440px, landscape and 200% text resize. Define actual breakpoints in token docs rather than silently adopting arbitrary UI template constraints.
- Network errors/low connectivity: visible progress, retry and timeout; no false booking submission if network fails. Support safe public offline fallback without stating stale clinic data is currently verified.
- Test on Android Chrome, Firefox desktop/mobile where available, Safari WebKit/mobile viewport simulation; verify keyboard, reduced motion, screen readers and content overflow.

### 11. Privacy and safety review checklist as executable acceptance conditions

**Must pass:**
- Education and directory browsing never trigger auth.
- Under-18 booking **uses the approved procedural artifact when available** with clinic-scoped policy version/approval evidence enforced server-side; without the artifact, real requests fail closed, though development fixture workflows remain testable. Never improvise consent requirements or assert one universal legal rule.
- Urgent possible HIV exposure in <=72h interrupts routine flow and surfaces approved professional-assessment guidance (copy must remain review-gated before release).
- Every public statement about a clinic's confidentiality, cost, services, youth-friendliness, ID/consent requirement and booking method is tied to source + verified date or visibly `unknown`.
- Forms enumerate fields disclosed to provider **before** submit; do not ask more than provider config permits.
- No anonymous-user analytics/event includes selections about exposure, STI status, booking secret, location precise enough to identify, name/contact, session path correlated to health interest or individual booking record.
- A public booking reference **alone cannot retrieve** appointment information; invalid reference/secret lookup is throttled.
- Only authorized clinic staff can view and edit assigned clinics' bookings; `technical_admin` isn't a universal clinical-record reader.
- No diagnosis or results storage anywhere, including dev fixtures, logs, telemetry and notification payloads.
- A request is shown as `pending_review` until confirmed by an authorized clinic user. Race conditions and unauthorized status transitions fail closed.
- Neutral notification templates display no unneeded STI or HIV content. Explicit opt-in, no initial prompt, and provider absence handled truthfully.
- No unreviewed article or urgent text gets production published. No speculative clinic/partner relationships.
- Encryption in transit; justified at-rest protection; retention documented/configurable; tested restore/recovery procedures; audit events never include booking payload.
- Accessibility coverage for actual interactive components and end-to-end flows.

### 12. Seed data, onboarding and environment rules

- For **development only**, add minimal fake `DEMO CLINIC A`, `DEMO CLINIC B` etc. with unmistakable demo labels and safe fake contacts, sample public text prominently marked unreviewed and intentionally varied privacy verification flags. Do **not** use actual Marinduque clinic names, fees, procedures or addresses unless approved verified sources are supplied.
- Production database starts with **no presumed participating clinics**. Admin can onboard only after documented verification and agreement. Include a clinic onboarding checklist covering contacts, service categories, hours, fees, privacy protocols, booking workflow, under-18 procedures, confidentiality statements, update/verification ownership and data processing arrangements.
- Document `.env.example`, `README.md`, existing-package-manager-compatible setup/migrate/seed/test/start scripts, sample staff creation process and explicit **server-enforced** flags (`DEMO_MODE=true` locally, `CLINICAL_CONTENT_APPROVED=false`, `ALLOW_REAL_BOOKING_REQUESTS=false`, `REAL_MINOR_BOOKING_ENABLED=false`, `NOTIFICATION_TRANSPORT=mock`, `REAL_NOTIFICATIONS_ENABLED=false` etc.). Use only keys genuinely supported by implementation. Include a startup validator that refuses unsafe flag combinations in staging/production; browser localStorage changes cannot bypass controls.
- Local `.env` secrets remain gitignored. Use fake, provider-safe emails/phone placeholders for mock scenarios (example.invalid domains; do not send). Use local dev-only reference secrets and a safe demo reset path. Do not leak any real connection strings or access keys in outputs.
- Restrict development-only mock providers and fake appointments from production deployments. CI check should fail if demo flags enabled in release configuration.

### 13. Claude Code skills and bounded verification-loop engineering

Use the companion `claude_templates/skills/` directory if supplied, but **merge into the existing repository's `.claude/skills/` rather than overwriting**. Current Claude Code supports project skills at `.claude/skills/<name>/SKILL.md` with YAML frontmatter. Keep `CLAUDE.md` short (repository facts, safe commands, source paths, red lines); keep repeatable procedures in small skills and detailed specs in `docs/`. Avoid introducing hooks or third-party plugins without checking the installed Claude Code version and repository security rules.

Required skill interfaces and responsibilities:

- **`/kalinga-next-slice <FEATURE-ID>` — manual invocation:** Resolve source requirements/acceptance, inspect the existing repo, implement one vertical UI→API→database→tests slice, run the appropriate tests, record evidence, mark status and give a bounded next-action report. The feature must be an **integrated, running** behavior, not a visual mock screen with unrelated fake API stubs. Use `disable-model-invocation: true` so the owner controls initiation of large edits.
- **`kalinga-implementation-loop` — normal task procedure:** inspect → scope → implement minimal change → typecheck/unit/API/DB/E2E/visual/privacy checks → repair → re-run → evidence. Three unexplained retry ceiling. Must not weaken tests to make them pass.
- **`kalinga-design-qa` — brand/accessibility reviewer:** verify exact Palette B, font scale and weights, icon conventions, component radii, 4-tab mobile nav, bilingual label expansion, focus, contrast, touch sizes, responsive screenshots (or record missing browser tooling), and provisional logo gate.
- **`kalinga-privacy-security-qa` — safe-data reviewer:** verify secure reference+secret, staff RBAC/RLS/IDOR, clinic fact provenance, approved/minor policy evidence, disclosure, mock notification neutrality, analytics/log/cache exclusion, signed-off release flags and booking-state truthfulness.
- **`kalinga-api-contract-qa` — typed backend reviewer:** compare OpenAPI and shared types/Zod validators, status errors, SQL migrations/RLS and indexes, timezone, idempotency, optimistic locking and API negative tests.
- **`kalinga-i18n-clinical-qa` — translation/review gate:** ensure `en`/`fil` parity, missing translations, separately approved medical content and no invented clinical guidance, including reviewed urgent PEP content.

Skills may be invoked automatically where appropriate except the owner-controlled `next-slice`. Avoid indiscriminate parallel subagents; delegate read-only audits or disjoint test review when useful, never simultaneous conflicting writes to the same files/DB. Do **not** trigger a built-in `/loop` to run unattended edits or deploys. A “loop” here is a deterministic, bounded inner verification process, not a scheduler.

**Standard loop algorithm for each feature:**

```text
0. LOAD: feature ID + original brief clause + brand page + owner decision + actual repository state.
1. SPEC: one vertical slice, UI states, data model/API, permissions, acceptance tests and safety gates.
2. BASELINE: run existing health/typecheck/tests; record existing failures; don't blame new code for old failures.
3. IMPLEMENT: smallest integration that demonstrates real local UI→API→DB behavior on clearly demo data.
4. VERIFY: typecheck, lint, unit, API, migration/RLS, localized content, browser E2E and privacy/accessibility checks appropriate to slice.
5. REPAIR: on failure diagnose, change root cause, re-run; don't silence tests, change scope or mock a forbidden real workflow.
6. CHECKPOINT: save files, update traceability/status/test evidence and document factual unresolved external gates.
7. STOP: pass documented acceptance, reach a true evidence blocker or hit bounded retry; do not spin indefinitely.
```

For continuation across multiple Claude Code contexts, maintain `docs/implementation-status.md`, `docs/slice-test-evidence.md` and the requirements matrix with actual commands/results; don't claim completed work based on earlier chat assertions alone. Never run destructive Git/database operations without approval.

### 14. Sequenced **full-stack vertical slices** and acceptance gates

**S0 — Audit + mapping, no speculative repo rewrite.** Discover existing KALINGA structure, current tests/commands/DB, read both source documents, identify already implemented capabilities, write concise architecture/threat model/traceability/decision log, baseline build and dependency gaps. Do not treat this audit as a standalone frontend scaffold milestone.

**S1 — First running public slice: brand-accurate Home + locale + API configuration + PWA shell.** Integrate Palette B/tokens, Plus Jakarta Sans and Inter, Lucide outline icons, Symbolic K placeholder policy, welcoming Gentle Guidance hero, **Home/Learn/Clinics/Menu** mobile bottom bar, desktop top navigation, English/Filipino switch, `GET /api/v1/public/config` or existing equivalent, safe demo environment state, manifest and offline-static shell, accessibility/visual tests, backend API smoke tests, actual locally running browser preview. This slice establishes reusable UI foundations **and** a real backend contract concurrently; do not build an isolated mockup.

**S2 — STI Information Hub vertical slice.** Article storage/migration/localizations and statuses, publish-safety rules, public API and UI topic cards/articles, English/Filipino reviewed-state separation, admin draft/review skeleton with restricted routes, demo labels, urgency entry, article-search and security/E2E tests.

**S3 — Privacy-Matched Testing Pathway vertical slice.** Optional 3-step concerns, non-identifying request contract, stateless explainable match service, verified/unknown flags, urgent ≤72-hour PEP shortcut that bypasses routine flow, skip/back/reset, proper demo-data sources, bilingual UI, unit/API/E2E tests. It may initially return an honest empty directory, then integrate clinic fixtures as S4 lands; record interface tests now.

**S4 — Directory and clinic profile vertical slice.** PostgreSQL clinic/service/privacy/pricing/verification tables + RLS/publishing guard, fake demo clinics, search/filters/verification freshness, public directory/profile APIs, clinic-specific booking configuration endpoint, province/clinic-scoped draft UI, bilingual frontend and accessibility/E2E tests. Never publish demo clinics as verified real providers.

**S5 — Booking request and private lookup vertical slice.** Minimal clinic-specific disclosure, dynamically validated form, anonymous reference+separate cryptographic secret, pending state, POST-only lookup, secret hash & throttling, no-store and cache bypass, idempotency/replay protection, verified-age policy adapter with DEMO fixtures, local PostgreSQL migrations and full API/negative/E2E tests. Real minor submissions remain disabled unless approved SOP evidence is integrated.

**S6 — Staff manual booking decision and preparation vertical slice.** Authenticated staff, clinic memberships, least privilege/RLS and cross-clinic negative cases, request queue/detail, pending→confirmed/alternative/cancelled guarded transitions and concurrency, clinic-supplied visit time/requirements, public status lookup, audit redaction, local end-to-end role flows and bilingual neutral copy.

**S7 — Content/clinic governance and technical admin vertical slice.** Partner verification evidence, published/unknown status and changes, editorial medically reviewed lifecycle per locale, staff invites/roles, audit and safe configuration, minor SOP clinic mapping and approvals UI, retention operations, admin E2E tests. Keep real-world gates off.

**S8 — Results/care navigation, optional neutral reminder mock and reporting vertical slice.** Provider-led results retrieval (no lab result/diagnosis storage), treatment/referral information, opt-in choice, mock-only delivery adapter with failure cases, privacy-preserving engagement/requests/confirmation/attendance metrics and small-cell suppression, anonymous surveys where consented, bilingual content and tests. Ensure attendance reporting only if partner-approved.

**S9 — Controlled pilot-readiness audit, not auto-launch.** Verify performance/slow network/Android, WCAG 2.2 AA, legal/privacy/clinical/partner approval evidence, actual minor procedure mapping, system backups/restore, auth/RLS, phishing/enumeration, translation reviews, hard demo-disable protections, neutral notification tests, threat model and operational SOP. Output blockers. **No claim of clinical, partner, legal, production or pilot readiness** without independent evidence.

**Vertical-slice acceptance:** each slice changes integrated UI/API/data only as needed, runs tests available in the repo, keeps app bootable and preserves unrelated features. At each checkpoint show a reproducible local demo path and actual verification evidence, not a generic "implemented" statement. External dependencies never justify fabricating clinic facts; build safe fixtures/adapters and mark the gate instead. Start **S0 then S1** immediately; once S1 passes, continue to S2 in bounded sessions with explicit check-ins, rather than waiting for a separate frontend approval milestone.

### 15. Required test matrix / measurable definition of done

Create automated suites covering:

1. Public page access, nav semantics, keyboard order and correct CTAs at all breakpoints.
2. Exact palette/layout/font declarations, 200% zoom, minimum 44px targets, contrast, reduced motion and icon labeling.
3. Article topic/search/empty states and prevention of unreviewed publishing.
4. Optional pathway: select concerns, review/edit, skip, verified-fact match, unknown-fact display, reset, no identity persistence, urgent <=72h interruption.
5. Directory search/filter combinations, municipality/fee/privacy claims, stale data, only published participating clinics, profile verified dates, explicit unknowns.
6. Dynamic booking form field disclosure, server validation, date/time zone and request-not-confirmed status, duplicate/replay prevention and no-store responses.
7. Reference+secret private lookup, guessed/invalid references, lockout/rate limits, shared-device/history/cache safety.
8. Staff auth and clinic scope: unauthorized 401/403, IDOR negative cases, RLS query boundaries, permitted and forbidden transitions, confirmation concurrency.
9. Neutral reminders opt-in/out and no identifiable sensitive lock-screen wording, disabled provider and failed delivery.
10. Referral/follow-up pages never store results or diagnoses.
11. Aggregate metrics denominators/suppression and redacted exports; record cannot be reidentified via dashboard drilldown.
12. PWA install/update/public-only cache, offline public message, failed booking retry and stale service warning.
13. Privacy/security regression scans, dependency vulnerability check and absence of real secrets/medical data in source/log fixtures.
14. Full role-specific E2E flows: anonymous visitor → Learn → Pathway → Clinic → Request pending → staff confirm → status lookup → visit prep → care guidance; plus urgent flow, nonparticipating clinic, approved/demo under-18 policy with evidence guard, and disabled real-minor path without evidence.
15. EN/FIL navigation, forms/errors/privacy disclosures, article version/reviewer per locale, screen reader `lang`, missing keys and expanded Filipino text at narrow breakpoints.
16. Local-only mock notification adapter: opted-out, opted-in, disabled, failed, retry, idempotency, neutrality and assurance no real outbound transport is used.
17. Existing repository preservation: no unexplained deleted files/overwritten configs, preexisting tests distinguished from regressions; full-stack integration smoke test per vertical slice.

Report test commands and actual pass/fail summaries. Never claim a test was run if no tool executed it. If there is no browser environment, document manual QA steps and remaining evidence gap without mislabeling it passed.

### 16. Hard production/pilot release gates

Create a blocking launch checklist. All must be evidenced, not inferred:

- Final official Symbolic K logo artwork reviewed/recolored, SVG/app icons QA'd.
- Confirmed healthcare institutional agreements and an owner for each clinic listing.
- Actual services, clinic contact/location, fees, hours, confidentiality, youth-friendly claims and booking rules verified with documented date/source.
- Qualified clinical review of STI articles, urgent PEP copy and referral guidance.
- Legal/privacy review including Philippine Data Privacy Act, approved notices, processor agreements, retention, incident response, the **actual approved minor-booking SOP and clinic mappings**, and confidential-service rules.
- Security audit, least privilege and RLS, secure appointment access, encrypted/controlled storage, backups/restore and neutral notifications.
- WCAG 2.2 AA accessibility audit, usability sessions with representative 15–24-year-olds, small phone and slow network verification.
- Pilot operating procedure: staffing, request turnaround expectations, cancellation/alternative workflow, attendance reporting method, aggregate metrics definitions, escalation and downtime.
- No demo fixtures, development identities, unverified clinical information, untranslated/unreviewed health copy, mock sends represented as real, or unchecked demo flags in production.

### 17. Delivery style, reporting contract and first action for the **existing repository**

**When invoked, start implementing safely rather than merely producing plans.**

1. Identify the actual repository root/branch/dirty worktree, package manager, frontend/backend, database, tests and current features. Avoid altering preexisting unrelated work. Record existing failures before changing code.
2. Resolve the project brief and brand PDF from `docs/` (or another verified local path). If either genuinely missing, preserve all known requirements in this prompt, report missing source, and block source-dependent assertions rather than fabricating contents.
3. Inspect the owner's approved minor-booking procedure **if present**; record its actual source and configured clinic process. If absent, proceed with technical scaffolding and demo-only tests; create one clearly labeled `APPROVED_SOP_ARTIFACT_MISSING` gate for real age-15–17 booking rather than reopening the owner's choice.
4. Create/update `docs/requirements-matrix.md`, `docs/decision-log.md`, `docs/implementation-status.md`, `docs/slice-test-evidence.md` and a minimal technical plan. Record these eight decisions as resolved. Update existing docs instead of duplicating conflicting versions.
5. Integrate necessary bounded skills with proper `SKILL.md` YAML frontmatter, or merge supplied templates; keep existing `CLAUDE.md` instructions intact and append concise KALINGA invariants only as appropriate.
6. Complete S0 repo baseline, then **implement S1 as a real full-stack feature slice**: approved four-item navigation, bilingual Home, design tokens, functional API/environment display, PWA shell and local development start path. Run actual available checks including browser preview if possible. Do not stop after writing a plan when safe implementation is possible.
7. When S1 passes, report and carry the same vertical pattern forward slice by slice, keeping the repo runnable. Provide a brief checkpoint after each slice with `Completed`, `Files changed`, `Actual commands/check results`, `Demonstrated user/backend path`, `Privacy/accessibility/i18n`, `Unresolved external evidence`, `Next slice`. No invented test results or fake success badges.
8. Do not change external/shared/prod infrastructure, activate real bookings for minors, send real notifications, publish unreviewed medical content, represent fictitious clinics as verified, push to public remotes, or deploy without explicit approval.

### 18. Decision register — **resolved**, not an eight-question survey

The eight owner decisions in the first table are final. Their remaining **evidence dependencies** are narrower and should be requested only at the relevant activation gate: (i) approved SOP details for ages 15–17, (ii) actual medical reviewers/translated content, (iii) clinic agreements and verified service facts, (iv) production SVG/logo signoff and deployment/privacy approvals, (v) notification provider credentials only if the owner later opts in to real notifications. Until then, keep demonstrable **local DEMO** flows and mock notification delivery, with no real data claims.

**End-state target:** an integrated, polished, accessible English/Filipino KALINGA PWA with truthful appointment statuses, safe local demo development, independently verified brand tokens and per-feature UI/API/database tests, plus explicit, non-bypassed launch gates.

## THE PROMPT — END

---

## How to review this prompt with the project owner

This is the **finalized implementation directive with all eight owner decisions incorporated**, not a claim that operational artifacts, health content, clinics, consent SOP documents or external infrastructure are available. The source-grounded requirements were taken from the uploaded project brief (sections 1–16, especially 7–10, 12 and 14) and KALINGA brand guideline v1.0 (pages 2–12). The user-confirmed decisions supersede the earlier draft where applicable. Architecture elaborations such as TypeScript, API path names, tables, test tools, reference+secret lookup and RLS enforcement detail are **engineering recommendations**, not facts stated verbatim in the project brief. All external/clinical/legal decisions are intentionally gated.

Claude Code support for modular `.claude/skills/<name>/SKILL.md` and verification loops is described in Anthropic's Claude Code guidance:
- https://claude.com/resources/articles/steering-claude-code-skills-hooks-rules-subagents-and-more
- https://claude.com/resources/articles/getting-started-with-loops
- https://claude.com/blog/building-verification-loops-in-claude-code-with-skills
