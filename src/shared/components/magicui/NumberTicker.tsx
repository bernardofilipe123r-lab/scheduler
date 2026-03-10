import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'

interface NumberTickerProps {
  value: number
  direction?: 'up' | 'down'
  delay?: number
  className?: string
  suffix?: string
  prefix?: string
  decimalPlaces?: number
}

export function NumberTicker({ value, direction = 'up', delay = 0, className = '', suffix = '', prefix = '', decimalPlaces = 0 }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [displayValue, setDisplayValue] = useState(direction === 'down' ? value : 0)

  useEffect(() => {
    if (!inView) return
    const timeout = setTimeout(() => {
      const start = direction === 'down' ? value : 0
      const end = direction === 'down' ? 0 : value
      const duration = 2000
      const startTime = performance.now()

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3)
        const current = start + (end - start) * eased
        setDisplayValue(Number(current.toFixed(decimalPlaces)))
        if (progress < 1) requestAnimationFrame(animate)
      }
      requestAnimationFrame(animate)
    }, delay * 1000)
    return () => clearTimeout(timeout)
  }, [inView, value, direction, delay, decimalPlaces])

  return (
    <span ref={ref} className={className}>
      {prefix}{displayValue.toLocaleString(undefined, { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })}{suffix}
    </span>
  )
}
