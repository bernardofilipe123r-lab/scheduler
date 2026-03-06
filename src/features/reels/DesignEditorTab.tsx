import { useState, useEffect } from 'react'
import { Loader2, Save, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDesignSettings, useUpdateDesign } from './api/use-text-video'
import type { DesignSettings } from './types'

const FONT_OPTIONS = ['Inter', 'Oswald', 'Montserrat', 'Bebas Neue', 'Roboto Condensed', 'Poppins']
const DIVIDER_OPTIONS = ['line_with_logo', 'gradient', 'none']
const TEXT_POSITIONS = ['center', 'bottom', 'top']

function ThumbnailPreview({ form }: { form: Partial<DesignSettings> }) {
  const imageRatio = form.thumbnail_image_ratio ?? 0.6
  const titleColor = form.thumbnail_title_color || '#FFFFFF'
  const titleSize = form.thumbnail_title_size ?? 72
  const titlePadding = form.thumbnail_title_padding ?? 40
  const dividerStyle = form.thumbnail_divider_style || 'line_with_logo'
  const showLogo = form.show_logo ?? true

  // Scale factor: actual 1080x1920, preview ~180x320
  const scale = 180 / 1080
  const previewHeight = 320
  const imageH = previewHeight * imageRatio
  const titleH = previewHeight * (1 - imageRatio)
  const scaledFontSize = Math.max(8, titleSize * scale)
  const scaledPadding = Math.max(4, titlePadding * scale)

  return (
    <div className="w-[180px] h-[320px] rounded-lg overflow-hidden shadow-lg border border-gray-200 flex-shrink-0 bg-black relative" style={{ fontFamily: form.thumbnail_title_font || 'Inter' }}>
      {/* Image area */}
      <div className="relative" style={{ height: `${imageH}px` }}>
        <div className="absolute inset-0 bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
          <span className="text-gray-400 text-[10px]">Image Area</span>
        </div>
        {showLogo && (
          <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-white/30 flex items-center justify-center">
            <span className="text-[6px] text-white font-bold">L</span>
          </div>
        )}
      </div>

      {/* Divider */}
      {dividerStyle !== 'none' && (
        <div className="relative h-[3px] z-10">
          {dividerStyle === 'line_with_logo' ? (
            <div className="absolute inset-x-0 top-0 h-[2px] bg-white/40 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-white/50 -mt-[1px]" />
            </div>
          ) : (
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          )}
        </div>
      )}

      {/* Title area */}
      <div
        className="flex flex-col items-center justify-center"
        style={{ height: `${titleH}px`, padding: `${scaledPadding}px`, backgroundColor: '#111' }}
      >
        <p
          className="text-center font-black leading-tight break-words w-full"
          style={{ color: titleColor, fontSize: `${scaledFontSize}px`, lineHeight: 1.1 }}
        >
          ELON MUSK{'\n'}JUST BOUGHT{'\n'}TIKTOK
        </p>
      </div>
    </div>
  )
}

function ReelFramePreview({ form }: { form: Partial<DesignSettings> }) {
  const textColor = form.reel_text_color || '#FFFFFF'
  const textSize = form.reel_text_size ?? 48
  const textPosition = form.reel_text_position || 'center'
  const bgOpacity = (form.reel_text_bg_opacity ?? 50) / 100
  const textShadow = form.reel_text_shadow ?? true
  const showHandle = form.show_handle ?? true
  const showLogo = form.show_logo ?? true

  const scale = 180 / 1080
  const scaledFontSize = Math.max(7, textSize * scale)

  const positionClass =
    textPosition === 'top' ? 'items-start pt-10' :
    textPosition === 'bottom' ? 'items-end pb-10' :
    'items-center'

  return (
    <div className="w-[180px] h-[320px] rounded-lg overflow-hidden shadow-lg border border-gray-200 flex-shrink-0 relative">
      {/* Background slideshow placeholder */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-500 to-gray-700" />

      {/* Dark overlay for text readability */}
      <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${bgOpacity})` }} />

      {/* Logo */}
      {showLogo && (
        <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-white/30 flex items-center justify-center z-10">
          <span className="text-[6px] text-white font-bold">L</span>
        </div>
      )}

      {/* Handle */}
      {showHandle && (
        <div className="absolute bottom-2 left-2 z-10">
          <span className="text-[7px] text-white/70">@yourbrand</span>
        </div>
      )}

      {/* Text overlay */}
      <div className={`absolute inset-0 flex flex-col justify-center ${positionClass} px-3 z-10`} style={{ fontFamily: form.reel_text_font || 'Inter' }}>
        <p
          className="text-center font-bold leading-tight w-full"
          style={{
            color: textColor,
            fontSize: `${scaledFontSize}px`,
            textShadow: textShadow ? '0 1px 4px rgba(0,0,0,0.8)' : 'none',
          }}
        >
          In a move nobody{'\n'}saw coming...
        </p>
      </div>
    </div>
  )
}

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
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Form Controls */}
      <div className="flex-1 space-y-8 min-w-0">
        {/* Thumbnail Settings */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Thumbnail Design</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.thumbnail_title_color || '#FFFFFF'}
                  onChange={e => update('thumbnail_title_color', e.target.value)}
                  className="w-8 h-8 rounded border border-gray-200 cursor-pointer bg-transparent"
                />
                <input
                  value={form.thumbnail_title_color || '#FFFFFF'}
                  onChange={e => update('thumbnail_title_color', e.target.value)}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-sm outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title Font</label>
              <select
                value={form.thumbnail_title_font || 'Inter'}
                onChange={e => update('thumbnail_title_font', e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              >
                {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title Size</label>
              <input
                type="number"
                value={form.thumbnail_title_size ?? 72}
                onChange={e => update('thumbnail_title_size', +e.target.value)}
                min={36} max={120}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Image Ratio (0.4 - 0.8)</label>
              <input
                type="number"
                step="0.05"
                value={form.thumbnail_image_ratio ?? 0.6}
                onChange={e => update('thumbnail_image_ratio', +e.target.value)}
                min={0.4} max={0.8}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Title Padding (px)</label>
              <input
                type="number"
                value={form.thumbnail_title_padding ?? 40}
                onChange={e => update('thumbnail_title_padding', +e.target.value)}
                min={10} max={100}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Divider Style</label>
              <select
                value={form.thumbnail_divider_style || 'line_with_logo'}
                onChange={e => update('thumbnail_divider_style', e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              >
                {DIVIDER_OPTIONS.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* Reel Text Settings */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Reel Text Overlay</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Text Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.reel_text_color || '#FFFFFF'}
                  onChange={e => update('reel_text_color', e.target.value)}
                  className="w-8 h-8 rounded border border-gray-200 cursor-pointer bg-transparent"
                />
                <input
                  value={form.reel_text_color || '#FFFFFF'}
                  onChange={e => update('reel_text_color', e.target.value)}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-sm outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Font</label>
              <select
                value={form.reel_text_font || 'Inter'}
                onChange={e => update('reel_text_font', e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              >
                {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Font Size</label>
              <input
                type="number"
                value={form.reel_text_size ?? 48}
                onChange={e => update('reel_text_size', +e.target.value)}
                min={24} max={96}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Text Position</label>
              <select
                value={form.reel_text_position || 'center'}
                onChange={e => update('reel_text_position', e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              >
                {TEXT_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Background Opacity (%)</label>
              <input
                type="number"
                value={form.reel_text_bg_opacity ?? 50}
                onChange={e => update('reel_text_bg_opacity', +e.target.value)}
                min={0} max={100}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.reel_text_shadow ?? true}
                onChange={e => update('reel_text_shadow', e.target.checked)}
                className="w-4 h-4 accent-primary-600"
              />
              <label className="text-xs text-gray-500">Text Shadow</label>
            </div>
          </div>
        </section>

        {/* Slideshow Settings */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Slideshow Timing</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Image Duration (seconds)</label>
              <input
                type="number"
                step="0.5"
                value={form.image_duration ?? 3}
                onChange={e => update('image_duration', +e.target.value)}
                min={1} max={10}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fade Duration (seconds)</label>
              <input
                type="number"
                step="0.1"
                value={form.image_fade_duration ?? 0.2}
                onChange={e => update('image_fade_duration', +e.target.value)}
                min={0} max={2}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Total Duration (seconds)</label>
              <input
                type="number"
                value={form.reel_total_duration ?? 15}
                onChange={e => update('reel_total_duration', +e.target.value)}
                min={5} max={60}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Black Fade In (seconds)</label>
              <input
                type="number"
                step="0.5"
                value={form.black_fade_duration ?? 1}
                onChange={e => update('black_fade_duration', +e.target.value)}
                min={0} max={5}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.show_logo ?? true}
                onChange={e => update('show_logo', e.target.checked)}
                className="w-4 h-4 accent-primary-600"
              />
              <label className="text-xs text-gray-500">Show Logo</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.show_handle ?? true}
                onChange={e => update('show_handle', e.target.checked)}
                className="w-4 h-4 accent-primary-600"
              />
              <label className="text-xs text-gray-500">Show Handle</label>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="w-full py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {updateMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
          ) : (
            <><Save className="w-4 h-4" /> Save Design Settings</>
          )}
        </button>
      </div>

      {/* Live Preview Panel */}
      <div className="lg:w-[220px] flex-shrink-0">
        <div className="sticky top-8 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4 text-primary-600" />
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Live Preview</h3>
          </div>

          {/* Thumbnail Preview */}
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Thumbnail</p>
            <ThumbnailPreview form={form} />
          </div>

          {/* Reel Frame Preview */}
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Reel Frame</p>
            <ReelFramePreview form={form} />
          </div>
        </div>
      </div>
    </div>
  )
}
