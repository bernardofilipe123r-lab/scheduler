import { Power, Loader2, Bot, Shield, Zap, Sparkles } from 'lucide-react'
import { useTobyStatus, useTobyEnable, useTobyDisable } from '../hooks'
import type { TobyPhase } from '../types'

const PHASE_CONFIG: Record<TobyPhase, { label: string; color: string; icon: typeof Shield; desc: string }> = {
  bootstrap: { label: 'Bootstrap', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: Shield, desc: 'Learning the basics — filling buffer & gathering first signals' },
  learning: { label: 'Learning', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: Zap, desc: 'Running experiments — finding what works best for your audience' },
  optimizing: { label: 'Optimizing', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: Sparkles, desc: 'Auto-pilot — exploiting proven strategies, minimal exploration' },
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
      <div className="p-6 flex items-start gap-5">
        {/* Bot avatar */}
        <div className={`relative shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center ${status.enabled ? 'bg-emerald-50' : 'bg-gray-100'}`}>
          <Bot className={`w-7 h-7 ${status.enabled ? 'text-emerald-600' : 'text-gray-400'}`} />
          {status.enabled && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
            </span>
          )}
        </div>

        {/* Status info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-lg font-bold text-gray-900">Toby</h2>
            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${status.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {status.enabled ? 'Active' : 'Inactive'}
            </span>
          </div>

          {status.enabled ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border ${phaseInfo.color}`}>
                <PhaseIcon className="w-3.5 h-3.5" />
                {phaseInfo.label} Phase
              </span>
              <span className="text-sm text-gray-500">{phaseInfo.desc}</span>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Enable Toby to start autonomous content generation and optimization.</p>
          )}

          {/* Metrics row */}
          {status.enabled && status.buffer && (
            <div className="flex items-center gap-6 mt-4">
              <div>
                <p className="text-xs text-gray-400">Buffer Health</p>
                <p className={`text-sm font-semibold ${
                  status.buffer.health === 'healthy' ? 'text-emerald-600' :
                  status.buffer.health === 'low' ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {status.buffer.fill_percent}% — {status.buffer.health}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Slots Filled</p>
                <p className="text-sm font-semibold text-gray-700">{status.buffer.filled_slots}/{status.buffer.total_slots}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Experiments</p>
                <p className="text-sm font-semibold text-gray-700">{status.active_experiments} active</p>
              </div>
            </div>
          )}
        </div>

        {/* Toggle button */}
        <button
          onClick={() => status.enabled ? disableMut.mutate() : enableMut.mutate()}
          disabled={toggling}
          className={`shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors ${
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
