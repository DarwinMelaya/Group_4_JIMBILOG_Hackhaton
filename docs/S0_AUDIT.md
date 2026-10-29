# S0 Audit: KALINGA repository baseline

Date: 2026-10-29 | Loop item: S0-1 | Author: loop-maker (not yet checked)

## 1. Factual repository state

No application code existed at the time of this audit. The repository contains only documentation, Claude Code skill templates and loop-control files. There is no frontend, backend, database, migration, test, lint, CI or build configuration.

- Branch: `main`. One commit: `e57d8b3 "first commit"` (author DarwinMelaya, 2026-10-28). That commit adds a single tracked file, `test.ts`, which is **0 bytes** (an empty placeholder, not application code).
- Everything else is untracked (`git status`): `.claude/`, `KALINGA_Claude_Code_Kickoff_Prompt_v2_FINAL.txt`, `LOOP.md`, `README_START_HERE.md`, `assets/`, `claude_templates/`, `docs/`, `lint-loop.sh`, `project-inspection.txt`, `stop-check.sh`.
- No `package.json`, lockfile, `tsconfig*`, `vite.config*`, ESLint/Prettier config, `.env*`, `.gitignore`, `README.md`, `CLAUDE.md`, `src/`, `apps/`, `packages/`, `supabase/` or `.github/` exist.
- Package manager: none established. npm 11.6.2 and Node v24.13.0 are installed; pnpm/yarn are not. npm is therefore the working choice (npm workspaces).

### Inventory of what exists
| Path | Kind | Notes |
|---|---|---|
| `docs/KALINGA_Project_Brief.md` | Source of truth | 16 sections; read in full |
| `docs/KALINGA_Claude_Code_Master_Skill_Loop_Prompt_v2_FINAL.md` | Source of truth | Sections 0-18; read in full |
| `docs/KALINGA_Brand_Guidelines_v1.0.pdf` | Source of truth | 10 numbered sections; read via `pdftotext` (text only; page images/logo artwork not visually inspected) |
| `assets/kalinga_logo_reference.png` | Shape reference only | Not approved artwork; not a signed-off master |
| `claude_templates/skills/*` and `CLAUDE_MD_MERGE_SNIPPET.md` | Skill templates | Six skill templates |
| `.claude/skills/*` (6), `.claude/agents/*` (loop-checker, loop-maker, loop-monitor), `.claude/commands/*` (loop-cycle, sync-loop) | Loop/skill config | Working loop scaffolding |
| `LOOP.md`, `stop-check.sh`, `lint-loop.sh` | Loop control | `stop-check.sh` requires `package.json` and `npm run verify` |
| `KALINGA_Claude_Code_Kickoff_Prompt_v2_FINAL.txt`, `README_START_HERE.md`, `project-inspection.txt` | Owner notes | Inspection output is only a directory listing |
| `test.ts` | Empty tracked file | 0 bytes |

### Source-document access
All three source documents were located at the expected `docs/` paths and read. The Brand Guide PDF was read as extracted text; its non-text rendering (logo shapes, color swatch presentation) was not viewed because the page-image renderer was unavailable. Nothing in this audit depends on visual claims about the logo.

## 2. Toolchain available locally
| Tool | Present | Consequence |
|---|---|---|
| Node 24.13.0 / npm 11.6.2 | yes | Use npm workspaces |
| Docker | no | No containerised Postgres/Supabase |
| `psql` / PostgreSQL server | no | Use PGlite (WASM Postgres) for local DB |
| Supabase CLI | no | No local Supabase stack; Supabase Auth unavailable locally |
| Python | no (Store stub only) | Do not depend on Python tooling |
| `pdftotext` | yes | Used for brand guide |
| Playwright browsers | none cached | E2E needs `npx playwright install`; network may be required (flag for S9) |
| `git` | yes | Agents never commit (LOOP.md) |

## 3. Capability inventory vs. requirements
Nothing in the requirement set (F01-F12, A01-A07) is implemented. Percent implemented: 0. See `docs/requirements-matrix.md`.

## 4. Gaps and flagged items
1. **Greenfield exception.** The master prompt (section 0.1, 17.1) says to preserve existing work and not blindly scaffold; it permits an adapted scaffold only after verifying the repo is empty of app code. This audit is that verification. Scaffolding in S0-2 must add files only and must not overwrite any existing file.
2. **No local Supabase/Docker/psql.** Real RLS through Supabase and Supabase Auth cannot run locally. PGlite supports PostgreSQL RLS policies, so RLS is testable in PGlite using database roles and `SET ROLE`/session settings; what is missing is Supabase Auth integration (JWT, `auth.uid()`). Gap flagged in `docs/decision-log.md` (D-004, D-005).
3. **No approved minor-booking SOP artifact** found in the repository. Gate `APPROVED_SOP_ARTIFACT_MISSING` applies (master prompt 17.3). Real 15-17 booking stays disabled.
4. **No final logo master.** Only a PNG shape reference. Branding gate remains blocked; use a labeled temporary text wordmark.
5. **No `.gitignore`.** S0-2 must create one before any `npm install` (to keep `node_modules`, `.env` out of the tree).
6. **Existing-file preservation.** `test.ts` (empty, tracked) is preserved. S0-2 should not delete it; if it collides with lint/tsconfig globs it is excluded rather than removed.
7. **Tension between brief and master prompt.** The brief says "Supabase PostgreSQL"; the owner decision (local-first) permits a documented equivalent. Recorded as D-004, not a conflict in policy.
8. **Brief vs. brand guide mobile nav.** Brief is silent; master prompt and Brand Guide page 8 agree on four items (Home/Learn/Clinics/Menu). No conflict.
9. **Wording details.** Brand Guide uses "Pending Review"; master prompt uses `pending_review` / "Pending Clinic Review". Treat the enum as `pending_review` and the user-facing label as "Pending Clinic Review" (master prompt F06), noting the guide's shorter form.
10. **Dated claims.** The brief cites statistics dated 2026 and references; they are source content, not verified by this audit, and must not be reproduced as medical claims without clinical review.

## 5. Decisions taken (summary; see decision-log.md)
npm workspaces `apps/web`, `apps/api`, `packages/shared`, `supabase/migrations`; PGlite as local PostgreSQL; staff auth via a documented dev equivalent with the gap flagged; mock notification transport only; DEMO-only fixtures.

## 6. Baseline results
There is nothing to build, lint, typecheck or test. `npm run verify` does not exist, so `bash stop-check.sh` exits 1 (it requires `package.json`). Baseline is "not applicable / empty", not green.

## 7. Verification for this item
`ls docs/S0_AUDIT.md docs/architecture.md docs/decision-log.md docs/threat-model.md docs/requirements-matrix.md` and `git status --short` (no ` M` or ` D` entries for tracked files; `test.ts` unchanged).
