import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle, Check, ChevronRight, Layers, Loader2, RefreshCw,
} from 'lucide-react'
import { clsx } from 'clsx'
import { apiClient } from '@/shared/api/client'

interface FormatViolation {
  type: string
  format: string
  user_id: string
  brand_id: string
  brand_name: string
  detail: string
  reel_id: string
  prev_reel_id: string
  variant: string
  scheduled_time: string | null
  prev_scheduled_time: string | null
}

interface FormatViolationsResponse {
  total_violations: number
  affected_brands: number
  affected_users: number
  violations: FormatViolation[]
}

function FormatIntegritySection() {
  const [expanded, setExpanded] = useState(false)

  const violationsQuery = useQuery<FormatViolationsResponse>({
    queryKey: ['admin-format-violations'],
    queryFn: () => apiClient.get('/api/admin/format-violations'),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })

  const total = violationsQuery.data?.total_violations ?? 0
  const violations = violationsQuery.data?.violations ?? []
  const affectedBrands = violationsQuery.data?.affected_brands ?? 0
  const affectedUsers = violationsQuery.data?.affected_users ?? 0

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-indigo-500" />
          Format Integrity
        </h3>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
              {total} violation{total !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => violationsQuery.refetch()}
            disabled={violationsQuery.isFetching}
            className="p-1 text-gray-400 hover:text-gray-600 rounded border border-gray-200 bg-white disabled:opacity-50"
            title="Re-check format integrity"
          >
            <RefreshCw className={clsx('w-3 h-3', violationsQuery.isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {violationsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking format integrity…
        </div>
      ) : violationsQuery.isError ? (
        <div className="flex items-center gap-2 text-xs text-red-500 py-1">
          <AlertCircle className="w-3.5 h-3.5" /> Failed to check format integrity
        </div>
      ) : total === 0 ? (
        <div className="flex items-center gap-2 text-xs text-emerald-600 py-1">
          <Check className="w-3.5 h-3.5" />
          <span className="font-medium">All reel formats are correctly alternating</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-left rounded border border-red-200 bg-red-50/50 hover:bg-red-50"
          >
            <ChevronRight className={clsx('w-3.5 h-3.5 text-red-400 transition-transform shrink-0', expanded && 'rotate-90')} />
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200 shrink-0">
              Format
            </span>
            <span className="text-xs text-gray-800 font-medium flex-1">
              {total} alternation violation{total !== 1 ? 's' : ''} across {affectedBrands} brand{affectedBrands !== 1 ? 's' : ''} / {affectedUsers} user{affectedUsers !== 1 ? 's' : ''}
            </span>
          </button>

          {expanded && (
            <div className="border border-gray-100 rounded-lg bg-gray-50 px-3 py-2 space-y-2">
              {violations.map((v, i) => (
                <div key={i} className="text-[11px] text-gray-700 flex items-start gap-2 py-1 border-b border-gray-100 last:border-0">
                  <span className="text-red-500 font-mono shrink-0 mt-0.5">✗</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-blue-700">{v.brand_name}</span>
                      <span className="text-[9px] text-gray-400 font-mono">{v.user_id.slice(0, 8)}…</span>
                    </div>
                    <p className="text-gray-500 mt-0.5">
                      Consecutive <span className="font-semibold text-red-600">{v.variant}</span> reels:{' '}
                      <span className="font-mono text-[10px]">{v.prev_reel_id}</span>
                      {' → '}
                      <span className="font-mono text-[10px]">{v.reel_id}</span>
                    </p>
                    {v.scheduled_time && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Scheduled: {new Date(v.scheduled_time).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


export default FormatIntegritySection
