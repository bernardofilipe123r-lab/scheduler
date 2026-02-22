import { Power, Loader2, Bot, Shield, Zap, Sparkles } from 'lucide-react'
import { useTobyStatus, useTobyEnable, useTobyDisable } from '../hooks'
import type { TobyPhase } from '../types'

const PHASE_CONFIG: Record<TobyPhase, { label: string; color: string; bg: string; icon: typeof Shield; desc: string }> = {
  bootstrap: {
    label: 'Bootstrap',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    icon: Shield,
    desc: 'Learning the basics — filling the content buffer and gathering first signals',
  },
  learning: {
    label: 'Learning',
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
    icon: Zap,
    desc: 'Running experiments — finding what works best for your audience',
  },
  optimizing: {
    label: 'Optimizing',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50 border-emerald-200',
    icon: Sparkles,
    desc: 'Auto-pilot — exploiting proven strategies with minimal exploration',
  },
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function TobyStatusBar() {
  const { data: status, isLoading } = useTobyStatus()
  const enableMut = useTobyEnable()
  const disableMut = useTobyDisable()
  const toggling = enableMut.isPending || disableMut.isPending

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-100 rounded w-48 mb-3" />
        <div className="h-4 bg-gray-100 rounded w-72" />
      </div>
    )
  }

  if (!status) return null

  const phaseInfo = PHASE_CONFIG[status.phase] || PHASE_CONFIG.bootstrap
  const PhaseIcon = phaseInfo.icon

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-5 flex items-center gap-4">
        {/* Bot avatar */}
        <div className={`relative shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${status.enabled ? 'bg-emerald-50' : 'bg-gray-100'}`}>
          <Bot className={`w-6 h-6 ${status.enabled ? 'text-emerald-600' : 'text-gray-400'}`} />
          {status.enabled && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
            </span>
          )}
        </div>

        {/* Status info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h2 className="text-base font-bold text-gray-900">Toby</h2>
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${status.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {status.enabled ? 'Active' : 'Inactive'}
            </span>
            {status.enabled && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${phaseInfo.bg} ${phaseInfo.color}`}>
                <PhaseIcon className="w-3 h-3" />
                {phaseInfo.label}
              </span>
            )}
          </div>

          {status.enabled ? (
            <p className="text-xs text-gray-500">{phaseInfo.desc}</p>
          ) : (
            <p className="text-xs text-gray-500">Enable Toby to start autonomous content generation and optimization.</p>
          )}

          {/* Compact metrics */}
          {status.enabled && status.buffer && (
            <div className="flex items-center gap-4 mt-2.5">
              <span className={`text-xs font-medium ${
                status.buffer.health === 'healthy' ? 'text-emerald-600' :
                status.buffer.health === 'low' ? 'text-amber-600' : 'text-red-600'
              }`}>
                Buffer {status.buffer.fill_percent}%
              </span>
              <span className="text-xs text-gray-500">
                {status.buffer.filled_slots}/{status.buffer.total_slots} slots
              </span>
              {status.active_experiments > 0 && (
                <span className="text-xs text-gray-500">
                  {status.active_experiments} experiment{status.active_experiments !== 1 ? 's' : ''}
                </span>
              )}
              {status.enabled_at && (
                <span className="text-xs text-gray-400">
                  Active since {timeAgo(status.enabled_at)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Toggle button */}
        <button
          onClick={() => status.enabled ? disableMut.mutate() : enableMut.mutate()}
          disabled={toggling}
          className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            status.enabled
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          } disabled:opacity-50`}
        >
          {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
          {status.enabled ? 'Disable' : 'Enable'}
        </button>
      </div>
    </div>
  )
}
