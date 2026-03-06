import { useState, useEffect } from 'react'
import { Loader2, Save, Eye, BadgeCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDesignSettings, useUpdateDesign } from './api/use-text-video'
import type { DesignSettings } from './types'
import vaLogo from '@/assets/icons/va-logo.svg'

const FONT_OPTIONS = ['Anton', 'Inter', 'Oswald', 'Montserrat', 'Bebas Neue', 'Roboto Condensed', 'Poppins']
const DIVIDER_OPTIONS = ['line_with_logo', 'gradient', 'none']

const EXAMPLE_REEL_TEXT = 'Viral Toby is legendary in AI automation, quietly orchestrating autonomous content empires while most creators still schedule posts. Its agents observe, learn, generate, test, and publish across platforms nonstop, turning trends into viral assets at machine speed.'

/* ──────────────────────────────────────────────
 * THUMBNAIL PREVIEW
 * Full-height image, dark gradient overlay from bottom→top,
 * logo bar centered above title, Anton font title.
 * ────────────────────────────────────────────── */
function ThumbnailPreview({ form }: { form: Partial<DesignSettings> }) {
  const titleColor = form.thumbnail_title_color || '#FFFFFF'
  const titleSize = form.thumbnail_title_size ?? 72
  const titlePadding = form.thumbnail_title_padding ?? 40
  const dividerStyle = form.thumbnail_divider_style || 'line_with_logo'
  const overlayOpacity = (form.thumbnail_overlay_opacity ?? 60) / 100
  const titleFont = form.thumbnail_title_font || 'Anton'

  const scale = 180 / 1080
  const scaledFontSize = Math.max(8, titleSize * scale)
  const scaledPadding = Math.max(4, titlePadding * scale)

  return (
    <div
      className="w-[180px] h-[320px] rounded-lg overflow-hidden shadow-lg border border-gray-200 flex-shrink-0 relative"
      style={{ fontFamily: titleFont }}
    >
      {/* Full-height background image */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-500 to-gray-700" />

      {/* Dark gradient overlay from bottom to top */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to top, rgba(0,0,0,${overlayOpacity}) 0%, rgba(0,0,0,${overlayOpacity * 0.6}) 40%, rgba(0,0,0,${overlayOpacity * 0.2}) 70%, transparent 100%)`,
        }}
      />

      {/* Content positioned at bottom */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center"
        style={{ padding: `${scaledPadding}px` }}
      >
        {/* Logo bar centered above title */}
        <div className="mb-2 flex justify-center">
          <img src={vaLogo} alt="Logo" className="w-5 h-5 rounded-md" />
        </div>

        {/* Divider */}
        {dividerStyle !== 'none' && (
          <div className="w-full mb-2">
            {dividerStyle === 'line_with_logo' ? (
              <div className="h-[1px] bg-white/30 relative flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white/40 absolute" />
              </div>
            ) : (
              <div className="h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent" />
            )}
          </div>
        )}

        {/* Title text */}
        <p
          className="text-center font-black leading-tight break-words w-full uppercase"
          style={{
            color: titleColor,
            fontSize: `${scaledFontSize}px`,
            lineHeight: 1.1,
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
          }}
        >
          ELON MUSK{'\n'}JUST BOUGHT{'\n'}TIKTOK
        </p>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
 * REEL FRAME PREVIEW
 * 3 divs stacked vertically:
 *   1. Brand header (row: circular logo + name/handle)
 *   2. Text content
 *   3. Image/video area with fade
 * ────────────────────────────────────────────── */
function ReelFramePreview({ form }: { form: Partial<DesignSettings> }) {
  const textColor = form.reel_text_color || '#FFFFFF'
  const textSize = form.reel_text_size ?? 48
  const textFont = form.reel_text_font || 'Inter'
  const bgOpacity = (form.reel_text_bg_opacity ?? 50) / 100
  const textShadow = form.reel_text_shadow ?? true
  const showLogo = form.show_logo ?? true
  const showHandle = form.show_handle ?? true
  const sectionGap = form.reel_section_gap ?? 16
  const paddingTop = form.reel_padding_top ?? 24
  const paddingBottom = form.reel_padding_bottom ?? 16
  const brandNameColor = form.reel_brand_name_color || '#FFFFFF'
  const brandNameSize = form.reel_brand_name_size ?? 16
  const handleColor = form.reel_handle_color || '#AAAAAA'
  const handleSize = form.reel_handle_size ?? 14

  const scale = 180 / 1080
  const scaledTextSize = Math.max(6, textSize * scale)
  const scaledGap = Math.max(2, sectionGap * scale)
  const scaledPaddingTop = Math.max(2, paddingTop * scale)
  const scaledPaddingBottom = Math.max(2, paddingBottom * scale)
  const scaledBrandNameSize = Math.max(6, brandNameSize * scale)
  const scaledHandleSize = Math.max(5, handleSize * scale)

  return (
    <div className="w-[180px] h-[320px] rounded-lg overflow-hidden shadow-lg border border-gray-200 flex-shrink-0 relative bg-black">
      {/* Dark background overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black" />

      {/* 3-div column layout */}
      <div
        className="absolute inset-0 flex flex-col"
        style={{
          paddingTop: `${scaledPaddingTop}px`,
          paddingBottom: `${scaledPaddingBottom}px`,
          paddingLeft: '8px',
          paddingRight: '8px',
          gap: `${scaledGap}px`,
        }}
      >
        {/* DIV 1: Brand Header (row) */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Circular logo with white border */}
          {showLogo && (
            <div className="w-6 h-6 rounded-full border-[1.5px] border-white flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-800">
              <img src={vaLogo} alt="Logo" className="w-4 h-4 rounded-sm" />
            </div>
          )}
          {/* Brand name + handle column */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-0.5">
              <span
                className="font-semibold truncate"
                style={{
                  color: brandNameColor,
                  fontSize: `${scaledBrandNameSize}px`,
                  lineHeight: 1.2,
                }}
              >
                Viral Toby
              </span>
              <BadgeCheck className="flex-shrink-0" style={{ width: `${scaledBrandNameSize * 0.8}px`, height: `${scaledBrandNameSize * 0.8}px`, color: '#3B82F6' }} />
            </div>
            {showHandle && (
              <span
                className="truncate"
                style={{
                  color: handleColor,
                  fontSize: `${scaledHandleSize}px`,
                  lineHeight: 1.2,
                }}
              >
                @viraltoby
              </span>
            )}
          </div>
        </div>

        {/* DIV 2: Text Content */}
        <div className="flex-1 min-h-0 overflow-hidden" style={{ fontFamily: textFont }}>
          <div
            className="rounded-md px-1.5 py-1 h-full overflow-hidden"
            style={{ backgroundColor: `rgba(0,0,0,${bgOpacity})` }}
          >
            <p
              className="leading-snug"
              style={{
                color: textColor,
                fontSize: `${scaledTextSize}px`,
                textShadow: textShadow ? '0 1px 3px rgba(0,0,0,0.7)' : 'none',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 12,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {EXAMPLE_REEL_TEXT}
            </p>
          </div>
        </div>

        {/* DIV 3: Image/Video Area */}
        <div className="relative flex-shrink-0 rounded-md overflow-hidden" style={{ height: '35%' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/60 to-purple-900/60 flex items-center justify-center">
            {/* Simulated fading image */}
            <div className="absolute inset-0 bg-gradient-to-r from-gray-600/40 via-gray-500/30 to-gray-600/40 animate-pulse" />
            <div className="relative z-10 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <div className="w-0 h-0 border-l-[5px] border-l-white/80 border-y-[3px] border-y-transparent ml-0.5" />
            </div>
          </div>
        </div>
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

        {/* ── Thumbnail Settings ── */}
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
                value={form.thumbnail_title_font || 'Anton'}
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
              <label className="block text-xs text-gray-500 mb-1">Overlay Intensity (%)</label>
              <input
                type="number"
                value={form.thumbnail_overlay_opacity ?? 60}
                onChange={e => update('thumbnail_overlay_opacity', +e.target.value)}
                min={0} max={100}
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

        {/* ── Brand Header Settings ── */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Brand Header</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.reel_brand_name_color || '#FFFFFF'}
                  onChange={e => update('reel_brand_name_color', e.target.value)}
                  className="w-8 h-8 rounded border border-gray-200 cursor-pointer bg-transparent"
                />
                <input
                  value={form.reel_brand_name_color || '#FFFFFF'}
                  onChange={e => update('reel_brand_name_color', e.target.value)}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-sm outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name Size</label>
              <input
                type="number"
                value={form.reel_brand_name_size ?? 16}
                onChange={e => update('reel_brand_name_size', +e.target.value)}
                min={10} max={40}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Handle Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.reel_handle_color || '#AAAAAA'}
                  onChange={e => update('reel_handle_color', e.target.value)}
                  className="w-8 h-8 rounded border border-gray-200 cursor-pointer bg-transparent"
                />
                <input
                  value={form.reel_handle_color || '#AAAAAA'}
                  onChange={e => update('reel_handle_color', e.target.value)}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-sm outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Handle Size</label>
              <input
                type="number"
                value={form.reel_handle_size ?? 14}
                onChange={e => update('reel_handle_size', +e.target.value)}
                min={8} max={30}
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

        {/* ── Reel Text Settings ── */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Reel Text Content</h3>
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
              <label className="block text-xs text-gray-500 mb-1">Avg Word Count</label>
              <input
                type="number"
                value={form.reel_avg_word_count ?? 50}
                onChange={e => update('reel_avg_word_count', +e.target.value)}
                min={10} max={200}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
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

        {/* ── Layout & Spacing ── */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Layout & Spacing</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Section Gap (px)</label>
              <input
                type="number"
                value={form.reel_section_gap ?? 16}
                onChange={e => update('reel_section_gap', +e.target.value)}
                min={0} max={60}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Padding Top (px)</label>
              <input
                type="number"
                value={form.reel_padding_top ?? 24}
                onChange={e => update('reel_padding_top', +e.target.value)}
                min={0} max={100}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Padding Bottom (px)</label>
              <input
                type="number"
                value={form.reel_padding_bottom ?? 16}
                onChange={e => update('reel_padding_bottom', +e.target.value)}
                min={0} max={100}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm outline-none focus:border-primary-500"
              />
            </div>
          </div>
        </section>

        {/* ── Slideshow Timing ── */}
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
