import { useState } from 'react'
import { Wand2, SplitSquareHorizontal, Zap } from 'lucide-react'
import { TextVideoManual } from './TextVideoManual'
import { TextVideoSemiAuto } from './TextVideoSemiAuto'
import { TextVideoFullAuto } from './TextVideoFullAuto'

type SubMode = 'manual' | 'semi_auto' | 'full_auto'

const SUB_MODES: { id: SubMode; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'manual', label: 'Manual', desc: 'Provide your own text & images', icon: <Wand2 className="w-4 h-4" /> },
  { id: 'semi_auto', label: 'Semi-Auto', desc: 'Discover stories, we polish & compose', icon: <SplitSquareHorizontal className="w-4 h-4" /> },
  { id: 'full_auto', label: 'Full Auto', desc: 'One click, we handle everything', icon: <Zap className="w-4 h-4" /> },
]

export function TextVideoTab() {
  const [mode, setMode] = useState<SubMode>('semi_auto')

  return (
    <div className="px-4 sm:px-6 py-6 space-y-6">
      {/* Mode Selector */}
      <div className="flex gap-3">
        {SUB_MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex-1 p-3 rounded-xl border transition-all text-left ${
              mode === m.id
                ? 'border-purple-500/60 bg-purple-500/10 text-white'
                : 'border-gray-700/50 bg-gray-800/30 text-gray-400 hover:border-gray-600 hover:text-gray-300'
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
      {mode === 'manual' && <TextVideoManual />}
      {mode === 'semi_auto' && <TextVideoSemiAuto />}
      {mode === 'full_auto' && <TextVideoFullAuto />}
    </div>
  )
}
