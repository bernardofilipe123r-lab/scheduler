import { CheckCircle2 } from 'lucide-react'

export function PostReviewBanner() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
      <h3 className="text-lg font-semibold text-gray-800 mb-1">All caught up!</h3>
      <p className="text-sm text-gray-500 max-w-sm">
        You've reviewed all pending content. Toby will generate more automatically.
      </p>
    </div>
  )
}
