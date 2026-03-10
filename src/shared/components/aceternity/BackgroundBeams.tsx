export function BackgroundBeams({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="beam-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="beam-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[
          { d: 'M0,200 Q400,100 800,300 T1600,200', grad: 'beam-grad-1', dur: '8s', delay: '0s' },
          { d: 'M0,400 Q300,200 600,400 T1200,300', grad: 'beam-grad-2', dur: '10s', delay: '1s' },
          { d: 'M0,100 Q500,300 1000,100 T2000,200', grad: 'beam-grad-1', dur: '12s', delay: '2s' },
          { d: 'M0,500 Q400,300 800,500 T1600,400', grad: 'beam-grad-2', dur: '9s', delay: '0.5s' },
          { d: 'M0,300 Q600,100 1200,400 T1800,300', grad: 'beam-grad-1', dur: '11s', delay: '1.5s' },
        ].map((beam, i) => (
          <g key={i}>
            <path d={beam.d} fill="none" stroke={`url(#${beam.grad})`} strokeWidth="1.5" opacity="0.6">
              <animate attributeName="d" dur={beam.dur} repeatCount="indefinite" begin={beam.delay}
                values={`${beam.d};${beam.d.replace(/Q\d+/g, (m) => `Q${parseInt(m.slice(1)) + 100}`)};${beam.d}`} />
            </path>
            <circle r="2" fill="#3b82f6" opacity="0.4">
              <animateMotion dur={beam.dur} repeatCount="indefinite" begin={beam.delay}>
                <mpath href={`#beam-path-${i}`} />
              </animateMotion>
            </circle>
            <path id={`beam-path-${i}`} d={beam.d} fill="none" />
          </g>
        ))}
      </svg>
    </div>
  )
}
