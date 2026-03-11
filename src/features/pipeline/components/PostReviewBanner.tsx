import { CheckCircle2, Sparkles } from 'lucide-react'

interface Props {
  onRegenerate: () => void
  isRegenerating: boolean
}

export function PostReviewBanner({ onRegenerate, isRegenerating }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
      <h3 className="text-lg font-semibold text-gray-800 mb-1">All caught up!</h3>
      <p className="text-sm text-gray-500 max-w-sm mb-4">
        You've reviewed all pending content. Need more? Ask Toby to generate a fresh batch.
      </p>
      <button
        onClick={onRegenerate}
        disabled={isRegenerating}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        {isRegenerating ? 'Generating...' : 'Generate more content'}
      </button>
    </div>
  )
}
