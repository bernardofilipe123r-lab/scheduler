import { useState, useEffect } from 'react'
import { Loader2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDesignSettings, useUpdateDesign } from './api/use-text-video'
import type { DesignSettings } from './types'

const FONT_OPTIONS = ['Inter', 'Oswald', 'Montserrat', 'Bebas Neue', 'Roboto Condensed', 'Poppins']
const DIVIDER_OPTIONS = ['line_with_logo', 'gradient', 'none']
const TEXT_POSITIONS = ['center', 'bottom', 'top']

export function DesignEditorTab() {
  const { data: design, isLoading } = useDesignSettings()
  const updateMutation = useUpdateDesign()
  const [form, setForm] = useState<Partial<DesignSettings>>({})

  useEffect(() => {
    if (design) setForm(design)
  }, [design])

  const update = (key: keyof DesignSettings, value: unknown) => {
    setForm((prev: Partial<DesignSettings>) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync(form)
      toast.success('Design settings saved')
    } catch {
      toast.error('Failed to save design settings')
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="px-4 sm:px-6 py-6 space-y-8 max-w-2xl">
      {/* Thumbnail Settings */}
      <section>
        <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Thumbnail Design</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.thumbnail_title_color || '#FFFFFF'}
                onChange={e => update('thumbnail_title_color', e.target.value)}
                className="w-8 h-8 rounded border border-gray-600 cursor-pointer bg-transparent"
              />
              <input
                value={form.thumbnail_title_color || '#FFFFFF'}
                onChange={e => update('thumbnail_title_color', e.target.value)}
                className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-white text-sm outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title Font</label>
            <select
              value={form.thumbnail_title_font || 'Inter'}
              onChange={e => update('thumbnail_title_font', e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            >
              {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title Size</label>
            <input
              type="number"
              value={form.thumbnail_title_size ?? 72}
              onChange={e => update('thumbnail_title_size', +e.target.value)}
              min={36} max={120}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Image Ratio (0.4 - 0.8)</label>
            <input
              type="number"
              step="0.05"
              value={form.thumbnail_image_ratio ?? 0.6}
              onChange={e => update('thumbnail_image_ratio', +e.target.value)}
              min={0.4} max={0.8}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Title Padding (px)</label>
            <input
              type="number"
              value={form.thumbnail_title_padding ?? 40}
              onChange={e => update('thumbnail_title_padding', +e.target.value)}
              min={10} max={100}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Divider Style</label>
            <select
              value={form.thumbnail_divider_style || 'line_with_logo'}
              onChange={e => update('thumbnail_divider_style', e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            >
              {DIVIDER_OPTIONS.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Reel Text Settings */}
      <section>
        <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Reel Text Overlay</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Text Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.reel_text_color || '#FFFFFF'}
                onChange={e => update('reel_text_color', e.target.value)}
                className="w-8 h-8 rounded border border-gray-600 cursor-pointer bg-transparent"
              />
              <input
                value={form.reel_text_color || '#FFFFFF'}
                onChange={e => update('reel_text_color', e.target.value)}
                className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 text-white text-sm outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Font</label>
            <select
              value={form.reel_text_font || 'Inter'}
              onChange={e => update('reel_text_font', e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            >
              {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Font Size</label>
            <input
              type="number"
              value={form.reel_text_size ?? 48}
              onChange={e => update('reel_text_size', +e.target.value)}
              min={24} max={96}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Text Position</label>
            <select
              value={form.reel_text_position || 'center'}
              onChange={e => update('reel_text_position', e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            >
              {TEXT_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Background Opacity (%)</label>
            <input
              type="number"
              value={form.reel_text_bg_opacity ?? 50}
              onChange={e => update('reel_text_bg_opacity', +e.target.value)}
              min={0} max={100}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.reel_text_shadow ?? true}
              onChange={e => update('reel_text_shadow', e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
            <label className="text-xs text-gray-400">Text Shadow</label>
          </div>
        </div>
      </section>

      {/* Slideshow Settings */}
      <section>
        <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Slideshow Timing</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Image Duration (seconds)</label>
            <input
              type="number"
              step="0.5"
              value={form.image_duration ?? 3}
              onChange={e => update('image_duration', +e.target.value)}
              min={1} max={10}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Fade Duration (seconds)</label>
            <input
              type="number"
              step="0.1"
              value={form.image_fade_duration ?? 0.2}
              onChange={e => update('image_fade_duration', +e.target.value)}
              min={0} max={2}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Total Duration (seconds)</label>
            <input
              type="number"
              value={form.reel_total_duration ?? 15}
              onChange={e => update('reel_total_duration', +e.target.value)}
              min={5} max={60}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Black Fade In (seconds)</label>
            <input
              type="number"
              step="0.5"
              value={form.black_fade_duration ?? 1}
              onChange={e => update('black_fade_duration', +e.target.value)}
              min={0} max={5}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.show_logo ?? true}
              onChange={e => update('show_logo', e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
            <label className="text-xs text-gray-400">Show Logo</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.show_handle ?? true}
              onChange={e => update('show_handle', e.target.checked)}
              className="w-4 h-4 accent-purple-500"
            />
            <label className="text-xs text-gray-400">Show Handle</label>
          </div>
        </div>
      </section>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={updateMutation.isPending}
        className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
      >
        {updateMutation.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
        ) : (
          <><Save className="w-4 h-4" /> Save Design Settings</>
        )}
      </button>
    </div>
  )
}
