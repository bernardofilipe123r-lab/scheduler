import {
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react'

// ─── Chart palette ──────────────────────────────────────

export const CHART_BLUE = '#3B82F6'
export const CHART_GREEN = '#10B981'
export const CHART_PURPLE = '#8B5CF6'
export const CHART_PINK = '#EC4899'
export const CHART_AMBER = '#F59E0B'
export const CHART_CYAN = '#06B6D4'
export const BAR_COLORS = [CHART_BLUE, CHART_GREEN, CHART_PURPLE, CHART_PINK, CHART_AMBER, CHART_CYAN]

export const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  youtube: '#FF0000',
  facebook: '#1877F2',
  threads: '#000000',
  tiktok: '#010101',
}

// ─── Formatters ─────────────────────────────────────────

export function fmt(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toLocaleString()
}

export function fmtGrowth(num: number): string {
  const prefix = num > 0 ? '+' : ''
  return prefix + fmt(num)
}

export function pctColor(pct: number) {
  if (pct > 0) return 'text-green-600'
  if (pct < 0) return 'text-red-500'
  return 'text-gray-400'
}

// ─── Reusable components ────────────────────────────────

export function PctBadge({ value }: { value: number | null }) {
  if (value === null) return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-gray-300">
      <Minus className="w-3 h-3" /> —
    </span>
  )
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${pctColor(value)}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}

export function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-gray-300 mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-700">{title}</h3>
      <p className="text-sm text-gray-400 mt-1 max-w-md">{description}</p>
    </div>
  )
}
