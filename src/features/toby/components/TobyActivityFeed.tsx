import { Clock, Zap, Brain, Search, BarChart3, Settings } from 'lucide-react'
import { useTobyActivity } from '../hooks'
import type { TobyActivityItem } from '../types'

const ACTION_ICONS: Record<string, typeof Zap> = {
  content_generated: Zap,
  score_updated: BarChart3,
  discovery_run: Search,
  experiment_created: Brain,
  phase_transition: Settings,
  buffer_fill: Clock,
}

const ACTION_COLORS: Record<string, string> = {
  content_generated: 'text-blue-500 bg-blue-50',
  score_updated: 'text-green-500 bg-green-50',
  discovery_run: 'text-purple-500 bg-purple-50',
  experiment_created: 'text-amber-500 bg-amber-50',
  phase_transition: 'text-emerald-500 bg-emerald-50',
  buffer_fill: 'text-gray-500 bg-gray-50',
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function ActivityItem({ item }: { item: TobyActivityItem }) {
  const Icon = ACTION_ICONS[item.action_type] || Clock
  const color = ACTION_COLORS[item.action_type] || 'text-gray-500 bg-gray-50'

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800">{item.description}</p>
        <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.created_at)}</p>
      </div>
    </div>
  )
}

export function TobyActivityFeed() {
  const { data, isLoading } = useTobyActivity({ limit: 30 })

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="h-5 bg-gray-100 rounded w-32 mb-4" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3 mb-3 animate-pulse">
            <div className="w-8 h-8 bg-gray-100 rounded-lg shrink-0" />
            <div className="flex-1">
              <div className="h-4 bg-gray-100 rounded w-3/4 mb-1" />
              <div className="h-3 bg-gray-100 rounded w-20" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const items = data?.items || []

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Activity Feed</h3>
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-gray-400">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No activity yet. Enable Toby to get started.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
          {items.map((item) => (
            <ActivityItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
