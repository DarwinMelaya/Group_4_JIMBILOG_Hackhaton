---
name: kalinga-design-qa
description: Audit KALINGA's approved Palette B identity, responsive UX, accessibility and four-item mobile navigation after UI changes.
---

Use Brand Guide v1.0 as authority, not a generic healthcare template. Inspect actual components and rendered pages where browser tooling exists.

- Colors: see docs/design-system.md and apps/web/src/styles/tokens.css (forest-and-gold: Forest #073F29, Emerald #0D5E38, Green #2A7A46, Moss #39582B, Olive #67783F, Gold #A38641, Amber #E59C40, Glow #67D678). No indigo, violet or pink.
- Fonts: Plus Jakarta Sans headings, Inter interface/body; typography 36/44 display, 30/38 H1, 24/32 H2, 20/28 H3, 16/24 body and buttons, 14/21 supporting, 12/18 metadata. Use correct weights/font loading.
- Icons: Lucide outline, default 24px/2px strokes; labeled controls. Soft geometric vector illustrations, not fear-based anatomy or fake patient imagery.
- 8px spacing rhythm, 16px mobile gutters, 12px buttons, 16px cards, 20-24px panels, 44x44 interactive targets, visible focus/borders.
- Four-item fixed bottom nav **Home / Learn / Clinics / Menu** with accessible active states and safe-area; desktop horizontal nav/split hero, centered privacy stepper; no fifth tab or fallback to outdated 3-tab design.
- Bilingual EN/FIL labels; no clipping at 320px, 360px, 390px, 768px, 1024px, 1440px or 200% text zoom; test keyboard, WCAG 2.2 AA contrast, screen-reader semantics, reduced motion, loading/error/offline states.
- Logo is a Symbolic K **shape reference only** until recolored signed-off production artwork exists. Don't certify screenshot-derived or placeholder marks.

Return measured passes, screenshots/test commands if available, defects with file/line and remediation. Never call a visual-only review a successful full-stack test.
