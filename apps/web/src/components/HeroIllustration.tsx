/**
 * Original hero vector: a phone with a shield-and-heart (privacy + care), a clinic pin card, a calendar card and
 * leaf shapes echoing the Symbolic K. Layers are separate <g> groups: `.px-*` groups drift with scroll (CSS only,
 * desktop and no-preference only), `.float` groups idle gently. Colours come from tokens via classes (see landing.css).
 * Decorative: the surrounding figure carries the accessible description.
 */
export function HeroIllustration() {
  return (
    <svg className="hero-art" viewBox="0 0 560 560" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ha-blob" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="ha-stop-violet" />
          <stop offset="1" className="ha-stop-plum" />
        </linearGradient>
        <linearGradient id="ha-phone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="ha-stop-royal" />
          <stop offset="1" className="ha-stop-midnight" />
        </linearGradient>
        <linearGradient id="ha-shield" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="ha-stop-vivid" />
          <stop offset="1" className="ha-stop-electric" />
        </linearGradient>
        <linearGradient id="ha-warm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="ha-stop-rose" />
          <stop offset="1" className="ha-stop-coral" />
        </linearGradient>
      </defs>

      <g className="px-back">
        <circle cx="280" cy="290" r="230" fill="url(#ha-blob)" opacity="0.55" />
        <circle cx="280" cy="290" r="262" fill="none" className="ha-ring" strokeWidth="1.5" strokeDasharray="4 10" />
        <circle cx="96" cy="120" r="10" fill="url(#ha-warm)" />
        <circle cx="478" cy="470" r="14" className="ha-dot" />
        <circle cx="520" cy="190" r="6" className="ha-dot" />
      </g>

      <g className="px-mid">
        <rect x="170" y="64" width="220" height="432" rx="38" fill="url(#ha-phone)" className="ha-phone-edge" strokeWidth="3" />
        <rect x="184" y="78" width="192" height="404" rx="28" className="ha-screen" />
        <rect x="242" y="90" width="76" height="14" rx="7" className="ha-notch" />
        <path d="M280 150 L334 170 V232 C334 270 312 296 280 310 C248 296 226 270 226 232 V170 Z" fill="url(#ha-shield)" />
        <path d="M280 276 L260 256 A12 12 0 0 1 280 241 A12 12 0 0 1 300 256 Z" className="ha-heart" />
        <rect x="210" y="338" width="140" height="12" rx="6" className="ha-line" />
        <rect x="226" y="362" width="108" height="12" rx="6" className="ha-line ha-line--soft" />
        <rect x="214" y="406" width="132" height="44" rx="22" fill="url(#ha-shield)" />
        <rect x="244" y="424" width="72" height="8" rx="4" className="ha-btn-line" />
      </g>

      <g className="px-front">
        <g className="float float--a">
          <rect x="58" y="330" width="150" height="76" rx="20" className="ha-card" />
          <circle cx="96" cy="368" r="20" fill="url(#ha-warm)" />
          <path d="M96 378 C88 369 85 365 85 361 A11 11 0 0 1 107 361 C107 365 104 369 96 378 Z" className="ha-pin" />
          <circle cx="96" cy="361" r="4" fill="url(#ha-warm)" />
          <rect x="126" y="356" width="64" height="9" rx="4.5" className="ha-line" />
          <rect x="126" y="374" width="44" height="9" rx="4.5" className="ha-line ha-line--soft" />
        </g>
        <g className="float float--b">
          <rect x="360" y="150" width="140" height="72" rx="20" className="ha-card" />
          <rect x="378" y="168" width="36" height="36" rx="11" fill="url(#ha-shield)" />
          <path d="M388 187 L394 193 L405 181" className="ha-check" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="424" y="172" width="58" height="9" rx="4.5" className="ha-line" />
          <rect x="424" y="190" width="40" height="9" rx="4.5" className="ha-line ha-line--soft" />
        </g>
        <g className="float float--c">
          <path d="M400 330 C440 300 486 296 520 306 C508 350 464 384 410 380 C396 370 392 346 400 330 Z" fill="url(#ha-warm)" />
          <path d="M404 372 C430 340 470 320 520 306" fill="none" className="ha-vein" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="float float--d">
          <path d="M60 220 C84 176 130 156 176 160 C170 206 130 244 84 246 C66 240 56 232 60 220 Z" className="ha-leaf" />
          <circle cx="470" cy="86" r="22" fill="url(#ha-warm)" />
        </g>
      </g>
    </svg>
  );
}
