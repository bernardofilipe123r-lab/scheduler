/**
 * TobyMascot — Cute robot peeking from behind the sidebar.
 * Eyes follow the user's mouse. Body slides in/out.
 */
import { useEffect, useRef, useState } from 'react'

export function TobyMascot({ size = 60, className = '' }: { size?: number; className?: string }) {
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
        // Eye center in screen coords (roughly where the eyes are in the SVG)
        const cx = rect.left + rect.width * 0.55
        const cy = rect.top + rect.height * 0.32
        const dx = e.clientX - cx
        const dy = e.clientY - cy
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const max = 2.5
        const scale = Math.min(max, dist / 80 * max) // Stronger when far
        setEye({
          x: (dx / dist) * scale,
          y: (dy / dist) * scale,
        })
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  const w = (size * 55) / 70
  const h = size

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 55 70"
      width={w}
      height={h}
      className={className}
      role="img"
      aria-label="Toby mascot peeking"
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
        @keyframes tp-slide {
          0%, 100% { transform: translateX(-8px); }
          30%, 70% { transform: translateX(0px); }
        }
        @keyframes tp-blink {
          0%, 46%, 48%, 100% { transform: scaleY(1); }
          47% { transform: scaleY(0.05); }
        }
        @keyframes tp-glow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes tp-grip {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(0.4px); }
        }
        .tp-body { animation: tp-slide 7s ease-in-out infinite; }
        .tp-blink { transform-origin: center; animation: tp-blink 4.5s ease-in-out infinite; }
        .tp-glow { animation: tp-glow 2s ease-in-out infinite; }
        .tp-hand-t { animation: tp-grip 2.8s ease-in-out infinite; }
        .tp-hand-b { animation: tp-grip 2.8s ease-in-out infinite 0.3s; }
      `}</style>

      {/* ═══ BODY GROUP — slides in/out ═══ */}
      <g className="tp-body">
        {/* Antenna */}
        <line x1="30" y1="8" x2="30" y2="2" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" />
        <circle className="tp-glow" cx="30" cy="1.5" r="3.5" fill="url(#tg)" />
        <circle cx="30" cy="1.5" r="2" fill="#a78bfa" />

        {/* Head — big and round for cuteness */}
        <rect x="10" y="8" width="40" height="30" rx="12" fill="url(#tb)" />
        {/* Face screen */}
        <rect x="13" y="11" width="34" height="24" rx="9" fill="url(#ts)" />

        {/* Eyes — big, cute, follow mouse */}
        <g className="tp-blink">
          {/* Left eye socket */}
          <circle cx="24" cy="22" r="5.5" fill="#0f172a" />
          {/* Left pupil — follows mouse */}
          <circle cx={24 + eye.x} cy={22 + eye.y} r="3.5" fill="#38bdf8" />
          <circle cx={24.8 + eye.x * 0.5} cy={20.5 + eye.y * 0.3} r="1.3" fill="#fff" opacity="0.9" />

          {/* Right eye socket */}
          <circle cx="37" cy="22" r="5.5" fill="#0f172a" />
          {/* Right pupil — follows mouse */}
          <circle cx={37 + eye.x} cy={22 + eye.y} r="3.5" fill="#38bdf8" />
          <circle cx={37.8 + eye.x * 0.5} cy={20.5 + eye.y * 0.3} r="1.3" fill="#fff" opacity="0.9" />
        </g>

        {/* Tiny smile */}
        <path d="M26 30 Q30.5 33 35 30" fill="none" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />

        {/* Ear bolts */}
        <circle cx="10" cy="23" r="2.2" fill="#94a3b8" />
        <circle cx="50" cy="23" r="2.2" fill="#94a3b8" />

        {/* Body — small and compact */}
        <rect x="16" y="40" width="28" height="18" rx="7" fill="url(#tb)" />
        {/* Chest light */}
        <circle cx="30" cy="48" r="2.2" fill="#a78bfa" opacity="0.7" />
        <circle cx="30" cy="48" r="1.2" fill="#c4b5fd" />

        {/* Tiny feet */}
        <ellipse cx="23" cy="60" rx="4.5" ry="3" fill="#78909c" />
        <ellipse cx="37" cy="60" rx="4.5" ry="3" fill="#78909c" />
      </g>

      {/* ═══ HANDS — stay fixed, grip the sidebar edge at x≈0 ═══ */}
      {/* Top hand */}
      <g className="tp-hand-t">
        <rect x="2" y="14" width="12" height="5.5" rx="2.8" fill="#b0bec5" />
        <rect x="-2" y="11" width="7" height="11" rx="3" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.4" />
        <line x1="0" y1="14.5" x2="3.5" y2="14.5" stroke="#94a3b8" strokeWidth="0.4" opacity="0.6" />
        <line x1="0" y1="17" x2="3.5" y2="17" stroke="#94a3b8" strokeWidth="0.4" opacity="0.6" />
        <line x1="0" y1="19.5" x2="3.5" y2="19.5" stroke="#94a3b8" strokeWidth="0.4" opacity="0.6" />
      </g>

      {/* Bottom hand */}
      <g className="tp-hand-b">
        <rect x="2" y="44" width="12" height="5.5" rx="2.8" fill="#b0bec5" />
        <rect x="-2" y="41" width="7" height="11" rx="3" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="0.4" />
        <line x1="0" y1="44.5" x2="3.5" y2="44.5" stroke="#94a3b8" strokeWidth="0.4" opacity="0.6" />
        <line x1="0" y1="47" x2="3.5" y2="47" stroke="#94a3b8" strokeWidth="0.4" opacity="0.6" />
        <line x1="0" y1="49.5" x2="3.5" y2="49.5" stroke="#94a3b8" strokeWidth="0.4" opacity="0.6" />
      </g>
    </svg>
  )
}
