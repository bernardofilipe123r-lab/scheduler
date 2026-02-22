import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck, Users, Search, RefreshCw, AlertCircle,
  Ban, UserCheck, Shield,
  Crown, ScrollText, X, Layers, Clock, ArrowUpDown, Trash2, ExternalLink,
} from 'lucide-react'
import { clsx } from 'clsx'
import { apiClient } from '@/shared/api/client'
import { Spinner } from '@/shared/components'
import { useAuth } from '@/features/auth/AuthContext'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  is_admin: boolean
  is_super_admin: boolean
  is_blocked: boolean
  created_at: string | null
  last_sign_in_at: string | null
}

interface Brand {
  id: string
  display_name: string
  short_name: string
  instagram_handle: string | null
  facebook_page_name: string | null
  youtube_channel_name: string | null
}

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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function formatTimestamp(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function RoleBadge({ user }: { user: AdminUser }) {
  if (user.is_blocked) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <Ban className="w-3 h-3" /> Blocked
    </span>
  )
  if (user.is_super_admin) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
      <Crown className="w-3 h-3" /> Super Admin
    </span>
  )
  if (user.is_admin) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
      <Shield className="w-3 h-3" /> Admin
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
      <UserCheck className="w-3 h-3" /> User
    </span>
  )
}

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

function statusColorClass(s: number) {
  if (s >= 500) return 'bg-red-50 text-red-700'
  if (s >= 400) return 'bg-amber-50 text-amber-700'
  if (s >= 300) return 'bg-blue-50 text-blue-600'
  return 'bg-green-50 text-green-700'
}

// ─── User Detail Panel ───────────────────────────────────────────────────────

function UserDetail({
  user,
  onClose,
  onRoleChanged,
  onUserDeleted,
}: {
  user: AdminUser
  onClose: () => void
  onRoleChanged: () => void
  onUserDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()
  const isSelf = currentUser?.id === user.id
  const [activeTab, setActiveTab] = useState<'brands' | 'logs'>('brands')
  const [logPage, setLogPage] = useState(1)
  const [logOrder, setLogOrder] = useState<'desc' | 'asc'>('desc')
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null)

  // Brands
  const brandsQuery = useQuery<{ brands: Brand[] }>({
    queryKey: ['admin-user-brands', user.id],
    queryFn: () => apiClient.get(`/api/admin/users/${user.id}/brands`),
  })

  // Logs
  const logsQuery = useQuery<LogsResponse>({
    queryKey: ['admin-user-logs', user.id, logPage, logOrder],
    queryFn: () =>
      apiClient.get(
        `/api/admin/users/${user.id}/logs?page=${logPage}&page_size=50&order=${logOrder}`
      ),
    enabled: activeTab === 'logs',
  })

  // Role mutation
  const roleMutation = useMutation({
    mutationFn: (role: string) =>
      apiClient.put(`/api/admin/users/${user.id}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      onRoleChanged()
    },
  })

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/admin/users/${user.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      onUserDeleted()
    },
  })

  // Delete brand mutation
  const deleteBrandMutation = useMutation({
    mutationFn: (brandId: string) => apiClient.delete(`/api/admin/brands/${brandId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-brands', user.id] })
    },
  })

  const confirmRole = (newRole: string, label: string) => {
    if (!window.confirm(`Set ${user.email} as ${label}?`)) return
    roleMutation.mutate(newRole)
  }

  const confirmDeleteUser = () => {
    if (!window.confirm(`Permanently delete ${user.email}? This cannot be undone.`)) return
    deleteUserMutation.mutate()
  }

  const confirmDeleteBrand = (brand: Brand) => {
    if (!window.confirm(`Delete brand "${brand.display_name}"? This cannot be undone.`)) return
    deleteBrandMutation.mutate(brand.id)
  }

  const actionBusy = roleMutation.isPending || deleteUserMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <p className="font-semibold text-gray-900">{user.name || user.email}</p>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {!isSelf && (
              <button
                disabled={deleteUserMutation.isPending}
                onClick={confirmDeleteUser}
                title="Delete user permanently"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete User
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Role & Info */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0 space-y-3">
          <div className="flex items-center gap-3">
            <RoleBadge user={user} />
            <span className="text-xs text-gray-400">Joined {formatDate(user.created_at)}</span>
            <span className="text-xs text-gray-400">Last seen {formatDate(user.last_sign_in_at)}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {!user.is_super_admin && (
              <button
                disabled={actionBusy}
                onClick={() => confirmRole('super_admin', 'Super Admin')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 disabled:opacity-50 transition-colors"
              >
                <Crown className="w-3.5 h-3.5" /> Make Super Admin
              </button>
            )}
            {!user.is_admin && !user.is_super_admin && !user.is_blocked && (
              <button
                disabled={actionBusy}
                onClick={() => confirmRole('admin', 'Admin')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 transition-colors"
              >
                <Shield className="w-3.5 h-3.5" /> Make Admin
              </button>
            )}
            {(user.is_admin || user.is_super_admin) && !user.is_blocked && (
              <button
                disabled={actionBusy}
                onClick={() => confirmRole('user', 'Regular User')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                <UserCheck className="w-3.5 h-3.5" /> Demote to User
              </button>
            )}
            {!user.is_blocked ? (
              <button
                disabled={actionBusy}
                onClick={() => confirmRole('blocked', 'Blocked')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                <Ban className="w-3.5 h-3.5" /> Block User
              </button>
            ) : (
              <button
                disabled={actionBusy}
                onClick={() => confirmRole('user', 'Unblocked User')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50 transition-colors"
              >
                <UserCheck className="w-3.5 h-3.5" /> Unblock User
              </button>
            )}
            {actionBusy && <Spinner size={16} className="text-gray-500 self-center" />}
          </div>

          {roleMutation.isError && (
            <p className="text-xs text-red-600">
              Failed: {(roleMutation.error as Error).message}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 shrink-0">
          <button
            onClick={() => setActiveTab('brands')}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'brands'
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <Layers className="w-4 h-4" /> Brands
          </button>
          <button
            onClick={() => { setActiveTab('logs'); setLogPage(1) }}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'logs'
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <ScrollText className="w-4 h-4" /> System Logs
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'brands' && (
            <div className="p-6">
              {brandsQuery.isLoading ? (
                <div className="flex justify-center py-10"><Spinner size={24} className="text-gray-400" /></div>
              ) : (brandsQuery.data?.brands ?? []).length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Layers className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No brands found for this user</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(brandsQuery.data?.brands ?? []).map(b => (
                    <div key={b.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="w-9 h-9 rounded-lg bg-stone-800 text-white flex items-center justify-center text-xs font-bold shrink-0">
                        {b.short_name || b.id.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">{b.display_name}</p>
                        <p className="text-xs text-gray-400">{b.id}</p>
                        <div className="text-xs text-gray-400 mt-0.5 space-y-0.5">
                          {b.instagram_handle && <p>IG: {b.instagram_handle}</p>}
                          {b.facebook_page_name && <p>FB: {b.facebook_page_name}</p>}
                        </div>
                      </div>
                      <button
                        disabled={deleteBrandMutation.isPending}
                        onClick={() => confirmDeleteBrand(b)}
                        title="Delete brand"
                        className="p-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div>
              {/* Logs toolbar */}
              <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {logsQuery.data ? `${logsQuery.data.total.toLocaleString()} entries` : '—'}
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={`/logs?user_id=${encodeURIComponent(user.id)}&user_name=${encodeURIComponent(user.name || user.email)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    See in full page
                  </a>
                  <button
                    onClick={() => setLogOrder(o => o === 'desc' ? 'asc' : 'desc')}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 bg-white"
                  >
                    <ArrowUpDown className="w-3 h-3" />
                    {logOrder === 'desc' ? 'Newest first' : 'Oldest first'}
                  </button>
                  <button
                    onClick={() => setLogPage(1)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded border border-gray-200 bg-white"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {logsQuery.isLoading ? (
                <div className="flex justify-center py-10"><Spinner size={24} className="text-gray-400" /></div>
              ) : (logsQuery.data?.logs ?? []).length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <ScrollText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No logs found</p>
                </div>
              ) : (
                <div>
                  {(logsQuery.data?.logs ?? []).map(log => (
                    <div key={log.id}>
                      <div
                        onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                        className={clsx(
                          'flex items-start gap-2 px-4 py-2 text-xs border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors',
                          (log.level === 'ERROR' || log.level === 'CRITICAL') && 'border-l-2 border-l-red-400',
                          log.level === 'WARNING' && 'border-l-2 border-l-amber-400',
                        )}
                      >
                        <span className="text-gray-400 whitespace-nowrap mt-0.5 shrink-0">
                          {formatTimestamp(log.timestamp)}
                        </span>
                        <span className={clsx('inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0', LEVEL_STYLES[log.level] || LEVEL_STYLES.DEBUG)}>
                          {log.level}
                        </span>
                        <span className={clsx('inline-block px-1.5 py-0.5 rounded text-[10px] shrink-0', CATEGORY_STYLES[log.category] || 'bg-gray-100 text-gray-500')}>
                          {log.category?.replace(/_/g, ' ')}
                        </span>
                        <span className="text-gray-700 truncate flex-1">{log.message}</span>
                        {log.http_status && (
                          <span className={clsx('inline-block px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0', statusColorClass(log.http_status))}>
                            {log.http_status}
                          </span>
                        )}
                      </div>
                      {expandedLogId === log.id && (
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs space-y-2">
                          <p className="text-gray-800 whitespace-pre-wrap break-words">{log.message}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {log.source && <div><span className="text-gray-400">Source: </span><span className="text-gray-700">{log.source}</span></div>}
                            {log.duration_ms != null && <div><span className="text-gray-400">Duration: </span><span className="text-gray-700">{log.duration_ms}ms</span></div>}
                            {log.http_method && <div><span className="text-gray-400">HTTP: </span><span className="text-gray-700">{log.http_method} {log.http_path}</span></div>}
                          </div>
                          {log.details && Object.keys(log.details).length > 0 && (
                            <pre className="p-2 bg-white border border-gray-200 rounded text-[11px] text-gray-600 overflow-auto max-h-48 font-mono">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Log pagination */}
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white sticky bottom-0">
                    <p className="text-xs text-gray-500">
                      Page {logsQuery.data?.page} of {logsQuery.data?.total_pages}
                    </p>
                    <div className="flex gap-1">
                      <button
                        disabled={logPage <= 1}
                        onClick={() => setLogPage(p => p - 1)}
                        className="px-3 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
                      >
                        ← Prev
                      </button>
                      <button
                        disabled={logPage >= (logsQuery.data?.total_pages ?? 1)}
                        onClick={() => setLogPage(p => p + 1)}
                        className="px-3 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Admin Page ─────────────────────────────────────────────────────────

export function AdminPage() {
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)

  const { data, isLoading, error, refetch, isFetching } = useQuery<{ users: AdminUser[] }>({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.get('/api/admin/users'),
    staleTime: 30_000,
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
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_140px_120px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <span>User</span>
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
                  'grid grid-cols-[1fr_auto_140px_120px] gap-4 px-5 py-3.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors items-center',
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
