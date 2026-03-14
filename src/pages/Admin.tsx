import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShieldCheck, Users, Search, RefreshCw, AlertCircle,
  Ban, UserCheck, Shield,
  Crown, Clock, Loader2, Zap, Settings, Check, Activity,
  Cpu, Image, Globe,
} from 'lucide-react'
import { clsx } from 'clsx'
import { apiClient } from '@/shared/api/client'
import { Spinner } from '@/shared/components'
import type { AdminUser, CreditsResponse, ApiUsageEntry } from '@/features/admin/types'
import { formatDate, RoleBadge } from '@/features/admin/helpers'
import {
  UserDetailPanel as UserDetail,
  ErrorMonitorPanel,
  SupabaseUsagePanel,
  MusicLibraryPanel,
} from '@/features/admin/components'

export function AdminPage() {
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)

  const creditsQuery = useQuery<CreditsResponse>({
    queryKey: ['admin-credits'],
    queryFn: () => apiClient.get('/api/admin/credits'),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })

  const apiUsageQuery = useQuery<{ usage: Record<string, ApiUsageEntry> }>({
    queryKey: ['admin-api-usage'],
    queryFn: () => apiClient.get('/api/admin/api-usage'),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })

  const { data, isLoading, error, refetch, isFetching } = useQuery<{ users: AdminUser[] }>({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.get('/api/admin/users'),
    staleTime: 5 * 60_000,
  })

  const users = (data?.users ?? []).filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
  })

  const counts = {
    total: data?.users.filter(u => !u.is_admin && !u.is_super_admin && !u.is_blocked).length ?? 0,
    superAdmins: data?.users.filter(u => u.is_super_admin).length ?? 0,
    admins: data?.users.filter(u => u.is_admin && !u.is_super_admin).length ?? 0,
    blocked: data?.users.filter(u => u.is_blocked).length ?? 0,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-stone-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-sm text-gray-500">Manage users, roles, and system access</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Users', value: counts.total, icon: Users, color: 'text-gray-700', bg: 'bg-white' },
          { label: 'Super Admins', value: counts.superAdmins, icon: Crown, color: 'text-purple-700', bg: 'bg-purple-50' },
          { label: 'Admins', value: counts.admins, icon: Shield, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Blocked', value: counts.blocked, icon: Ban, color: 'text-red-700', bg: 'bg-red-50' },
        ].map(stat => (
          <div key={stat.label} className={clsx('flex items-center gap-3 p-4 rounded-lg border border-gray-200', stat.bg)}>
            <stat.icon className={clsx('w-5 h-5 shrink-0', stat.color)} />
            <div>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Error Monitor */}
      <ErrorMonitorPanel />

      {/* AI Credits */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            AI Service Credits
          </h2>
          <button
            onClick={() => creditsQuery.refetch()}
            disabled={creditsQuery.isFetching}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded border border-gray-200 bg-white disabled:opacity-50"
            title="Refresh credits"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', creditsQuery.isFetching && 'animate-spin')} />
          </button>
        </div>
        {creditsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading credits…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* DeepSeek */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
              <Cpu className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-blue-700 mb-1">DeepSeek</p>
                {creditsQuery.data?.deepseek?.error ? (
                  <p className="text-xs text-red-600">{creditsQuery.data.deepseek.error}</p>
                ) : creditsQuery.data?.deepseek ? (
                  <div className="space-y-0.5">
                    {(creditsQuery.data.deepseek.balance_infos ?? []).map((b, i) => (
                      <div key={i} className="flex items-baseline gap-1.5">
                        <span className="text-lg font-bold text-blue-900">{b.total_balance}</span>
                        <span className="text-xs text-blue-600">{b.currency}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-1 mt-1">
                      {creditsQuery.data.deepseek.available ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                          <Check className="w-3 h-3" /> Available
                        </span>
                      ) : (
                        <span className="text-[10px] text-red-600 font-medium">Unavailable</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">—</p>
                )}
              </div>
            </div>

            {/* Freepik */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-teal-50 border border-teal-100">
              <Image className="w-5 h-5 text-teal-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-teal-700 mb-1">Freepik (Image Gen)</p>
                {creditsQuery.data?.freepik?.error ? (
                  <p className="text-xs text-red-600">{creditsQuery.data.freepik.error}</p>
                ) : creditsQuery.data?.freepik ? (
                  (() => {
                    const fp = creditsQuery.data.freepik!
                    const budgetPct = fp.total_budget_eur
                      ? Math.round(((fp.spent_eur ?? 0) / fp.total_budget_eur) * 100)
                      : 0
                    return (
                      <div className="space-y-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-bold text-teal-900">
                            {(fp.remaining_eur ?? 0).toFixed(2)}
                          </span>
                          <span className="text-xs text-teal-600">EUR remaining</span>
                        </div>
                        <div className="h-1.5 bg-teal-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-teal-500 transition-all duration-500"
                            style={{ width: `${Math.min(budgetPct, 100)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-teal-600">
                          <span>{(fp.spent_eur ?? 0).toFixed(2)} EUR spent</span>
                          <span>{fp.total_budget_eur} EUR budget</span>
                        </div>
                        <div className="text-[10px] text-teal-500">
                          {fp.daily_limit}/day · {fp.total_calls ?? 0} total calls
                        </div>
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-xs text-gray-400">—</p>
                )}
              </div>
            </div>

            {/* DeAPI */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-50 border border-purple-100">
              <Image className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-purple-700 mb-1">DeAPI (Fallback)</p>
                {creditsQuery.data?.deapi?.error ? (
                  <p className="text-xs text-red-600">{creditsQuery.data.deapi.error}</p>
                ) : creditsQuery.data?.deapi ? (
                  (() => {
                    const d = creditsQuery.data.deapi
                    const val = d.data?.balance ?? d.balance_usd ?? d.remaining ?? d.credits ?? d.balance
                    return (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-bold text-purple-900">
                          {typeof val === 'number' ? val.toFixed(2) : '—'}
                        </span>
                        <span className="text-xs text-purple-600">USD</span>
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-xs text-gray-400">—</p>
                )}
              </div>
            </div>

            {/* Pexels */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 border border-green-100">
              <Globe className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-green-700 mb-1">Pexels (Web Images — Free)</p>
                {creditsQuery.data?.pexels?.error ? (
                  <p className="text-xs text-red-600">{creditsQuery.data.pexels.error}</p>
                ) : creditsQuery.data?.pexels ? (
                  (() => {
                    const px = creditsQuery.data.pexels!
                    const usagePct = px.monthly_limit
                      ? Math.round(((px.used_this_month ?? 0) / px.monthly_limit) * 100)
                      : 0
                    return (
                      <div className="space-y-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-bold text-green-900">
                            {px.remaining ?? 0}
                          </span>
                          <span className="text-xs text-green-600">requests remaining this month</span>
                        </div>
                        <div className="h-1.5 bg-green-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-green-500 transition-all duration-500"
                            style={{ width: `${Math.min(usagePct, 100)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-green-600">
                          <span>{px.used_this_month ?? 0} used</span>
                          <span>{px.monthly_limit?.toLocaleString()} monthly limit</span>
                        </div>
                        <div className="text-[10px] text-green-500">
                          Free — $0.00 cost
                        </div>
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-xs text-gray-400">—</p>
                )}
              </div>
            </div>

            {/* Image Source Toggles */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200 col-span-full">
              <Settings className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-xs font-semibold text-gray-700">Format B Image Source</p>

                {/* Content slides */}
                <div>
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">Content Slides</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        try { await apiClient.put('/api/admin/image-source', { mode: 'ai', target: 'content' }); creditsQuery.refetch() } catch {}
                      }}
                      className={clsx('px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
                        creditsQuery.data?.image_source_mode !== 'web' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      AI Generated
                    </button>
                    <button
                      onClick={async () => {
                        try { await apiClient.put('/api/admin/image-source', { mode: 'web', target: 'content' }); creditsQuery.refetch() } catch {}
                      }}
                      className={clsx('px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
                        creditsQuery.data?.image_source_mode === 'web' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      Web (Pexels)
                    </button>
                    <span className="text-[10px] text-gray-400 ml-1">
                      {creditsQuery.data?.image_source_mode === 'web' ? 'Pexels photos' : 'AI-generated'}
                    </span>
                  </div>
                </div>

                {/* Thumbnail */}
                <div>
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-1">Thumbnail</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        try { await apiClient.put('/api/admin/image-source', { mode: 'ai', target: 'thumbnail' }); creditsQuery.refetch() } catch {}
                      }}
                      className={clsx('px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
                        creditsQuery.data?.thumbnail_image_source_mode !== 'web' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      AI Generated
                    </button>
                    <button
                      onClick={async () => {
                        try { await apiClient.put('/api/admin/image-source', { mode: 'web', target: 'thumbnail' }); creditsQuery.refetch() } catch {}
                      }}
                      className={clsx('px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
                        creditsQuery.data?.thumbnail_image_source_mode === 'web' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      Web (Pexels)
                    </button>
                    <span className="text-[10px] text-gray-400 ml-1">
                      {creditsQuery.data?.thumbnail_image_source_mode === 'web' ? 'Pexels photos' : 'AI-generated'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* API Usage Monitoring */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" />
            API Usage Monitoring
          </h2>
          <button
            onClick={() => apiUsageQuery.refetch()}
            disabled={apiUsageQuery.isFetching}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded border border-gray-200 bg-white disabled:opacity-50"
            title="Refresh API usage"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', apiUsageQuery.isFetching && 'animate-spin')} />
          </button>
        </div>
        {apiUsageQuery.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading API usage…
          </div>
        ) : apiUsageQuery.isError ? (
          <div className="flex items-center gap-2 text-xs text-red-500 py-1">
            <AlertCircle className="w-3.5 h-3.5" /> Failed to load API usage
          </div>
        ) : apiUsageQuery.data?.usage ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(apiUsageQuery.data.usage).map(([key, api]) => {
              const pct = api.usage_pct ?? 0
              const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
              const badgeColor = pct >= 90
                ? 'bg-red-50 text-red-700 border-red-100'
                : pct >= 70
                  ? 'bg-amber-50 text-amber-700 border-amber-100'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-100'
              const hasLive = !!api.live
              return (
                <div key={key} className="p-3 rounded-lg bg-gray-50 border border-gray-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700">{api.label}</p>
                    <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded border', badgeColor)}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full transition-all duration-500', barColor)}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <span>{api.remaining?.toLocaleString()} remaining</span>
                    <span>{api.limit?.toLocaleString()} / {api.period}</span>
                  </div>
                  {hasLive && (
                    <span className="inline-flex items-center gap-1 text-[9px] text-emerald-600 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live data
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-400">No API usage data available</p>
        )}
      </div>

      {/* Supabase Infrastructure */}
      <SupabaseUsagePanel />

      {/* Music Library */}
      <MusicLibraryPanel />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-stone-400"
        />
      </div>

      {/* User Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size={32} className="text-gray-400" />
        </div>
      ) : error ? (
        <div className="bg-white border border-red-200 rounded-lg p-8 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-red-600 font-medium">Failed to load users</p>
          <p className="text-sm text-gray-500 mt-1">{(error as Error).message}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
          {/* Header row */}
          <div className="grid grid-cols-[minmax(180px,_260px)_300px_110px_155px_130px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide min-w-[840px]">
            <span>User</span>
            <span>User ID</span>
            <span>Role</span>
            <span>Last Sign In</span>
            <span>Joined</span>
          </div>

          {users.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No users match your search</p>
            </div>
          ) : (
            users.map(u => (
              <div
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className={clsx(
                  'grid grid-cols-[minmax(180px,_260px)_300px_110px_155px_130px] gap-4 px-5 py-3.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors items-center min-w-[840px]',
                  u.is_blocked && 'opacity-60',
                  selectedUser?.id === u.id && 'bg-stone-50',
                )}
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {u.name || <span className="text-gray-400 italic">No name</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                </div>
                <button
                  title="Click to copy full ID"
                  onClick={e => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(u.id)
                  }}
                  className="text-xs text-gray-400 font-mono hover:text-gray-600 text-left whitespace-nowrap"
                >
                  {u.id}
                </button>
                <RoleBadge user={u} />
                <span className="text-xs text-gray-400 flex items-center gap-1 whitespace-nowrap">
                  <Clock className="w-3 h-3" />
                  {formatDate(u.last_sign_in_at)}
                </span>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {formatDate(u.created_at)}
                </span>
              </div>
            ))
          )}
          </div>
        </div>
      )}

      {/* Role Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><Crown className="w-3.5 h-3.5 text-purple-500" /> Super Admin — full access, can manage all users</span>
        <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-blue-500" /> Admin — can view system logs for their own account</span>
        <span className="flex items-center gap-1"><UserCheck className="w-3.5 h-3.5 text-gray-400" /> User — standard access</span>
        <span className="flex items-center gap-1"><Ban className="w-3.5 h-3.5 text-red-500" /> Blocked — login temporarily suspended</span>
      </div>

      {/* User detail side panel */}
      {selectedUser && (
        <UserDetail
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onRoleChanged={() => {
            refetch().then(res => {
              const updated = res.data?.users.find(u => u.id === selectedUser.id)
              if (updated) setSelectedUser(updated)
            })
          }}
          onUserDeleted={() => {
            setSelectedUser(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}
