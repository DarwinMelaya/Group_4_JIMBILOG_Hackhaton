# KALINGA design system (forest-and-gold)

Source of truth: `apps/web/src/styles/tokens.css`. Components read semantic tokens; raw hex lives only there, plus the static files that cannot import CSS (`public/offline.css`, `manifest.json`, `index.html` theme-color).
Styles load in this order: `tokens.css`, `app.css` (shell, forms, buttons), `landing.css` (landing page, footer, motion), `cards.css` (shared card system).

## Palette and hierarchy
| Role | Token | Hex | Use |
|---|---|---|---|
| Foundation | `--brand-forest` | #073F29 | headings, nav text, dark hero, theme-color |
| Interactive | `--brand-emerald` | #0D5E38 | primary buttons, links, selected nav (`--color-action`) |
| Accent | `--brand-green` | #2A7A46 | focus ring, progress, icons, gradient end (`--color-accent`) |
| Supporting | `--brand-moss` / `--brand-olive` | #39582B / #67783F | dark sections, illustration, decoration |
| Premium | `--brand-gold` | #A38641 | gold gradient start, demo markers |
| CTA | `--brand-amber` | #E59C40 | hero and final CTA buttons, illustration accents, demo card edge |
| Light | `--brand-glow` | #67D678 | ambient glows only; never text, never a fill behind text |
| Surfaces | `--surface-canvas` / `-raised` / `-tint` / `-ivory` / `-warm` | #F6F8F1 / #FFFFFF / #E7F0E3 / #FBF6E8 / #FBEFD5 | page / cards, inputs / selected + supportive / warm panels / notices |
| Lines | `--line-soft` / `--line-strong` | #D3DFCF / #7B9680 | card borders / form-control borders (3:1 on canvas) |

Semantic roles: `--color-heading`, `--color-action`, `--color-accent`, `--color-tint`, `--color-notice`, `--color-canvas`, `--color-ink`, `--color-muted`, `--color-border`, `--color-on-dark`, `--color-on-dark-muted`, `--color-gold-soft`. Use these in components, not the brand ramp, except for gradients and illustrations.

## Gradients and light
`--gradient-hero` forest to emerald to green. `--gradient-dark` forest to moss (dark sections). `--gradient-action` emerald to green (primary buttons, selected chips, icon chips). `--gradient-gold` gold to amber (decorative only, never behind small text). `--glow-warm`, `--glow-cool`, `--glow-page` are low-opacity radial glows. `--texture-grain` is used on the hero and dark sections only; `--deco-leaf` is the faint corner leaf on cards.

## Cards (`styles/cards.css`)
- **Base**: raised surface, 20px radius, soft green-tinted shadow, 22px padding, faint corner leaf. Hierarchy comes from the icon chip (`.card-icon`, a Lucide medical pictogram), the type scale and spacing. **No permanent underlines and no rules under card titles.** Only `.btn--text` keeps an underline, as a conventional text button.
- **Clickable** (`.article-card`, `.clinic-card`, care topics): the title link stretches over the whole card, an arrow glyph shows the affordance, hover lifts 3px and moves the arrow, press scales to 0.99, keyboard focus draws a ring on the card. Under `(hover: none)` there is no lift.
- **Featured**: the urgent article spans the grid row on a warm gradient with a forest border; the top pathway match gets a tinted gradient and a filled rank badge.
- **Informational / forms / admin** (`.card`, `.state-box`, `.staff-bar`): same surface, never animated.
- **Grids**: 1 column on phones, 2 from 640px, 3 from 1000px (articles); clinics 2 columns from 820px.

## Motion
- Tokens: `--ease-ios`, `--duration-quick` 160ms, `--duration-base` 240ms, `--duration-slow` 600ms. Transform and opacity only.
- CSS only, no JS and no dependency. Scroll reveals use `animation-timeline: view()` (landing sections and listing cards, with short staggers via `animation-range` offsets); hero layers drift with `animation-timeline: scroll(root)` from 900px; idle float and the hero glow run from 768px. Panels (assistant) fade and rise on open.
- Browsers without `animation-timeline`, and anyone with `prefers-reduced-motion`, get the static page (global rule in `app.css` plus explicit media queries).
- Never animated: forms, clinical information, appointment details, staff and admin screens.

## Typography and icons
Plus Jakarta Sans for headings and display, Inter for everything else. Icons are Lucide only at 2px stroke: House, BookHeart, Hospital, ShieldPlus, ShieldCheck, ClipboardCheck, Stethoscope, HeartPulse, MessageCircleHeart, TriangleAlert. The brand logo is `public/icons/kalinga-logo.png`.

## Contrast (computed in `a11y.test.tsx`, all >= 4.5:1)
ink on canvas, warm notice and tint; muted on canvas, tint and raised; heading on canvas; action on canvas and tint; white on emerald, green, forest and moss; on-dark-muted on forest, emerald and moss; gold-soft on emerald and forest; forest on amber. Form borders on canvas are 3:1 or better.

## Content rule
No invented clinics, availability, claims or contact details. The footer states contact details are unavailable in this DEMO. All new copy is unreviewed DEMO text with a draft Filipino version.

## KAI (Kalinga AI) assistant
- **Persona and mark**: `components/KaiAvatar.tsx` is KAI's own logo: a forest-to-green squircle holding the Symbolic K (stem plus a gold-amber leaf and a glow-green leaf, echoing the KALINGA logo) with a four-point gold spark for the "AI". Shown in the launcher, the panel header (with an online dot) and beside every KAI message. Inline SVG, no inline style attributes (CSP).
- **Chat flow** (`assistant/AssistantWidget.tsx`, `styles/assistant.css`): the panel opens with KAI's greeting and the quick-reply chips. After the first message (chip or typed) the chips are removed, the panel widens and the log grows, and a small sparkle button beside the input opens a dropdown with the remaining suggestions (already-asked ones drop out; Escape closes the dropdown before the chat).
- **Feels like chatting**: user and KAI bubbles with pop-in, and a typing indicator for 600 ms (`REPLY_DELAY_MS`) before each scripted reply. The typing state is announced as "KAI is typing". Everything stays local: no network, no storage, no model; the DEMO disclaimer stays visible.
