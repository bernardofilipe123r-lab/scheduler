import { useState } from 'react'
import { Wand2, SplitSquareHorizontal, Zap } from 'lucide-react'
import { FormatBManual } from './FormatBManual'
import { FormatBSemiAuto } from './FormatBSemiAuto'
import { FormatBFullAuto } from './FormatBFullAuto'

type SubMode = 'manual' | 'semi_auto' | 'full_auto'

const SUB_MODES: { id: SubMode; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'manual', label: 'Manual', desc: 'Provide your own text & images', icon: <Wand2 className="w-4 h-4" /> },
  { id: 'semi_auto', label: 'Semi-Auto', desc: 'Discover stories, we polish & compose', icon: <SplitSquareHorizontal className="w-4 h-4" /> },
  { id: 'full_auto', label: 'Full Auto', desc: 'One click, we handle everything', icon: <Zap className="w-4 h-4" /> },
]

export function FormatBTab() {
  const [mode, setMode] = useState<SubMode>('semi_auto')

  return (
    <div className="space-y-6">
      {/* Mode Selector */}
      <div className="flex gap-3">
        {SUB_MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex-1 p-3 rounded-xl border transition-all text-left ${
              mode === m.id
                ? 'border-primary-500 bg-primary-50 text-gray-900 shadow-sm'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {m.icon}
              <span className="font-medium text-sm">{m.label}</span>
            </div>
            <p className="text-xs opacity-70">{m.desc}</p>
          </button>
        ))}
      </div>

      {/* Sub-mode Content */}
      {mode === 'manual' && <FormatBManual />}
      {mode === 'semi_auto' && <FormatBSemiAuto />}
      {mode === 'full_auto' && <FormatBFullAuto />}
    </div>
  )
}
