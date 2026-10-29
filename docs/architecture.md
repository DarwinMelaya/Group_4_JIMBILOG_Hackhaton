# KALINGA architecture (initial, S0)

Status: planned, nothing implemented. Derived from master prompt sections 2, 7, 8, 10 and the owner decisions. Items are engineering recommendations, not facts from the brief.

## 1. Stack and layout (decided; see decision-log D-001 to D-006)
```text
package.json                 npm workspaces root; scripts: lint, typecheck, test, build, verify
apps/web                     React + Vite + TypeScript, React Router, TanStack Query, lucide-react, PWA shell
apps/api                     Express + TypeScript + Zod, /api/v1, correlation IDs, redacted logs
packages/shared              API contracts, Zod schemas, enums (status, locale, roles), non-clinical utils
supabase/migrations          Ordered *.sql migrations (source of truth for schema + RLS)
supabase/seeds               DEMO-only fixtures (never loaded outside DEMO_MODE)
docs/                        Source docs preserved verbatim + generated docs
```
Existing files (`docs/*`, `.claude/*`, `LOOP.md`, `test.ts`, scripts) are preserved. `test.ts` is an empty tracked file and is left alone.

## 2. Runtime view
```text
Browser (PWA)  --HTTPS-->  Express API (/api/v1)  --SQL-->  PostgreSQL (PGlite locally)
  public pages              validation (Zod)                  tables + constraints + RLS
  service worker            rate limit, no-store              migrations from supabase/migrations
  (public static only)      staff session / authz             audit_events, status events
                            NotificationTransport (Disabled|Mock)
```
- The browser never holds DB credentials. There is no service-role key in any bundle.
- Public browsing (Home, Learn, Clinics, Pathway) needs no authentication.
- Anonymous booking uses reference + independent secret; no public account.

## 3. Database layer (local)
- PGlite (WASM PostgreSQL) runs in-process for dev and tests: no Docker, `psql` or Supabase CLI available (S0_AUDIT section 2).
- A small migration runner applies `supabase/migrations/*.sql` in filename order and records applied versions in a `schema_migrations` table. Migrations are plain SQL so they remain valid for a real Supabase/Postgres later.
- RLS policies are written in SQL and tested in PGlite using DB roles. Server-side scope checks apply regardless of RLS (defense in depth).
- Known gap: PGlite does not provide Supabase Auth (`auth.uid()`, JWT). The dev equivalent supplies the actor via a session setting (for example `set_config('app.current_user_id', ...)`) that policies read; this is replaced by Supabase JWT claims in a real deployment. Flagged as gap G-AUTH in the decision log.
- Persistence: dev may use in-memory or a gitignored data directory; tests use in-memory and reset per suite.

## 4. API conventions
Versioned REST under `/api/v1`; Zod validation on every input and output; centralized error handler with stable codes and generic public messages; `x-request-id` correlation header generated/propagated (echoed on responses and in error bodies as `requestId`); structured logs with redaction (no secrets, booking payloads, contact data); security headers, least-privilege CORS, body limits, parameterized queries, per-route rate limits; `Cache-Control: no-store` on private responses; ISO 8601 times, display in `Asia/Manila`; optimistic locking via `version` on mutable records. First endpoint (S1-1): `GET /api/v1/public/config`. Further endpoints per master prompt section 8, built per slice.

## 5. Frontend
Tokens from master prompt section 3 (Palette B, 8px rhythm, 12/16/24 radii, 44px targets) in CSS custom properties; Plus Jakarta Sans for headings and Inter for body, `font-display: swap`; lucide-react outline icons only. Mobile bottom nav fixed to Home / Learn / Clinics / Menu; desktop top nav; Menu holds Privacy, Help/FAQs, About, status lookup, language switch. Typed EN/FIL catalogs with stable keys, parity test, per-locale review state. Single server-state strategy: TanStack Query. No sensitive journey state in URLs, localStorage or persistent session storage (only the language preference persists).

## 6. PWA
Manifest (`name`/`short_name` KALINGA, Indigo theme color). Versioned service worker caches only public versioned static assets and approved public content; bypasses `/api`, `/staff`, `/admin` and booking flows; purges old caches. Maskable icon only after logo approval (until then temporary text wordmark, gate recorded). Offline shows a public-only message and never claims stale clinic data is verified.

## 7. Notifications
`NotificationTransport` interface with `DisabledTransport` and `MockTransport`. Mock stores expiry-bound demo events inspectable only in protected local tooling; neutral template text; idempotency keys; deterministic failure injection. No real send path is wired, and `REAL_NOTIFICATIONS_ENABLED=false` is enforced server side.

## 8. Configuration and release flags
Server-enforced flags (only those actually implemented are exposed): `DEMO_MODE`, `CLINICAL_CONTENT_APPROVED`, `ALLOW_REAL_BOOKING_REQUESTS`, `REAL_MINOR_BOOKING_ENABLED`, `NOTIFICATION_TRANSPORT`, `REAL_NOTIFICATIONS_ENABLED`. A startup validator refuses unsafe combinations when `NODE_ENV` is staging/production. Browser storage cannot change them. `.env.example` documents them with safe defaults; real `.env` is gitignored.

## 9. Roles and authorization (proposed; confirm with partners)
`clinic_staff`, `clinic_manager`, `provincial_admin`, `content_reviewer`, `technical_admin`. Memberships bind a user to clinic(s). Technical admin does not read booking payloads. Role never derived from client input. Detailed matrix to be written with S6/S7 in `docs/` (not yet created).

## 10. Slice order and verification
S0 audit (this), S0-2 scaffold and `npm run verify` (lint + typecheck + test + build), then S1 to S9 as listed in LOOP.md. `npm run verify` is the single gate; `bash stop-check.sh` wraps it.

## 11. Mapping of logical locations to this repo
All reference-layout locations in the master prompt section 2 are net-new. Docs listed there but not yet present (`data-dictionary.md`, `api-contract.md`, `design-system.md`, `clinic-onboarding-checklist.md`, `minor-booking-policy-and-evidence.md`, `localization-review-matrix.md`, `clinical-review-checklist.md`, `launch-gates.md`, `implementation-status.md`, `slice-test-evidence.md`) are created by later items, not S0-1.
