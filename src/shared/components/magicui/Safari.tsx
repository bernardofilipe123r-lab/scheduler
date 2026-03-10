import { type ReactNode } from 'react'

interface SafariProps {
  url?: string
  className?: string
  children?: ReactNode
  imageSrc?: string
  width?: number
  height?: number
}

export function Safari({ url = 'viraltoby.com', className = '', children, imageSrc, width = 1203, height = 753 }: SafariProps) {
  return (
    <div className={`relative rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden ${className}`}>
      {/* Safari toolbar */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-4 py-3">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-4 py-1.5 min-w-[260px] justify-center">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            <span className="text-[12px] text-gray-500">{url}</span>
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="relative" style={{ aspectRatio: children ? undefined : `${width}/${height}` }}>
        {imageSrc ? (
          <img src={imageSrc} alt="Screenshot" className="w-full h-full object-cover object-top" />
        ) : children}
      </div>
    </div>
  )
}
