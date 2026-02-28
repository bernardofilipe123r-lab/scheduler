import { useState, useEffect } from 'react'
import {
  X, ArrowRight, Play, BarChart3, Brain, Sparkles,
} from 'lucide-react'

const STORAGE_KEY = 'toby-guide-dismissed-v2'

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
      <div className="h-1 bg-gradient-to-r from-violet-400 via-blue-400 to-emerald-400" />

      <div className="p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">How Toby Learns</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Every post Toby publishes teaches it something — no waiting required
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Continuous learning loop */}
        <div className="bg-gray-50 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            The continuous loop — runs every 5 minutes
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <LoopStep icon={Play} label="Publish content" color="text-violet-500" />
            <ArrowRight className="w-3.5 h-3.5 text-gray-300 hidden sm:block" />
            <LoopStep icon={BarChart3} label="Collect engagement (48h)" color="text-blue-500" />
            <ArrowRight className="w-3.5 h-3.5 text-gray-300 hidden sm:block" />
            <LoopStep icon={Brain} label="Update strategy scores" color="text-indigo-500" />
            <ArrowRight className="w-3.5 h-3.5 text-gray-300 hidden sm:block" />
            <LoopStep icon={Sparkles} label="Next post is smarter" color="text-emerald-500" />
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Within 48 hours of each post going live, Toby scores it and updates its strategy knowledge.
            No waiting weeks — the feedback loop closes on every single post.
          </p>
        </div>

        {/* 3 modes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ModeCard
            color="violet"
            icon="🧱"
            title="Knowledge Base Building"
            trigger="Starts immediately"
            description="Toby fills your calendar and begins creating content. The goal is to get your first posts live so data collection can begin."
            transition="Moves on when 15+ posts have been scored and strategy patterns emerge"
          />
          <ModeCard
            color="blue"
            icon="🔍"
            title="Pattern Recognition"
            trigger="After first ~15 scored posts"
            description="Toby tracks what resonates: which hooks, tones, and topics drive saves and shares. It runs A/B experiments to accelerate learning."
            transition="Upgrades when strategy confidence reaches 60%+ — not after a fixed number of weeks"
          />
          <ModeCard
            color="emerald"
            icon="⚡"
            title="Precision Mode"
            trigger="When data confidence is high"
            description="Toby knows what works for your audience and doubles down. It still explores new formats (10–20%) to stay ahead of trends."
            transition="Reverts to Pattern Recognition if performance drops — fully automatic"
          />
        </div>
      </div>
    </div>
  )
}

function LoopStep({ icon: Icon, label, color }: { icon: typeof Play; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg border border-gray-200 text-xs text-gray-600 font-medium">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      {label}
    </div>
  )
}

const MODE_COLORS = {
  violet:  { bg: 'bg-violet-50',  ring: 'ring-violet-200',  label: 'text-violet-700'  },
  blue:    { bg: 'bg-blue-50',    ring: 'ring-blue-200',    label: 'text-blue-700'    },
  emerald: { bg: 'bg-emerald-50', ring: 'ring-emerald-200', label: 'text-emerald-700' },
}

function ModeCard({ color, icon, title, trigger, description, transition }: {
  color: 'violet' | 'blue' | 'emerald'
  icon: string
  title: string
  trigger: string
  description: string
  transition: string
}) {
  const c = MODE_COLORS[color]
  return (
    <div className={`${c.bg} rounded-xl p-4 ring-1 ${c.ring}`}>
      <div className="text-xl mb-2">{icon}</div>
      <h3 className={`text-sm font-bold ${c.label} mb-0.5`}>{title}</h3>
      <p className={`text-[10px] font-medium ${c.label} opacity-70 mb-2`}>{trigger}</p>
      <p className="text-xs text-gray-600 leading-relaxed mb-3">{description}</p>
      <div className="pt-2 border-t border-gray-200">
        <p className="text-[10px] text-gray-400 leading-relaxed">{transition}</p>
      </div>
    </div>
  )
}
