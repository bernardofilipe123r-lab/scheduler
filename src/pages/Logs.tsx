import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ScrollText,
  Clock,
  ArrowUpDown,
} from 'lucide-react'
import { clsx } from 'clsx'
import { apiClient } from '@/shared/api/client'
import { Spinner } from '@/shared/components'

// ─── Types ──────────────────────────────────────────────────────

interface LogEntry {
  id: number
  timestamp: string
  level: string
  category: string
  source: string | null
  message: string
  details: Record<string, unknown> | null
  request_id: string | null
  deployment_id: string | null
  duration_ms: number | null
  http_method: string | null
  http_path: string | null
  http_status: number | null
}

interface LogsResponse {
  logs: LogEntry[]
  total: number
  page: number
  page_size: number
  total_pages: number
  deployment_id?: string
}

// ─── Constants ──────────────────────────────────────────────────

const LEVELS = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const
const CATEGORIES = [
  'http_request',
  'app_log',
  'system_event',
  'error',
  'scheduler',
  'publishing',
  'ai_generation',
  'http_outbound',
  'user_action',
] as const

const TIME_RANGES = [
  { label: 'Last Hour', minutes: 60 },
  { label: 'Today', minutes: 0 }, // special case
  { label: 'Last 24h', minutes: 1440 },
  { label: 'Last 7 Days', minutes: 10080 },
  { label: 'All Time', minutes: -1 },
] as const

const PAGE_SIZES = [25, 50, 100] as const

const LEVEL_STYLES: Record<string, string> = {
  DEBUG: 'bg-gray-100 text-gray-600',
  INFO: 'bg-blue-50 text-blue-700',
  WARNING: 'bg-amber-50 text-amber-700',
  ERROR: 'bg-red-50 text-red-700',
  CRITICAL: 'bg-red-600 text-white',
}

const CATEGORY_STYLES: Record<string, string> = {
  http_request: 'bg-indigo-50 text-indigo-700',
  http_outbound: 'bg-purple-50 text-purple-700',
  app_log: 'bg-gray-100 text-gray-600',
  system_event: 'bg-teal-50 text-teal-700',
  error: 'bg-red-50 text-red-600',
  scheduler: 'bg-cyan-50 text-cyan-700',
  publishing: 'bg-green-50 text-green-700',
  ai_generation: 'bg-violet-50 text-violet-700',
  user_action: 'bg-orange-50 text-orange-700',
}

// ─── Helpers ────────────────────────────────────────────────────

function formatTimestamp(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s
}

function getSinceMinutes(range: typeof TIME_RANGES[number]): number | undefined {
  if (range.minutes === -1) return undefined
  if (range.minutes === 0) {
    // "Today" — minutes since midnight
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  }
  return range.minutes
}

function statusColorClass(status: number): string {
  if (status >= 500) return 'bg-red-50 text-red-700'
  if (status >= 400) return 'bg-amber-50 text-amber-700'
  if (status >= 300) return 'bg-blue-50 text-blue-600'
  return 'bg-green-50 text-green-700'
}

// ─── Component ──────────────────────────────────────────────────

export function LogsPage() {
  const [searchParams] = useSearchParams()
  const userId = searchParams.get('user_id')
  const userName = searchParams.get('user_name')
  const userEmail = searchParams.get('user_email')
  const userRole = searchParams.get('user_role')

  // Filters
  const [level, setLevel] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [timeRange, setTimeRange] = useState<typeof TIME_RANGES[number]>(TIME_RANGES[0])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const queryClient = useQueryClient()

  // Build query params
  const buildParams = useCallback(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('page_size', String(pageSize))
    params.set('order', order)
    if (level) params.set('level', level)
    if (category) params.set('category', category)
    if (search) params.set('search', search)
    const minutes = getSinceMinutes(timeRange)
    if (minutes !== undefined) params.set('since_minutes', String(minutes))
    return params.toString()
  }, [page, pageSize, order, level, category, search, timeRange])

  // Fetch logs
  const { data, isLoading, isFetching, error, refetch } = useQuery<LogsResponse>({
    queryKey: ['system-logs', userId, page, pageSize, order, level, category, search, timeRange.label],
    queryFn: () => {
      const endpoint = userId
        ? `/api/admin/users/${encodeURIComponent(userId)}/logs?${buildParams()}`
        : `/api/logs?${buildParams()}`
      return apiClient.get<LogsResponse>(endpoint)
    },
    refetchInterval: autoRefresh ? 30_000 : false,
  })

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [level, category, timeRange, pageSize])

  const logs = data?.logs ?? []
  const total = data?.total ?? 0
  const totalPages = data?.total_pages ?? 0

  // Stats
  const errorCount = logs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length
  const warningCount = logs.filter(l => l.level === 'WARNING').length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScrollText className="w-6 h-6 text-stone-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">System Logs</h1>
            {userId
              ? (
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="text-sm font-medium text-gray-800">{userName ? decodeURIComponent(userName) : userId}</span>
                  {userEmail && <span className="text-sm text-gray-500">{decodeURIComponent(userEmail)}</span>}
                  {userRole && (
                    <span className={clsx(
                      'inline-block px-2 py-0.5 rounded-full text-xs font-semibold',
                      userRole === 'Super Admin' ? 'bg-purple-100 text-purple-700' :
                      userRole === 'Admin' ? 'bg-blue-100 text-blue-700' :
                      userRole === 'Blocked' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    )}>{userRole}</span>
                  )}
                </div>
              )
              : <p className="text-sm text-gray-500">Real-time system log viewer</p>
            }
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-stone-900 focus:ring-stone-400"
            />
            Auto-refresh
          </label>
          <button
            onClick={() => { queryClient.invalidateQueries({ queryKey: ['system-logs'] }); refetch() }}
            disabled={isFetching}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Level */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Level</label>
            <select
              value={level}
              onChange={e => setLevel(e.target.value)}
              className="rounded-lg border-gray-200 text-sm py-1.5 px-3 bg-white focus:ring-stone-400 focus:border-stone-400"
            >
              <option value="">All Levels</option>
              {LEVELS.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
              <option value="WARNING,ERROR,CRITICAL">⚠️ Warnings+</option>
              <option value="ERROR,CRITICAL">🔴 Errors+</option>
            </select>
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="rounded-lg border-gray-200 text-sm py-1.5 px-3 bg-white focus:ring-stone-400 focus:border-stone-400"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {/* Time Range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Time Range</label>
            <select
              value={timeRange.label}
              onChange={e => setTimeRange(TIME_RANGES.find(t => t.label === e.target.value) ?? TIME_RANGES[0])}
              className="rounded-lg border-gray-200 text-sm py-1.5 px-3 bg-white focus:ring-stone-400 focus:border-stone-400"
            >
              {TIME_RANGES.map(t => (
                <option key={t.label} value={t.label}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search messages..."
                style={{ paddingLeft: '2.25rem' }}
                className="w-full pr-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
              />
            </div>
          </div>

          {/* Page Size */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Per Page</label>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="rounded-lg border-gray-200 text-sm py-1.5 px-3 bg-white focus:ring-stone-400 focus:border-stone-400"
            >
              {PAGE_SIZES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg">
          <span className="text-gray-500">Total:</span>
          <span className="font-semibold text-gray-900">{total.toLocaleString()}</span>
        </div>
        {errorCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="font-semibold text-red-700">{errorCount} errors</span>
          </div>
        )}
        {warningCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-semibold text-amber-700">{warningCount} warnings</span>
          </div>
        )}
        {isFetching && (
          <div className="flex items-center gap-2 text-gray-400">
            <Spinner size={14} className="text-gray-400" />
            <span className="text-xs">Refreshing…</span>
          </div>
        )}
      </div>

      {/* Log Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size={32} className="text-gray-500" />
        </div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-lg p-8 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-600 font-medium">Failed to load logs</p>
          <p className="text-sm text-gray-500 mt-1">{(error as Error).message}</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <ScrollText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No logs found</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or time range</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[140px_80px_120px_1fr_80px] gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <button
              onClick={() => setOrder(o => o === 'desc' ? 'asc' : 'desc')}
              className="flex items-center gap-1 hover:text-gray-700 transition-colors"
            >
              Timestamp
              <ArrowUpDown className="w-3 h-3" />
            </button>
            <span>Level</span>
            <span>Category</span>
            <span>Message</span>
            <span>Status</span>
          </div>

          {/* Rows */}
          {logs.map(log => (
            <div key={log.id}>
              <div
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                className={clsx(
                  'grid grid-cols-[140px_80px_120px_1fr_80px] gap-3 px-4 py-2.5 text-sm border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors',
                  (log.level === 'ERROR' || log.level === 'CRITICAL') && 'border-l-2 border-l-red-400',
                  log.level === 'WARNING' && 'border-l-2 border-l-amber-400',
                  expandedId === log.id && 'bg-gray-50',
                )}
              >
                <span className="text-gray-500 text-xs flex items-center gap-1 whitespace-nowrap">
                  {expandedId === log.id ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                  {formatTimestamp(log.timestamp)}
                </span>
                <span>
                  <span className={clsx('inline-block px-2 py-0.5 rounded text-xs font-semibold', LEVEL_STYLES[log.level] || LEVEL_STYLES.DEBUG)}>
                    {log.level}
                  </span>
                </span>
                <span>
                  <span className={clsx('inline-block px-2 py-0.5 rounded text-xs', CATEGORY_STYLES[log.category] || 'bg-gray-100 text-gray-500')}>
                    {log.category?.replace(/_/g, ' ')}
                  </span>
                </span>
                <span className="text-gray-700 truncate">{truncate(log.message || '', 100)}</span>
                <span>
                  {log.http_status && (
                    <span className={clsx('inline-block px-2 py-0.5 rounded text-xs font-medium', statusColorClass(log.http_status))}>
                      {log.http_status}
                    </span>
                  )}
                </span>
              </div>

              {/* Expanded row */}
              {expandedId === log.id && (
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 space-y-3 text-sm">
                  <div className="text-gray-800 whitespace-pre-wrap break-words">{log.message}</div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {log.source && (
                      <div>
                        <span className="text-gray-400 block">Source</span>
                        <span className="text-gray-700 font-medium">{log.source}</span>
                      </div>
                    )}
                    {log.request_id && (
                      <div>
                        <span className="text-gray-400 block">Request ID</span>
                        <span className="text-gray-700 font-mono text-[11px]">{log.request_id}</span>
                      </div>
                    )}
                    {log.duration_ms != null && (
                      <div>
                        <span className="text-gray-400 block">Duration</span>
                        <span className="text-gray-700 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {log.duration_ms}ms
                        </span>
                      </div>
                    )}
                    {log.http_method && (
                      <div>
                        <span className="text-gray-400 block">HTTP</span>
                        <span className="text-gray-700 font-medium">
                          {log.http_method} {log.http_path} → {log.http_status}
                        </span>
                      </div>
                    )}
                    {log.deployment_id && (
                      <div>
                        <span className="text-gray-400 block">Deployment</span>
                        <span className="text-gray-700 font-mono text-[11px]">{log.deployment_id}</span>
                      </div>
                    )}
                  </div>

                  {log.details && Object.keys(log.details).length > 0 && (
                    <details className="group">
                      <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                        Details JSON
                      </summary>
                      <pre className="mt-2 p-3 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 overflow-auto max-h-64 font-mono">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} · {total.toLocaleString()} entries
          </p>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage(1)}
              className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              First
            </button>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            {/* Page number buttons */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number
              if (totalPages <= 5) {
                p = i + 1
              } else if (page <= 3) {
                p = i + 1
              } else if (page >= totalPages - 2) {
                p = totalPages - 4 + i
              } else {
                p = page - 2 + i
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={clsx(
                    'px-3 py-1.5 text-sm border rounded-lg transition-colors',
                    p === page
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-white border-gray-200 hover:bg-gray-50',
                  )}
                >
                  {p}
                </button>
              )
            })}
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
              className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
