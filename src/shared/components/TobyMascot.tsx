/**
 * TobyMascot — Robot peeking from behind the sidebar edge.
 * Positioned on the right edge of the sidebar, hands gripping the edge,
 * body sliding in/out (40→70%) like peeking around a wall.
 */
export function TobyMascot({ size = 120, className = '' }: { size?: number; className?: string }) {
  // The SVG is drawn with the "wall edge" on the left side.
  // The robot peeks from behind it to the right.
  // viewBox is wide enough to show the full robot body when at 70%.
  return (
    <svg
      viewBox="0 0 80 130"
      width={(size * 80) / 130}
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
        <linearGradient id="toby-body-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id="toby-screen" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#312e81" />
        </linearGradient>
        <linearGradient id="toby-arm-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#b0bec5" />
        </linearGradient>
      </defs>

      <style>{`
        @keyframes toby-slide-peek {
          0%, 100% { transform: translateX(-12px); }
          35%, 65% { transform: translateX(0px); }
        }
        @keyframes toby-eye-look {
          0%, 25% { transform: translateX(0); }
          30%, 55% { transform: translateX(1.5px); }
          60%, 85% { transform: translateX(-1px); }
          90%, 100% { transform: translateX(0); }
        }
        @keyframes toby-blink {
          0%, 46%, 48%, 100% { transform: scaleY(1); }
          47% { transform: scaleY(0.08); }
        }
        @keyframes toby-antenna-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes toby-hand-grip {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(0.5px); }
        }
        .toby-peek-body {
          animation: toby-slide-peek 8s ease-in-out infinite;
        }
        .toby-pupils {
          animation: toby-eye-look 8s ease-in-out infinite;
        }
        .toby-eye-blink {
          transform-origin: center;
          animation: toby-blink 5s ease-in-out infinite;
        }
        .toby-glow-anim {
          animation: toby-antenna-glow 2.5s ease-in-out infinite;
        }
        .toby-hand-top {
          animation: toby-hand-grip 3s ease-in-out infinite;
        }
        .toby-hand-bottom {
          animation: toby-hand-grip 3s ease-in-out infinite 0.4s;
        }
      `}</style>

      {/* ═══ SLIDING BODY GROUP ═══ */}
      {/* This whole group slides left/right for the peek animation */}
      <g className="toby-peek-body">

        {/* ── Antenna ── */}
        <line x1="40" y1="14" x2="40" y2="4" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
        <circle className="toby-glow-anim" cx="40" cy="3" r="5" fill="url(#toby-glow)" />
        <circle cx="40" cy="3" r="3" fill="#a78bfa" />

        {/* ── Head ── */}
        <rect x="14" y="14" width="52" height="40" rx="13" fill="url(#toby-body-grad)" />
        {/* Face screen */}
        <rect x="18" y="18" width="44" height="32" rx="9" fill="url(#toby-screen)" />

        {/* ── Eyes (suspicious squint) ── */}
        <g className="toby-eye-blink">
          <g className="toby-pupils">
            {/* Left eye */}
            <ellipse cx="32" cy="33" rx="5.5" ry="4" fill="#0f172a" />
            <ellipse cx="32" cy="33" rx="4" ry="3" fill="#38bdf8" />
            <circle cx="33.5" cy="31.5" r="1.3" fill="#fff" opacity="0.9" />
            {/* Right eye */}
            <ellipse cx="50" cy="33" rx="5.5" ry="4" fill="#0f172a" />
            <ellipse cx="50" cy="33" rx="4" ry="3" fill="#38bdf8" />
            <circle cx="51.5" cy="31.5" r="1.3" fill="#fff" opacity="0.9" />
          </g>
        </g>

        {/* Eyebrows — suspicious/curious angle */}
        <line x1="26" y1="26" x2="38" y2="27.5" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
        <line x1="56" y1="26" x2="44" y2="27.5" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />

        {/* Ear bolts */}
        <circle cx="14" cy="34" r="3" fill="#78909c" />
        <circle cx="66" cy="34" r="3" fill="#78909c" />

        {/* ── Body / Torso ── */}
        <rect x="20" y="56" width="40" height="32" rx="10" fill="url(#toby-body-grad)" />
        {/* Chest light */}
        <circle cx="40" cy="70" r="3.5" fill="#a78bfa" opacity="0.6" />
        <circle cx="40" cy="70" r="2" fill="#a78bfa" opacity="0.9" />

        {/* ── Wheels / Feet ── */}
        <ellipse cx="30" cy="92" rx="7" ry="5" fill="#546e7a" />
        <ellipse cx="30" cy="92" rx="5" ry="3.5" fill="#37474f" />
        <ellipse cx="50" cy="92" rx="7" ry="5" fill="#546e7a" />
        <ellipse cx="50" cy="92" rx="5" ry="3.5" fill="#37474f" />
      </g>

      {/* ═══ HANDS GRIPPING THE SIDEBAR EDGE ═══ */}
      {/* These stay fixed (don't slide) — they grip the "wall" at x=0 */}

      {/* ── Top hand ── gripping near the head */}
      <g className="toby-hand-top">
        {/* Arm segment connecting to body */}
        <rect x="0" y="18" width="18" height="8" rx="4" fill="url(#toby-arm-grad)" />
        {/* Hand/fist gripping the edge */}
        <rect x="-4" y="15" width="10" height="14" rx="4" fill="#b0bec5" stroke="#94a3b8" strokeWidth="0.5" />
        {/* Finger details */}
        <line x1="-2" y1="19" x2="4" y2="19" stroke="#94a3b8" strokeWidth="0.6" opacity="0.5" />
        <line x1="-2" y1="22" x2="4" y2="22" stroke="#94a3b8" strokeWidth="0.6" opacity="0.5" />
        <line x1="-2" y1="25" x2="4" y2="25" stroke="#94a3b8" strokeWidth="0.6" opacity="0.5" />
      </g>

      {/* ── Bottom hand ── gripping near the torso */}
      <g className="toby-hand-bottom">
        {/* Arm segment */}
        <rect x="0" y="72" width="18" height="8" rx="4" fill="url(#toby-arm-grad)" />
        {/* Hand/fist */}
        <rect x="-4" y="69" width="10" height="14" rx="4" fill="#b0bec5" stroke="#94a3b8" strokeWidth="0.5" />
        {/* Finger details */}
        <line x1="-2" y1="73" x2="4" y2="73" stroke="#94a3b8" strokeWidth="0.6" opacity="0.5" />
        <line x1="-2" y1="76" x2="4" y2="76" stroke="#94a3b8" strokeWidth="0.6" opacity="0.5" />
        <line x1="-2" y1="79" x2="4" y2="79" stroke="#94a3b8" strokeWidth="0.6" opacity="0.5" />
      </g>
    </svg>
  )
}
