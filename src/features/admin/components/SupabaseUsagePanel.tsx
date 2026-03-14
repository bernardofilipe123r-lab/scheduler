import React, { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Database, HardDrive, Server, Globe,
  ChevronDown, ChevronUp, RefreshCw,
  Loader2, AlertCircle, Activity, Wifi, Shield, Trash2, Settings, Sparkles,
  Users, Zap, Image as LucideImage, BarChart3, Clock,
} from 'lucide-react'
import { clsx } from 'clsx'
import { apiClient } from '@/shared/api/client'
import type { SupabaseUsageResponse } from '../types'
import { UsageBar, SectionHeader, HealthDot } from '../helpers'

function SupabaseUsagePanel() {
  const [expanded, setExpanded] = useState(true)
  const [showTables, setShowTables] = useState(false)
  const [showHealth, setShowHealth] = useState(true)
  const [showDbConfig, setShowDbConfig] = useState(false)
  const [showStorage, setShowStorage] = useState(false)
  const [showEdgeFns, setShowEdgeFns] = useState(false)
  const [showRealtime, setShowRealtime] = useState(false)
  const [showBackups, setShowBackups] = useState(false)
  const [showAdvisors, setShowAdvisors] = useState(false)
  const [showApiUsage, setShowApiUsage] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)

  const queryClient = useQueryClient()

  const usageQuery = useQuery<SupabaseUsageResponse>({
    queryKey: ['admin-supabase-usage'],
    queryFn: () => apiClient.get('/api/admin/supabase-usage'),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  })

  const purgeMutation = useMutation<{ deleted: number; message: string }>({
    mutationFn: () => apiClient.delete('/api/logs/purge'),
    onSuccess: (res) => {
      setConfirmPurge(false)
      queryClient.invalidateQueries({ queryKey: ['admin-supabase-usage'] })
      alert(`Purged ${res.deleted.toLocaleString()} log entries`)
    },
  })

  const db = usageQuery.data?.db_stats
  const usage = usageQuery.data?.usage
  const infra = usageQuery.data?.infrastructure
  const apiError = usageQuery.data?.error
  const hasUsageApi = usage !== null && usage !== undefined

  // Helper to safely extract usage values from the Management API response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getUsageTotal = (metric: string): number | null => {
    if (!usage || !usage[metric]) return null
    const m = usage[metric]
    if (typeof m === 'object' && m.error) return null
    if (typeof m.usage === 'number') return m.usage
    if (typeof m.total === 'number') return m.total
    if (Array.isArray(m)) {
      return m.reduce((s: number, r: any) => s + (r.usage ?? r.total ?? 0), 0) // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    if (Array.isArray(m.data)) {
      return m.data.reduce((s: number, r: any) => s + (r.usage ?? r.total ?? 0), 0) // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    return null
  }

  const getUsageLimit = (metric: string): number | null => {
    if (!usage || !usage[metric]) return null
    const m = usage[metric]
    if (typeof m === 'object' && m.error) return null
    if (typeof m.limit === 'number') return m.limit
    if (typeof m.included === 'number') return m.included
    return null
  }

  const FREE_LIMITS: Record<string, { limit: number; unit: string; label: string }> = {
    egress: { limit: 5, unit: 'GB', label: 'Egress' },
    db_size: { limit: 0.5, unit: 'GB', label: 'Database Size' },
    storage_size: { limit: 1, unit: 'GB', label: 'Storage Size' },
    monthly_active_users: { limit: 50000, unit: 'MAU', label: 'Monthly Active Users' },
    realtime_message_count: { limit: 2000000, unit: 'msgs', label: 'Realtime Messages' },
    realtime_peak_connections: { limit: 200, unit: '', label: 'Realtime Peak Connections' },
    func_invocations: { limit: 500000, unit: '', label: 'Edge Function Invocations' },
    storage_image_render_count: { limit: 100, unit: '', label: 'Image Transformations' },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeObj = (key: string): any => infra && infra[key] && !infra[key].error ? infra[key] : null

  const projectInfo = safeObj('project_info')
  const healthData = safeObj('health')
  const diskUtil = safeObj('disk_util')
  const diskConfig = safeObj('disk_config')
  const pgConfig = safeObj('postgres_config')
  const poolerConfig = safeObj('pooler_config')
  const postgrestConfig = safeObj('postgrest_config')
  const storageConfig = safeObj('storage_config')
  const storageBuckets = safeObj('storage_buckets')
  const backupsData = safeObj('backups')
  const edgeFunctions = safeObj('edge_functions')
  const realtimeConfig = safeObj('realtime_config')
  const readonlyMode = safeObj('readonly_mode')
  const sslEnforcement = safeObj('ssl_enforcement')
  const billingAddons = safeObj('billing_addons')
  const apiUsageCounts = safeObj('api_usage_counts')
  const perfAdvisors = safeObj('perf_advisors')
  const securityAdvisors = safeObj('security_advisors')

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Server className="w-4 h-4 text-emerald-500" />
          Supabase Infrastructure
          {projectInfo && (
            <span className="text-[10px] font-normal text-gray-400 ml-1">
              {projectInfo.region} &middot; {projectInfo.status}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {usageQuery.isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-5">
          {usageQuery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading Supabase metrics…
            </div>
          ) : usageQuery.isError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
              Failed to load usage data: {(usageQuery.error as Error).message}
            </div>
          ) : (
            <>
              {apiError && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                  {apiError}
                </div>
              )}

              {/* ── Project Overview ─────────────────────────────────── */}
              {projectInfo && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Project', value: projectInfo.name, color: 'text-gray-900' },
                    { label: 'Region', value: projectInfo.region, color: 'text-gray-700' },
                    { label: 'Status', value: projectInfo.status, color: projectInfo.status === 'ACTIVE_HEALTHY' ? 'text-emerald-700' : 'text-amber-700' },
                    { label: 'DB Version', value: projectInfo.database?.version ?? '—', color: 'text-gray-700' },
                  ].map(item => (
                    <div key={item.label} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{item.label}</p>
                      <p className={clsx('text-xs font-semibold truncate', item.color)}>{item.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Service Health ───────────────────────────────────── */}
              {Array.isArray(healthData) && healthData.length > 0 && (
                <div>
                  <SectionHeader label="Service Health" open={showHealth} toggle={() => setShowHealth(!showHealth)} icon={<Activity className="w-3.5 h-3.5 text-emerald-500" />} />
                  {showHealth && (
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {healthData.map((svc: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                        <div key={svc.name} className={clsx('p-2.5 rounded-lg border', svc.healthy ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100')}>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{svc.name}</p>
                          <HealthDot healthy={svc.healthy} status={svc.status} />
                          {svc.info?.version && <p className="text-[10px] text-gray-400 mt-0.5">v{svc.info.version}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Database Stats ───────────────────────────────────── */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Database</h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <Database className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-blue-700 mb-0.5">Database Size</p>
                      <p className="text-lg font-bold text-blue-900">
                        {db?.database_size_mb != null ? `${db.database_size_mb} MB` : '—'}
                      </p>
                      <p className="text-[10px] text-blue-600">Limit: 500 MB (Free)</p>
                      {db?.database_size_mb != null && (
                        <div className="mt-1.5 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                          <div
                            className={clsx('h-full rounded-full', (db.database_size_mb / 500) > 0.9 ? 'bg-red-500' : 'bg-blue-500')}
                            style={{ width: `${Math.min((db.database_size_mb / 500) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                    <Wifi className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-emerald-700 mb-0.5">Connections</p>
                      <p className="text-lg font-bold text-emerald-900">{db?.active_connections ?? '—'} <span className="text-xs font-normal">active</span></p>
                      <p className="text-[10px] text-emerald-600">
                        {db?.total_connections ?? '—'} total
                        {pgConfig?.max_connections ? ` / ${pgConfig.max_connections} max` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Disk Utilization */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-violet-50 border border-violet-100">
                    <HardDrive className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-violet-700 mb-0.5">Disk Usage</p>
                      {diskUtil?.metrics ? (
                        <>
                          <p className="text-lg font-bold text-violet-900">
                            {formatBytes(diskUtil.metrics.fs_used_bytes)}
                          </p>
                          <p className="text-[10px] text-violet-600">
                            of {formatBytes(diskUtil.metrics.fs_size_bytes)} total &middot; {formatBytes(diskUtil.metrics.fs_avail_bytes)} free
                          </p>
                          <div className="mt-1.5 h-1.5 bg-violet-100 rounded-full overflow-hidden">
                            <div
                              className={clsx(
                                'h-full rounded-full',
                                (diskUtil.metrics.fs_used_bytes / diskUtil.metrics.fs_size_bytes) > 0.85 ? 'bg-red-500' : 'bg-violet-500'
                              )}
                              style={{ width: `${Math.min((diskUtil.metrics.fs_used_bytes / diskUtil.metrics.fs_size_bytes) * 100, 100)}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <p className="text-lg font-bold text-violet-900">{db?.top_tables?.length ?? '—'} <span className="text-xs font-normal">tables</span></p>
                      )}
                    </div>
                  </div>

                  {/* Security info */}
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
                    <Shield className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-amber-700 mb-0.5">Security</p>
                      <div className="space-y-0.5">
                        <p className="text-[10px] text-amber-700">
                          SSL: {sslEnforcement?.currentConfig?.database ? '✓ Enforced' : '✗ Not enforced'}
                        </p>
                        <p className="text-[10px] text-amber-700">
                          Read-only: {readonlyMode?.enabled ? '✓ Active' : '✗ Disabled'}
                        </p>
                        {diskConfig?.attributes && (
                          <p className="text-[10px] text-amber-700">
                            Disk: {diskConfig.attributes.type?.toUpperCase()} {diskConfig.attributes.size_gb}GB
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Top Tables ───────────────────────────────────────── */}
              {db?.top_tables && db.top_tables.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowTables(!showTables)}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {showTables ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Top Tables by Row Count ({db.top_tables.length})
                  </button>
                  {showTables && (
                    <div className="mt-2 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                      <div className="grid grid-cols-[1fr_80px_40px] gap-2 px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        <span>Table</span>
                        <span className="text-right">Rows</span>
                        <span />
                      </div>
                      {db.top_tables.map((t, i) => (
                        <div key={i} className="grid grid-cols-[1fr_80px_40px] gap-2 px-3 py-1.5 border-b border-gray-100 last:border-b-0 text-xs items-center">
                          <span className="text-gray-700 font-mono truncate">{t.table}</span>
                          <span className="text-gray-500 text-right font-mono">{t.row_count.toLocaleString()}</span>
                          <span>
                            {t.table === 'app_logs' && t.row_count > 0 && (
                              <button
                                onClick={() => setConfirmPurge(true)}
                                title="Purge all app logs"
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Purge confirmation dialog */}
                  {confirmPurge && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-red-800 mb-2">
                        Delete all {db.top_tables.find(t => t.table === 'app_logs')?.row_count.toLocaleString() ?? ''} app log entries? This cannot be undone.
                      </p>
                      <p className="text-[10px] text-red-600 mb-3">
                        These are debug/operational logs. Auto-cleanup runs weekly (7-day retention).
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => purgeMutation.mutate()}
                          disabled={purgeMutation.isPending}
                          className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {purgeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          {purgeMutation.isPending ? 'Purging…' : 'Yes, purge all logs'}
                        </button>
                        <button
                          onClick={() => setConfirmPurge(false)}
                          className="px-3 py-1.5 bg-white border border-gray-200 text-xs font-medium text-gray-700 rounded-md hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                      {purgeMutation.isError && (
                        <p className="text-xs text-red-600 mt-2">
                          <AlertCircle className="w-3 h-3 inline mr-1" />
                          {(purgeMutation.error as Error).message}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Database Config ──────────────────────────────────── */}
              {(pgConfig || poolerConfig || postgrestConfig) && (
                <div>
                  <SectionHeader label="Database Configuration" open={showDbConfig} toggle={() => setShowDbConfig(!showDbConfig)} icon={<Settings className="w-3.5 h-3.5 text-blue-500" />} />
                  {showDbConfig && (
                    <div className="mt-2 space-y-3">
                      {/* Postgres config */}
                      {pgConfig && (
                        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Postgres Config</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            {[
                              { k: 'max_connections', v: pgConfig.max_connections },
                              { k: 'shared_buffers', v: pgConfig.shared_buffers },
                              { k: 'work_mem', v: pgConfig.work_mem },
                              { k: 'effective_cache_size', v: pgConfig.effective_cache_size },
                              { k: 'maintenance_work_mem', v: pgConfig.maintenance_work_mem },
                              { k: 'max_worker_processes', v: pgConfig.max_worker_processes },
                              { k: 'max_parallel_workers', v: pgConfig.max_parallel_workers },
                              { k: 'statement_timeout', v: pgConfig.statement_timeout },
                              { k: 'max_wal_size', v: pgConfig.max_wal_size },
                              { k: 'max_replication_slots', v: pgConfig.max_replication_slots },
                              { k: 'track_commit_timestamp', v: pgConfig.track_commit_timestamp ? 'on' : 'off' },
                              { k: 'session_replication_role', v: pgConfig.session_replication_role },
                            ].filter(x => x.v !== undefined).map(({ k, v }) => (
                              <div key={k}>
                                <span className="text-gray-400 font-mono text-[10px]">{k}</span>
                                <p className="text-gray-700 font-semibold font-mono">{String(v)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pooler config */}
                      {Array.isArray(poolerConfig) && poolerConfig.length > 0 && (
                        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Connection Pooler (Supavisor)</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            {poolerConfig.map((p: any, i: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                              <React.Fragment key={i}>
                                <div><span className="text-gray-400 text-[10px]">pool_mode</span><p className="text-gray-700 font-semibold">{p.pool_mode}</p></div>
                                <div><span className="text-gray-400 text-[10px]">default_pool_size</span><p className="text-gray-700 font-semibold">{p.default_pool_size}</p></div>
                                <div><span className="text-gray-400 text-[10px]">max_client_conn</span><p className="text-gray-700 font-semibold">{p.max_client_conn}</p></div>
                                <div><span className="text-gray-400 text-[10px]">db_type</span><p className="text-gray-700 font-semibold">{p.database_type}</p></div>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* PostgREST config */}
                      {postgrestConfig && (
                        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">PostgREST</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div><span className="text-gray-400 text-[10px]">max_rows</span><p className="text-gray-700 font-semibold">{postgrestConfig.max_rows}</p></div>
                            <div><span className="text-gray-400 text-[10px]">db_pool</span><p className="text-gray-700 font-semibold">{postgrestConfig.db_pool}</p></div>
                            <div><span className="text-gray-400 text-[10px]">db_schema</span><p className="text-gray-700 font-semibold truncate">{postgrestConfig.db_schema}</p></div>
                            <div><span className="text-gray-400 text-[10px]">extra_search_path</span><p className="text-gray-700 font-semibold truncate">{postgrestConfig.db_extra_search_path}</p></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Billing Usage ────────────────────────────────────── */}
              {hasUsageApi && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Billing Usage (Current Cycle)</h3>

                  {/* Billing addons */}
                  {billingAddons?.selected_addons && billingAddons.selected_addons.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {billingAddons.selected_addons.map((addon: any, i: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-medium text-emerald-700">
                          <Sparkles className="w-3 h-3" />
                          {addon.variant?.name || addon.type} — ${addon.variant?.price?.amount ?? '?'}/{addon.variant?.price?.interval ?? 'mo'}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3">
                    {Object.entries(FREE_LIMITS).map(([metric, info]) => {
                      const total = getUsageTotal(metric)
                      const apiLimit = getUsageLimit(metric)
                      if (total === null) return null

                      const limit = apiLimit ?? info.limit
                      const isBytes = metric === 'egress' || metric === 'storage_size'
                      const displayUsed = isBytes ? total / (1024 ** 3) : total
                      const displayLimit = limit

                      const icons: Record<string, React.ReactNode> = {
                        egress: <Globe className="w-3.5 h-3.5 text-gray-400" />,
                        db_size: <Database className="w-3.5 h-3.5 text-gray-400" />,
                        storage_size: <HardDrive className="w-3.5 h-3.5 text-gray-400" />,
                        monthly_active_users: <Users className="w-3.5 h-3.5 text-gray-400" />,
                        realtime_message_count: <Activity className="w-3.5 h-3.5 text-gray-400" />,
                        realtime_peak_connections: <Wifi className="w-3.5 h-3.5 text-gray-400" />,
                        func_invocations: <Zap className="w-3.5 h-3.5 text-gray-400" />,
                        storage_image_render_count: <LucideImage className="w-3.5 h-3.5 text-gray-400" />,
                      }

                      return (
                        <UsageBar
                          key={metric}
                          used={displayUsed}
                          limit={displayLimit}
                          label={info.label}
                          icon={icons[metric] || <BarChart3 className="w-3.5 h-3.5 text-gray-400" />}
                          unit={info.unit}
                          decimals={isBytes ? 3 : 0}
                        />
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── API Usage Counts ─────────────────────────────────── */}
              {apiUsageCounts?.result && Array.isArray(apiUsageCounts.result) && apiUsageCounts.result.length > 0 && (
                <div>
                  <SectionHeader label="API Request Breakdown" open={showApiUsage} toggle={() => setShowApiUsage(!showApiUsage)} icon={<BarChart3 className="w-3.5 h-3.5 text-indigo-500" />} />
                  {showApiUsage && (
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {apiUsageCounts.result.slice(-1).map((r: any, i: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                        <React.Fragment key={i}>
                          <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                            <p className="text-[10px] text-blue-600 uppercase">Auth Requests</p>
                            <p className="text-sm font-bold text-blue-900">{(r.total_auth_requests ?? 0).toLocaleString()}</p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                            <p className="text-[10px] text-emerald-600 uppercase">REST Requests</p>
                            <p className="text-sm font-bold text-emerald-900">{(r.total_rest_requests ?? 0).toLocaleString()}</p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-violet-50 border border-violet-100">
                            <p className="text-[10px] text-violet-600 uppercase">Realtime Requests</p>
                            <p className="text-sm font-bold text-violet-900">{(r.total_realtime_requests ?? 0).toLocaleString()}</p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                            <p className="text-[10px] text-amber-600 uppercase">Storage Requests</p>
                            <p className="text-sm font-bold text-amber-900">{(r.total_storage_requests ?? 0).toLocaleString()}</p>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Storage ──────────────────────────────────────────── */}
              {(storageBuckets || storageConfig) && (
                <div>
                  <SectionHeader label={`Storage${Array.isArray(storageBuckets) ? ` (${storageBuckets.length} buckets)` : ''}`} open={showStorage} toggle={() => setShowStorage(!showStorage)} icon={<HardDrive className="w-3.5 h-3.5 text-orange-500" />} />
                  {showStorage && (
                    <div className="mt-2 space-y-2">
                      {storageConfig && (
                        <div className="flex flex-wrap gap-2 text-[10px]">
                          <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">Max file: {storageConfig.fileSizeLimit ? formatBytes(storageConfig.fileSizeLimit) : '—'}</span>
                          {storageConfig.features?.imageTransformation?.enabled && (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Image Transforms ✓</span>
                          )}
                          {storageConfig.features?.s3Protocol?.enabled && (
                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">S3 Protocol ✓</span>
                          )}
                        </div>
                      )}
                      {Array.isArray(storageBuckets) && storageBuckets.length > 0 && (
                        <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                          <div className="grid grid-cols-[1fr_60px_100px] gap-2 px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                            <span>Bucket</span>
                            <span className="text-center">Public</span>
                            <span className="text-right">Created</span>
                          </div>
                          {storageBuckets.map((b: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                            <div key={b.id} className="grid grid-cols-[1fr_60px_100px] gap-2 px-3 py-1.5 border-b border-gray-100 last:border-b-0 text-xs">
                              <span className="text-gray-700 font-mono truncate">{b.name}</span>
                              <span className={clsx('text-center font-medium', b.public ? 'text-emerald-600' : 'text-gray-400')}>
                                {b.public ? 'Yes' : 'No'}
                              </span>
                              <span className="text-gray-400 text-right text-[10px]">
                                {b.created_at ? new Date(b.created_at).toLocaleDateString() : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Edge Functions ────────────────────────────────────── */}
              {Array.isArray(edgeFunctions) && edgeFunctions.length > 0 && (
                <div>
                  <SectionHeader label={`Edge Functions (${edgeFunctions.length})`} open={showEdgeFns} toggle={() => setShowEdgeFns(!showEdgeFns)} icon={<Zap className="w-3.5 h-3.5 text-yellow-500" />} />
                  {showEdgeFns && (
                    <div className="mt-2 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                      <div className="grid grid-cols-[1fr_80px_60px_100px] gap-2 px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                        <span>Function</span>
                        <span>Status</span>
                        <span className="text-center">JWT</span>
                        <span className="text-right">Version</span>
                      </div>
                      {edgeFunctions.map((fn: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                        <div key={fn.id} className="grid grid-cols-[1fr_80px_60px_100px] gap-2 px-3 py-1.5 border-b border-gray-100 last:border-b-0 text-xs">
                          <span className="text-gray-700 font-mono truncate">{fn.slug || fn.name}</span>
                          <span className={clsx('font-medium', fn.status === 'ACTIVE' ? 'text-emerald-600' : 'text-amber-600')}>
                            {fn.status}
                          </span>
                          <span className={clsx('text-center', fn.verify_jwt ? 'text-emerald-600' : 'text-gray-400')}>
                            {fn.verify_jwt ? '✓' : '✗'}
                          </span>
                          <span className="text-gray-500 text-right font-mono">v{fn.version}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Realtime Config ──────────────────────────────────── */}
              {realtimeConfig && (
                <div>
                  <SectionHeader label="Realtime Config" open={showRealtime} toggle={() => setShowRealtime(!showRealtime)} icon={<Wifi className="w-3.5 h-3.5 text-cyan-500" />} />
                  {showRealtime && (
                    <div className="mt-2 bg-gray-50 rounded-lg border border-gray-200 p-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {[
                          { k: 'max_concurrent_users', v: realtimeConfig.max_concurrent_users },
                          { k: 'max_events_per_second', v: realtimeConfig.max_events_per_second },
                          { k: 'max_bytes_per_second', v: realtimeConfig.max_bytes_per_second },
                          { k: 'max_channels_per_client', v: realtimeConfig.max_channels_per_client },
                          { k: 'max_joins_per_second', v: realtimeConfig.max_joins_per_second },
                          { k: 'connection_pool', v: realtimeConfig.connection_pool },
                          { k: 'max_payload_size_kb', v: realtimeConfig.max_payload_size_in_kb },
                          { k: 'private_only', v: realtimeConfig.private_only ? 'yes' : 'no' },
                        ].filter(x => x.v !== undefined).map(({ k, v }) => (
                          <div key={k}>
                            <span className="text-gray-400 font-mono text-[10px]">{k}</span>
                            <p className="text-gray-700 font-semibold">{String(v)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Backups ──────────────────────────────────────────── */}
              {backupsData && (
                <div>
                  <SectionHeader label={`Backups${backupsData.backups ? ` (${backupsData.backups.length})` : ''}`} open={showBackups} toggle={() => setShowBackups(!showBackups)} icon={<Clock className="w-3.5 h-3.5 text-teal-500" />} />
                  {showBackups && (
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap gap-2 text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">Region: {backupsData.region}</span>
                        <span className={clsx('px-2 py-0.5 rounded', backupsData.pitr_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                          PITR: {backupsData.pitr_enabled ? '✓ Enabled' : '✗ Disabled'}
                        </span>
                        <span className={clsx('px-2 py-0.5 rounded', backupsData.walg_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                          WAL-G: {backupsData.walg_enabled ? '✓' : '✗'}
                        </span>
                      </div>
                      {Array.isArray(backupsData.backups) && backupsData.backups.length > 0 && (
                        <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden max-h-48 overflow-y-auto">
                          <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide sticky top-0">
                            <span>Date</span>
                            <span>Type</span>
                            <span className="text-right">Status</span>
                          </div>
                          {backupsData.backups.map((bk: any, i: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                            <div key={i} className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-1.5 border-b border-gray-100 last:border-b-0 text-xs">
                              <span className="text-gray-700 text-[10px]">{bk.inserted_at ? new Date(bk.inserted_at).toLocaleString() : '—'}</span>
                              <span className="text-gray-500 text-[10px]">{bk.is_physical_backup ? 'Physical' : 'Logical'}</span>
                              <span className={clsx('text-right text-[10px] font-medium', bk.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600')}>
                                {bk.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Performance & Security Advisors ──────────────────── */}
              {(perfAdvisors?.lints?.length > 0 || securityAdvisors?.lints?.length > 0) && (
                <div>
                  <SectionHeader
                    label={`Advisors (${(perfAdvisors?.lints?.length ?? 0) + (securityAdvisors?.lints?.length ?? 0)} issues)`}
                    open={showAdvisors}
                    toggle={() => setShowAdvisors(!showAdvisors)}
                    icon={<AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                  />
                  {showAdvisors && (
                    <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                      {[...(perfAdvisors?.lints ?? []), ...(securityAdvisors?.lints ?? [])].map((lint: any, i: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                        <div
                          key={i}
                          className={clsx(
                            'p-2.5 rounded-lg border text-xs',
                            lint.level === 'ERROR' ? 'bg-red-50 border-red-200' :
                              lint.level === 'WARN' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={clsx(
                              'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase',
                              lint.level === 'ERROR' ? 'bg-red-100 text-red-700' :
                                lint.level === 'WARN' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                            )}>
                              {lint.level}
                            </span>
                            <span className="font-semibold text-gray-700">{lint.title}</span>
                            <span className="text-[10px] text-gray-400 ml-auto">{(lint.categories || []).join(', ')}</span>
                          </div>
                          <p className="text-gray-600 text-[11px]">{lint.description}</p>
                          {lint.detail && <p className="text-gray-500 text-[10px] mt-1">{lint.detail}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Refresh Button */}
              <div className="flex justify-end">
                <button
                  onClick={() => usageQuery.refetch()}
                  disabled={usageQuery.isFetching}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={clsx('w-3 h-3', usageQuery.isFetching && 'animate-spin')} />
                  Refresh
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default SupabaseUsagePanel
