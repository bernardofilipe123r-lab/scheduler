import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, AlertCircle, Check, ChevronDown, ChevronUp, ChevronRight,
  Copy, RefreshCw, Loader2, Server,
} from 'lucide-react'
import { clsx } from 'clsx'
import { apiClient } from '@/shared/api/client'
import type { ErrorDigestResponse } from '../types'
import FormatIntegritySection from './FormatIntegritySection'

const CATEGORY_LABELS: Record<string, string> = {
  publishing: 'Publishing',
  http_request: 'HTTP Request',
  http_outbound: 'External API',
  ai_generation: 'AI Generation',
  scheduler: 'Scheduler',
  error: 'Application',
  app_log: 'App Log',
  system_event: 'System',
}

const CATEGORY_COLORS: Record<string, string> = {
  publishing: 'bg-rose-50 text-rose-700 border-rose-200',
  http_request: 'bg-amber-50 text-amber-700 border-amber-200',
  http_outbound: 'bg-orange-50 text-orange-700 border-orange-200',
  ai_generation: 'bg-violet-50 text-violet-700 border-violet-200',
  scheduler: 'bg-sky-50 text-sky-700 border-sky-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  app_log: 'bg-gray-50 text-gray-700 border-gray-200',
  system_event: 'bg-slate-50 text-slate-700 border-slate-200',
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  critical: { label: 'Critical', color: 'bg-red-100 text-red-800 border-red-300', dot: 'bg-red-500' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-800 border-orange-300', dot: 'bg-orange-500' },
  medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', dot: 'bg-yellow-500' },
  low: { label: 'Low', color: 'bg-gray-100 text-gray-600 border-gray-300', dot: 'bg-gray-400' },
}

function ErrorMonitorPanel() {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('admin-error-monitor-collapsed') === 'true'
  })
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [showAllDeployments, setShowAllDeployments] = useState(false)

  const digestQuery = useQuery<ErrorDigestResponse>({
    queryKey: ['admin-error-digest', showAllDeployments],
    queryFn: () => apiClient.get(`/api/admin/error-digest?hours=48&current_deployment=${!showAllDeployments}`),
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  })

  const digest = digestQuery.data?.digest ?? []
  const totalErrors = digestQuery.data?.total_errors ?? 0
  const uniquePatterns = digestQuery.data?.unique_patterns ?? 0

  function handleCopy(text: string, idx: number) {
    navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  function handleToggleCollapsed() {
    setIsCollapsed(prev => {
      const next = !prev
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('admin-error-monitor-collapsed', String(next))
      }
      if (next) setExpandedIdx(null)
      return next
    })
  }

  function relativeTime(iso: string | null): string {
    if (!iso) return '—'
    const diff = Date.now() - new Date(iso).getTime()
    const secs = Math.floor(diff / 1000)
    if (secs < 60) return `${secs}s ago`
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 1) return 'just now'
    if (hrs < 24) {
      // Check if it's still today
      const errorDate = new Date(iso)
      const today = new Date()
      if (errorDate.toDateString() === today.toDateString()) return `${hrs}h ago (Today)`
      return `${hrs}h ago`
    }
    const days = Math.floor(hrs / 24)
    if (days === 1) return '1 day ago'
    return `${days} days ago`
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          Error Monitor
          <span className="text-[10px] font-normal text-gray-400">
            {showAllDeployments ? 'Last 48h (all deploys)' : 'Current deploy'}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {totalErrors > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
              {totalErrors} errors / {uniquePatterns} patterns
            </span>
          )}
          <button
            onClick={() => setShowAllDeployments(prev => !prev)}
            className={clsx(
              'inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border',
              showAllDeployments
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-white text-gray-500 border-gray-200 hover:text-gray-700'
            )}
            title={showAllDeployments ? 'Showing all deployments — click to show current only' : 'Showing current deployment — click to show all'}
          >
            <Server className="w-3 h-3" />
            {showAllDeployments ? 'All' : 'Current'}
          </button>
          <button
            onClick={handleToggleCollapsed}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-500 hover:text-gray-700 rounded border border-gray-200 bg-white"
            title={isCollapsed ? 'Expand errors panel' : 'Collapse errors panel'}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand errors panel' : 'Collapse errors panel'}
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3 h-3" />
                Expand
              </>
            ) : (
              <>
                <ChevronUp className="w-3 h-3" />
                Collapse
              </>
            )}
          </button>
          <button
            onClick={() => digestQuery.refetch()}
            disabled={digestQuery.isFetching}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded border border-gray-200 bg-white disabled:opacity-50"
            title="Refresh errors"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', digestQuery.isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {isCollapsed ? (
        <div className="text-xs text-gray-500 py-1">
          Error list hidden. Use Expand to inspect recent patterns.
        </div>
      ) : digestQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading error digest...
        </div>
      ) : digestQuery.isError ? (
        <div className="flex items-center gap-2 text-xs text-red-500 py-2">
          <AlertCircle className="w-3.5 h-3.5" /> Failed to load error digest
        </div>
      ) : digest.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-emerald-600 py-4">
          <Check className="w-4 h-4" />
          <span className="font-medium">
            {showAllDeployments ? 'No errors in the last 48 hours' : 'No errors since last deployment'}
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          {digest.map((entry, idx) => {
            const isExpanded = expandedIdx === idx
            const catColor = CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.error
            const prio = PRIORITY_CONFIG[entry.priority] || PRIORITY_CONFIG.low

            return (
              <div
                key={idx}
                className={clsx(
                  'border rounded-lg overflow-hidden',
                  entry.priority === 'critical' ? 'border-red-200 bg-red-50/30' : 'border-gray-100'
                )}
              >
                {/* Human-readable row */}
                <button
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <ChevronRight
                    className={clsx(
                      'w-3.5 h-3.5 text-gray-400 transition-transform shrink-0',
                      isExpanded && 'rotate-90'
                    )}
                  />
                  {/* Priority dot */}
                  <span className={clsx('w-2 h-2 rounded-full shrink-0', prio.dot)} title={prio.label} />
                  <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0', catColor)}>
                    {CATEGORY_LABELS[entry.category] || entry.category}
                  </span>
                  <span className="text-xs text-gray-800 font-medium flex-1 min-w-0 truncate">
                    {entry.human_summary}
                  </span>
                  {/* Brand tags */}
                  {entry.brands?.length > 0 && (
                    <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 shrink-0 max-w-[120px] truncate">
                      {entry.brands.slice(0, 2).join(', ')}{entry.brands.length > 2 ? ` +${entry.brands.length - 2}` : ''}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap">
                    {relativeTime(entry.last_seen)}
                  </span>
                </button>

                {/* Technical details (expandable) */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-3 py-3 space-y-3">
                    {/* Priority + meta row */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-gray-500 items-center">
                      <span className={clsx('px-1.5 py-0.5 rounded border font-semibold', prio.color)}>
                        {prio.label} Priority
                      </span>
                      <span>Occurrences: <strong className="text-gray-700">{entry.count}</strong></span>
                      <span>Affected users: <strong className="text-gray-700">{entry.affected_user_count}</strong></span>
                      {entry.http_path && (
                        <span>Path: <strong className="text-gray-700 font-mono">{entry.http_path}</strong></span>
                      )}
                      {entry.http_status && (
                        <span>Status: <strong className="text-gray-700">{entry.http_status}</strong></span>
                      )}
                      <span>First: <strong className="text-gray-700">{relativeTime(entry.first_seen)}</strong></span>
                      <span>Last: <strong className="text-gray-700">{relativeTime(entry.last_seen)}</strong></span>
                    </div>

                    {/* Brands affected */}
                    {entry.brands?.length > 0 && (
                      <div className="text-[10px] text-gray-500">
                        <span className="font-medium">Brands: </span>
                        <span className="text-blue-700">{entry.brands.join(', ')}</span>
                      </div>
                    )}

                    {/* Affected users with brand info */}
                    {entry.affected_user_info && entry.affected_user_info.length > 0 && (
                      <div className="text-[10px] text-gray-500 space-y-1">
                        <span className="font-medium">Affected Users:</span>
                        {entry.affected_user_info.slice(0, 5).map((u) => (
                          <div key={u.user_id} className="flex items-center gap-2 pl-2">
                            <button
                              onClick={() => navigator.clipboard.writeText(u.user_id)}
                              className="font-mono text-gray-600 hover:text-gray-900 hover:underline"
                              title="Click to copy full ID"
                            >
                              {u.user_id.slice(0, 8)}...
                            </button>
                            {u.brands && (
                              <span className="text-blue-600 bg-blue-50 px-1 py-0.5 rounded text-[9px]">
                                {u.brands}
                              </span>
                            )}
                          </div>
                        ))}
                        {entry.affected_user_info.length > 5 && (
                          <span className="text-gray-400 pl-2">+{entry.affected_user_info.length - 5} more users</span>
                        )}
                      </div>
                    )}

                    {/* Technical error block */}
                    <div className="relative">
                      <div className="bg-gray-900 rounded-md p-3 text-[11px] font-mono text-gray-300 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
                        {entry.technical_error}
                      </div>
                      <button
                        onClick={() => handleCopy(entry.technical_error, idx)}
                        className="absolute top-2 right-2 p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
                        title="Copy technical error"
                      >
                        {copiedIdx === idx ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Format Integrity Check */}
      <FormatIntegritySection />
    </div>
  )
}



export default ErrorMonitorPanel
