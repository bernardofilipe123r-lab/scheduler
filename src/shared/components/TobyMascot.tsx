/**
 * TobyMascot — Animated SVG robot mascot for the sidebar.
 * A friendly little agent that waves on hover.
 */
export function TobyMascot({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Toby mascot"
    >
      <defs>
        {/* Glow for the antenna */}
        <radialGradient id="toby-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </radialGradient>
        {/* Body gradient */}
        <linearGradient id="toby-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        {/* Face screen gradient */}
        <linearGradient id="toby-screen" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#312e81" />
        </linearGradient>
      </defs>

      <style>{`
        @keyframes toby-wave {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(-25deg); }
          30% { transform: rotate(15deg); }
          45% { transform: rotate(-20deg); }
          60% { transform: rotate(10deg); }
          75% { transform: rotate(-10deg); }
        }
        @keyframes toby-blink {
          0%, 42%, 44%, 96%, 98%, 100% { transform: scaleY(1); }
          43%, 97% { transform: scaleY(0.1); }
        }
        @keyframes toby-antenna-pulse {
          0%, 100% { opacity: 0.5; r: 6; }
          50% { opacity: 1; r: 8; }
        }
        @keyframes toby-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1.5px); }
        }
        .toby-group {
          animation: toby-float 3s ease-in-out infinite;
        }
        .toby-arm-right {
          transform-origin: 76px 52px;
        }
        svg:hover .toby-arm-right,
        .group:hover .toby-arm-right {
          animation: toby-wave 0.8s ease-in-out;
        }
        .toby-eyes {
          transform-origin: center;
          animation: toby-blink 4s ease-in-out infinite;
        }
        .toby-antenna-glow {
          animation: toby-antenna-pulse 2s ease-in-out infinite;
        }
      `}</style>

      <g className="toby-group">
        {/* Antenna */}
        <line x1="50" y1="22" x2="50" y2="12" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
        <circle className="toby-antenna-glow" cx="50" cy="10" r="6" fill="url(#toby-glow)" />
        <circle cx="50" cy="10" r="3.5" fill="#a78bfa" />

        {/* Head / Face screen */}
        <rect x="26" y="22" width="48" height="38" rx="12" fill="url(#toby-body)" />
        <rect x="30" y="26" width="40" height="30" rx="8" fill="url(#toby-screen)" />

        {/* Eyes */}
        <g className="toby-eyes">
          <circle cx="41" cy="39" r="4" fill="#38bdf8" />
          <circle cx="59" cy="39" r="4" fill="#38bdf8" />
          {/* Eye shine */}
          <circle cx="42.5" cy="37.5" r="1.5" fill="#fff" opacity="0.8" />
          <circle cx="60.5" cy="37.5" r="1.5" fill="#fff" opacity="0.8" />
        </g>

        {/* Smile */}
        <path d="M42 47 Q50 52 58 47" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" />

        {/* Body */}
        <rect x="32" y="62" width="36" height="22" rx="8" fill="url(#toby-body)" />
        {/* Chest light */}
        <circle cx="50" cy="72" r="3" fill="#a78bfa" opacity="0.7" />

        {/* Left arm */}
        <rect x="18" y="64" width="12" height="6" rx="3" fill="#94a3b8" />

        {/* Right arm (waves on hover) */}
        <g className="toby-arm-right">
          <rect x="70" y="64" width="12" height="6" rx="3" fill="#94a3b8" />
        </g>

        {/* Feet */}
        <rect x="35" y="84" width="10" height="6" rx="3" fill="#94a3b8" />
        <rect x="55" y="84" width="10" height="6" rx="3" fill="#94a3b8" />
      </g>
    </svg>
  )
}
