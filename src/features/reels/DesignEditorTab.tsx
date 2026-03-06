import { useState, useEffect, useMemo } from 'react'
import { Loader2, Save, BadgeCheck, Image, Film } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDesignSettings, useUpdateDesign } from './api/use-text-video'
import type { DesignSettings } from './types'
import vaLogo from '@/assets/icons/va-logo.svg'

const FONT_OPTIONS = ['Anton', 'Impact', 'Inter', 'Oswald', 'Montserrat', 'Bebas Neue', 'Roboto Condensed', 'Poppins']
const DIVIDER_OPTIONS = ['line_with_logo', 'gradient', 'none']

/* ─── Dynamic example text that stays coherent at any word count ─── */
const EXAMPLE_SENTENCES = [
  'Viral Toby is legendary in AI automation.',
  'It quietly orchestrates autonomous content empires while most creators still schedule posts manually.',
  'Its agents observe, learn, generate, test, and publish across platforms nonstop.',
  'Trends become viral assets at machine speed.',
  'The system scales brands effortlessly through data-driven strategies.',
  'Adaptive content pipelines discover emerging topics before they peak.',
  'Predictive trend scouting identifies viral opportunities across every niche.',
  'Continuous experimentation drives learning and optimization.',
  'Each piece of content is scored across five quality dimensions.',
  'Only the highest-scoring content reaches the audience.',
  'Performance metrics feed back into strategy decisions automatically.',
  'The platform adapts to any brand identity and tone.',
  'Content DNA defines every visual and textual choice.',
  'Publishing happens simultaneously across Instagram, TikTok, YouTube, Threads, and Facebook.',
  'The entire workflow runs autonomously, requiring zero manual intervention.',
  'Brands grow while their owners sleep.',
  'Every caption, hashtag, and visual is optimized for maximum engagement.',
  'The AI learns from each publish cycle to improve the next.',
]

function buildExampleText(targetWords: number): string {
  const result: string[] = []
  let count = 0
  let i = 0
  while (count < targetWords && i < EXAMPLE_SENTENCES.length * 3) {
    const sentence = EXAMPLE_SENTENCES[i % EXAMPLE_SENTENCES.length]
    const words = sentence.split(/\s+/).length
    if (count + words > targetWords + 5 && count > 0) break
    result.push(sentence)
    count += words
    i++
  }
  return result.join(' ')
}

// Reusable slider row
function SliderRow({ label, value, min, max, step = 1, unit = 'px', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-28 flex-shrink-0 truncate">{label}</span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(+e.target.value)}
        className="flex-1 h-1.5 accent-primary-600 cursor-pointer"
      />
      <span className="text-xs text-gray-700 font-mono w-14 text-right flex-shrink-0">{value}{unit}</span>
    </div>
  )
}

// Color picker row
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-28 flex-shrink-0 truncate">{label}</span>
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded border border-gray-200 cursor-pointer bg-transparent flex-shrink-0" />
      <input value={value} onChange={e => onChange(e.target.value)}
        className="w-20 bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-900 text-xs outline-none focus:border-primary-500" />
    </div>
  )
}

/* ─────────── PREVIEW SCALE ───────────
 * Real canvas: 1080×1920
 * Preview at ~2/3 of previous size (was 340, now 227).
 */
const CANVAS_W = 1080
const CANVAS_H = 1920
const PREVIEW_W = 227
const SCALE = PREVIEW_W / CANVAS_W  // ≈ 0.21

/* ──────────────────────────────────────────────
 * THUMBNAIL PREVIEW — Gold title, logo-in-divider, dramatic BG
 * ────────────────────────────────────────────── */
function ThumbnailPreview({ form }: { form: Partial<DesignSettings> }) {
  const titleColor = form.thumbnail_title_color || '#FFD700'
  const titleSize = form.thumbnail_title_size ?? 72
  const titlePadding = form.thumbnail_title_padding ?? 40
  const dividerStyle = form.thumbnail_divider_style || 'line_with_logo'
  const overlayOpacity = (form.thumbnail_overlay_opacity ?? 60) / 100
  const titleFont = form.thumbnail_title_font || 'Anton'
  const logoSize = form.thumbnail_logo_size ?? 200

  const s = SCALE
  const pw = CANVAS_W * s
  const ph = CANVAS_H * s
  const scaledLogo = logoSize * s

  return (
    <div
      className="rounded-xl overflow-hidden shadow-lg border border-gray-200 relative mx-auto"
      style={{ width: pw, height: ph, fontFamily: titleFont }}
    >
      {/* Dramatic background with Ken Burns panning */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #0f3460 50%, #533483 75%, #1a1a2e 100%)',
        backgroundSize: '200% 200%',
        animation: 'thumbKenBurns 8s ease-in-out infinite alternate',
      }} />

      {/* Dark gradient overlay from bottom */}
      <div className="absolute inset-0" style={{
        background: `linear-gradient(to top, rgba(0,0,0,${overlayOpacity}) 0%, rgba(0,0,0,${overlayOpacity * 0.7}) 35%, rgba(0,0,0,${overlayOpacity * 0.3}) 65%, transparent 100%)`,
      }} />

      {/* Content pinned to bottom */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center"
        style={{ padding: `${titlePadding * s}px` }}>

        {/* Brand name with hairlines: ── VIRAL TOBY ── */}
        <div className="flex items-center w-full" style={{ gap: `${6 * s}px`, marginBottom: `${8 * s}px` }}>
          <div className="flex-1 h-px" style={{ background: 'rgba(212,160,23,0.4)' }} />
          <span className="uppercase tracking-widest whitespace-nowrap" style={{
            color: 'rgba(212,160,23,0.7)',
            fontSize: `${18 * s}px`,
            fontFamily: 'Georgia, "Times New Roman", serif',
            letterSpacing: '0.15em',
          }}>Viral Toby</span>
          <div className="flex-1 h-px" style={{ background: 'rgba(212,160,23,0.4)' }} />
        </div>

        {/* Divider: logo-in-line — hairline breaks around centered logo */}
        {dividerStyle !== 'none' && (
          <div className="w-full flex items-center" style={{ gap: `${4 * s}px`, marginBottom: `${8 * s}px` }}>
            {dividerStyle === 'line_with_logo' ? (
              <>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.3)' }} />
                <img src={vaLogo} alt="Logo" style={{
                  width: scaledLogo,
                  height: scaledLogo,
                  borderRadius: `${4 * s}px`,
                }} />
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.3)' }} />
              </>
            ) : (
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
            )}
          </div>
        )}

        {/* Title — gold, ultra-bold condensed caps */}
        <p className="text-center font-black break-words w-full uppercase"
          style={{
            color: titleColor,
            fontSize: `${titleSize * s}px`,
            lineHeight: 0.95,
            letterSpacing: '-0.02em',
            textShadow: '0 2px 12px rgba(0,0,0,0.8), 0 0 40px rgba(255,215,0,0.15)',
          }}>
          ELON MUSK{'\n'}JUST BOUGHT{'\n'}TIKTOK
        </p>
      </div>

      <style>{`
        @keyframes thumbKenBurns {
          0% { background-position: 0% 0%; transform: scale(1); }
          100% { background-position: 100% 100%; transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}

/* ──────────────────────────────────────────────
 * REEL FRAME PREVIEW (1080×1920 scaled)
 * 3 divs: brand header, text, image/video
 * ────────────────────────────────────────────── */
function ReelFramePreview({ form }: { form: Partial<DesignSettings> }) {
  const textColor = form.reel_text_color || '#FFFFFF'
  const textSize = form.reel_text_size ?? 48
  const textFont = form.reel_text_font || 'Inter'
  const textShadow = form.reel_text_shadow ?? true
  const showLogo = form.show_logo ?? true
  const showHandle = form.show_handle ?? true
  const sectionGap = form.reel_section_gap ?? 40
  const paddingTop = form.reel_padding_top ?? 320
  const paddingBottom = form.reel_padding_bottom ?? 40
  const paddingLeft = form.reel_padding_left ?? 85
  const paddingRight = form.reel_padding_right ?? 85
  const imageHeight = form.reel_image_height ?? 600
  const brandNameColor = form.reel_brand_name_color || '#FFFFFF'
  const brandNameSize = form.reel_brand_name_size ?? 16
  const handleColor = form.reel_handle_color || '#AAAAAA'
  const handleSize = form.reel_handle_size ?? 14

  const s = SCALE
  const pw = CANVAS_W * s
  const ph = CANVAS_H * s
  const logoSize = 48 * s

  return (
    <div className="rounded-xl overflow-hidden shadow-lg border border-gray-200 relative bg-black mx-auto"
      style={{ width: pw, height: ph }}>
      {/* Dark background */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black" />

      {/* 3-div column layout */}
      <div className="absolute inset-0 flex flex-col" style={{
        paddingTop: `${paddingTop * s}px`,
        paddingBottom: `${paddingBottom * s}px`,
        paddingLeft: `${paddingLeft * s}px`,
        paddingRight: `${paddingRight * s}px`,
        gap: `${sectionGap * s}px`,
      }}>
        {/* DIV 1: Brand Header (row) */}
        <div className="flex items-center flex-shrink-0" style={{ gap: `${12 * s}px` }}>
          {showLogo && (
            <div className="rounded-full border-2 border-white flex items-center justify-center flex-shrink-0 overflow-hidden bg-gray-800"
              style={{ width: logoSize, height: logoSize }}>
              <img src={vaLogo} alt="Logo" className="rounded-sm" style={{ width: logoSize * 0.7, height: logoSize * 0.7 }} />
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center" style={{ gap: `${4 * s}px` }}>
              <span className="font-semibold truncate" style={{
                color: brandNameColor, fontSize: `${brandNameSize * s}px`, lineHeight: 1.2,
              }}>Viral Toby</span>
              <BadgeCheck className="flex-shrink-0" style={{
                width: `${brandNameSize * s * 0.85}px`, height: `${brandNameSize * s * 0.85}px`, color: '#3B82F6',
              }} />
            </div>
            {showHandle && (
              <span className="truncate" style={{
                color: handleColor, fontSize: `${handleSize * s}px`, lineHeight: 1.3,
              }}>@viraltoby</span>
            )}
          </div>
        </div>

        {/* DIV 2: Text Content */}
        <div className="flex-1 min-h-0 overflow-hidden" style={{ fontFamily: textFont }}>
          <p className="leading-snug" style={{
            color: textColor,
            fontSize: `${textSize * s}px`,
            textShadow: textShadow ? '0 1px 3px rgba(0,0,0,0.7)' : 'none',
            lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: 20,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {EXAMPLE_REEL_TEXT}
          </p>
        </div>

        {/* DIV 3: Image/Video Area */}
        <div className="relative flex-shrink-0 rounded-lg overflow-hidden"
          style={{ height: `${imageHeight * s}px` }}>
          <div className="absolute inset-0 bg-gradient-to-br from-blue-900/50 to-purple-900/50 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-r from-gray-600/30 via-gray-500/20 to-gray-600/30 animate-pulse" />
            <div className="relative z-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm"
              style={{ width: 40 * s, height: 40 * s }}>
              <div className="border-l-white/80 border-y-transparent ml-0.5"
                style={{ width: 0, height: 0, borderLeftWidth: `${10 * s}px`, borderTopWidth: `${6 * s}px`, borderBottomWidth: `${6 * s}px` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
 * MAIN COMPONENT — Two tabs: Thumbnail / Content
 * Each tab: preview LEFT, settings RIGHT
 * ────────────────────────────────────────────── */
type DesignTab = 'thumbnail' | 'content'

export function DesignEditorTab() {
  const { data: design, isLoading } = useDesignSettings()
  const updateMutation = useUpdateDesign()
  const [form, setForm] = useState<Partial<DesignSettings>>({})
  const [tab, setTab] = useState<DesignTab>('thumbnail')

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
    <div className="space-y-4">
      {/* ── Sticky top bar: tabs + save ── */}
      <div className="sticky top-0 z-20 bg-gray-50 -mx-1 px-1 pb-3 pt-1 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
            {([
              { id: 'thumbnail' as DesignTab, label: 'Thumbnail', icon: <Image className="w-3.5 h-3.5" /> },
              { id: 'content' as DesignTab, label: 'Content', icon: <Film className="w-3.5 h-3.5" /> },
            ]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === t.id ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
          <button onClick={handleSave} disabled={updateMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* ── Tab content: preview LEFT — settings RIGHT ── */}
      <div className="flex gap-6 items-start">
        {/* LEFT: Preview */}
        <div className="flex-shrink-0">
          {tab === 'thumbnail' ? (
            <ThumbnailPreview form={form} />
          ) : (
            <ReelFramePreview form={form} />
          )}
        </div>

        {/* RIGHT: Settings */}
        <div className="flex-1 min-w-0 space-y-5">
          {tab === 'thumbnail' ? (
            <ThumbnailSettings form={form} update={update} />
          ) : (
            <ContentSettings form={form} update={update} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
 * THUMBNAIL SETTINGS PANEL
 * ────────────────────────────────────────────── */
function ThumbnailSettings({ form, update }: {
  form: Partial<DesignSettings>
  update: (key: keyof DesignSettings, value: unknown) => void
}) {
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Title</h4>
        <ColorRow label="Title Color" value={form.thumbnail_title_color || '#FFFFFF'} onChange={v => update('thumbnail_title_color', v)} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-28 flex-shrink-0">Font</span>
          <select value={form.thumbnail_title_font || 'Anton'} onChange={e => update('thumbnail_title_font', e.target.value)}
            className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-900 text-xs outline-none focus:border-primary-500">
            {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <SliderRow label="Title Size" value={form.thumbnail_title_size ?? 72} min={36} max={120} onChange={v => update('thumbnail_title_size', v)} />
        <SliderRow label="Title Padding" value={form.thumbnail_title_padding ?? 40} min={10} max={200} onChange={v => update('thumbnail_title_padding', v)} />
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Overlay</h4>
        <SliderRow label="Dark Intensity" value={form.thumbnail_overlay_opacity ?? 60} min={0} max={100} unit="%" onChange={v => update('thumbnail_overlay_opacity', v)} />
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Divider</h4>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-28 flex-shrink-0">Style</span>
          <select value={form.thumbnail_divider_style || 'line_with_logo'} onChange={e => update('thumbnail_divider_style', e.target.value)}
            className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-900 text-xs outline-none focus:border-primary-500">
            {DIVIDER_OPTIONS.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </section>
    </div>
  )
}

/* ──────────────────────────────────────────────
 * CONTENT / REEL FRAME SETTINGS PANEL
 * ────────────────────────────────────────────── */
function ContentSettings({ form, update }: {
  form: Partial<DesignSettings>
  update: (key: keyof DesignSettings, value: unknown) => void
}) {
  return (
    <div className="space-y-4">
      {/* Brand Header */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Brand Header</h4>
        <ColorRow label="Name Color" value={form.reel_brand_name_color || '#FFFFFF'} onChange={v => update('reel_brand_name_color', v)} />
        <SliderRow label="Name Size" value={form.reel_brand_name_size ?? 16} min={10} max={40} onChange={v => update('reel_brand_name_size', v)} />
        <ColorRow label="Handle Color" value={form.reel_handle_color || '#AAAAAA'} onChange={v => update('reel_handle_color', v)} />
        <SliderRow label="Handle Size" value={form.reel_handle_size ?? 14} min={8} max={30} onChange={v => update('reel_handle_size', v)} />
        <div className="flex items-center gap-4 pt-1">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={form.show_logo ?? true} onChange={e => update('show_logo', e.target.checked)} className="w-3.5 h-3.5 accent-primary-600" />
            Logo
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={form.show_handle ?? true} onChange={e => update('show_handle', e.target.checked)} className="w-3.5 h-3.5 accent-primary-600" />
            Handle
          </label>
        </div>
      </section>

      {/* Text */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Text</h4>
        <ColorRow label="Text Color" value={form.reel_text_color || '#FFFFFF'} onChange={v => update('reel_text_color', v)} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-28 flex-shrink-0">Font</span>
          <select value={form.reel_text_font || 'Inter'} onChange={e => update('reel_text_font', e.target.value)}
            className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-900 text-xs outline-none focus:border-primary-500">
            {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <SliderRow label="Font Size" value={form.reel_text_size ?? 48} min={24} max={96} onChange={v => update('reel_text_size', v)} />
        <SliderRow label="Avg Words" value={form.reel_avg_word_count ?? 50} min={10} max={200} unit="" onChange={v => update('reel_avg_word_count', v)} />
        <SliderRow label="BG Opacity" value={form.reel_text_bg_opacity ?? 50} min={0} max={100} unit="%" onChange={v => update('reel_text_bg_opacity', v)} />
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer pt-1">
          <input type="checkbox" checked={form.reel_text_shadow ?? true} onChange={e => update('reel_text_shadow', e.target.checked)} className="w-3.5 h-3.5 accent-primary-600" />
          Text Shadow
        </label>
      </section>

      {/* Layout */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Layout</h4>
        <SliderRow label="Padding Top" value={form.reel_padding_top ?? 320} min={0} max={600} onChange={v => update('reel_padding_top', v)} />
        <SliderRow label="Padding Bottom" value={form.reel_padding_bottom ?? 40} min={0} max={200} onChange={v => update('reel_padding_bottom', v)} />
        <SliderRow label="Padding Left" value={form.reel_padding_left ?? 85} min={0} max={200} onChange={v => update('reel_padding_left', v)} />
        <SliderRow label="Padding Right" value={form.reel_padding_right ?? 85} min={0} max={200} onChange={v => update('reel_padding_right', v)} />
        <SliderRow label="Section Gap" value={form.reel_section_gap ?? 40} min={0} max={120} onChange={v => update('reel_section_gap', v)} />
        <SliderRow label="Image Height" value={form.reel_image_height ?? 600} min={200} max={1200} onChange={v => update('reel_image_height', v)} />
      </section>

      {/* Slideshow Timing */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Slideshow</h4>
        <SliderRow label="Image Duration" value={form.image_duration ?? 3} min={1} max={10} step={0.5} unit="s" onChange={v => update('image_duration', v)} />
        <SliderRow label="Fade Duration" value={form.image_fade_duration ?? 0.2} min={0} max={2} step={0.1} unit="s" onChange={v => update('image_fade_duration', v)} />
        <SliderRow label="Total Duration" value={form.reel_total_duration ?? 15} min={5} max={60} unit="s" onChange={v => update('reel_total_duration', v)} />
        <SliderRow label="Black Fade In" value={form.black_fade_duration ?? 1} min={0} max={5} step={0.5} unit="s" onChange={v => update('black_fade_duration', v)} />
      </section>
    </div>
  )
}
