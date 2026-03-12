import { Clock, Loader2, CalendarCheck, Globe, XCircle, TrendingUp } from 'lucide-react'
import { clsx } from 'clsx'
import type { PipelineStats as Stats } from '../model/types'

const CARDS = [
  { key: 'pending_review', label: 'Pending Review', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'generating', label: 'Generating', icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'scheduled', label: 'Scheduled', icon: CalendarCheck, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'published', label: 'Published', icon: Globe, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'rejected', label: 'Rejected', icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  { key: 'rate', label: 'Approval Rate', icon: TrendingUp, color: 'text-gray-600', bg: 'bg-gray-50' },
] as const

interface Props {
  stats: Stats | undefined
  isLoading: boolean
}

export function PipelineStats({ stats, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
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
  )
}
