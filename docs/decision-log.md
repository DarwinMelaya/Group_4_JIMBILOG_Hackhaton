# KALINGA decision log

Format: ID | date | decision | basis | status. Dates are 2026-10-29 unless noted.

## A. Resolved owner decisions (master prompt, "Final owner decisions"; not to be reopened)
| ID | Decision | Status |
|---|---|---|
| O-1 | Build order: full-stack vertical slices; shared design foundation created inside the first slice | resolved |
| O-2 | Working codebase: existing KALINGA repo; preserve history and files, no destructive reset | resolved |
| O-3 | Mobile nav: fixed Home / Learn / Clinics / Menu (Brand Guide section 6/8); older 3-tab design superseded | resolved |
| O-4 | Booking identity: no public account; random reference plus independent high-entropy secret (>= 256 bits CSPRNG); never reference alone; staff authenticate | resolved |
| O-5 | Ages 15-17: implement owner's already-approved procedure once the actual artifact is available; until then policy adapters and DEMO workflows only; real under-18 submissions disabled | resolved; evidence gate `APPROVED_SOP_ARTIFACT_MISSING` open |
| O-6 | Public languages: English (`en`) + Filipino (`fil`); Filipino clinical copy needs separate qualified review | resolved |
| O-7 | Clinics/content: no real resources; unmistakably fictitious DEMO clinics/content, labeled unreviewed | resolved |
| O-8 | Infrastructure: local-first; local Supabase/Postgres if available else documented equivalent; notifications mock-only | resolved (equivalent chosen, see D-004) |

## B. Engineering decisions made in S0-1 (proposed by loop-maker; owner reviews at commit)
| ID | Decision | Basis / alternatives | Status |
|---|---|---|---|
| D-001 | Package manager and layout: npm workspaces with `apps/web`, `apps/api`, `packages/shared`, `supabase/migrations` | npm 11.6.2 installed; pnpm/yarn absent; no existing lockfile family to preserve; layout follows master prompt section 2 | proposed |
| D-002 | Language: TypeScript across web, api, shared | master prompt section 2 | proposed |
| D-003 | Frontend: React + Vite + React Router + TanStack Query; React Hook Form permitted for forms; lucide-react only icons; styling via CSS custom properties from brand tokens (no Tailwind by default) | master prompt 2, 3; avoids a second styling system | proposed |
| D-004 | Local database: PGlite (WASM PostgreSQL) with plain-SQL migrations in `supabase/migrations/*.sql` and a small custom migration runner | Docker, psql and Supabase CLI are absent (S0_AUDIT section 2); SQL stays portable to Supabase. Alternative rejected: SQLite (would not exercise RLS or Postgres types) | proposed |
| D-005 | Staff authentication: documented dev equivalent. scrypt-hashed seeded DEMO accounts, server-side sessions, role/clinic membership checked server side; actor passed to Postgres via a session setting read by RLS policies. **Gap flagged:** Supabase Auth (invitations, MFA, JWT claims, secure reset) is not available locally and is not exercised; must be integrated and re-tested before any real deployment | master prompt 2 "documented equivalent"; brief 9 allows "equivalent controlled authentication service" | proposed; gap G-AUTH open |
| D-006 | RLS: written in SQL and tested in PGlite via DB roles; server-side scope checks are mandatory regardless. Gap: Supabase-specific `auth.uid()` helper not present | master prompt 2, 7 | proposed; part of G-AUTH |
| D-007 | API: Express + Zod, `/api/v1`, Vitest + Supertest for API tests | master prompt 2, 8 | proposed |
| D-008 | Tests: Vitest + React Testing Library + vitest-axe (or axe-core) for unit/component/accessibility; Playwright for E2E in S9 (browser download may need network; flagged) | master prompt 2, 15 | proposed |
| D-009 | Single verification gate: `npm run verify` = lint + typecheck + test + build, defined in S0-2 | LOOP.md Stop condition | proposed |
| D-010 | Notification transport: `DisabledTransport` and `MockTransport` only; no real provider code paths | O-8, master prompt 8 | proposed |
| D-011 | Public request statuses limited to `pending_review`, `confirmed`, `alternative_required`, `cancelled` | master prompt F07; Brand Guide section 8. UI label for pending: "Pending Clinic Review" | proposed |
| D-012 | Staff roles: `clinic_staff`, `clinic_manager`, `provincial_admin`, `content_reviewer`, `technical_admin` (proposed in source; to confirm with partners) | master prompt A01 | assumption |
| D-013 | Locale codes: `en`, `fil`; timezone `Asia/Manila` | master prompt F11 | proposed |
| D-014 | Local state: only the language preference may persist client-side; pathway selections in memory only | master prompt F03, F11 | proposed |
| D-015 | Preserve `test.ts` (empty tracked file) untouched; exclude it from lint/typecheck globs if necessary rather than delete it | LOOP.md Rules, master prompt 0.1 | proposed |
| D-016 | `.gitignore` is created in S0-2 before any install (node_modules, `.env`, PGlite data dir, build output) | hygiene; no `.gitignore` exists today | proposed |
| D-017 | Correlation header is `x-request-id` (matches apps/api/src/http/middleware.ts: well-formed inbound value accepted, else generated; echoed on response and as `requestId` in error bodies); docs previously used a different header name | code and tests already shipped in S1-1; renaming code adds churn for no benefit | accepted |

## C. Source conflicts and ambiguities recorded (none changes owner decisions)
| ID | Observation | Handling |
|---|---|---|
| C-1 | Brief says Supabase PostgreSQL; local environment cannot run Supabase | D-004, D-005 |
| C-2 | Brand Guide says "Pending Review"; master prompt says "Pending Clinic Review" | enum `pending_review`; UI label "Pending Clinic Review" |
| C-3 | Brief section 6 lists "High school students aged 15-18" while the product targets 15-24 and minors are 15-17 | follow master prompt (policy for 15-17; 18+ adult) |
| C-4 | Brand Guide asset ledger says the SVG reconstruction needs recolor and review; only a PNG reference exists | text wordmark placeholder; branding gate blocked |
| C-5 | Brand Guide wording: brand tagline is provisional | label provisional internally; do not claim approved |
| C-6 | Brief section 6 allows email/SMS provider "optional"; owner decision O-8 forbids real sends | mock only |
| C-7 | Brief cites 2026 statistics and research as background | not reproduced as medical claims; clinical review needed before use |

## D. Open gates (external evidence, not decisions)
APPROVED_SOP_ARTIFACT_MISSING (minors 15-17); final logo master; medical reviewers and Filipino translation review; clinic agreements and verified facts; urgent PEP copy review; legal/privacy review under the Data Privacy Act; Supabase Auth integration (G-AUTH); real notification provider (only if owner opts in later).
