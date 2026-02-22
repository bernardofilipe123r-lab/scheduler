import { useState } from 'react'
import { Settings, Save, Loader2, RotateCcw } from 'lucide-react'
import { useTobyConfig, useUpdateTobyConfig, useTobyReset } from '../hooks'

export function TobySettings() {
  const { data: config, isLoading } = useTobyConfig()
  const updateMut = useUpdateTobyConfig()
  const resetMut = useTobyReset()
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const [form, setForm] = useState<Record<string, number>>({})

  if (isLoading || !config) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse">
        <div className="h-5 bg-gray-100 rounded w-28 mb-4" />
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-50 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const getValue = (key: string, fallback: number) => form[key] ?? fallback

  const hasChanges = Object.keys(form).length > 0

  const handleSave = () => {
    const updates: Record<string, number> = {}
    if (form.buffer_days !== undefined) updates.buffer_days = form.buffer_days
    if (form.explore_ratio !== undefined) updates.explore_ratio = form.explore_ratio
    if (form.reel_slots_per_day !== undefined) updates.reel_slots_per_day = form.reel_slots_per_day
    if (form.post_slots_per_day !== undefined) updates.post_slots_per_day = form.post_slots_per_day
    if (Object.keys(updates).length > 0) {
      updateMut.mutate(updates, { onSuccess: () => setForm({}) })
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-400" />
          Configuration
        </h3>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={updateMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {updateMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        <ConfigField
          label="Buffer Days"
          desc="How many days ahead to keep the content buffer filled"
          value={getValue('buffer_days', config.buffer_days)}
          onChange={(v) => setForm({ ...form, buffer_days: v })}
          min={1}
          max={14}
          step={1}
        />
        <ConfigField
          label="Explore Ratio"
          desc="Percentage of content that tries new strategies vs. proven winners"
          value={getValue('explore_ratio', config.explore_ratio)}
          onChange={(v) => setForm({ ...form, explore_ratio: v })}
          min={0}
          max={1}
          step={0.05}
          format={(v) => `${(v * 100).toFixed(0)}%`}
        />
        <ConfigField
          label="Reel Slots / Day"
          desc="Number of reels Toby publishes per day per brand"
          value={getValue('reel_slots_per_day', config.reel_slots_per_day)}
          onChange={(v) => setForm({ ...form, reel_slots_per_day: v })}
          min={0}
          max={5}
          step={1}
        />
        <ConfigField
          label="Post Slots / Day"
          desc="Number of posts (carousels) Toby publishes per day per brand"
          value={getValue('post_slots_per_day', config.post_slots_per_day)}
          onChange={(v) => setForm({ ...form, post_slots_per_day: v })}
          min={0}
          max={5}
          step={1}
        />
      </div>

      {/* Danger zone */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset all learnings
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-xs text-red-600">This will erase all strategy scores and experiments. Are you sure?</p>
            <button
              onClick={() => { resetMut.mutate(); setShowResetConfirm(false) }}
              disabled={resetMut.isPending}
              className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {resetMut.isPending ? 'Resetting...' : 'Confirm Reset'}
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ConfigField({
  label,
  desc,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string
  desc: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  format?: (v: number) => string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm font-semibold text-gray-900">{format ? format(value) : value}</span>
      </div>
      <p className="text-xs text-gray-400 mb-2">{desc}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
      />
    </div>
  )
}
