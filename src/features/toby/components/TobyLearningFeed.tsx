import { TrendingUp, TrendingDown, Minus, Brain, Loader2 } from 'lucide-react'
import { useTobyActivity } from '../hooks'
import type { TobyActivityItem } from '../types'

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function getLessonMeta(description: string): {
  icon: typeof TrendingUp
  iconColor: string
  bg: string
  border: string
} {
  const lower = description.toLowerCase()
  if (lower.startsWith('strong signal') || lower.startsWith('positive signal')) {
    return {
      icon: TrendingUp,
      iconColor: 'text-emerald-500',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
    }
  }
  if (lower.startsWith('weak signal')) {
    return {
      icon: TrendingDown,
      iconColor: 'text-red-400',
      bg: 'bg-red-50',
      border: 'border-red-100',
    }
  }
  return {
    icon: Minus,
    iconColor: 'text-gray-400',
    bg: 'bg-gray-50',
    border: 'border-gray-100',
  }
}

function LearningEventRow({ item }: { item: TobyActivityItem }) {
  const m = getLessonMeta(item.description)
  const Icon = m.icon
  const meta = item.metadata as Record<string, unknown>
  const score = typeof meta?.score === 'number' ? meta.score : null
  const topic = typeof meta?.topic === 'string' ? meta.topic : null

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${m.bg} ${m.border}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center bg-white/70 shrink-0 mt-0.5`}>
        <Icon className={`w-3.5 h-3.5 ${m.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-700 leading-relaxed">{item.description}</p>
        <div className="flex items-center gap-3 mt-1">
          {score !== null && (
            <span className="text-[10px] text-gray-400 tabular-nums">Score: {score.toFixed(1)}</span>
          )}
          {topic && (
            <span className="text-[10px] text-gray-400 capitalize">{topic.replace(/_/g, ' ')}</span>
          )}
          <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(item.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

export function TobyLearningFeed() {
  const { data, isLoading } = useTobyActivity({ limit: 8, action_type: 'learning_event' })

  const items = data?.items ?? []

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden h-full">
      {/* Accent */}
      <div className="h-1 bg-gradient-to-r from-blue-400 to-violet-400" />

      <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-gray-900">Learning Feed</h2>
          {items.length > 0 && (
            <span className="ml-auto text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              {items.length} signals
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8">
            <Brain className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-500">No lessons yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-48 mx-auto">
              Toby will log what it learns as posts get scored at 48h
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => (
              <LearningEventRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
