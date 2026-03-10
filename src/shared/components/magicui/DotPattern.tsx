interface DotPatternProps {
  className?: string
  cr?: number
  cx?: number
  cy?: number
  width?: number
  height?: number
}

export function DotPattern({ className = '', width = 16, height = 16, cx = 1, cy = 1, cr = 1 }: DotPatternProps) {
  const id = `dot-pattern-${Math.random().toString(36).slice(2, 9)}`
  return (
    <svg className={`pointer-events-none absolute inset-0 h-full w-full fill-gray-300/30 ${className}`} aria-hidden="true">
      <defs>
        <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse">
          <circle cx={cx} cy={cy} r={cr} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  )
}
