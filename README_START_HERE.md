# KALINGA — Final Claude Code Skill-Loop Implementation Package

**Version:** v2 FINAL • 29 October 2026  
**App:** KALINGA — Knowledge and Access Link for STI Navigation, Guidance, and Assistance

## What this package contains

- `docs/KALINGA_Claude_Code_Master_Skill_Loop_Prompt_v2_FINAL.md`: the complete actionable implementation directive with every feature from the project brief, approved brand tokens, API/database specification, signed-off owner decisions, acceptance checks and vertical development slices.
- `docs/KALINGA_Project_Brief.md`: the original full project brief (unchanged).
- `docs/KALINGA_Brand_Guidelines_v1.0.pdf`: the official visual and UX guide (unchanged).
- `assets/kalinga_logo_reference.png`: selected Symbolic K image **for shape reference only**, not a signed-off production SVG master.
- `KALINGA_Claude_Code_Kickoff_Prompt_v2_FINAL.txt`: shorter paste-ready first-session instruction; points Claude to all source docs.
- `claude_templates/skills/*/SKILL.md`: Claude Code project skill templates for implementing and verifying full-stack vertical slices.
- `claude_templates/CLAUDE_MD_MERGE_SNIPPET.md`: facts to merge safely into an existing `CLAUDE.md`.

## Import into your EXISTING repository

1. Make a normal, reviewed backup/commit of your existing repository **yourself** (or at least confirm Git status) so no in-progress work is lost. Do not delete any existing app files.
2. Copy the three `docs/` artifacts into your repository's `docs/` folder. Copy `assets/kalinga_logo_reference.png` into `assets/` (optional).
3. Merge the contents of `claude_templates/skills/` into your existing `.claude/skills/` directory. **Do not overwrite an existing skill with the same name without comparing it first.** The companion master prompt also works without copying these templates; Claude can create equivalent skills as it audits.
4. Merge the concise `CLAUDE_MD_MERGE_SNIPPET.md` **selectively** into your current `CLAUDE.md` if you use one; keep your existing instructions.
5. Start Claude Code from the actual KALINGA repository root (VS Code integrated terminal/extension is fine), then paste the entire content of `KALINGA_Claude_Code_Kickoff_Prompt_v2_FINAL.txt`.
6. Claude's first work is repository audit **S0**, followed by a working full-stack **S1**. Then it should proceed to S2–S9 by feature. For subsequent sessions invoke `/kalinga-next-slice S2` (or desired slice) after checking current status. Run `/skills` to confirm recognition if necessary. Refer to the current Claude Code documentation if your installation's skill support differs.

## Locked decisions

| Decision | Value |
|---|---|
| Implementation | Full-stack PWA **feature by feature** |
| Start location | **Existing KALINGA repository**; preserve it |
| Mobile bottom navigation | **Home / Learn / Clinics / Menu** |
| Public appointments | No user account; **reference + independent secret** |
| Ages 15–17 | Owner already approved a process; use its **actual procedure** (not supplied here) before enabling real minor booking |
| Languages | **English / Filipino** |
| Clinics/content | No actual partners/resources yet; clear DEMO-only fixtures |
| Infrastructure | Local development, isolated DB and **mock notification transport** |

## What is NOT approved by this package

No actual clinic partner agreements, fee/hours/service assertions, finalized signed-off SVG logo, clinical reviews, Filipino medical translations, legal verification/approved minors' SOP artifact, real patients, live booking, real email/SMS, or pilot/public deployment. The owner has selected an approved minor-booking *process*, but this archive does not contain that process's explicit consent/booking steps. Claude must search the existing repo for the actual signed SOP, map it to implementation and fail closed for real minors until evidence is present.

The UI may show DEMO fixtures with clear development labels. It must never imply real clinics are participating, show simulated appointment confirmation as genuine, or diagnose STI/HIV.

## Technical references for Claude Code skills

- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/hooks

The intended workflow relies on standard project `SKILL.md` with YAML frontmatter and repeatable verification steps. No unsupported unattended scheduler or risky hooks are installed.

## Run locally (prototype)

- `npm install` once, then `npm run dev` starts the API (http://localhost:3001) and the web app (http://localhost:5173) together. The web dev server proxies `/api` to the API (override with `API_PORT`), so the browser needs no CORS. Press Ctrl+C to stop both.
- `npm run verify` runs lint, typecheck, all tests and builds. Evidence of what has actually been run is in `docs/slice-test-evidence.md`.
- Real-browser end-to-end suite (S9-1, Playwright + Chromium, DEMO data only): `npm run test:e2e:install` once (downloads Chromium, needs network), then `npm run test:e2e` (about 1 minute including a production web build; NOT part of `npm run verify`). It starts the API on port 3101 (`DEMO_MODE=true`, in-memory database, seeded fictitious data) and a `vite preview` of the production build on port 4173 (strict CSP headers, service worker, `/api` proxy), so ports 3101 and 4173 must be free. Specs are in `e2e/`.

### Prototype status

This is a local DEMO prototype, not a service that is ready for real users. All clinics, articles and translations are DEMO and unreviewed, Filipino text is a draft, DEMO staff accounts exist only in demo mode, reminders are mock-only (no real SMS or e-mail), and a booking submission is a request, not a confirmation. What is built and what was actually tested: `docs/implementation-status.md`. What must happen before any real use (clinical, legal, partner, security and accessibility gates, all open): `docs/launch-gates.md`.
