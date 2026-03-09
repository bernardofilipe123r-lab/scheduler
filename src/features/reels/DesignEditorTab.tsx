import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Loader2, Save, Image, Film, RotateCcw, Music, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDesignSettings, useUpdateDesign } from './api/use-format-b'
import type { DesignSettings } from './types'
import { useDynamicBrands } from '@/features/brands/hooks/use-dynamic-brands'
import { BrandThemeModal } from '@/features/brands/components/BrandThemeModal'
import type { BrandInfo } from '@/features/brands/constants'
import vaLogo from '@/assets/icons/vt-logo.png'
import verifiedIcon from '@/assets/icons/verified.png'
import testBg from '@/assets/images/test-viral-toby.jpg'
import previewSlide1 from '@/assets/images/preview/slide-1.jpg'
import previewSlide2 from '@/assets/images/preview/slide-2.jpg'
import previewSlide3 from '@/assets/images/preview/slide-3.jpg'
import previewSlide4 from '@/assets/images/preview/slide-4.jpg'

const PREVIEW_SLIDES = [previewSlide1, previewSlide2, previewSlide3, previewSlide4]

const FONT_OPTIONS = ['Anton', 'Inter', 'Oswald', 'Montserrat', 'Bebas Neue', 'Roboto Condensed', 'Poppins']
const DIVIDER_OPTIONS = ['line_with_logo', 'gradient', 'none']

/* ─── Base sizes for the header scale system ─── */
const BASE_NAME_SIZE = 42
const BASE_HANDLE_SIZE = 32
const BASE_LOGO_SIZE = 96

/* ─── Default values for reset ─── */
const DEFAULTS: Partial<DesignSettings> = {
  // Thumbnail
  thumbnail_title_color: '#FFD700',
  thumbnail_title_font: 'Anton',
  thumbnail_title_size: 120,
  thumbnail_title_padding: 150,
  thumbnail_logo_size: 100,
  thumbnail_overlay_opacity: 80,
  thumbnail_divider_style: 'line_with_logo',
  thumbnail_divider_thickness: 4,
  // Reel
  reel_text_color: '#FFFFFF',
  reel_text_font: 'Inter',
  reel_text_size: 38,
  reel_text_font_bold: false,
  reel_brand_name_color: '#FFFFFF',
  reel_handle_color: '#AAAAAA',
  reel_header_scale: 1.15,
  reel_brand_name_size: BASE_NAME_SIZE,
  reel_handle_size: BASE_HANDLE_SIZE,
  reel_logo_size: BASE_LOGO_SIZE,
  show_logo: true,
  show_handle: true,
  reel_padding_top: 320,
  reel_section_gap: 40,
  reel_image_height: 660,
  image_duration: 3,
  black_fade_duration: 1.0,
  reel_music_enabled: true,
}

/* Keys we compare for dirty/changed detection */
const COMPARE_KEYS = Object.keys(DEFAULTS) as (keyof DesignSettings)[]

function formsDiffer(a: Partial<DesignSettings>, b: Partial<DesignSettings>): boolean {
  return COMPARE_KEYS.some(k => {
    const va = a[k]
    const vb = b[k]
    if (va === undefined && vb === undefined) return false
    if (typeof va === 'number' && typeof vb === 'number') return Math.abs(va - vb) > 0.001
    return va !== vb
  })
}

/* ─── Dynamic example text that stays coherent at any word count ─── */
const EXAMPLE_SENTENCES = [
  'Viral Toby is legendary in AI automation.',
  'It quietly orchestrates autonomous content empires while most creators still schedule posts manually.',
  'Its agents observe, learn, generate, test, and publish across platforms nonstop.',
  'Trends become viral assets at machine speed.',
  'The system scales brands effortlessly through data-driven strategies.',
  'Adaptive content pipelines discover emerging topics before they peak.',
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

// Compact color picker — small circle swatch only
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-28 flex-shrink-0 truncate">{label}</span>
      <div className="relative w-7 h-7 flex-shrink-0">
        <div className="absolute inset-0 rounded-full border border-gray-200 shadow-sm" style={{ background: value }} />
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </div>
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
const THUMB_TITLE = 'HOW VIRAL TOBY AUTOMATES YOUR ENTIRE CONTENT STRATEGY'

/**
 * Auto-fit title into 2 or 3 lines at the largest possible font size.
 * Prefers 2 lines first; falls back to 3 if text is too long.
 */
function useAutoTitleLines(title: string, _maxFontSize: number, font: string, containerWidthPx: number) {
  const [fontReady, setFontReady] = useState(false)
  useEffect(() => {
    document.fonts.ready.then(() => setFontReady(true))
  }, [])

  return useMemo(() => {
    const words = title.split(/\s+/)
    if (words.length <= 1) return { lines: [title], fontSize: 300 }

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const letterSpacing = 2 // matches the 2px letter-spacing in the render

    function measureLine(text: string, size: number): number {
      ctx.font = `900 ${size}px ${font}, sans-serif`
      // Account for letter-spacing: adds (charCount - 1) * letterSpacing
      return ctx.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing
    }

    function greedySplit(size: number): string[] {
      // Use 98% of container width as safety margin for CSS vs canvas rendering differences
      const maxWidth = containerWidthPx * 0.98
      const lines: string[] = []
      let current = ''
      for (const word of words) {
        const test = current ? `${current} ${word}` : word
        if (current && measureLine(test, size) > maxWidth) {
          lines.push(current)
          current = word
        } else {
          current = test
        }
      }
      if (current) lines.push(current)
      return lines
    }

    // First pass: find largest font that fits in 2 lines, then shave 2px
    for (let size = 300; size >= 20; size--) {
      const lines = greedySplit(size)
      if (lines.length <= 2) {
        const final = Math.max(20, size - 2)
        return { lines: greedySplit(final), fontSize: final }
      }
    }

    // Second pass: text too long for 2 lines, try 3
    for (let size = 300; size >= 20; size--) {
      const lines = greedySplit(size)
      if (lines.length <= 3) {
        const final = Math.max(20, size - 2)
        return { lines: greedySplit(final), fontSize: final }
      }
    }

    // Fallback
    return { lines: [title], fontSize: 20 }
  }, [title, _maxFontSize, font, containerWidthPx, fontReady])
}

function ThumbnailPreview({ form }: { form: Partial<DesignSettings> }) {
  const titleColor = form.thumbnail_title_color || '#FFD700'
  const titleSize = form.thumbnail_title_size ?? 120
  const titlePadding = form.thumbnail_title_padding ?? 220
  const dividerStyle = form.thumbnail_divider_style || 'line_with_logo'
  const overlayOpacity = ((form.thumbnail_overlay_opacity ?? 80) + 20) / 100
  const titleFont = form.thumbnail_title_font || 'Anton'
  const logoSize = form.thumbnail_logo_size ?? 100
  const dividerThickness = form.thumbnail_divider_thickness ?? 4

  const s = SCALE
  const pw = CANVAS_W * s
  const ph = CANVAS_H * s
  const scaledLogo = logoSize * s
  const lineThickness = Math.max(dividerThickness * s, 1)
  const lineLogoGap = 20 * s
  const dividerTitleGap = 24 * s
  const sidePadding = 55 // real px
  const titleAreaWidth = CANVAS_W - sidePadding * 2

  const { lines: titleLines, fontSize: autoFontSize } = useAutoTitleLines(
    THUMB_TITLE, titleSize, titleFont, titleAreaWidth
  )

  return (
    <div
      className="rounded-xl overflow-hidden shadow-lg border border-gray-200 relative mx-auto"
      style={{ width: pw, height: ph, fontFamily: titleFont }}
    >
      {/* Background image — object-fit cover preserves aspect ratio */}
      <img src={testBg} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center' }} />

      {/* Dark gradient overlay from bottom */}
      <div className="absolute inset-0" style={{
        background: `linear-gradient(to top, rgba(0,0,0,${overlayOpacity}) 0%, rgba(0,0,0,${overlayOpacity * 0.7}) 35%, rgba(0,0,0,${overlayOpacity * 0.3}) 65%, transparent 100%)`,
      }} />

      {/* Content pinned to bottom */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center"
        style={{ paddingBottom: `${titlePadding * s}px`, paddingLeft: `${sidePadding * s}px`, paddingRight: `${sidePadding * s}px` }}>

        {/* Divider: line with logo in center (both styles show logo) */}
        {dividerStyle !== 'none' && (
          <div className="w-full flex items-center" style={{ marginBottom: `${dividerTitleGap}px` }}>
            <div className="flex-1" style={{
              height: `${lineThickness}px`,
              background: dividerStyle === 'gradient'
                ? 'linear-gradient(to right, transparent, rgba(255,255,255,0.7))'
                : '#FFFFFF',
            }} />
            <div style={{ paddingLeft: `${lineLogoGap}px`, paddingRight: `${lineLogoGap}px` }}>
              <img src={vaLogo} alt="Logo" style={{
                width: scaledLogo,
                height: scaledLogo,
                borderRadius: `${4 * s}px`,
              }} />
            </div>
            <div className="flex-1" style={{
              height: `${lineThickness}px`,
              background: dividerStyle === 'gradient'
                ? 'linear-gradient(to left, transparent, rgba(255,255,255,0.7))'
                : '#FFFFFF',
            }} />
          </div>
        )}

        {/* Title — auto-sized to 2 or 3 lines */}
        <div className="text-center font-black w-full uppercase" style={{
          color: titleColor,
          fontSize: `${autoFontSize * s}px`,
          lineHeight: 1.05,
          letterSpacing: `${2 * s}px`,
          textShadow: '0 2px 12px rgba(0,0,0,0.8), 0 0 40px rgba(255,215,0,0.15)',
        }}>
          {titleLines.map((line, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{line}</div>)}
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
 * REEL FRAME PREVIEW — 3 divs with independent gaps
 * ────────────────────────────────────────────── */
function ReelFramePreview({ form }: { form: Partial<DesignSettings> }) {
  const textColor = form.reel_text_color || '#FFFFFF'
  const textSize = form.reel_text_size ?? 48
  const textFont = form.reel_text_font || 'Inter'
  const fontBold = form.reel_text_font_bold ?? false
  const showLogo = form.show_logo ?? true
  const showHandle = form.show_handle ?? true
  const gap = form.reel_section_gap ?? 40
  const paddingTop = form.reel_padding_top ?? 320
  const paddingLeft = 85 // hardcoded
  const paddingRight = 85 // hardcoded
  const paddingBottom = 40 // hardcoded
  const imageHeight = form.reel_image_height ?? 660
  const brandNameColor = form.reel_brand_name_color || '#FFFFFF'
  const handleColor = form.reel_handle_color || '#AAAAAA'
  const scale = form.reel_header_scale ?? 1.15
  const brandNameSize = Math.round(BASE_NAME_SIZE * scale)
  const handleSize = Math.round(BASE_HANDLE_SIZE * scale)
  const logoSizePx = Math.round(BASE_LOGO_SIZE * scale)
  const avgWords = 55 // hardcoded

  const exampleText = useMemo(() => buildExampleText(avgWords), [avgWords])

  const s = SCALE
  const pw = CANVAS_W * s
  const ph = CANVAS_H * s
  const scaledLogo = logoSizePx * s

  return (
    <div className="rounded-xl overflow-hidden shadow-lg border border-gray-200 relative bg-black mx-auto"
      style={{ width: pw, height: ph }}>

      {/* 3-div column — text div auto-heights */}
      <div className="absolute inset-0 flex flex-col" style={{
        paddingTop: `${paddingTop * s}px`,
        paddingBottom: `${paddingBottom * s}px`,
        paddingLeft: `${paddingLeft * s}px`,
        paddingRight: `${paddingRight * s}px`,
      }}>
        {/* DIV 1: Brand Header */}
        <div className="flex items-center flex-shrink-0" style={{ gap: `${12 * s}px` }}>
          {showLogo && (
            <div className="rounded-full border-white flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ width: scaledLogo, height: scaledLogo, borderWidth: `${Math.max(1, 1 * s)}px`, borderStyle: 'solid' }}>
              <img src={vaLogo} alt="Logo" className="rounded-[1px] object-cover" style={{ width: scaledLogo, height: scaledLogo }} />
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center" style={{ gap: `${4 * s}px` }}>
              <span className="font-semibold truncate" style={{
                color: brandNameColor, fontSize: `${brandNameSize * s}px`, lineHeight: 1.2,
              }}>Viral Toby</span>
              <img src={verifiedIcon} alt="verified" className="flex-shrink-0" style={{
                width: `${brandNameSize * s * 0.85}px`, height: `${brandNameSize * s * 0.85}px`,
              }} />
            </div>
            {showHandle && (
              <span className="truncate" style={{
                color: handleColor, fontSize: `${handleSize * s}px`, lineHeight: 1.3,
              }}>@viraltoby</span>
            )}
          </div>
        </div>

        {/* Gap: Header → Text */}
        <div className="flex-shrink-0" style={{ height: `${gap * s}px` }} />

        {/* DIV 2: Text Content — auto height, adapts to font size & word count */}
        <div className="flex-shrink-0 overflow-hidden" style={{ fontFamily: textFont }}>
          <p className="leading-snug" style={{
            color: textColor,
            fontSize: `${textSize * s}px`,
            fontWeight: fontBold ? 700 : 400,
            textShadow: '0 1px 3px rgba(0,0,0,0.7)',
            lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: 20,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {exampleText}
          </p>
        </div>

        {/* Gap: Text → Media */}
        <div className="flex-shrink-0" style={{ height: `${gap * s}px` }} />

        {/* DIV 3: Image/Video Area — cycling slideshow */}
        <div className="relative flex-shrink-0 rounded-lg overflow-hidden"
          style={{ height: `${imageHeight * s}px` }}>
          {PREVIEW_SLIDES.map((slide, i) => (
            <img key={i} src={slide} alt="" className="absolute inset-0 w-full h-full object-cover"
              style={{
                animation: `reelSlideFade ${PREVIEW_SLIDES.length * 3}s ${i * 3}s infinite`,
                opacity: 0,
              }} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes reelSlideFade {
          0% { opacity: 0; }
          5% { opacity: 1; }
          ${100 / PREVIEW_SLIDES.length - 2}% { opacity: 1; }
          ${100 / PREVIEW_SLIDES.length}% { opacity: 0; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

/* ──────────────────────────────────────────────
 * MAIN COMPONENT — Two top-level tabs: Format A / Format B
 * ────────────────────────────────────────────── */
type TopTab = 'format-a' | 'format-b'

export function DesignEditorTab({ onBack }: { onBack?: () => void }) {
  const [topTab, setTopTab] = useState<TopTab>('format-a')

  // Format B sub-tab + action state (lifted here for unified header)
  const [formatBTab, setFormatBTab] = useState<DesignTab>('thumbnail')
  const formatBRef = useRef<{ save: () => void; reset: () => void; hasChanges: boolean; isPending: boolean } | null>(null)
  const [, forceUpdate] = useState(0)

  return (
    <div className="space-y-4">
      {/* ── Single unified header row ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Back button */}
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors mr-1">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        {/* Format A / Format B selector */}
        <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
          {([
            { id: 'format-a' as TopTab, label: 'Format A', icon: <Image className="w-4 h-4" /> },
            { id: 'format-b' as TopTab, label: 'Format B', icon: <Film className="w-4 h-4" /> },
          ]).map(t => (
            <button key={t.id} onClick={() => setTopTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                topTab === t.id ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Format B sub-tabs + actions (only when Format B is active) */}
        {topTab === 'format-b' && (
          <>
            <div className="w-px h-6 bg-gray-200" />
            <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-0.5">
              {([
                { id: 'thumbnail' as DesignTab, label: 'Thumbnail', icon: <Image className="w-3.5 h-3.5" /> },
                { id: 'content' as DesignTab, label: 'Content', icon: <Film className="w-3.5 h-3.5" /> },
              ]).map(t => (
                <button key={t.id} onClick={() => setFormatBTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    formatBTab === t.id ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <button onClick={() => formatBRef.current?.reset()} disabled={!formatBRef.current?.hasChanges || formatBRef.current?.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
              <button onClick={() => formatBRef.current?.save()} disabled={!formatBRef.current?.hasChanges || formatBRef.current?.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {formatBRef.current?.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          </>
        )}
      </div>

      {topTab === 'format-a' && <TextReelsDesign />}
      {topTab === 'format-b' && <FormatBDesign tab={formatBTab} setTab={setFormatBTab} actionsRef={formatBRef} onStateChange={() => forceUpdate(n => n + 1)} />}
    </div>
  )
}

/* ──────────────────────────────────────────────
 * TEXT REELS DESIGN — Per-brand theme editor (inline)
 * ────────────────────────────────────────────── */
function TextReelsDesign() {
  const { brands, isLoading: brandsLoading } = useDynamicBrands()
  const [selectedBrandId, setSelectedBrandId] = useState<string>('')

  useEffect(() => {
    if (brands.length > 0 && !selectedBrandId) {
      setSelectedBrandId(brands[0].id)
    }
  }, [brands, selectedBrandId])

  if (brandsLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  const selectedBrand = brands.find(b => b.id === selectedBrandId)
  if (!selectedBrand) return null

  const brandInfo: BrandInfo = {
    id: selectedBrand.id,
    name: selectedBrand.label,
    color: selectedBrand.color,
    logo: '',
  }

  const brandSelector = (
    <select
      value={selectedBrandId}
      onChange={e => setSelectedBrandId(e.target.value)}
      className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 font-medium outline-none focus:border-primary-500 cursor-pointer"
    >
      {brands.map(b => (
        <option key={b.id} value={b.id}>{b.label}</option>
      ))}
    </select>
  )

  return (
    <BrandThemeModal
      key={selectedBrandId}
      brand={brandInfo}
      onClose={() => {}}
      inline
      brandSelector={brandSelector}
    />
  )
}

/* ──────────────────────────────────────────────
 * Format B DESIGN — Thumbnail & Content settings
 * Each sub-tab: preview LEFT, settings RIGHT
 * ────────────────────────────────────────────── */
type DesignTab = 'thumbnail' | 'content'

function FormatBDesign({ tab, setTab, actionsRef, onStateChange }: {
  tab: DesignTab
  setTab: (t: DesignTab) => void
  actionsRef: React.MutableRefObject<{ save: () => void; reset: () => void; hasChanges: boolean; isPending: boolean } | null>
  onStateChange: () => void
}) {
  const { data: design, isLoading } = useDesignSettings()
  const updateMutation = useUpdateDesign()
  const [form, setForm] = useState<Partial<DesignSettings>>({})
  const savedRef = useRef<Partial<DesignSettings>>({})

  useEffect(() => {
    if (design) {
      setForm(design)
      savedRef.current = design
    }
  }, [design])

  const hasChanges = useMemo(() => formsDiffer(form, savedRef.current), [form])

  const update = (key: keyof DesignSettings, value: unknown) => {
    setForm((prev: Partial<DesignSettings>) => ({ ...prev, [key]: value }))
  }

  const buildPayload = useCallback((source: Partial<DesignSettings>) => {
    const scale = source.reel_header_scale ?? 1.15
    const gap = source.reel_section_gap ?? 40
    return {
      ...source,
      reel_brand_name_size: Math.round(BASE_NAME_SIZE * scale),
      reel_handle_size: Math.round(BASE_HANDLE_SIZE * scale),
      reel_logo_size: Math.round(BASE_LOGO_SIZE * scale),
      reel_gap_header_text: gap,
      reel_gap_text_media: gap,
      reel_padding_bottom: 40,
      reel_padding_left: 85,
      reel_padding_right: 85,
      reel_avg_word_count: 55,
      image_fade_duration: 0.2,
      reel_text_bg_opacity: 85,
      reel_text_shadow: true,
    } as Partial<DesignSettings>
  }, [])

  const handleSave = useCallback(async () => {
    const payload = buildPayload(form)
    try {
      await updateMutation.mutateAsync(payload)
      savedRef.current = { ...form }
      setForm(f => ({ ...f }))
      toast.success('Design settings saved')
    } catch {
      toast.error('Failed to save design settings')
    }
  }, [form, updateMutation, buildPayload])

  const handleReset = useCallback(async () => {
    const resetForm = { ...form, ...DEFAULTS }
    setForm(resetForm)
    const payload = buildPayload(resetForm)
    try {
      await updateMutation.mutateAsync(payload)
      savedRef.current = { ...resetForm }
      setForm(f => ({ ...f }))
      toast.success('Reset to defaults and saved')
    } catch {
      toast.error('Failed to save after reset')
    }
  }, [form, updateMutation, buildPayload])

  // Expose actions to parent header
  useEffect(() => {
    actionsRef.current = { save: handleSave, reset: handleReset, hasChanges, isPending: updateMutation.isPending }
    onStateChange()
  }, [hasChanges, updateMutation.isPending, handleSave, handleReset])

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="space-y-4">
      {/* ── Tab content: 2 previews LEFT — settings RIGHT ── */}
      <div className="flex gap-6 items-start">
        {/* LEFT: Both previews side by side */}
        <div className="flex gap-3 flex-shrink-0">
          <div
            className={`cursor-pointer transition-opacity ${tab === 'thumbnail' ? 'ring-2 ring-primary-400 rounded-xl' : 'opacity-60 hover:opacity-80'}`}
            onClick={() => setTab('thumbnail')}
          >
            <ThumbnailPreview form={form} />
          </div>
          <div
            className={`cursor-pointer transition-opacity ${tab === 'content' ? 'ring-2 ring-primary-400 rounded-xl' : 'opacity-60 hover:opacity-80'}`}
            onClick={() => setTab('content')}
          >
            <ReelFramePreview form={form} />
          </div>
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
 * THUMBNAIL SETTINGS
 * ────────────────────────────────────────────── */
function ThumbnailSettings({ form, update }: {
  form: Partial<DesignSettings>
  update: (key: keyof DesignSettings, value: unknown) => void
}) {
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Title</h4>
        <ColorRow label="Title Color" value={form.thumbnail_title_color || '#FFD700'} onChange={v => update('thumbnail_title_color', v)} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-28 flex-shrink-0">Font</span>
          <select value={form.thumbnail_title_font || 'Anton'} onChange={e => update('thumbnail_title_font', e.target.value)}
            className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-900 text-xs outline-none focus:border-primary-500">
            {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <SliderRow label="Title Padding" value={form.thumbnail_title_padding ?? 220} min={10} max={400} onChange={v => update('thumbnail_title_padding', v)} />
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Logo</h4>
        <SliderRow label="Logo Size" value={form.thumbnail_logo_size ?? 100} min={80} max={120} onChange={v => update('thumbnail_logo_size', v)} />
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Overlay</h4>
        <SliderRow label="Dark Intensity" value={form.thumbnail_overlay_opacity ?? 80} min={80} max={100} unit="%" onChange={v => update('thumbnail_overlay_opacity', v)} />
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
        <SliderRow label="Thickness" value={form.thumbnail_divider_thickness ?? 4} min={1} max={10} onChange={v => update('thumbnail_divider_thickness', v)} />
      </section>
    </div>
  )
}

/* ──────────────────────────────────────────────
 * CONTENT / REEL FRAME SETTINGS
 * ────────────────────────────────────────────── */
function ContentSettings({ form, update }: {
  form: Partial<DesignSettings>
  update: (key: keyof DesignSettings, value: unknown) => void
}) {
  const headerScale = form.reel_header_scale ?? 1.15

  return (
    <div className="space-y-4">
      {/* Brand Header */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Brand Header</h4>
        <div className="grid grid-cols-2 gap-x-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 flex-shrink-0">Name</span>
            <div className="relative w-6 h-6 flex-shrink-0">
              <div className="absolute inset-0 rounded-full border border-gray-200 shadow-sm" style={{ background: form.reel_brand_name_color || '#FFFFFF' }} />
              <input type="color" value={form.reel_brand_name_color || '#FFFFFF'} onChange={e => update('reel_brand_name_color', e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 flex-shrink-0">Handle</span>
            <div className="relative w-6 h-6 flex-shrink-0">
              <div className="absolute inset-0 rounded-full border border-gray-200 shadow-sm" style={{ background: form.reel_handle_color || '#AAAAAA' }} />
              <input type="color" value={form.reel_handle_color || '#AAAAAA'} onChange={e => update('reel_handle_color', e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-28 flex-shrink-0 truncate">Scale</span>
          <input
            type="range" min={0.5} max={1.5} step={0.05}
            value={headerScale}
            onChange={e => update('reel_header_scale', +e.target.value)}
            className="flex-1 h-1.5 accent-primary-600 cursor-pointer"
          />
          <span className="text-xs text-gray-700 font-mono w-14 text-right flex-shrink-0">×{headerScale.toFixed(2)}</span>
        </div>
        <p className="text-[10px] text-gray-400 pl-[7.5rem]">
          Name {Math.round(BASE_NAME_SIZE * headerScale)}px · Handle {Math.round(BASE_HANDLE_SIZE * headerScale)}px · Logo {Math.round(BASE_LOGO_SIZE * headerScale)}px
        </p>
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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-gray-500">Color</span>
            <div className="relative w-6 h-6 flex-shrink-0">
              <div className="absolute inset-0 rounded-full border border-gray-200 shadow-sm" style={{ background: form.reel_text_color || '#FFFFFF' }} />
              <input type="color" value={form.reel_text_color || '#FFFFFF'} onChange={e => update('reel_text_color', e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </div>
          </div>
          <select value={form.reel_text_font || 'Inter'} onChange={e => update('reel_text_font', e.target.value)}
            className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-900 text-xs outline-none focus:border-primary-500 min-w-0">
            {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer flex-shrink-0">
            <input type="checkbox" checked={form.reel_text_font_bold ?? false} onChange={e => update('reel_text_font_bold', e.target.checked)} className="w-3.5 h-3.5 accent-primary-600" />
            Bold
          </label>
        </div>
        <SliderRow label="Font Size" value={form.reel_text_size ?? 38} min={24} max={42} onChange={v => update('reel_text_size', v)} />
      </section>

      {/* Layout */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Layout</h4>
        <SliderRow label="Padding Top" value={form.reel_padding_top ?? 320} min={0} max={600} onChange={v => update('reel_padding_top', v)} />
        <SliderRow label="Gap" value={form.reel_section_gap ?? 40} min={0} max={200} onChange={v => update('reel_section_gap', v)} />
        <SliderRow label="Image Height" value={form.reel_image_height ?? 660} min={400} max={730} onChange={v => update('reel_image_height', v)} />
      </section>

      {/* Slideshow */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Slideshow</h4>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-xs text-gray-500 w-28 flex-shrink-0 truncate">Image Duration</span>
            <input
              type="range" min={1} max={10} step={0.5}
              value={form.image_duration ?? 3}
              onChange={e => update('image_duration', +e.target.value)}
              className="flex-1 h-1.5 accent-primary-600 cursor-pointer"
            />
            <span className="text-xs text-gray-700 font-mono w-14 text-right flex-shrink-0">{form.image_duration ?? 3}s</span>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer flex-shrink-0">
            <input type="checkbox"
              checked={(form.black_fade_duration ?? 1) > 0}
              onChange={e => update('black_fade_duration', e.target.checked ? 1.0 : 0)}
              className="w-3.5 h-3.5 accent-primary-600" />
            Black Fade In
          </label>
        </div>
      </section>

      {/* Music */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <Music className="w-3.5 h-3.5" />
          Music
        </h4>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={form.reel_music_enabled ?? true} onChange={e => update('reel_music_enabled', e.target.checked)} className="w-3.5 h-3.5 accent-primary-600" />
          Enable background music
        </label>
        <p className="text-[10px] text-gray-400">Toby picks a random trending track. In manual mode, you choose the track or let it be random.</p>
      </section>
    </div>
  )
}
