import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  X, Layers, Clock, ArrowUpDown, Trash2, ExternalLink,
  Bot, Power, Play, Loader2, Zap, Sparkles, Activity,
  Instagram, Facebook, Youtube, ChevronDown, ChevronUp, Check, Link, Calendar, Settings, Brain,
  Image, AlertCircle, Shield, Crown, UserCheck, Ban, ScrollText, BarChart3, RefreshCw,
} from 'lucide-react'
import { clsx } from 'clsx'
import { apiClient } from '@/shared/api/client'
import { Spinner } from '@/shared/components'
import { useAuth } from '@/features/auth/AuthContext'
import type { AdminUser, Brand, NicheConfig, LogsResponse } from './types'
import { formatDate, formatTimestamp, RoleBadge, LEVEL_STYLES, CATEGORY_STYLES, statusColorClass, DetailRow } from './helpers'

export function UserDetailPanel({
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
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const isSelf = currentUser?.id === user.id
  const [activeTab, setActiveTab] = useState<'brands' | 'logs' | 'toby' | 'costs'>('brands')
  const [logPage, setLogPage] = useState(1)
  const [logOrder, setLogOrder] = useState<'desc' | 'asc'>('desc')
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null)
  const [expandedBrandId, setExpandedBrandId] = useState<string | null>(null)

  // Brands
  const brandsQuery = useQuery<{ brands: Brand[] }>({
    queryKey: ['admin-user-brands', user.id],
    queryFn: () => apiClient.get(`/api/admin/users/${user.id}/brands`),
  })

  // Content DNA (NicheConfig)
  const nicheConfigQuery = useQuery<{ niche_configs: NicheConfig[] }>({
    queryKey: ['admin-user-niche-config', user.id],
    queryFn: () => apiClient.get(`/api/admin/users/${user.id}/niche-config`),
    enabled: activeTab === 'brands',
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

  // Toby status
  const tobyStatusQuery = useQuery<{
    enabled: boolean
    phase: string
    phase_started_at: string | null
    enabled_at: string | null
    buffer: { health: string; total_slots: number; filled_slots: number; fill_percent: number; brand_count: number; reel_slots_per_day: number; post_slots_per_day: number; buffer_days: number } | null
    active_experiments: number
    config: Record<string, unknown>
    timestamps: { last_buffer_check_at: string | null; last_metrics_check_at: string | null; last_analysis_at: string | null; last_discovery_at: string | null }
    stats: { total_created: number; total_scored: number }
  }>({
    queryKey: ['admin-toby-status', user.id],
    queryFn: () => apiClient.get(`/api/toby/status?user_id=${user.id}`),
    enabled: activeTab === 'toby',
    refetchInterval: activeTab === 'toby' ? 300_000 : false,
    refetchOnWindowFocus: false,
  })

  // Toby activity
  const tobyActivityQuery = useQuery<{ total: number; items: Array<{ id: number; action_type: string; description: string; metadata: Record<string, unknown>; created_at: string }> }>({
    queryKey: ['admin-toby-activity', user.id],
    queryFn: () => apiClient.get(`/api/toby/activity?user_id=${user.id}&limit=20`),
    enabled: activeTab === 'toby',
  })

  // Cost tracking
  const [costPeriod, setCostPeriod] = useState<'day' | 'week' | 'month' | 'all'>('month')
  const costsQuery = useQuery<{
    user_id: string
    period: string
    totals: {
      deepseek_calls: number
      deepseek_input_tokens: number
      deepseek_output_tokens: number
      deepseek_cost_usd: number
      deapi_calls: number
      deapi_cost_usd: number
      reels_generated: number
      carousels_generated: number
      total_cost_usd: number
    }
    daily: Array<{
      date: string
      deepseek_calls: number
      deepseek_input_tokens: number
      deepseek_output_tokens: number
      deepseek_cost_usd: number
      deapi_calls: number
      deapi_cost_usd: number
      reels_generated: number
      carousels_generated: number
      total_cost_usd: number
    }>
    monthly: Array<{
      month: string
      deepseek_calls: number
      deepseek_cost_usd: number
      deapi_calls: number
      deapi_cost_usd: number
      reels_generated: number
      carousels_generated: number
      total_cost_usd: number
    }>
  }>({
    queryKey: ['admin-user-costs', user.id, costPeriod],
    queryFn: () => apiClient.get(`/api/admin/users/${user.id}/costs?period=${costPeriod}`),
    enabled: activeTab === 'costs',
  })

  // Toby enable/disable
  const tobyEnableMut = useMutation({
    mutationFn: () => apiClient.post(`/api/toby/enable?user_id=${user.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-toby-status', user.id] }),
  })
  const tobyDisableMut = useMutation({
    mutationFn: () => apiClient.post(`/api/toby/disable?user_id=${user.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-toby-status', user.id] }),
  })
  const tobyToggling = tobyEnableMut.isPending || tobyDisableMut.isPending

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
    if (!window.confirm(`Permanently delete ${user.email} and ALL their data (brands, jobs, analytics, etc.)? This cannot be undone.`)) return
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
            <button
              onClick={() => navigate(`/calendar?user_id=${user.id}&user_name=${encodeURIComponent(user.name || user.email)}`)}
              title="View user's calendar"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" /> View Calendar
            </button>
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
            {(user.is_admin || user.is_super_admin) && !user.is_blocked && !isSelf && (
              <button
                disabled={actionBusy}
                onClick={() => confirmRole('user', 'Regular User')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                <UserCheck className="w-3.5 h-3.5" /> Demote to User
              </button>
            )}
            {!isSelf && (!user.is_blocked ? (
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
            ))}
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
          <button
            onClick={() => setActiveTab('toby')}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'toby'
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <Bot className="w-4 h-4" /> Toby AI
          </button>
          <button
            onClick={() => setActiveTab('costs')}
            className={clsx(
              'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'costs'
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            <BarChart3 className="w-4 h-4" /> Usage & Costs
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
                <div className="space-y-3">
                  {(brandsQuery.data?.brands ?? []).map(b => {
                    const isExpanded = expandedBrandId === b.id
                    const primaryColor = b.colors?.primary
                    const accentColor = b.colors?.accent
                    return (
                      <div key={b.id} className="rounded-xl border border-gray-200 overflow-hidden">
                        {/* Brand header row — click to expand */}
                        <div
                          className="flex items-center gap-4 p-4 bg-white cursor-pointer hover:bg-gray-50 transition-colors select-none"
                          onClick={() => setExpandedBrandId(isExpanded ? null : b.id)}
                        >
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-sm"
                            style={{ backgroundColor: primaryColor || '#292524' }}
                          >
                            {b.short_name || b.id.slice(0, 3).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-900 text-sm">{b.display_name}</p>
                              {b.baseline_for_content && (
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-violet-100 text-violet-700">Baseline</span>
                              )}
                              {b.has_instagram && (
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-pink-100 text-pink-700 flex items-center gap-0.5">
                                  <Instagram className="w-2.5 h-2.5" /> IG
                                </span>
                              )}
                              {b.has_facebook && (
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-blue-100 text-blue-700 flex items-center gap-0.5">
                                  <Facebook className="w-2.5 h-2.5" /> FB
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 font-mono">{b.id}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              disabled={deleteBrandMutation.isPending}
                              onClick={e => { e.stopPropagation(); confirmDeleteBrand(b) }}
                              title="Delete brand"
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            {isExpanded
                              ? <ChevronUp className="w-4 h-4 text-gray-400" />
                              : <ChevronDown className="w-4 h-4 text-gray-400" />
                            }
                          </div>
                        </div>

                        {/* Expanded detail panel */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4 text-xs">

                            {/* Social handles */}
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Social Handles</p>
                              <div className="grid grid-cols-1 gap-1.5">
                                <DetailRow icon={<Instagram className="w-3.5 h-3.5 text-pink-500" />} label="Instagram" value={b.instagram_handle} />
                                <DetailRow icon={<Facebook className="w-3.5 h-3.5 text-blue-500" />} label="Facebook" value={b.facebook_page_name} />
                                <DetailRow icon={<Youtube className="w-3.5 h-3.5 text-red-500" />} label="YouTube" value={b.youtube_channel_name} />
                              </div>
                            </div>

                            {/* Credentials */}
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Credentials</p>
                              <div className="grid grid-cols-1 gap-1.5">
                                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-gray-200">
                                  <span className="flex items-center gap-2 text-gray-600"><Instagram className="w-3.5 h-3.5 text-pink-500" /> Instagram API</span>
                                  {b.has_instagram
                                    ? <span className="flex items-center gap-1 text-emerald-600 font-medium"><Check className="w-3 h-3" /> Connected</span>
                                    : <span className="text-gray-400">Not connected</span>
                                  }
                                </div>
                                {b.instagram_business_account_id && (
                                  <DetailRow icon={<Link className="w-3.5 h-3.5 text-gray-400" />} label="IG Business ID" value={b.instagram_business_account_id} mono />
                                )}
                                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-gray-200">
                                  <span className="flex items-center gap-2 text-gray-600"><Facebook className="w-3.5 h-3.5 text-blue-500" /> Facebook API</span>
                                  {b.has_facebook
                                    ? <span className="flex items-center gap-1 text-emerald-600 font-medium"><Check className="w-3 h-3" /> Connected</span>
                                    : <span className="text-gray-400">Not connected</span>
                                  }
                                </div>
                                {b.facebook_page_id && (
                                  <DetailRow icon={<Link className="w-3.5 h-3.5 text-gray-400" />} label="FB Page ID" value={b.facebook_page_id} mono />
                                )}
                              </div>
                            </div>

                            {/* Scheduling */}
                            <div>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Scheduling</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                <DetailRow icon={<Settings className="w-3.5 h-3.5 text-gray-400" />} label="Posts / day" value={b.posts_per_day != null ? String(b.posts_per_day) : null} />
                                <DetailRow icon={<Clock className="w-3.5 h-3.5 text-gray-400" />} label="Schedule offset" value={b.schedule_offset != null ? `${b.schedule_offset}h` : null} />
                              </div>
                            </div>

                            {/* Colors */}
                            {(primaryColor || accentColor || b.colors?.color_name) && (
                              <div>
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Brand Colors</p>
                                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-gray-200">
                                  {primaryColor && (
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-5 h-5 rounded-md border border-black/10 shadow-sm" style={{ backgroundColor: primaryColor }} />
                                      <span className="text-gray-500 font-mono">{primaryColor}</span>
                                    </div>
                                  )}
                                  {accentColor && (
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-5 h-5 rounded-md border border-black/10 shadow-sm" style={{ backgroundColor: accentColor }} />
                                      <span className="text-gray-500 font-mono">{accentColor}</span>
                                    </div>
                                  )}
                                  {b.colors?.color_name && (
                                    <span className="text-gray-400 italic ml-auto">{b.colors.color_name}</span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Timestamps */}
                            <div className="flex gap-4 text-gray-400 pt-1 border-t border-gray-200">
                              <span><Calendar className="w-3 h-3 inline mr-1" />Created {formatDate(b.created_at)}</span>
                              <span><Clock className="w-3 h-3 inline mr-1" />Updated {formatDate(b.updated_at)}</span>
                            </div>

                            {/* Content DNA */}
                            {(() => {
                              const nc = (nicheConfigQuery.data?.niche_configs ?? [])[0]
                              const isLoading = nicheConfigQuery.isLoading
                              const hasTopics = nc && nc.topic_categories && nc.topic_categories.length > 0
                              return (
                                <div className="pt-2 border-t border-gray-200">
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                    <Brain className="w-3 h-3" /> Content DNA
                                    {nc && !hasTopics && (
                                      <span className="ml-auto flex items-center gap-1 text-amber-600 font-semibold">
                                        <AlertCircle className="w-3 h-3" /> No topic categories — Toby blocked
                                      </span>
                                    )}
                                    {!nc && !isLoading && (
                                      <span className="ml-auto flex items-center gap-1 text-red-600 font-semibold">
                                        <AlertCircle className="w-3 h-3" /> No Content DNA row — Toby blocked
                                      </span>
                                    )}
                                  </p>
                                  {isLoading ? (
                                    <div className="flex justify-center py-3"><Spinner size={16} className="text-gray-400" /></div>
                                  ) : !nc ? (
                                    <p className="text-xs text-red-600 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
                                      No Content DNA record found. The user needs to open their Brands page to initialise it.
                                    </p>
                                  ) : (
                                    <div className="space-y-2 text-xs">
                                      {/* Identity */}
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                                          <p className="text-gray-400 mb-0.5">Niche</p>
                                          <p className="font-medium text-gray-800">{nc.niche_name || '—'}</p>
                                        </div>
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                                          <p className="text-gray-400 mb-0.5">Target Audience</p>
                                          <p className="font-medium text-gray-800">{nc.target_audience || '—'}</p>
                                        </div>
                                      </div>

                                      {/* Topic Categories */}
                                      <div className={`px-3 py-2 rounded-lg border ${hasTopics ? 'bg-white border-gray-200' : 'bg-amber-50 border-amber-300'}`}>
                                        <p className={`mb-1 font-semibold ${hasTopics ? 'text-gray-400' : 'text-amber-700'}`}>
                                          Topic Categories ({nc.topic_categories?.length ?? 0})
                                          {!hasTopics && ' — required for Toby'}
                                        </p>
                                        {hasTopics
                                          ? <div className="flex flex-wrap gap-1">{nc.topic_categories.map((t: string, i: number) => <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-medium">{t}</span>)}</div>
                                          : <p className="text-amber-700 text-[10px]">Empty — user must add at least one topic category in their Content DNA settings.</p>
                                        }
                                      </div>

                                      {/* Content Tone */}
                                      {nc.content_tone && nc.content_tone.length > 0 && (
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                                          <p className="text-gray-400 mb-1">Tone</p>
                                          <div className="flex flex-wrap gap-1">{nc.content_tone.map((t: string, i: number) => <span key={i} className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full text-[10px]">{t}</span>)}</div>
                                        </div>
                                      )}

                                      {/* Topic Keywords */}
                                      {nc.topic_keywords && nc.topic_keywords.length > 0 && (
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                                          <p className="text-gray-400 mb-1">Keywords ({nc.topic_keywords.length})</p>
                                          <div className="flex flex-wrap gap-1">{nc.topic_keywords.slice(0, 20).map((k, i) => <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">{k}</span>)}{nc.topic_keywords.length > 20 && <span className="text-gray-400 text-[10px]">+{nc.topic_keywords.length - 20} more</span>}</div>
                                        </div>
                                      )}

                                      {/* Discovery */}
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                                          <p className="text-gray-400 mb-1">Competitor Accounts ({nc.competitor_accounts?.length ?? 0})</p>
                                          {(nc.competitor_accounts?.length ?? 0) > 0
                                            ? <div className="flex flex-wrap gap-1">{nc.competitor_accounts.map((a, i) => <span key={i} className="px-1.5 py-0.5 bg-pink-50 text-pink-700 rounded text-[10px] font-mono">{a}</span>)}</div>
                                            : <p className="text-gray-400">—</p>
                                          }
                                        </div>
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                                          <p className="text-gray-400 mb-1">Discovery Hashtags ({nc.discovery_hashtags?.length ?? 0})</p>
                                          {(nc.discovery_hashtags?.length ?? 0) > 0
                                            ? <div className="flex flex-wrap gap-1">{nc.discovery_hashtags.map((h, i) => <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-mono">{h}</span>)}</div>
                                            : <p className="text-gray-400">—</p>
                                          }
                                        </div>
                                      </div>

                                      {/* CTAs & Hashtags counts */}
                                      <div className="grid grid-cols-3 gap-1.5">
                                        {[
                                          { label: 'CTAs', value: nc.cta_options?.length ?? 0 },
                                          { label: 'Hashtags', value: nc.hashtags?.length ?? 0 },
                                          { label: 'Hook Themes', value: nc.hook_themes?.length ?? 0 },
                                        ].map(({ label, value }) => (
                                          <div key={label} className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-center">
                                            <p className="text-lg font-bold text-gray-900">{value}</p>
                                            <p className="text-gray-400 text-[10px]">{label}</p>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Text fields */}
                                      {nc.content_brief && (
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                                          <p className="text-gray-400 mb-1">Content Brief</p>
                                          <p className="text-gray-700 whitespace-pre-wrap">{nc.content_brief}</p>
                                        </div>
                                      )}
                                      {nc.brand_personality && (
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                                          <p className="text-gray-400 mb-1">Brand Personality</p>
                                          <p className="text-gray-700 whitespace-pre-wrap">{nc.brand_personality}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )
                  })}
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
                    href={`/logs?user_id=${encodeURIComponent(user.id)}&user_name=${encodeURIComponent(user.name || user.email)}&user_email=${encodeURIComponent(user.email)}&user_role=${encodeURIComponent(user.is_super_admin ? 'Super Admin' : user.is_admin ? 'Admin' : user.is_blocked ? 'Blocked' : 'User')}`}
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

          {activeTab === 'toby' && (
            <div className="p-6 space-y-5">
              {tobyStatusQuery.isLoading ? (
                <div className="flex justify-center py-10"><Spinner size={24} className="text-gray-400" /></div>
              ) : tobyStatusQuery.isError ? (
                <div className="text-center py-10 text-gray-400">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-300" />
                  <p className="text-sm text-red-600">Failed to load Toby status</p>
                  <p className="text-xs text-gray-400 mt-1">{(tobyStatusQuery.error as Error).message}</p>
                </div>
              ) : tobyStatusQuery.data ? (() => {
                const ts = tobyStatusQuery.data
                const phaseConfig: Record<string, { label: string; color: string; bg: string; icon: typeof Shield }> = {
                  bootstrap: { label: 'Bootstrap', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Shield },
                  learning: { label: 'Learning', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: Zap },
                  optimizing: { label: 'Optimizing', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: Sparkles },
                }
                const pi = phaseConfig[ts.phase] || phaseConfig.bootstrap
                const PhaseIcon = pi.icon
                return (
                  <>
                    {/* Status card */}
                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className={`relative shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${ts.enabled ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                        <Bot className={`w-5 h-5 ${ts.enabled ? 'text-emerald-600' : 'text-gray-400'}`} />
                        {ts.enabled && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white">
                            <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${ts.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                            {ts.enabled ? 'Active' : 'Inactive'}
                          </span>
                          {ts.enabled && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${pi.bg} ${pi.color}`}>
                              <PhaseIcon className="w-3 h-3" />
                              {pi.label}
                            </span>
                          )}
                          {ts.active_experiments > 0 && (
                            <span className="text-[10px] text-gray-500">{ts.active_experiments} experiment{ts.active_experiments !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                        {ts.enabled_at && (
                          <p className="text-[10px] text-gray-400">Enabled {formatDate(ts.enabled_at)}</p>
                        )}
                      </div>
                      <button
                        onClick={() => ts.enabled ? tobyDisableMut.mutate() : tobyEnableMut.mutate()}
                        disabled={tobyToggling}
                        className={clsx(
                          'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
                          ts.enabled
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700',
                        )}
                      >
                        {tobyToggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ts.enabled ? <Power className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        {ts.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>

                    {/* Preflight error */}
                    {tobyEnableMut.isError && (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">{(tobyEnableMut.error as { message?: string })?.message || 'Could not enable Toby. Ensure the user has an active brand with Instagram connected and Content DNA configured.'}</p>
                      </div>
                    )}

                    {/* Buffer health */}
                    {ts.buffer && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Buffer Health</h4>
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className={`font-medium ${
                              ts.buffer.health === 'healthy' ? 'text-emerald-600' :
                              ts.buffer.health === 'low' ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {ts.buffer.health === 'healthy' ? '● Healthy' : ts.buffer.health === 'low' ? '● Low' : '● Critical'}
                            </span>
                            <span className="text-gray-500 text-xs">{ts.buffer.filled_slots}/{ts.buffer.total_slots} slots ({ts.buffer.fill_percent}%)</span>
                          </div>
                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                ts.buffer.health === 'healthy' ? 'bg-emerald-500' :
                                ts.buffer.health === 'low' ? 'bg-amber-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(ts.buffer.fill_percent, 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-gray-400">
                            {ts.buffer.brand_count} brand{ts.buffer.brand_count !== 1 ? 's' : ''} · {ts.buffer.reel_slots_per_day} reels + {ts.buffer.post_slots_per_day} posts/day · {ts.buffer.buffer_days} day buffer
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Stats & timestamps */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-400 mb-1">Content Created</p>
                        <p className="text-lg font-bold text-gray-900">{ts.stats.total_created}</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-xs text-gray-400 mb-1">Content Scored</p>
                        <p className="text-lg font-bold text-gray-900">{ts.stats.total_scored}</p>
                      </div>
                    </div>

                    {/* Timestamps */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Actions</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          { label: 'Buffer check', val: ts.timestamps.last_buffer_check_at },
                          { label: 'Metrics check', val: ts.timestamps.last_metrics_check_at },
                          { label: 'Analysis', val: ts.timestamps.last_analysis_at },
                          { label: 'Discovery', val: ts.timestamps.last_discovery_at },
                        ].map(t => (
                          <div key={t.label} className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-100">
                            <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-gray-500 truncate">{t.label}</p>
                              <p className="text-gray-700 font-medium truncate">{t.val ? formatDate(t.val) : '—'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recent activity */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" /> Recent Activity
                      </h4>
                      {tobyActivityQuery.isLoading ? (
                        <div className="flex justify-center py-6"><Spinner size={20} className="text-gray-400" /></div>
                      ) : (tobyActivityQuery.data?.items ?? []).length === 0 ? (
                        <p className="text-xs text-gray-400 py-4 text-center">No activity yet</p>
                      ) : (
                        <div className="space-y-1 max-h-72 overflow-y-auto">
                          {(tobyActivityQuery.data?.items ?? []).map(a => (
                            <div key={a.id} className="flex items-start gap-2 px-3 py-2 text-xs bg-gray-50 rounded border border-gray-100">
                              <span className="text-gray-400 whitespace-nowrap shrink-0 mt-0.5">{formatTimestamp(a.created_at)}</span>
                              <span className={clsx(
                                'inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0',
                                a.action_type.includes('failed') || a.action_type.includes('error') ? 'bg-red-50 text-red-600' :
                                a.action_type.includes('partial') ? 'bg-amber-50 text-amber-700' :
                                a.action_type.includes('create') || a.action_type.includes('generate') ? 'bg-violet-50 text-violet-700' :
                                a.action_type.includes('publish') ? 'bg-green-50 text-green-700' :
                                a.action_type.includes('experiment') ? 'bg-blue-50 text-blue-700' :
                                'bg-gray-100 text-gray-600'
                              )}>
                                {a.action_type.replace(/_/g, ' ')}
                              </span>
                              <span className="text-gray-600 break-words min-w-0">{a.description}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )
              })() : null}
            </div>
          )}

          {activeTab === 'costs' && (
            <div className="p-6 space-y-5">
              {/* Period filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Period:</span>
                {(['day', 'week', 'month', 'all'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setCostPeriod(p)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      costPeriod === p
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
                    )}
                  >
                    {p === 'day' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
                  </button>
                ))}
              </div>

              {costsQuery.isLoading ? (
                <div className="flex justify-center py-10"><Spinner size={24} className="text-gray-400" /></div>
              ) : costsQuery.isError ? (
                <div className="text-center py-10 text-gray-400">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-300" />
                  <p className="text-sm text-red-600">Failed to load cost data</p>
                </div>
              ) : costsQuery.data ? (() => {
                const { totals, daily, monthly } = costsQuery.data
                return (
                  <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <p className="text-xs text-gray-500 font-medium">Total Spent</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">${totals.total_cost_usd.toFixed(4)}</p>
                        <p className="text-[10px] text-gray-400 mt-1">DeepSeek + DeAPI combined</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <p className="text-xs text-gray-500 font-medium">Content Generated</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{totals.reels_generated + totals.carousels_generated}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{totals.reels_generated} reels · {totals.carousels_generated} carousels</p>
                      </div>
                    </div>

                    {/* DeepSeek breakdown */}
                    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                          <Brain className="w-3.5 h-3.5" /> DeepSeek (Text AI)
                        </h4>
                        <span className="text-sm font-bold text-gray-900">${totals.deepseek_cost_usd.toFixed(4)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-[10px] text-gray-400">API Calls</p>
                          <p className="text-sm font-semibold text-gray-800">{totals.deepseek_calls.toLocaleString()}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-[10px] text-gray-400">Input Tokens</p>
                          <p className="text-sm font-semibold text-gray-800">{totals.deepseek_input_tokens.toLocaleString()}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-[10px] text-gray-400">Output Tokens</p>
                          <p className="text-sm font-semibold text-gray-800">{totals.deepseek_output_tokens.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>

                    {/* DeAPI breakdown */}
                    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                          <Image className="w-3.5 h-3.5" /> DeAPI (Image Generation)
                        </h4>
                        <span className="text-sm font-bold text-gray-900">${totals.deapi_cost_usd.toFixed(4)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-[10px] text-gray-400">Images Generated</p>
                          <p className="text-sm font-semibold text-gray-800">{totals.deapi_calls.toLocaleString()}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-[10px] text-gray-400">Cost per Image</p>
                          <p className="text-sm font-semibold text-gray-800">
                            {totals.deapi_calls > 0 ? `$${(totals.deapi_cost_usd / totals.deapi_calls).toFixed(4)}` : '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Daily breakdown table */}
                    {daily.length > 0 && (
                      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100">
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Daily Breakdown</h4>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="text-left px-3 py-2 text-gray-500 font-medium">Date</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">Reels</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">Carousels</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">DeepSeek</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">DeAPI</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {daily.map(d => (
                                <tr key={d.date} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 text-gray-700 font-medium">{d.date}</td>
                                  <td className="px-3 py-2 text-right text-gray-600">{d.reels_generated}</td>
                                  <td className="px-3 py-2 text-right text-gray-600">{d.carousels_generated}</td>
                                  <td className="px-3 py-2 text-right text-gray-600">${d.deepseek_cost_usd.toFixed(4)}</td>
                                  <td className="px-3 py-2 text-right text-gray-600">${d.deapi_cost_usd.toFixed(4)}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-800">${d.total_cost_usd.toFixed(4)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Monthly aggregated data */}
                    {monthly.length > 0 && (
                      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100">
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Monthly History (Aggregated)</h4>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                <th className="text-left px-3 py-2 text-gray-500 font-medium">Month</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">Reels</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">Carousels</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">DeepSeek</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">DeAPI</th>
                                <th className="text-right px-3 py-2 text-gray-500 font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {monthly.map(m => (
                                <tr key={m.month} className="hover:bg-gray-50">
                                  <td className="px-3 py-2 text-gray-700 font-medium">{m.month}</td>
                                  <td className="px-3 py-2 text-right text-gray-600">{m.reels_generated}</td>
                                  <td className="px-3 py-2 text-right text-gray-600">{m.carousels_generated}</td>
                                  <td className="px-3 py-2 text-right text-gray-600">${m.deepseek_cost_usd.toFixed(4)}</td>
                                  <td className="px-3 py-2 text-right text-gray-600">${m.deapi_cost_usd.toFixed(4)}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-800">${m.total_cost_usd.toFixed(4)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {daily.length === 0 && monthly.length === 0 && (
                      <div className="text-center py-10 text-gray-400">
                        <BarChart3 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">No cost data recorded yet</p>
                        <p className="text-xs text-gray-400 mt-1">Cost tracking starts from now — data will appear after content is generated</p>
                      </div>
                    )}
                  </>
                )
              })() : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
