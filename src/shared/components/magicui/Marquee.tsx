import { type ReactNode } from 'react'

interface MarqueeProps {
  children: ReactNode
  className?: string
  reverse?: boolean
  pauseOnHover?: boolean
  speed?: number
}

export function Marquee({ children, className = '', reverse = false, pauseOnHover = false, speed = 40 }: MarqueeProps) {
  return (
    <div className={`group flex overflow-hidden [--gap:1rem] ${className}`}>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className={`flex shrink-0 items-center justify-around gap-[--gap] ${pauseOnHover ? 'group-hover:[animation-play-state:paused]' : ''}`}
          style={{
            animation: `marquee ${speed}s linear infinite ${reverse ? 'reverse' : ''}`,
          }}
        >
          {children}
        </div>
      ))}
    </div>
  )
}
