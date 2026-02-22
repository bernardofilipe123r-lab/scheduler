import {
  Clock,
  Zap,
  Brain,
  Search,
  BarChart3,
  Power,
  PowerOff,
  RotateCcw,
  AlertTriangle,
  FlaskConical,
  ArrowUpRight,
  CalendarCheck,
} from 'lucide-react'
import { useTobyActivity } from '../hooks'
import type { TobyActivityItem } from '../types'

interface ActionConfig {
  icon: typeof Zap
  color: string
  bgColor: string
  humanLabel: string
}

const ACTION_CONFIG: Record<string, ActionConfig> = {
  toby_enabled: {
    icon: Power,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    humanLabel: 'Activated',
  },
  toby_disabled: {
    icon: PowerOff,
    color: 'text-gray-500',
    bgColor: 'bg-gray-50',
    humanLabel: 'Deactivated',
  },
  toby_reset: {
    icon: RotateCcw,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    humanLabel: 'Reset all learnings',
  },
  content_generated: {
    icon: Zap,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    humanLabel: 'Created content',
  },
  error: {
    icon: AlertTriangle,
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    humanLabel: 'Error encountered',
  },
  metrics_collected: {
    icon: BarChart3,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    humanLabel: 'Collected metrics',
  },
  analysis_completed: {
    icon: Brain,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    humanLabel: 'Analyzed performance',
  },
  discovery_completed: {
    icon: Search,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    humanLabel: 'Found trends',
  },
  experiment_created: {
    icon: FlaskConical,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    humanLabel: 'Started A/B test',
  },
  phase_transition: {
    icon: ArrowUpRight,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    humanLabel: 'Phase transition',
  },
  buffer_fill: {
    icon: CalendarCheck,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    humanLabel: 'Filled buffer slots',
  },
  score_updated: {
    icon: BarChart3,
    color: 'text-green-500',
    bgColor: 'bg-green-50',
    humanLabel: 'Scored content',
  },
  discovery_run: {
    icon: Search,
    color: 'text-purple-500',
    bgColor: 'bg-purple-50',
    humanLabel: 'Scanned trends',
  },
}

const DEFAULT_CONFIG: ActionConfig = {
  icon: Clock,
  color: 'text-gray-400',
  bgColor: 'bg-gray-50',
  humanLabel: 'Action',
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function getTimeGroup(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours < 1) return 'Just now'
  if (diffHours < 24 && now.getDate() === date.getDate()) return 'Today'
  if (diffHours < 48) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function humanizeDescription(item: TobyActivityItem): string {
  const cfg = ACTION_CONFIG[item.action_type]
  if (!cfg) return item.description

  // Enhance raw descriptions with friendlier versions
  switch (item.action_type) {
    case 'content_generated': {
      const count = (item.metadata as Record<string, number>)?.count
      if (count) return `Toby created ${count} piece${count > 1 ? 's' : ''} of content to fill empty buffer slots`
      return 'Toby created new content for your brands'
    }
    case 'metrics_collected': {
      const count = (item.metadata as Record<string, number>)?.count
      if (count) return `Toby checked performance metrics on ${count} published post${count > 1 ? 's' : ''}`
      return 'Toby gathered engagement data from your published content'
    }
    case 'toby_enabled':
      return 'Toby was turned on and started managing your content autonomously'
    case 'toby_disabled':
      return 'Toby was turned off — no more automatic content generation'
    case 'toby_reset':
      return 'All of Toby\'s learned strategies and experiments were cleared'
    case 'phase_transition':
      return item.description || 'Toby advanced to the next learning phase'
    case 'experiment_created':
      return item.description || 'Toby started a new A/B test to find better strategies'
    case 'error':
      return `Something went wrong: ${item.description}`
    default:
      return item.description
  }
}

function ActivityItem({ item }: { item: TobyActivityItem }) {
  const cfg = ACTION_CONFIG[item.action_type] || DEFAULT_CONFIG
  const Icon = cfg.icon
  const isError = item.action_type === 'error'

  return (
    <div className={`flex items-start gap-3 px-4 py-3 transition-colors ${isError ? 'bg-red-50/50' : 'hover:bg-gray-50/50'}`}>
      <div className="relative shrink-0 mt-0.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bgColor}`}>
          <Icon className={`w-4 h-4 ${cfg.color}`} />
        </div>
        {/* Timeline connector dot */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-px h-3 bg-gray-100" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.humanLabel}</span>
          <span className="text-[10px] text-gray-400">{timeAgo(item.created_at)}</span>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">{humanizeDescription(item)}</p>
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

  // Group items by time period
  const grouped: { label: string; items: TobyActivityItem[] }[] = []
  let currentGroup: string | null = null
  for (const item of items) {
    const group = getTimeGroup(item.created_at)
    if (group !== currentGroup) {
      grouped.push({ label: group, items: [item] })
      currentGroup = group
    } else {
      grouped[grouped.length - 1].items.push(item)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Activity Timeline</h3>
        {items.length > 0 && (
          <span className="text-[10px] text-gray-400 font-medium">{items.length} events</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-gray-400">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium text-gray-500">No activity yet</p>
          <p className="text-xs text-gray-400 mt-1">Enable Toby to start seeing what he's up to</p>
        </div>
      ) : (
        <div className="max-h-[600px] overflow-y-auto">
          {grouped.map((group, gi) => (
            <div key={gi}>
              <div className="sticky top-0 z-10 px-4 py-1.5 bg-gray-50/95 backdrop-blur-sm border-t border-gray-100 first:border-t-0">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{group.label}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {group.items.map((item) => (
                  <ActivityItem key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
