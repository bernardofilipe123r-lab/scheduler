/**
 * TobyMascot — Cute robot body that pulls out from behind the sidebar.
 * Eyes follow the user's mouse. Hands are rendered separately in the layout
 * at a higher z-index so they appear ON the sidebar surface.
 */
import { useEffect, useRef, useState } from 'react'

export function TobyMascot({ size = 44, className = '' }: { size?: number; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [eye, setEye] = useState({ x: 0, y: 0 })

  useEffect(() => {
    let raf = 0
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const svg = svgRef.current
        if (!svg) return
        const rect = svg.getBoundingClientRect()
        const cx = rect.left + rect.width * 0.5
        const cy = rect.top + rect.height * 0.3
        const dx = e.clientX - cx
        const dy = e.clientY - cy
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const max = 2
        const scale = Math.min(max, dist / 100 * max)
        setEye({ x: (dx / dist) * scale, y: (dy / dist) * scale })
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf) }
  }, [])

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 40 52"
      width={size * 40 / 52}
      height={size}
      className={className}
      role="img"
      aria-label="Toby mascot"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <radialGradient id="tg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tb" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#b0bec5" />
        </linearGradient>
        <linearGradient id="ts" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="100%" stopColor="#312e81" />
        </linearGradient>
      </defs>

      <style>{`
        @keyframes tp-pull {
          0%, 100% { transform: translateX(-22px); }
          25%, 75% { transform: translateX(2px); }
        }
        @keyframes tp-blink {
          0%, 46%, 48%, 100% { transform: scaleY(1); }
          47% { transform: scaleY(0.05); }
        }
        @keyframes tp-glow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        .tp-body { animation: tp-pull 8s ease-in-out infinite; }
        .tp-blink { transform-origin: center; animation: tp-blink 4.5s ease-in-out infinite; }
        .tp-glow { animation: tp-glow 2s ease-in-out infinite; }
      `}</style>

      <g className="tp-body">
        {/* Antenna */}
        <line x1="20" y1="5" x2="20" y2="1" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
        <circle className="tp-glow" cx="20" cy="0.5" r="2.5" fill="url(#tg)" />
        <circle cx="20" cy="0.5" r="1.5" fill="#a78bfa" />

        {/* Head — big round cute */}
        <rect x="3" y="5" width="34" height="22" rx="10" fill="url(#tb)" />
        <rect x="6" y="8" width="28" height="16" rx="7" fill="url(#ts)" />

        {/* Eyes — big cute, follow mouse */}
        <g className="tp-blink">
          <circle cx="15" cy="15" r="4" fill="#0f172a" />
          <circle cx={15 + eye.x} cy={15 + eye.y} r="2.8" fill="#38bdf8" />
          <circle cx={15.5 + eye.x * 0.4} cy={13.8 + eye.y * 0.3} r="1" fill="#fff" opacity="0.9" />

          <circle cx="25" cy="15" r="4" fill="#0f172a" />
          <circle cx={25 + eye.x} cy={15 + eye.y} r="2.8" fill="#38bdf8" />
          <circle cx={25.5 + eye.x * 0.4} cy={13.8 + eye.y * 0.3} r="1" fill="#fff" opacity="0.9" />
        </g>

        {/* Tiny smile */}
        <path d="M16 22 Q20 24.5 24 22" fill="none" stroke="#38bdf8" strokeWidth="1" strokeLinecap="round" opacity="0.6" />

        {/* Ear bolts */}
        <circle cx="3" cy="16" r="1.6" fill="#94a3b8" />
        <circle cx="37" cy="16" r="1.6" fill="#94a3b8" />

        {/* Body */}
        <rect x="8" y="29" width="24" height="13" rx="5" fill="url(#tb)" />
        <circle cx="20" cy="35" r="1.6" fill="#a78bfa" opacity="0.7" />

        {/* Feet */}
        <ellipse cx="14" cy="44" rx="3.5" ry="2.2" fill="#78909c" />
        <ellipse cx="26" cy="44" rx="3.5" ry="2.2" fill="#78909c" />
      </g>
    </svg>
  )
}

/** Tiny hand nubs that sit ON the sidebar surface (rendered at higher z-index) */
export function TobyHands({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 7 38" width={5} height={30} className={className} style={{ overflow: 'visible' }}>
      <style>{`
        @keyframes th-grip1 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-0.5px); } }
        @keyframes th-grip2 { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-0.5px); } }
        .th-t { animation: th-grip1 3s ease-in-out infinite; }
        .th-b { animation: th-grip2 3s ease-in-out infinite 0.4s; }
      `}</style>
      {/* Top hand — near head level */}
      <g className="th-t">
        <rect x="0" y="0" width="6" height="9" rx="2.5" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.4" />
        <line x1="1.2" y1="3" x2="4.5" y2="3" stroke="#94a3b8" strokeWidth="0.35" opacity="0.5" />
        <line x1="1.2" y1="5.5" x2="4.5" y2="5.5" stroke="#94a3b8" strokeWidth="0.35" opacity="0.5" />
      </g>
      {/* Bottom hand — near body level */}
      <g className="th-b">
        <rect x="0" y="24" width="6" height="9" rx="2.5" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.4" />
        <line x1="1.2" y1="27" x2="4.5" y2="27" stroke="#94a3b8" strokeWidth="0.35" opacity="0.5" />
        <line x1="1.2" y1="29.5" x2="4.5" y2="29.5" stroke="#94a3b8" strokeWidth="0.35" opacity="0.5" />
      </g>
    </svg>
  )
}
