import { Fragment } from 'react'
import {
  Bot, Play, Power, Loader2, Sparkles, Shield, Zap,
  BarChart3, FlaskConical, Calendar, Check,
} from 'lucide-react'
import { useTobyStatus, useTobyEnable, useTobyDisable } from '../hooks'
import type { TobyPhase } from '../types'

const PHASES: Array<{ id: TobyPhase; label: string; hint: string; icon: typeof Shield }> = [
  { id: 'bootstrap', label: 'Bootstrap', hint: 'Building content library', icon: Shield },
  { id: 'learning', label: 'Learning', hint: 'Testing what performs', icon: Zap },
  { id: 'optimizing', label: 'Optimizing', hint: 'Running proven strategies', icon: Sparkles },
]

export function TobyHero() {
  const { data: status, isLoading } = useTobyStatus()
  const enableMut = useTobyEnable()
  const disableMut = useTobyDisable()
  const toggling = enableMut.isPending || disableMut.isPending

  if (isLoading) return <HeroSkeleton />
  if (!status) return null

  const phaseIdx = PHASES.findIndex(p => p.id === status.phase)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Accent */}
      <div className={`h-1 ${status.enabled ? 'bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500' : 'bg-gray-200'}`} />

      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                status.enabled
                  ? 'bg-gradient-to-br from-violet-500 to-blue-600 shadow-violet-500/25'
                  : 'bg-gray-200'
              }`}>
                <Bot className="w-7 h-7 text-white" />
              </div>
              {status.enabled && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4">
                  <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative rounded-full h-4 w-4 bg-emerald-500 border-2 border-white" />
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-gray-900">Toby</h1>
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                  status.enabled
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {status.enabled ? 'Running' : 'Off'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {status.enabled
                  ? `Autonomously managing ${status.buffer?.brand_count || 0} brand${(status.buffer?.brand_count || 0) !== 1 ? 's' : ''}`
                  : 'Your AI content agent — handles creation, testing & optimization'}
              </p>
            </div>
          </div>

          <button
            onClick={() => status.enabled ? disableMut.mutate() : enableMut.mutate()}
            disabled={toggling}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              status.enabled
                ? 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
                : 'bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-xl'
            } disabled:opacity-50`}
          >
            {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : status.enabled ? <Power className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {status.enabled ? 'Turn Off' : 'Enable Toby'}
          </button>
        </div>

        {/* Phase Journey */}
        {status.enabled && (
          <div className="flex items-center gap-2 mb-6">
            {PHASES.map((phase, i) => {
              const isActive = phase.id === status.phase
              const isPast = i < phaseIdx
              const Icon = phase.icon
              return (
                <Fragment key={phase.id}>
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/20'
                      : isPast
                        ? 'bg-emerald-50 text-emerald-600'
                        : 'bg-gray-50 text-gray-400'
                  }`}>
                    {isPast ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                    <span className="text-xs font-semibold">{phase.label}</span>
                  </div>
                  {i < PHASES.length - 1 && (
                    <div className={`h-0.5 w-8 rounded-full ${isPast ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                  )}
                </Fragment>
              )
            })}
          </div>
        )}

        {/* Metric Cards */}
        {status.enabled && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label="Created" value={status.stats?.total_created || 0}
              icon={Sparkles} bg="bg-violet-50" iconColor="text-violet-500" valueColor="text-violet-700"
            />
            <MetricCard
              label="Scored" value={status.stats?.total_scored || 0}
              icon={BarChart3} bg="bg-blue-50" iconColor="text-blue-500" valueColor="text-blue-700"
            />
            <MetricCard
              label="Buffer" value={`${status.buffer?.fill_percent || 0}%`}
              icon={Calendar}
              bg={status.buffer?.health === 'healthy' ? 'bg-emerald-50' : status.buffer?.health === 'low' ? 'bg-amber-50' : 'bg-red-50'}
              iconColor={status.buffer?.health === 'healthy' ? 'text-emerald-500' : status.buffer?.health === 'low' ? 'text-amber-500' : 'text-red-500'}
              valueColor={status.buffer?.health === 'healthy' ? 'text-emerald-700' : status.buffer?.health === 'low' ? 'text-amber-700' : 'text-red-700'}
            />
            <MetricCard
              label="Experiments" value={status.active_experiments || 0}
              icon={FlaskConical} bg="bg-indigo-50" iconColor="text-indigo-500" valueColor="text-indigo-700"
            />
          </div>
        )}

        {/* Disabled CTA */}
        {!status.enabled && (
          <div className="grid grid-cols-3 gap-6 pt-2 pb-2">
            <FeatureItem icon={Calendar} title="Auto-Schedule" desc="Fills your content calendar without lifting a finger" />
            <FeatureItem icon={FlaskConical} title="A/B Testing" desc="Runs experiments to discover what your audience loves" />
            <FeatureItem icon={Sparkles} title="Self-Improving" desc="Gets smarter with every post — learns what works" />
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon: Icon, bg, iconColor, valueColor }: {
  label: string; value: number | string; icon: typeof Sparkles
  bg: string; iconColor: string; valueColor: string
}) {
  return (
    <div className={`${bg} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="text-[11px] font-medium text-gray-500">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${valueColor} tabular-nums`}>{value}</p>
    </div>
  )
}

function FeatureItem({ icon: Icon, title, desc }: { icon: typeof Calendar; title: string; desc: string }) {
  return (
    <div className="text-center">
      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center mx-auto mb-2">
        <Icon className="w-5 h-5 text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
    </div>
  )
}

function HeroSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="h-1 bg-gray-100" />
      <div className="p-6 animate-pulse">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gray-100" />
          <div>
            <div className="h-5 bg-gray-100 rounded w-16 mb-2" />
            <div className="h-4 bg-gray-100 rounded w-48" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-50 rounded-xl" />)}
        </div>
      </div>
    </div>
  )
}
