# KALINGA design system (Brand Guidelines v1.0 refresh)

Source of truth: `apps/web/src/styles/tokens.css`. Components consume semantic tokens; raw hex lives only there (plus the static files that cannot import CSS: `public/offline.css`, `manifest.json`, `index.html` theme-color, `icons/kalinga-logo.png`).

## Palette and hierarchy
| Role | Token | Hex | Use |
|---|---|---|---|
| Foundation | `--brand-midnight` | #101440 | body text, hero gradient start |
| Foundation | `--brand-navy` | #161955 | headings, brand text, theme-color |
| Foundation | `--brand-royal` | #221F6E | hero gradient middle |
| Interactive | `--brand-vivid` | #261CA3 | links, secondary buttons, selected nav (`--color-action`) |
| Interactive | `--brand-electric` | #4025E1 | focus ring, primary gradient end (`--color-periwinkle`) |
| Accent | `--brand-purple` / `--brand-plum` / `--brand-mauve` | #3E2A75 / #613979 / #86497B | reserved for illustration and future badges; not used for text |
| Accent | `--brand-rose` | #AC5F7A | field-error marker |
| Accent | `--brand-coral` | #D37C7A | hero warm glow only |
| Surface | `--surface-canvas` / `-raised` / `-tint` / `-warm` | #F7F6FD / #FFFFFF / #EEECFB / #FCE6E0 | app background / cards, inputs / selected + supportive panels / demo and urgent notices |
| Line | `--line-soft` / `--line-strong` | #D9D6F0 / #8C86C9 | dividers / form-control borders (3.07:1 on canvas, WCAG 1.4.11) |

Legacy names (`--color-indigo`, `--color-periwinkle`, `--color-lavender`, `--color-peach`, `--color-white`, `--color-ink`, `--color-muted`, `--color-border`) remain as aliases so existing rules inherit the palette. Prefer the semantic names in new code.

## Style decisions
- **Gradients**: indigo to violet only. `--gradient-hero` (hero), `--gradient-action` (primary button, FAB, selected topic). No other gradients.
- **Grain**: `--texture-grain`, 6% opacity overlay, hero only. Removed under `prefers-reduced-transparency` and forced-colors.
- **Glass**: header and bottom nav use `--glass-bg` + `--glass-blur`, inside `@supports`; solid fallback otherwise and under reduced transparency.
- **Elevation**: `--shadow-card` (cards), `--shadow-raised` (hero, FAB, assistant panel), `--shadow-action` (primary button). No heavier shadows.
- **Radii**: 12 button, 16 card, 24 feature, pill for badges/FAB.
- **Motion**: 160ms `--ease-ios` on color, shadow and a 0.98 press scale. All animation and transition are disabled under `prefers-reduced-motion` (existing global rule).
- **Typography** unchanged: Plus Jakarta Sans (headings), Inter (everything else).
- **Icons**: Lucide only, 2px stroke. Medical set: House (home), BookHeart (learn), Hospital (clinics), ShieldPlus (hero, privacy + care), ShieldCheck (privacy-matched pathway links), MessageCircleHeart (guide), TriangleAlert (urgent).
- **On dark**: the hero inverts the primary button to white-on-navy and uses `--color-on-dark` / `--color-on-dark-muted`.

## Contrast (computed in `a11y.test.tsx`, all >= 4.5:1)
ink/canvas, ink/warm, ink/tint, muted/canvas, muted/tint, muted/raised, navy/canvas, action/canvas, action/tint, white on vivid, electric, midnight, royal, and muted-on-dark on royal/vivid. Focus ring electric on canvas 7.6:1.

## Known follow-ups
- `kalinga-logo.png` is the single brand icon (favicon, manifest, header). Its green/coral/gold artwork is outside the indigo UI palette; confirm that is intended.
- Visual QA in a real browser at 360 / 768 / 1280 px has not been run in this change.

## Parallax-inspired redesign (landing and shared screens)
- **Landing** (`pages/Home.tsx`, `styles/landing.css`, copy in `i18n/home-messages.ts`): illustrated hero (`components/HeroIllustration.tsx`, original SVG: phone with shield-and-heart, clinic pin card, calendar card, leaves), urgent-guidance strip overlapping the hero edge, How it works (4 connected steps), Why KALINGA (asymmetric bento), Explore health information (purple-to-mauve band, links to real pages), Find the care you need (Privacy-Matched Pathway + clinics), Privacy and trust (dark), Final CTA, footer links. Sections overlap with large radii for the layered transitions and alternate light, tint, warm, light, dark.
- **Motion is CSS only, no JS and no new dependency.** `.reveal` uses `animation-timeline: view()`; hero layers (`.px-back/.px-mid/.px-front`) use `animation-timeline: scroll(root)` at >= 900px only; idle float at >= 768px only. Browsers without `animation-timeline` render everything static and visible. `prefers-reduced-motion` disables all of it (global rule plus explicit media queries).
- **Not animated:** forms, clinic information, appointment screens, staff and admin. Inner pages get only the tinted page glow, larger titles and gentle card hover.
- **Tokens added:** `--gradient-warm` (purple to plum to mauve), `--gradient-glow` (plum to rose to coral, decorative only, never behind text), `--glow-page`, `--color-peach-soft`.
- **Content rule:** no invented clinics, availability, claims or contact details; the footer states contact details are unavailable in this DEMO. All new copy is unreviewed DEMO text with a draft Filipino version.
