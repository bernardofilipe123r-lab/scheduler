import { useState, useEffect } from 'react'
import {
  X, Shield, Zap, Sparkles, ArrowRight,
  Calendar, FlaskConical, BarChart3, Brain,
} from 'lucide-react'

const STORAGE_KEY = 'toby-guide-dismissed'

interface TobyGuideProps {
  forceOpen?: boolean
  onClose?: () => void
}

export function TobyGuide({ forceOpen, onClose }: TobyGuideProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (forceOpen) return false
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })

  useEffect(() => {
    if (forceOpen) setDismissed(false)
  }, [forceOpen])

  if (dismissed && !forceOpen) return null

  function handleDismiss() {
    setDismissed(true)
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* noop */ }
    onClose?.()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* accent */}
      <div className="h-1 bg-gradient-to-r from-violet-400 via-blue-400 to-emerald-400" />

      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">How Toby Works</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Toby goes through three phases to master your content strategy
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Phase Explainer */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <PhaseCard
            phase={1}
            icon={Shield}
            title="Bootstrap"
            color="violet"
            duration="First few days"
            description="Toby fills your content calendar from scratch — creating reels and carousels for every brand. The goal is to build a healthy content buffer so nothing goes un-posted."
            details={[
              'Creates content for empty calendar slots',
              'Builds a 2+ day content buffer',
              'Scans your niche for trending topics',
            ]}
          />
          <PhaseCard
            phase={2}
            icon={Zap}
            title="Learning"
            color="blue"
            duration="Weeks 1–3"
            description="Content is being published. Toby tracks how each post performs and runs A/B experiments to figure out what resonates with your audience."
            details={[
              'Collects likes, views & engagement data',
              'Runs A/B tests on different strategies',
              'Discovers which formats perform best',
            ]}
          />
          <PhaseCard
            phase={3}
            icon={Sparkles}
            title="Optimizing"
            color="emerald"
            duration="Ongoing"
            description="Toby has enough data to know what works. It doubles down on winning strategies, adapts to trends, and continuously improves over time."
            details={[
              'Focuses on proven high-performing strategies',
              'Adapts to new trends automatically',
              'Gets smarter with every content cycle',
            ]}
          />
        </div>

        {/* What happens each cycle */}
        <div className="bg-gray-50 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Every 5 minutes, Toby runs a cycle
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <CycleStep icon={Calendar} label="Fill calendar" />
            <ArrowRight className="w-3.5 h-3.5 text-gray-300 hidden sm:block" />
            <CycleStep icon={BarChart3} label="Track performance" />
            <ArrowRight className="w-3.5 h-3.5 text-gray-300 hidden sm:block" />
            <CycleStep icon={Brain} label="Analyze & learn" />
            <ArrowRight className="w-3.5 h-3.5 text-gray-300 hidden sm:block" />
            <CycleStep icon={FlaskConical} label="Run experiments" />
          </div>
        </div>
      </div>
    </div>
  )
}

const COLORS = {
  violet: {
    bg: 'bg-violet-50',
    ring: 'ring-violet-200',
    icon: 'text-violet-500',
    badge: 'bg-violet-100 text-violet-700',
    number: 'text-violet-400',
    bullet: 'text-violet-400',
  },
  blue: {
    bg: 'bg-blue-50',
    ring: 'ring-blue-200',
    icon: 'text-blue-500',
    badge: 'bg-blue-100 text-blue-700',
    number: 'text-blue-400',
    bullet: 'text-blue-400',
  },
  emerald: {
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-200',
    icon: 'text-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700',
    number: 'text-emerald-400',
    bullet: 'text-emerald-400',
  },
}

function PhaseCard({ phase, icon: Icon, title, color, duration, description, details }: {
  phase: number
  icon: typeof Shield
  title: string
  color: 'violet' | 'blue' | 'emerald'
  duration: string
  description: string
  details: string[]
}) {
  const c = COLORS[color]
  return (
    <div className={`${c.bg} rounded-xl p-4 ring-1 ${c.ring}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${c.number}`}>Phase {phase}</span>
            <h3 className="text-sm font-bold text-gray-900">{title}</h3>
          </div>
          <p className={`text-[10px] font-medium ${c.icon}`}>{duration}</p>
        </div>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed mb-3">{description}</p>
      <ul className="space-y-1.5">
        {details.map((d, i) => (
          <li key={i} className="flex items-start gap-2 text-[11px] text-gray-500">
            <span className={`mt-0.5 w-1 h-1 rounded-full ${c.icon} bg-current shrink-0`} />
            {d}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CycleStep({ icon: Icon, label }: { icon: typeof Calendar; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-gray-200 text-xs text-gray-600 font-medium">
      <Icon className="w-3.5 h-3.5 text-gray-400" />
      {label}
    </div>
  )
}
