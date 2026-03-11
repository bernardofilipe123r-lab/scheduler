/**
 * TobyMascot — Peeking spy robot that grips the sidebar edge.
 * Inspired by the classic "peeking over a wall" pose:
 * fingers gripping the top, head tilted diagonally, eyes darting suspiciously.
 */
export function TobyMascot({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 90 100"
      width={size * 0.9}
      height={size}
      className={className}
      role="img"
      aria-label="Toby mascot peeking"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <radialGradient id="toby-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="toby-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id="toby-screen" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#312e81" />
        </linearGradient>
      </defs>

      <style>{`
        @keyframes toby-peek {
          0%, 100% { transform: translateY(6px); }
          20%, 80% { transform: translateY(0px); }
        }
        @keyframes toby-eye-dart {
          0%, 30% { transform: translateX(0); }
          35%, 50% { transform: translateX(-2.5px); }
          55%, 70% { transform: translateX(2px); }
          75%, 100% { transform: translateX(0); }
        }
        @keyframes toby-blink {
          0%, 44%, 46%, 100% { transform: scaleY(1); }
          45% { transform: scaleY(0.1); }
        }
        @keyframes toby-antenna-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes toby-finger-grip {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-0.8px); }
        }
        .toby-peek-group {
          animation: toby-peek 5s ease-in-out infinite;
          transform-origin: center bottom;
        }
        .toby-eye-pupils {
          animation: toby-eye-dart 5s ease-in-out infinite;
        }
        .toby-eye-blink {
          transform-origin: center;
          animation: toby-blink 4s ease-in-out infinite;
        }
        .toby-antenna-glow {
          animation: toby-antenna-pulse 2s ease-in-out infinite;
        }
        .toby-fingers-left {
          animation: toby-finger-grip 2.5s ease-in-out infinite;
        }
        .toby-fingers-right {
          animation: toby-finger-grip 2.5s ease-in-out infinite 0.3s;
        }
      `}</style>

      {/* The whole peeking group — tilted diagonally */}
      <g className="toby-peek-group" transform="rotate(-8, 45, 95)">

        {/* === FINGERS gripping the ledge (bottom of viewbox) === */}
        {/* Left hand fingers — 4 fingers curling over the edge */}
        <g className="toby-fingers-left">
          <rect x="16" y="88" width="5" height="10" rx="2.5" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.5" />
          <rect x="22" y="86" width="5" height="12" rx="2.5" fill="#d1d5db" stroke="#94a3b8" strokeWidth="0.5" />
          <rect x="28" y="87" width="5" height="11" rx="2.5" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.5" />
          <rect x="34" y="89" width="4.5" height="9" rx="2.2" fill="#d1d5db" stroke="#94a3b8" strokeWidth="0.5" />
        </g>

        {/* Right hand fingers */}
        <g className="toby-fingers-right">
          <rect x="50" y="89" width="4.5" height="9" rx="2.2" fill="#d1d5db" stroke="#94a3b8" strokeWidth="0.5" />
          <rect x="55" y="87" width="5" height="11" rx="2.5" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.5" />
          <rect x="61" y="86" width="5" height="12" rx="2.5" fill="#d1d5db" stroke="#94a3b8" strokeWidth="0.5" />
          <rect x="67" y="88" width="5" height="10" rx="2.5" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.5" />
        </g>

        {/* === ARM stubs connecting fingers to body === */}
        <rect x="20" y="78" width="18" height="12" rx="5" fill="url(#toby-body)" />
        <rect x="52" y="78" width="18" height="12" rx="5" fill="url(#toby-body)" />

        {/* === HEAD — peeking over the edge === */}
        {/* Main head shape */}
        <rect x="18" y="28" width="54" height="42" rx="14" fill="url(#toby-body)" />

        {/* Face screen */}
        <rect x="22" y="32" width="46" height="34" rx="10" fill="url(#toby-screen)" />

        {/* Antenna */}
        <line x1="45" y1="28" x2="45" y2="16" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
        <circle className="toby-antenna-glow" cx="45" cy="14" r="5" fill="url(#toby-glow)" />
        <circle cx="45" cy="14" r="3" fill="#a78bfa" />

        {/* === EYES — suspicious, darting look === */}
        <g className="toby-eye-blink">
          <g className="toby-eye-pupils">
            {/* Left eye — slightly squinted (suspicious) */}
            <ellipse cx="36" cy="46" rx="6" ry="4.5" fill="#0f172a" />
            <ellipse cx="36" cy="46" rx="4.5" ry="3.5" fill="#38bdf8" />
            <circle cx="37.5" cy="44.5" r="1.5" fill="#fff" opacity="0.9" />

            {/* Right eye — slightly squinted */}
            <ellipse cx="56" cy="46" rx="6" ry="4.5" fill="#0f172a" />
            <ellipse cx="56" cy="46" rx="4.5" ry="3.5" fill="#38bdf8" />
            <circle cx="57.5" cy="44.5" r="1.5" fill="#fff" opacity="0.9" />
          </g>
        </g>

        {/* Suspicious eyebrow lines — slightly angled */}
        <line x1="30" y1="38" x2="42" y2="39.5" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
        <line x1="62" y1="38" x2="50" y2="39.5" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />

        {/* No mouth — just eyes peeking, adds to the spy mystery */}

        {/* Ear bolts */}
        <circle cx="18" cy="48" r="3" fill="#94a3b8" />
        <circle cx="72" cy="48" r="3" fill="#94a3b8" />
      </g>
    </svg>
  )
}
