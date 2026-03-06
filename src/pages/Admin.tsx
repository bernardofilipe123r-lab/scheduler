import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ShieldCheck, Users, Search, RefreshCw, AlertCircle,
  Ban, UserCheck, Shield,
  Crown, ScrollText, X, Layers, Clock, ArrowUpDown, Trash2, ExternalLink,
  Bot, Power, Play, Loader2, Zap, Sparkles, Activity,
  Instagram, Facebook, Youtube, ChevronDown, ChevronUp, Check, Link, Calendar, Settings, Brain,
  Cpu, Image, Database, HardDrive, Wifi, Server, Globe, BarChart3,
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
  active: boolean
  // Social
  instagram_handle: string | null
  facebook_page_name: string | null
  youtube_channel_name: string | null
  // Scheduling
  posts_per_day: number | null
  schedule_offset: number | null
  baseline_for_content: boolean
  // Colors
  colors: {
    primary?: string
    accent?: string
    text?: string
    color_name?: string
  }
  // Credentials status
  has_instagram: boolean
  has_facebook: boolean
  instagram_business_account_id: string | null
  facebook_page_id: string | null
  // Logo
  logo_path: string | null
  // Timestamps
  created_at: string | null
  updated_at: string | null
}

interface NicheConfig {
  id: string
  niche_name: string
  niche_description: string
  content_brief: string
  target_audience: string
  audience_description: string
  content_tone: string[]
  tone_avoid: string[]
  topic_categories: string[]
  topic_keywords: string[]
  topic_avoid: string[]
  content_philosophy: string
  hook_themes: string[]
  brand_personality: string | null
  brand_focus_areas: string[]
  parent_brand_name: string
  competitor_accounts: string[]
  discovery_hashtags: string[]
  cta_options: string[]
  hashtags: string[]
  carousel_cta_options: string[]
  carousel_cta_topic: string
  image_style_description: string
  image_palette_keywords: string[]
  citation_style: string
  citation_source_types: string[]
  carousel_cover_overlay_opacity: number
  carousel_content_overlay_opacity: number
  follow_section_text: string
  save_section_text: string
  disclaimer_text: string
  created_at: string | null
  updated_at: string | null
}

interface NicheConfig {
  id: string
  niche_name: string
  niche_description: string
  content_brief: string
  target_audience: string
  audience_description: string
  content_tone: string[]
  tone_avoid: string[]
  topic_categories: string[]
  topic_keywords: string[]
  topic_avoid: string[]
  content_philosophy: string
  hook_themes: string[]
  brand_personality: string | null
  brand_focus_areas: string[]
  parent_brand_name: string
  competitor_accounts: string[]
  discovery_hashtags: string[]
  cta_options: string[]
  hashtags: string[]
  carousel_cta_options: string[]
  carousel_cta_topic: string
  image_style_description: string
  image_palette_keywords: string[]
  citation_style: string
  citation_source_types: string[]
  carousel_cover_overlay_opacity: number
  carousel_content_overlay_opacity: number
  follow_section_text: string
  save_section_text: string
  disclaimer_text: string
  created_at: string | null
  updated_at: string | null
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

// ─── DetailRow helper ─────────────────────────────────────────────────────────

function DetailRow({
  icon, label, value, mono = false,
}: { icon: React.ReactNode; label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-gray-200">
      <span className="flex items-center gap-2 text-gray-600">{icon} {label}</span>
      {value
        ? <span className={`text-gray-800 font-medium truncate max-w-[55%] ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</span>
        : <span className="text-gray-400">—</span>
      }
    </div>
  )
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
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const isSelf = currentUser?.id === user.id
  const [activeTab, setActiveTab] = useState<'brands' | 'logs' | 'toby'>('brands')
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
                          {/* Logo / initials with brand primary color */}
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

                                      {/* Topic Categories — the critical field */}
                                      <div className={`px-3 py-2 rounded-lg border ${hasTopics ? 'bg-white border-gray-200' : 'bg-amber-50 border-amber-300'}`}>
                                        <p className={`mb-1 font-semibold ${hasTopics ? 'text-gray-400' : 'text-amber-700'}`}>
                                          Topic Categories ({nc.topic_categories?.length ?? 0})
                                          {!hasTopics && ' — required for Toby'}
                                        </p>
                                        {hasTopics
                                          ? <div className="flex flex-wrap gap-1">{nc.topic_categories.map((t, i) => <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-medium">{t}</span>)}</div>
                                          : <p className="text-amber-700 text-[10px]">Empty — user must add at least one topic category in their Content DNA settings.</p>
                                        }
                                      </div>

                                      {/* Content Tone */}
                                      {nc.content_tone && nc.content_tone.length > 0 && (
                                        <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg">
                                          <p className="text-gray-400 mb-1">Tone</p>
                                          <div className="flex flex-wrap gap-1">{nc.content_tone.map((t, i) => <span key={i} className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full text-[10px]">{t}</span>)}</div>
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
        </div>
      </div>
    </div>
  )
}

// ─── Main Admin Page ─────────────────────────────────────────────────────────

// ─── Credits types ──────────────────────────────────────────────────────────

interface DeepSeekBalanceInfo {
  currency: string
  total_balance: string
  granted_balance: string
  topped_up_balance: string
}

interface CreditsResponse {
  deepseek?: {
    available?: boolean
    balance_infos?: DeepSeekBalanceInfo[]
    error?: string
  }
  deapi?: {
    data?: { balance?: number }
    balance_usd?: number
    currency?: string
    credits?: number
    remaining?: number
    balance?: number
    error?: string
    detail?: string
    [key: string]: unknown
  }
}

// ─── Supabase Usage Types ──────────────────────────────────────────────────

// ─── API Usage Types ───────────────────────────────────────────────────────

interface ApiUsageEntry {
  label: string
  local_count: number
  limit: number
  period: 'daily' | 'monthly'
  remaining: number
  usage_pct: number
  live?: Record<string, unknown>
}

// ────────────────────────────────────────────────────────────────────────────

interface DbStats {
  database_size_bytes?: number
  database_size_mb?: number
  active_connections?: number
  total_connections?: number
  top_tables?: Array<{ schema: string; table: string; row_count: number }>
  error?: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface SupabaseUsageResponse {
  db_stats: DbStats
  usage: Record<string, any> | null
  infrastructure: Record<string, any> | null
  error: string | null
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Usage Progress Bar ─────────────────────────────────────────────────────

function UsageBar({ used, limit, label, icon, unit = 'GB', decimals = 2 }: {
  used: number
  limit: number
  label: string
  icon: React.ReactNode
  unit?: string
  decimals?: number
}) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  const overLimit = used > limit
  const barColor = overLimit
    ? 'bg-red-500'
    : pct > 80
      ? 'bg-amber-500'
      : 'bg-emerald-500'
  const textColor = overLimit ? 'text-red-600' : pct > 80 ? 'text-amber-600' : 'text-gray-700'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
          {icon} {label}
        </span>
        <span className={clsx('text-xs font-semibold', textColor)}>
          {used.toFixed(decimals)} / {limit.toFixed(decimals)} {unit}
          {' '}({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {overLimit && (
        <p className="text-[10px] text-red-500 font-medium flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Exceeded by {(used - limit).toFixed(decimals)} {unit}
        </p>
      )}
    </div>
  )
}

// ─── Section toggle helper ─────────────────────────────────────────────────

function SectionHeader({ label, open, toggle, icon }: { label: string; open: boolean; toggle: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={toggle} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700 transition-colors w-full">
      {icon}
      {label}
      {open ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
    </button>
  )
}

// ─── Health dot ─────────────────────────────────────────────────────────────

function HealthDot({ healthy, status }: { healthy: boolean; status?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={clsx('w-2 h-2 rounded-full shrink-0', healthy ? 'bg-emerald-500' : 'bg-red-500')} />
      <span className={clsx('font-medium', healthy ? 'text-emerald-700' : 'text-red-700')}>
        {status ?? (healthy ? 'Healthy' : 'Unhealthy')}
      </span>
    </span>
  )
}

// ─── Supabase Infrastructure Panel ─────────────────────────────────────────

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
                        storage_image_render_count: <Image className="w-3.5 h-3.5 text-gray-400" />,
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

            {/* DeAPI */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-50 border border-purple-100">
              <Image className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-purple-700 mb-1">DeAPI (Image Gen)</p>
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
