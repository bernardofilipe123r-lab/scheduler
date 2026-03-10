import { useEffect, useRef } from 'react'

interface AnimatedBeamProps {
  className?: string
  containerRef: React.RefObject<HTMLElement | null>
  fromRef: React.RefObject<HTMLElement | null>
  toRef: React.RefObject<HTMLElement | null>
  curvature?: number
  duration?: number
  pathColor?: string
  pathWidth?: number
  gradientStartColor?: string
  gradientStopColor?: string
}

export function AnimatedBeam({
  className = '',
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  duration = 2,
  pathColor = 'rgba(0,0,0,0.05)',
  pathWidth = 2,
  gradientStartColor = '#3b82f6',
  gradientStopColor = '#8b5cf6',
}: AnimatedBeamProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const id = useRef(`beam-${Math.random().toString(36).slice(2, 9)}`).current

  useEffect(() => {
    const update = () => {
      if (!containerRef.current || !fromRef.current || !toRef.current || !svgRef.current || !pathRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const fromRect = fromRef.current.getBoundingClientRect()
      const toRect = toRef.current.getBoundingClientRect()

      const x1 = fromRect.left + fromRect.width / 2 - containerRect.left
      const y1 = fromRect.top + fromRect.height / 2 - containerRect.top
      const x2 = toRect.left + toRect.width / 2 - containerRect.left
      const y2 = toRect.top + toRect.height / 2 - containerRect.top

      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2 + curvature

      pathRef.current.setAttribute('d', `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`)
      svgRef.current.setAttribute('width', `${containerRect.width}`)
      svgRef.current.setAttribute('height', `${containerRect.height}`)
    }
    update()
    const resizeObs = new ResizeObserver(update)
    if (containerRef.current) resizeObs.observe(containerRef.current)
    return () => resizeObs.disconnect()
  }, [containerRef, fromRef, toRef, curvature])

  return (
    <svg ref={svgRef} className={`pointer-events-none absolute left-0 top-0 ${className}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${id}-grad`} gradientUnits="userSpaceOnUse">
          <stop stopColor={gradientStartColor} stopOpacity="0" />
          <stop stopColor={gradientStartColor} offset="0.3" />
          <stop stopColor={gradientStopColor} offset="0.7" />
          <stop stopColor={gradientStopColor} stopOpacity="0" offset="1" />
        </linearGradient>
      </defs>
      <path ref={pathRef} d="" fill="none" stroke={pathColor} strokeWidth={pathWidth} />
      <path d="" fill="none" stroke={`url(#${id}-grad)`} strokeWidth={pathWidth} strokeLinecap="round">
        <animate attributeName="stroke-dasharray" from={`0 1000`} to={`50 1000`} dur={`${duration}s`} repeatCount="indefinite" />
        <animate attributeName="stroke-dashoffset" from="0" to="-150" dur={`${duration}s`} repeatCount="indefinite" />
      </path>
    </svg>
  )
}
