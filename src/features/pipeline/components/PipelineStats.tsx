import { Clock, Loader2, CalendarCheck, Globe, XCircle, TrendingUp } from 'lucide-react'
import { clsx } from 'clsx'
import { useTobyBuffer } from '@/features/toby'
import type { PipelineStats as Stats } from '../model/types'

const CARDS = [
  { key: 'pending_review', label: 'Pending Review', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'generating', label: 'Generating', icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'scheduled', label: 'Scheduled', icon: CalendarCheck, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'published', label: 'Published', icon: Globe, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'rejected', label: 'Rejected', icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  { key: 'rate', label: 'Approval Rate', icon: TrendingUp, color: 'text-gray-600', bg: 'bg-gray-50' },
] as const

/** Format a date as "12th March" style. */
function formatContentUntilDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDate()
  const month = d.toLocaleString('en-US', { month: 'long' })
  const suffix = day === 1 || day === 21 || day === 31 ? 'st'
    : day === 2 || day === 22 ? 'nd'
    : day === 3 || day === 23 ? 'rd'
    : 'th'
  return `${day}${suffix} ${month}`
}

/** Calculate the "content until" date from buffer data. */
function getContentUntilDate(buffer: { empty_slots: Array<{ date: string }>; buffer_days: number; fill_percent: number } | undefined): string | null {
  if (!buffer || buffer.buffer_days === 0) return null
  if (buffer.fill_percent <= 0) return null

  if (buffer.empty_slots.length === 0) {
    // 100% filled — content covers the full buffer window
    const end = new Date()
    end.setDate(end.getDate() + buffer.buffer_days)
    return formatContentUntilDate(end.toISOString().slice(0, 10))
  }

  // Find the earliest empty slot date
  const sortedDates = [...new Set(buffer.empty_slots.map(s => s.date))].sort()
  const firstGap = sortedDates[0]
  const gapDate = new Date(firstGap + 'T12:00:00')
  // Content until = day before first gap
  gapDate.setDate(gapDate.getDate() - 1)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (gapDate < today) return null
  return formatContentUntilDate(gapDate.toISOString().slice(0, 10))
}

interface Props {
  stats: Stats | undefined
  isLoading: boolean
}

export function PipelineStats({ stats, isLoading }: Props) {
  const { data: buffer } = useTobyBuffer()
  const contentUntil = getContentUntilDate(buffer)

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-10 rounded-xl bg-gray-100 animate-pulse" />
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {contentUntil && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CalendarCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-700">
            You have content until {contentUntil}
          </p>
        </div>
      )}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {CARDS.map(({ key, label, icon: Icon, color, bg }) => {
          const value = key === 'rate'
            ? `${stats?.rate ?? 0}%`
            : String(stats?.[key] ?? 0)

          return (
            <div key={key} className={clsx('rounded-xl px-4 py-3 flex items-center gap-3', bg)}>
              <Icon className={clsx('w-5 h-5 shrink-0', color)} />
              <div>
                <p className="text-xs text-gray-500 font-medium">{label}</p>
                <p className={clsx('text-lg font-bold', color)}>{value}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
