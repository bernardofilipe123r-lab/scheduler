import React from 'react'
import {
  AlertCircle, Ban, Crown, Shield, UserCheck, ChevronDown, ChevronUp,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { AdminUser } from './types'

export function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function formatTimestamp(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

export function RoleBadge({ user }: { user: AdminUser }) {
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

export function statusColorClass(s: number) {
  if (s >= 500) return 'bg-red-50 text-red-700'
  if (s >= 400) return 'bg-amber-50 text-amber-700'
  if (s >= 300) return 'bg-blue-50 text-blue-600'
  return 'bg-green-50 text-green-700'
}

export function DetailRow({
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

export const LEVEL_STYLES: Record<string, string> = {
  DEBUG: 'bg-gray-100 text-gray-600',
  INFO: 'bg-blue-50 text-blue-700',
  WARNING: 'bg-amber-50 text-amber-700',
  ERROR: 'bg-red-50 text-red-700',
  CRITICAL: 'bg-red-600 text-white',
}

export const CATEGORY_STYLES: Record<string, string> = {
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

export function UsageBar({ used, limit, label, icon, unit = 'GB', decimals = 2 }: {
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

export function SectionHeader({ label, open, toggle, icon }: { label: string; open: boolean; toggle: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={toggle} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700 transition-colors w-full">
      {icon}
      {label}
      {open ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
    </button>
  )
}

export function HealthDot({ healthy, status }: { healthy: boolean; status?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={clsx('w-2 h-2 rounded-full shrink-0', healthy ? 'bg-emerald-500' : 'bg-red-500')} />
      <span className={clsx('font-medium', healthy ? 'text-emerald-700' : 'text-red-700')}>
        {status ?? (healthy ? 'Healthy' : 'Unhealthy')}
      </span>
    </span>
  )
}
