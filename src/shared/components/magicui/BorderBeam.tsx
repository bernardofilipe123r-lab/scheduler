interface BorderBeamProps {
  className?: string
  size?: number
  duration?: number
  delay?: number
  colorFrom?: string
  colorTo?: string
}

export function BorderBeam({
  className = '',
  size = 200,
  duration = 12,
  delay = 0,
  colorFrom = '#6C5CE7',
  colorTo = '#00D2FF',
}: BorderBeamProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 rounded-[inherit] ${className}`}>
      <div
        className="absolute inset-0 rounded-[inherit] [mask-composite:exclude] [mask:linear-gradient(#fff_0_0)_content-box,linear-gradient(#fff_0_0)]"
        style={{ padding: '1.5px' }}
      >
        <div
          className="absolute inset-[-200%] animate-[border-beam-spin_var(--duration)_linear_infinite]"
          style={{
            '--duration': `${duration}s`,
            animationDelay: `${delay}s`,
            background: `conic-gradient(from 0deg, transparent 0%, transparent 25%, ${colorFrom} 35%, ${colorTo} 50%, transparent 60%, transparent 100%)`,
            width: `${size}%`,
            height: `${size}%`,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          } as React.CSSProperties}
        />
      </div>
    </div>
  )
}
