/**
 * TemplatePicker — grid of pre-built DNA templates users can select.
 * Used in both DNAProfilesManager and Onboarding Step 4.
 */
import { Loader2 } from 'lucide-react'
import type { ContentDNATemplate } from '../types'

const CATEGORY_STYLES: Record<string, { emoji: string; bg: string; border: string; hover: string }> = {
  finance:            { emoji: '💰', bg: 'bg-emerald-50',  border: 'border-emerald-200', hover: 'hover:border-emerald-400' },
  fitness:            { emoji: '💪', bg: 'bg-orange-50',   border: 'border-orange-200',  hover: 'hover:border-orange-400' },
  'self-improvement': { emoji: '🧠', bg: 'bg-violet-50',  border: 'border-violet-200',  hover: 'hover:border-violet-400' },
  skincare:           { emoji: '✨', bg: 'bg-pink-50',     border: 'border-pink-200',    hover: 'hover:border-pink-400' },
  cooking:            { emoji: '🍳', bg: 'bg-amber-50',    border: 'border-amber-200',   hover: 'hover:border-amber-400' },
  travel:             { emoji: '✈️', bg: 'bg-sky-50',      border: 'border-sky-200',     hover: 'hover:border-sky-400' },
  tech:               { emoji: '⚡', bg: 'bg-blue-50',     border: 'border-blue-200',    hover: 'hover:border-blue-400' },
  fashion:            { emoji: '👗', bg: 'bg-rose-50',     border: 'border-rose-200',    hover: 'hover:border-rose-400' },
  entrepreneurship:   { emoji: '🚀', bg: 'bg-indigo-50',  border: 'border-indigo-200',  hover: 'hover:border-indigo-400' },
  psychology:         { emoji: '🔬', bg: 'bg-teal-50',     border: 'border-teal-200',    hover: 'hover:border-teal-400' },
}

function getCategoryStyle(category: string) {
  return CATEGORY_STYLES[category] ?? { emoji: '📄', bg: 'bg-gray-50', border: 'border-gray-200', hover: 'hover:border-gray-400' }
}

export function TemplatePicker({
  templates,
  onSelect,
  isPending,
  onBack,
}: {
  templates: ContentDNATemplate[]
  onSelect: (templateId: string) => void
  isPending: boolean
  onBack?: () => void
}) {
  if (templates.length === 0) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-5 h-5 mx-auto text-gray-300 animate-spin mb-2" />
        <p className="text-sm text-gray-400">Loading templates...</p>
      </div>
    )
  }

  return (
    <div>
      {onBack && (
        <button onClick={onBack} className="text-xs text-gray-400 hover:text-gray-600 mb-3 flex items-center gap-1">
          ← Back
        </button>
      )}
      <p className="text-xs text-gray-500 mb-3">Choose a niche template — all content examples, CTAs, and style will be pre-filled.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
        {templates.map((t) => {
          const style = getCategoryStyle(t.template_category)
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              disabled={isPending}
              className={`flex flex-col items-start p-3.5 rounded-xl border-2 transition-all text-left disabled:opacity-50 ${style.bg} ${style.border} ${style.hover}`}
            >
              <span className="text-xl mb-1.5">{style.emoji}</span>
              <span className="text-sm font-semibold text-gray-800 leading-tight">{t.template_name}</span>
              {t.niche_name && (
                <span className="text-[10px] text-gray-400 mt-1 line-clamp-1">{t.niche_name}</span>
              )}
            </button>
          )
        })}
      </div>
      {isPending && (
        <div className="flex items-center justify-center gap-2 mt-3 text-sm text-primary-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Creating profile...
        </div>
      )}
    </div>
  )
}
