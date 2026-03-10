import { useEffect, useRef, useState } from 'react'

interface InfiniteMovingCardsProps {
  items: { quote: string; name: string; title: string; metric?: string }[]
  direction?: 'left' | 'right'
  speed?: 'fast' | 'normal' | 'slow'
  className?: string
}

export function InfiniteMovingCards({ items, direction = 'left', speed = 'normal', className = '' }: InfiniteMovingCardsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !scrollerRef.current) return
    const scrollerContent = Array.from(scrollerRef.current.children)
    scrollerContent.forEach((item) => {
      const duplicatedItem = item.cloneNode(true)
      scrollerRef.current!.appendChild(duplicatedItem)
    })

    const duration = speed === 'fast' ? '20s' : speed === 'normal' ? '40s' : '60s'
    containerRef.current.style.setProperty('--animation-duration', duration)
    containerRef.current.style.setProperty('--animation-direction', direction === 'left' ? 'forwards' : 'reverse')
    setStart(true)
  }, [direction, speed])

  return (
    <div ref={containerRef} className={`scroller relative z-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_10%,white_90%,transparent)] ${className}`}>
      <div
        ref={scrollerRef}
        className={`flex min-w-full shrink-0 gap-4 py-4 w-max flex-nowrap ${start ? 'animate-[scroll_var(--animation-duration)_linear_infinite_var(--animation-direction)]' : ''}`}
      >
        {items.map((item, idx) => (
          <div
            key={idx}
            className="w-[350px] max-w-full relative rounded-2xl border border-gray-200 bg-white p-6 flex-shrink-0 shadow-sm hover:shadow-lg transition-shadow"
          >
            <div className="text-[14px] text-gray-600 leading-relaxed mb-4">"{item.quote}"</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[14px] font-semibold text-gray-900">{item.name}</div>
                <div className="text-[12px] text-gray-400">{item.title}</div>
              </div>
              {item.metric && (
                <span className="text-[12px] font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{item.metric}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
