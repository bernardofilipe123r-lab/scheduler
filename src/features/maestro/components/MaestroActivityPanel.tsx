import { useState } from 'react'
import {
  Loader2,
  RefreshCw,
  Activity,
} from 'lucide-react'
import type { ActivityEntry } from '@/features/maestro/types'
import { getAgentMeta } from '@/features/maestro/constants'
import { timeAgo } from '@/features/maestro/utils'

type ActivityFilter = 'all' | 'actions' | 'api' | 'data'
type AgentActivityFilter = string  // dynamic: 'all' | any agent_id

interface MaestroActivityPanelProps {
  activity: ActivityEntry[]
  onRefresh: () => Promise<void>
}

export function MaestroActivityPanel({
  activity, onRefresh,
}: MaestroActivityPanelProps) {
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [agentActivityFilter, setAgentActivityFilter] = useState<AgentActivityFilter>('all')
  const [expanded, setExpanded] = useState(true)

  // Derive unique agent names from activity entries
  const uniqueAgents = Array.from(new Set(activity.map(e => e.agent))).sort((a, b) => {
    // maestro first, then alphabetical
    if (a === 'maestro') return -1
    if (b === 'maestro') return 1
    return a.localeCompare(b)
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    await onRefresh()
    setRefreshing(false)
  }

  const actionColors: Record<string, string> = {
    Thinking: 'text-violet-600 bg-violet-50',
    Generating: 'text-blue-600 bg-blue-50',
    Generated: 'text-green-600 bg-green-50',
    Observing: 'text-indigo-600 bg-indigo-50',
    Scouting: 'text-orange-600 bg-orange-50',
    Dispatching: 'text-amber-600 bg-amber-50',
    'Metrics collected': 'text-teal-600 bg-teal-50',
    'Trends discovered': 'text-red-600 bg-red-50',
    Resting: 'text-gray-500 bg-gray-50',
    Waiting: 'text-yellow-600 bg-yellow-50',
    Throttling: 'text-amber-600 bg-amber-50',
    Intel: 'text-purple-600 bg-purple-50',
    Planning: 'text-indigo-600 bg-indigo-50',
    'Cycle complete': 'text-green-600 bg-green-50',
    Error: 'text-red-600 bg-red-50',
    Started: 'text-green-600 bg-green-50',
    Analyze: 'text-violet-600 bg-violet-50',
    Refine: 'text-cyan-600 bg-cyan-50',
    Systematic: 'text-indigo-600 bg-indigo-50',
    Compound: 'text-emerald-600 bg-emerald-50',
  }

  // Double filter: by level AND by agent
  const filtered = activity.filter((e) => {
    const levelOk =
      filter === 'all' ? true :
      filter === 'actions' ? (!e.level || e.level === 'action') :
      filter === 'api' ? e.level === 'api' :
      filter === 'data' ? e.level === 'data' : true
    const agentOk = agentActivityFilter === 'all' || e.agent === agentActivityFilter
    return levelOk && agentOk
  })

  const filterButtons: { key: ActivityFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: '📋' },
    { key: 'actions', label: 'Actions', icon: '🤖' },
    { key: 'api', label: 'API Calls', icon: '🌐' },
    { key: 'data', label: 'Data', icon: '📊' },
  ]

  const agentBadge = (agent: string) => {
    if (agent === 'maestro') {
      return (
        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-orange-50 border-orange-200 text-orange-600 uppercase border">
          Maestro
        </span>
      )
    }
    const meta = getAgentMeta(agent)
    return (
      <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${meta.bg} ${meta.color} uppercase`}>
        {meta.label}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Full transparency — every decision, API call, and data point from both agents
        </p>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {/* Filter row: level + agent */}
      <div className="flex flex-wrap gap-2 items-center">
        {filterButtons.map((fb) => (
          <button
            key={fb.key}
            onClick={() => setFilter(fb.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              filter === fb.key
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span>{fb.icon}</span>
            {fb.label}
          </button>
        ))}

        <div className="w-px h-6 bg-gray-200 mx-1" />

        {['all', ...uniqueAgents].map((a) => (
          <button
            key={a}
            onClick={() => setAgentActivityFilter(a)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              agentActivityFilter === a
                ? a === 'maestro' ? 'bg-orange-500 text-white border-orange-500'
                  : a === 'all' ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {a === 'all' ? 'All Agents' : a.charAt(0).toUpperCase() + a.slice(1)}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          {expanded ? 'Compact' : 'Expanded'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Activity className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No activity yet</p>
          <p className="text-sm mt-1">Maestro will start logging on the first cycle</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((entry, i) => {
            const level = entry.level || 'action'
            const colorClass = actionColors[entry.action] || 'text-gray-600 bg-gray-50'

            if (level === 'action') {
              return (
                <div key={i} className="flex items-start gap-3 bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                  <span className="text-lg flex-shrink-0 mt-0.5">{entry.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {agentBadge(entry.agent)}
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${colorClass}`}>
                        {entry.action}
                      </span>
                      <span className="text-xs text-gray-400">{timeAgo(entry.time)}</span>
                    </div>
                    {entry.detail && expanded && (
                      <p className="text-sm text-gray-700 font-medium">{entry.detail}</p>
                    )}
                  </div>
                </div>
              )
            }

            if (level === 'api') {
              const isError = entry.action.includes('Error') || entry.emoji === '❌'
              const isResponse = entry.action.includes('Response') || entry.emoji === '✅'
              const barColor = isError ? 'border-l-red-400' : isResponse ? 'border-l-green-400' : 'border-l-blue-400'
              const bgColor = isError ? 'bg-red-50/50' : isResponse ? 'bg-green-50/30' : 'bg-blue-50/30'

              return (
                <div key={i} className={`flex items-start gap-2.5 ml-6 border-l-2 ${barColor} ${bgColor} rounded-r-lg p-2 pl-3`}>
                  <span className="text-sm flex-shrink-0">{entry.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {agentBadge(entry.agent)}
                      <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 rounded">
                        API
                      </span>
                      <span className="text-xs font-medium text-gray-600">{entry.action}</span>
                      <span className="text-[11px] text-gray-400">{timeAgo(entry.time)}</span>
                    </div>
                    {entry.detail && expanded && (
                      <p className="text-xs text-gray-600 mt-0.5 font-mono break-all">{entry.detail}</p>
                    )}
                  </div>
                </div>
              )
            }

            if (level === 'data') {
              return (
                <div key={i} className="flex items-start gap-2.5 ml-6 border-l-2 border-l-amber-300 bg-amber-50/30 rounded-r-lg p-2 pl-3">
                  <span className="text-sm flex-shrink-0">{entry.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {agentBadge(entry.agent)}
                      <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 rounded">
                        DATA
                      </span>
                      <span className="text-xs text-gray-700 font-medium">{entry.detail || entry.action}</span>
                      <span className="text-[11px] text-gray-400 ml-auto">{timeAgo(entry.time)}</span>
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div key={i} className="flex items-start gap-2.5 ml-6 border-l-2 border-l-gray-200 bg-gray-50/50 rounded-r-lg p-2 pl-3">
                <span className="text-sm flex-shrink-0">{entry.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {agentBadge(entry.agent)}
                    <span className="text-xs font-medium text-gray-500">{entry.action}</span>
                    <span className="text-[11px] text-gray-400">{timeAgo(entry.time)}</span>
                  </div>
                  {entry.detail && expanded && (
                    <p className="text-xs text-gray-600 mt-0.5">{entry.detail}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
