import { type ReactNode } from 'react'

interface ShimmerButtonProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  shimmerColor?: string
  shimmerSize?: string
  background?: string
}

export function ShimmerButton({ children, className = '', onClick, shimmerColor = '#ffffff', shimmerSize = '0.1em', background = 'linear-gradient(135deg, #3b82f6, #2563eb, #4f46e5)' }: ShimmerButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`group relative inline-flex items-center justify-center overflow-hidden rounded-xl px-8 py-3.5 font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_40px_-10px_rgba(59,130,246,0.5)] active:scale-[0.98] ${className}`}
      style={{ background }}
    >
      <span className="absolute inset-0 overflow-hidden rounded-xl">
        <span
          className="absolute inset-[-100%] animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{ '--shimmer-color': shimmerColor, '--shimmer-size': shimmerSize } as React.CSSProperties}
        />
      </span>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  )
}
