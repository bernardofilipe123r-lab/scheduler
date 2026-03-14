import { Copy } from 'lucide-react'

export function CaptionCard({ platform, color, subtitle, content, onCopy }: {
  platform: string
  color: string
  subtitle?: string
  content: string
  onCopy: () => void
}) {
  return (
    <div className="bg-white rounded-lg p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${color}`} />
          <span className="text-sm font-medium text-gray-700">{platform}</span>
          {subtitle && <span className="text-[10px] text-gray-400">({subtitle})</span>}
        </div>
        <button onClick={onCopy} className="p-1 rounded hover:bg-gray-50">
          <Copy className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{content}</p>
      </div>
    </div>
  )
}
