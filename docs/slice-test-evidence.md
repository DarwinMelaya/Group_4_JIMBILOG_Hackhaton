# Slice test evidence

Honest record of what was actually run. Nothing here claims clinical, security or production readiness. All data is DEMO.

## S1 (cycle 7, 2026-10-29, Windows 11, node v24.13.0)

### Commands run and results

| Command | Result |
| --- | --- |
| `npm run verify` (eslint, `tsc --noEmit` x3, vitest x3 workspaces, builds) | exit 0 on final run: api 26 tests (5 files), web 93 tests (6 files), shared 4 tests (2 files); vite build OK |
| `npm run dev` (concurrently: API on 3001 + Vite on 5173), then `curl -i http://localhost:5173/api/v1/public/config` | HTTP 200 JSON through the Vite proxy; API log shows the request with an `x-request-id`; `curl http://localhost:5173/` 200; direct `curl http://localhost:3001/api/v1/public/config` 200. Servers were stopped afterwards (ports 5173/3001 closed) |

Known flake, disclosed: `apps/api/src/db/db.test.ts` "persists to a data directory and stays idempotent on reopen" exceeded its 5000 ms default timeout (about 6 s) on the first two cold `npm run verify` runs, then passed on 3 consecutive reruns (including the final full verify). It is an on-disk PGlite start-up time issue unrelated to this item; the test was not edited. Consider a per-test timeout in a future item (needs a human decision because tests are the verification surface).

### What the S1 automated tests cover

- Config API (S1-1): `apps/api` tests for `GET /api/v1/public/config`, request IDs, error envelope, migrations.
- Brand tokens, 4-item nav, DEMO banner (S1-2): `apps/web/src/App.shell.test.tsx`.
- EN/FIL parity, lang attribute, review flags (S1-3): `apps/web/src/i18n/i18n.test.tsx`.
- PWA cache policy (S1-4): `apps/web/src/pwa/pwa.test.ts`.
- Frontend config consumption (S1-5): `apps/web/src/api/client.test.ts` (relative URL, no credentials, Zod validation, HTTP/network/invalid-body errors).
- Accessibility (S1-5): `apps/web/src/a11y/a11y.test.tsx`
  - axe-core (wcag2a/aa, 2.1, 2.2 AA, best-practice tags) with zero violations on Home, Learn, Clinics, Menu in en and fil (8 pages), plus Home in loading and API-error states.
  - Footer environment status from the API: ready (en, fil), unreachable API, browser offline.
  - Landmarks (banner, main, contentinfo, two labelled navs), skip link first in tab order and targeting `#main`, tab sequence of skip link, logo, primary nav, language buttons, page actions.
  - CSS assertions: `--touch-target: 44px` and min-height from it on `.nav-link`, `.btn`, `.logo`, `.locale-switch__btn`; `:focus-visible` outline; `prefers-reduced-motion` rule disables animation, transition and smooth scroll.
  - Computed contrast of declared token pairs (ink/white, ink/peach, ink/lavender, muted/white, indigo/white) at least 4.5:1.

### NOT run (be skeptical of any claim otherwise)

- No real browser: no Lighthouse, no screenshots, no responsive check at 320/360/390/768/1024/1440 px or 200% zoom, no real keyboard or screen-reader pass, no PWA install or offline test.
- axe runs in jsdom with `color-contrast` disabled (jsdom has no layout/cascade); contrast is only checked by arithmetic on token pairs, not on rendered pixels. The fixed bottom nav overlapping content was not checked visually.
- 44px targets are asserted from CSS text, not measured boxes.
- Filipino strings and the offline text remain unreviewed drafts; no clinical review has occurred.
- No end-to-end test through a browser; the proxy was verified with curl only.

## S2-S9 and the DEMO assistant

Evidence for slices S2 to S9 (articles, pathway, clinics, booking, staff, governance, care/reminders/reports, Playwright e2e) and the assistant is summarized in `docs/implementation-status.md`: last known full `npm run verify` was 388 API + 461 web + 17 shared tests, `test:loop` 14/14, lint/typecheck/build green, and Playwright e2e 9/9 in Chromium (desktop viewport). Per-item maker and checker evidence is in `LOOP.md` (many S2-S8 items were checked in FAST MODE with targeted tests; full verify was run after S9). Not tested: real devices, screen readers, rendered contrast in browsers, slow networks, load, penetration testing. See `docs/launch-gates.md`.
