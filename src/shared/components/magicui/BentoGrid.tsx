import { type ReactNode } from 'react'

interface BentoGridProps {
  children: ReactNode
  className?: string
}

export function BentoGrid({ children, className = '' }: BentoGridProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
      {children}
    </div>
  )
}

interface BentoCardProps {
  title: string
  description: string
  icon?: ReactNode
  className?: string
  children?: ReactNode
  gradient?: string
}

export function BentoCard({ title, description, icon, className = '', children, gradient }: BentoCardProps) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 transition-all duration-300 hover:shadow-xl hover:shadow-black/[0.04] hover:-translate-y-0.5 ${className}`}>
      {/* Spotlight effect on hover */}
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: gradient || 'radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(59,130,246,0.06), transparent 40%)' }} />
      <div className="relative z-10">
        {icon && <div className="mb-4">{icon}</div>}
        <h3 className="text-[18px] font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-[14px] text-gray-500 leading-relaxed mb-4">{description}</p>
        {children}
      </div>
    </div>
  )
}
