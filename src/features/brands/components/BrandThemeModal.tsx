import { useState, useEffect } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { apiClient } from '@/shared/api/client'
import { supabase } from '@/shared/api/supabase'
import {
  type BrandInfo,
  BRAND_THEMES,
} from '@/features/brands/constants'

export interface BrandThemeModalProps {
  brand: BrandInfo
  onClose: () => void
  onSave?: () => void
}

/* ── Proportional scale: 1080px canvas → 240px preview ────────── */
const CANVAS_W = 1080
const CANVAS_H = 1920
const PREVIEW_W = 240
const S = PREVIEW_W / CANVAS_W // 0.2222
const PREVIEW_H = Math.round(CANVAS_H * S) // 427

/* Pixel-accurate scaled values from image_generator.py constants */
const PX = {
  /* Thumbnail */
  thumbTitleFont: Math.round(80 * S),               // 18
  thumbSideMargin: Math.round(80 * S),              // 18
  thumbLineSpacing: Math.round(20 * S),             // 4
  thumbBrandFont: Math.max(6, Math.round(28 * S)),  // 6
  thumbBrandGap: Math.round(254 * S),               // 56

  /* Content slide — title bars */
  barStartY: Math.round(280 * S),                   // 62
  barHeight: Math.round(100 * S),                    // 22
  barRadius: Math.round(20 * S),                     // 4
  barTitleFont: Math.round(56 * S),                  // 12

  /* Content slide — body */
  titleContentGap: Math.round(70 * S),               // 16
  contentSidePad: Math.round(108 * S),               // 24
  contentFont: Math.round(44 * S),                   // 10
  contentLineH: Math.round(44 * 1.5 * S),            // 15
  bulletSpacing: Math.round(44 * 0.6 * S),           // 6

  /* Brand name at bottom of content slide */
  brandFont: Math.max(4, Math.round(15 * S)),        // 4
  brandBottom: Math.round(12 * S),                    // 3
}

/* Dark-mode AI-image placeholder (gradient simulating a dark photo) */
const DARK_BG =
  'linear-gradient(145deg, #1a3a2a 0%, #0d1f15 25%, #1a2030 50%, #2d1a0a 75%, #1a0a1a 100%)'

/* Sample data for preview */
const SAMPLE_TITLE = 'SURPRISING TRUTHS ABOUT DETOXIFICATION'
const TITLE_LINES = ['SURPRISING TRUTHS', 'ABOUT', 'DETOXIFICATION']
/* Stepped bar widths proportional to text length, centered (like PIL renderer) */
const BAR_WIDTHS = ['80%', '30%', '62%']
const SAMPLE_CONTENT = [
  'Your liver does an incredible job filtering toxins',
  'Drinking more water supports natural detox',
  'Sleep is the most underrated detox mechanism',
]

/** Convert #rrggbb → rgba(r,g,b,opacity) */
function hexToRgba(hex: string, opacity: number): string {
  const h = hex.replace('#', '')
  if (h.length < 6) return `rgba(0,0,0,${opacity})`
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

/* ═══════════════════════════════════════════════════════════════ */

export function BrandThemeModal({ brand, onClose, onSave }: BrandThemeModalProps) {
  const [mode, setMode] = useState<'light' | 'dark'>('light')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const defaults = BRAND_THEMES[brand.id] ?? {
    brandColor: brand.color,
    lightThumbnailTextColor: '#000000',
    lightContentTitleTextColor: '#000000',
    lightContentTitleBgColor: '#c8e1f6',
    darkThumbnailTextColor: '#ffffff',
    darkContentTitleTextColor: '#ffffff',
    darkContentTitleBgColor: '#00435c',
  }

  const [brandColor, setBrandColor] = useState(defaults.brandColor)
  const [lightThumbnailTextColor, setLightThumbnailTextColor] = useState(defaults.lightThumbnailTextColor)
  const [lightContentTitleTextColor, setLightContentTitleTextColor] = useState(defaults.lightContentTitleTextColor)
  const [lightContentTitleBgColor, setLightContentTitleBgColor] = useState(defaults.lightContentTitleBgColor)
  const [darkThumbnailTextColor, setDarkThumbnailTextColor] = useState(defaults.darkThumbnailTextColor)
  const [darkContentTitleTextColor, setDarkContentTitleTextColor] = useState(defaults.darkContentTitleTextColor)
  const [darkContentTitleBgColor, setDarkContentTitleBgColor] = useState(defaults.darkContentTitleBgColor)

  /* Derived for current mode */
  const thumbnailTextColor = mode === 'light' ? lightThumbnailTextColor : '#ffffff'
  const contentTitleTextColor = mode === 'light' ? lightContentTitleTextColor : '#ffffff'
  const contentTitleBgColor = mode === 'light' ? lightContentTitleBgColor : darkContentTitleBgColor
  const contentTextColor = mode === 'light' ? '#000000' : '#ffffff'
  const brandNameColor = mode === 'light' ? lightThumbnailTextColor : '#ffffff'

  useEffect(() => {
    const fetchTheme = async () => {
      try {
        const data = await apiClient.get<{ theme: Record<string, string | null> }>(
          `/api/brands/${brand.id}/theme`
        )
        const t = data.theme
        if (t) {
          if (t.brand_color) setBrandColor(t.brand_color)
          if (t.light_thumbnail_text_color) setLightThumbnailTextColor(t.light_thumbnail_text_color)
          if (t.light_content_title_text_color) setLightContentTitleTextColor(t.light_content_title_text_color)
          if (t.light_content_title_bg_color) setLightContentTitleBgColor(t.light_content_title_bg_color)
          if (t.dark_thumbnail_text_color) setDarkThumbnailTextColor(t.dark_thumbnail_text_color)
          if (t.dark_content_title_text_color) setDarkContentTitleTextColor(t.dark_content_title_text_color)
          if (t.dark_content_title_bg_color) setDarkContentTitleBgColor(t.dark_content_title_bg_color)
          if (t.logo) {
            const logoUrl = `/brand-logos/${t.logo}?t=${Date.now()}`
            const logoCheck = await fetch(logoUrl, { method: 'HEAD' })
            if (logoCheck.ok) setLogoPreview(logoUrl)
          }
        }
      } catch { /* use defaults */ }
      setLoading(false)
    }
    fetchTheme()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id])

  const handleSave = async () => {
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('brand_color', brandColor)
      formData.append('light_title_color', lightThumbnailTextColor)
      formData.append('light_bg_color', lightContentTitleBgColor)
      formData.append('dark_title_color', darkThumbnailTextColor)
      formData.append('dark_bg_color', darkContentTitleBgColor)
      formData.append('light_thumbnail_text_color', lightThumbnailTextColor)
      formData.append('light_content_title_text_color', lightContentTitleTextColor)
      formData.append('light_content_title_bg_color', lightContentTitleBgColor)
      formData.append('dark_thumbnail_text_color', darkThumbnailTextColor)
      formData.append('dark_content_title_text_color', darkContentTitleTextColor)
      formData.append('dark_content_title_bg_color', darkContentTitleBgColor)
      if (logoFile) formData.append('logo', logoFile)

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/api/brands/${brand.id}/theme`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        }
      )
      if (!resp.ok) throw new Error('Save failed')
      onSave?.()
      onClose()
    } catch {
      // save error handled silently
    }
    setSaving(false)
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  /* Content start Y = barStartY + N bars × barHeight + titleContentGap */
  const contentStartY =
    PX.barStartY + TITLE_LINES.length * PX.barHeight + PX.titleContentGap

  /* ──────────────────────── RENDER ──────────────────────── */
  return (
    <div className="flex flex-col gap-5">
      {/* ── Mode Toggle ── */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setMode('light')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            mode === 'light' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ☀️ Light Mode
        </button>
        <button
          onClick={() => setMode('dark')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            mode === 'dark' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🌙 Dark Mode
        </button>
      </div>

      <div className="flex gap-6">
        {/* ══════ LEFT: Pixel-accurate Previews (60%) ══════ */}
        <div className="flex-[3]">
          <div style={{ display: 'flex', gap: 12 }}>

            {/* ════ THUMBNAIL PREVIEW (9:16) ════ */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Thumbnail</p>
              <div
                style={{
                  width: PREVIEW_W,
                  height: PREVIEW_H,
                  position: 'relative',
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid #e5e7eb',
                  backgroundColor: mode === 'light' ? '#f4f4f4' : undefined,
                  background: mode === 'dark' ? DARK_BG : undefined,
                }}
              >
                {/* Dark overlay — fixed 55% */}
                {mode === 'dark' && (
                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                )}

                {/* Title — vertically centered (only title affects centering) */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1,
                  }}
                >
                  <div
                    style={{
                      paddingLeft: PX.thumbSideMargin,
                      paddingRight: PX.thumbSideMargin,
                      textAlign: 'center',
                      position: 'relative',
                    }}
                  >
                    {/* Title text — Poppins Bold 700, uppercase */}
                    <div
                      style={{
                        fontFamily: "'Poppins', sans-serif",
                        fontWeight: 700,
                        fontSize: PX.thumbTitleFont,
                        lineHeight: `${PX.thumbTitleFont + PX.thumbLineSpacing}px`,
                        color: thumbnailTextColor,
                        textTransform: 'uppercase',
                        wordBreak: 'break-word',
                      }}
                    >
                      {SAMPLE_TITLE}
                    </div>

                    {/* Brand name — absolute so it doesn't shift title centering */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: PX.thumbBrandGap,
                        fontFamily: "'Poppins', sans-serif",
                        fontWeight: 700,
                        fontSize: PX.thumbBrandFont,
                        color: thumbnailTextColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {brand.name}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ════ CONTENT / REEL PREVIEW (9:16) ════ */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Content</p>
              <div
                style={{
                  width: PREVIEW_W,
                  height: PREVIEW_H,
                  position: 'relative',
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid #e5e7eb',
                  backgroundColor: mode === 'light' ? '#f4f4f4' : undefined,
                  background: mode === 'dark' ? DARK_BG : undefined,
                }}
              >
                {/* Dark overlay — fixed 85% */}
                {mode === 'dark' && (
                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)' }} />
                )}

                {/* Title bars — stacked, 0 gap, stepped widths */}
                <div
                  style={{
                    position: 'absolute',
                    top: PX.barStartY,
                    left: 0,
                    right: 0,
                    zIndex: 1,
                  }}
                >
                  {TITLE_LINES.map((line, i) => (
                    <div
                      key={i}
                      style={{
                        width: BAR_WIDTHS[i],
                        height: PX.barHeight,
                        margin: '0 auto',
                        backgroundColor: hexToRgba(contentTitleBgColor, 200 / 255),
                        borderRadius: PX.barRadius,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'Poppins', sans-serif",
                          fontWeight: 700,
                          fontSize: PX.barTitleFont,
                          color: contentTitleTextColor,
                          textTransform: 'uppercase',
                          lineHeight: 1,
                        }}
                      >
                        {line}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Content lines — numbered, left-aligned */}
                <div
                  style={{
                    position: 'absolute',
                    top: contentStartY,
                    left: PX.contentSidePad,
                    right: PX.contentSidePad,
                    zIndex: 1,
                  }}
                >
                  {SAMPLE_CONTENT.map((line, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 3,
                        marginBottom: PX.bulletSpacing,
                        lineHeight: `${PX.contentLineH}px`,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontWeight: 500,
                          fontSize: PX.contentFont,
                          color: contentTextColor,
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}.
                      </span>
                      <span
                        style={{
                          fontFamily: "'Inter', sans-serif",
                          fontWeight: 500,
                          fontSize: PX.contentFont,
                          color: contentTextColor,
                        }}
                      >
                        {line}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Brand name — bottom center */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: PX.brandBottom,
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    zIndex: 1,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 700,
                      fontSize: PX.brandFont,
                      color: brandNameColor,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  >
                    {brand.name}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══════ RIGHT: Color Controls (40%) ══════ */}
        <div className="flex-[2] space-y-4">
          {/* Logo Upload */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Logo</label>
            <label className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 transition-colors">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-10 h-10 object-contain" />
              ) : (
                <Upload className="w-5 h-5 text-gray-400" />
              )}
              <span className="text-sm text-gray-500">{logoFile ? logoFile.name : 'Upload logo'}</span>
              <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </label>
            <p className="text-[10px] text-gray-400 mt-1">
              Logo is stored for branding but not rendered on reels/thumbnails.
            </p>
          </div>

          {/* Brand Color (always visible) */}
          <ColorPicker label="Brand Color" value={brandColor} onChange={setBrandColor} />

          {/* Mode-specific rendering colors */}
          <div className="border-t border-gray-200 pt-3">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">
              {mode === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode'} Render Colors
            </h4>

            {mode === 'light' ? (
              <>
                {/* Light mode: 3 editable color fields */}
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Thumbnail
                </p>
                <ColorPicker
                  label="Text Color"
                  value={lightThumbnailTextColor}
                  onChange={setLightThumbnailTextColor}
                />

                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">
                  Content Title
                </p>
                <div className="space-y-3">
                  <ColorPicker
                    label="Text Color"
                    value={lightContentTitleTextColor}
                    onChange={setLightContentTitleTextColor}
                  />
                  <ColorPicker
                    label="Bar Background"
                    value={lightContentTitleBgColor}
                    onChange={setLightContentTitleBgColor}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Dark mode: only bar bg is editable (text always white, bg is AI image) */}
                <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
                  Text is always white. Background is an AI-generated image
                  with fixed dark overlays (55% thumbnail, 85% content).
                </p>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Content Title
                </p>
                <ColorPicker
                  label="Bar Background"
                  value={darkContentTitleBgColor}
                  onChange={setDarkContentTitleBgColor}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Theme
        </button>
      </div>
    </div>
  )
}

/* ── Reusable color picker ───────────────────────────────────── */
function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-600 mb-1.5 block">{label}</label>
      <div className="flex items-center gap-3">
        <label
          className="w-10 h-10 rounded-lg border-2 border-gray-200 cursor-pointer overflow-hidden flex-shrink-0"
          style={{ backgroundColor: value }}
        >
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="opacity-0 w-full h-full cursor-pointer"
          />
        </label>
        <input
          type="text"
          value={value}
          onChange={e => {
            const v = e.target.value
            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v)
          }}
          className="flex-1 px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          maxLength={7}
        />
      </div>
    </div>
  )
}
