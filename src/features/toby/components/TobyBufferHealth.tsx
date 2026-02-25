import { Film, LayoutGrid, CheckCircle2 } from 'lucide-react'
import { useTobyBuffer } from '../hooks'

export function TobyBufferHealth() {
  const { data: buffer, isLoading } = useTobyBuffer()

  if (isLoading) return <BufferSkeleton />
  if (!buffer) return null

  const healthy = buffer.health === 'healthy'
  const low = buffer.health === 'low'

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden h-full">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Content Calendar</h2>
        <span className={`text-xs font-semibold ${
          healthy ? 'text-emerald-600' : low ? 'text-amber-600' : 'text-red-600'
        }`}>
          {buffer.fill_percent}% filled
        </span>
      </div>

      <div className="p-5">
        {/* Progress bar */}
        <div className="mb-5">
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                healthy ? 'bg-emerald-500' : low ? 'bg-amber-400' : 'bg-red-400'
              }`}
              style={{ width: `${Math.max(buffer.fill_percent, 2)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {buffer.filled_slots} of {buffer.total_slots} slots filled · {buffer.buffer_days}-day buffer
          </p>
        </div>

        {/* Brand breakdown */}
        {Array.isArray(buffer.brand_breakdown) && buffer.brand_breakdown.length > 0 && (
          <div className="space-y-3">
            {buffer.brand_breakdown.map(b => {
              const pct = b.total > 0 ? Math.round((b.filled / b.total) * 100) : 100
              const full = pct === 100
              return (
                <div key={b.brand_id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700 truncate" title={b.display_name}>
                      {b.display_name}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 text-[11px] text-blue-500">
                        <Film className="w-3 h-3" />{b.reels}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-purple-500">
                        <LayoutGrid className="w-3 h-3" />{b.posts}
                      </span>
                      {full && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        full ? 'bg-emerald-500' : pct > 50 ? 'bg-amber-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${Math.max(pct, 3)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function BufferSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 animate-pulse">
      <div className="h-5 bg-gray-100 rounded w-32 mb-4" />
      <div className="h-2.5 bg-gray-100 rounded-full w-full mb-5" />
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i}>
            <div className="h-4 bg-gray-100 rounded w-28 mb-1.5" />
            <div className="h-1.5 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
