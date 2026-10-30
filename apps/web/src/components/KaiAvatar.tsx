import { useId } from 'react';

/**
 * KAI (Kalinga AI) mark: a green squircle holding the Symbolic K (stem plus two leaves, echoing the KALINGA logo)
 * with an amber four-point spark for the "AI". Decorative; the surrounding control carries the accessible name.
 */
export function KaiAvatar({ size = 40, online = false }: { size?: 28 | 32 | 40 | 44; online?: boolean }) {
  const uid = useId();
  const bg = `${uid}-bg`;
  const leaf = `${uid}-leaf`;
  return (
    <span className={`kai-avatar kai-avatar--${size}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={size} height={size} focusable="false">
        <defs>
          <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="kai-stop-forest" />
            <stop offset="1" className="kai-stop-green" />
          </linearGradient>
          <linearGradient id={leaf} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" className="kai-stop-gold" />
            <stop offset="1" className="kai-stop-amber" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="20" fill={`url(#${bg})`} />
        <rect x="19" y="17" width="7.5" height="31" rx="3.75" className="kai-k" />
        <path d="M28 34 C33 27 39 22 47 20 C47.5 28 41 34 32 37 Z" fill={`url(#${leaf})`} />
        <path d="M28 34 C36 35 43 39 47 47 C38 48.5 30.5 44.5 28 34 Z" className="kai-k kai-k--soft" />
        <path d="M49 8 L50.5 12.5 L55 14 L50.5 15.5 L49 20 L47.5 15.5 L43 14 L47.5 12.5 Z" className="kai-spark" />
      </svg>
      {online && <span className="kai-avatar__dot" />}
    </span>
  );
}
