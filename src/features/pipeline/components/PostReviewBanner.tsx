import { CheckCircle2, Film, LayoutGrid, MessageSquare, CalendarClock } from 'lucide-react'

interface ContentBreakdown {
  reels: number
  carousels: number
  threads: number
}

interface Props {
  contentBreakdown?: ContentBreakdown
  scheduledUntil?: string | null
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PostReviewBanner({ contentBreakdown, scheduledUntil }: Props) {
  const { reels = 0, carousels = 0, threads = 0 } = contentBreakdown ?? {}
  const totalScheduled = reels + carousels + threads

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
      <h3 className="text-lg font-semibold text-gray-800 mb-1">All caught up!</h3>

      {totalScheduled > 0 ? (
        <>
          <p className="text-sm text-gray-500 mb-4">Your upcoming content:</p>
          <div className="flex items-center gap-4 mb-3">
            {reels > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <Film className="w-4 h-4 text-purple-500" />
                {reels} {reels === 1 ? 'Reel' : 'Reels'}
              </span>
            )}
            {carousels > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <LayoutGrid className="w-4 h-4 text-blue-500" />
                {carousels} {carousels === 1 ? 'Carousel' : 'Carousels'}
              </span>
            )}
            {threads > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <MessageSquare className="w-4 h-4 text-gray-600" />
                {threads} {threads === 1 ? 'Thread' : 'Threads'}
              </span>
            )}
          </div>
          {scheduledUntil && (
            <p className="flex items-center gap-1.5 text-xs text-gray-400">
              <CalendarClock className="w-3.5 h-3.5" />
              Scheduled until {formatDate(scheduledUntil)}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500 max-w-sm">
          You've reviewed all pending content. Toby will generate more automatically.
        </p>
      )}
    </div>
  )
}
