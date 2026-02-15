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

const DARK_BG_GRADIENT =
  'linear-gradient(135deg, #1a3a2a 0%, #0d1f15 40%, #2d1a0a 70%, #1a0a1a 100%)'

const SAMPLE_TITLE = 'SURPRISING TRUTHS ABOUT DETOXIFICATION'
const SAMPLE_CONTENT = [
  'Your liver already does an incredible job filtering toxins',
  'Drinking more water supports natural detox processes',
  'Sleep is the most underrated detox mechanism',
]

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

  // Derived for current mode
  const thumbnailTextColor = mode === 'light' ? lightThumbnailTextColor : darkThumbnailTextColor
  const contentTitleTextColor = mode === 'light' ? lightContentTitleTextColor : darkContentTitleTextColor
  const contentTitleBgColor = mode === 'light' ? lightContentTitleBgColor : darkContentTitleBgColor

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
      // Legacy fields (backend still requires them)
      formData.append('light_title_color', lightThumbnailTextColor)
      formData.append('light_bg_color', lightContentTitleBgColor)
      formData.append('dark_title_color', darkThumbnailTextColor)
      formData.append('dark_bg_color', darkContentTitleBgColor)
      // Rendering color fields
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

  // Split title into three lines for the content bars (shows stepped bar widths)
  const titleLines = ['SURPRISING TRUTHS', 'ABOUT', 'DETOXIFICATION']
  const barWidths = ['89%', '42%', '75%']

  return (
    <div className="flex flex-col gap-5">
      {/* Mode Toggle - top level */}
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
        {/* LEFT: Previews (60%) */}
        <div className="flex-[3] space-y-3">
          <div className="flex gap-3">
            {/* Thumbnail Preview - 9:16 */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 mb-1.5">Thumbnail</p>
              <div
                className="w-full rounded-xl overflow-hidden border border-gray-200 relative"
                style={{
                  aspectRatio: '9/16',
                  backgroundColor: mode === 'light' ? '#f4f4f4' : undefined,
                  ...(mode === 'dark' ? { background: DARK_BG_GRADIENT } : {}),
                }}
              >
                {/* Dark overlay 55% */}
                {mode === 'dark' && (
                  <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />
                )}

                {/* Centered title */}
                <div className="absolute inset-0 flex flex-col items-center justify-center px-3 z-10">
                  <h2
                    className="text-sm font-extrabold text-center uppercase tracking-wide leading-tight"
                    style={{
                      color: mode === 'light' ? thumbnailTextColor : '#ffffff',
                      fontFamily: '"Poppins", system-ui, sans-serif',
                    }}
                  >
                    {SAMPLE_TITLE}
                  </h2>
                </div>

                {/* Brand name below center */}
                <div className="absolute left-0 right-0 z-10" style={{ bottom: '30%' }}>
                  <p
                    className="text-center uppercase font-bold tracking-wider"
                    style={{
                      color: mode === 'light' ? thumbnailTextColor : '#ffffff',
                      fontFamily: '"Poppins", system-ui, sans-serif',
                      fontSize: '5px',
                    }}
                  >
                    {brand.name}
                  </p>
                </div>
              </div>
            </div>

            {/* Content/Reel Preview - 9:16 */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 mb-1.5">Content</p>
              <div
                className="w-full rounded-xl overflow-hidden border border-gray-200 relative"
                style={{
                  aspectRatio: '9/16',
                  backgroundColor: mode === 'light' ? '#f4f4f4' : undefined,
                  ...(mode === 'dark' ? { background: DARK_BG_GRADIENT } : {}),
                }}
              >
                {/* Dark overlay 85% */}
                {mode === 'dark' && (
                  <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} />
                )}

                {/* Title bars - stepped widths */}
                <div className="relative z-10" style={{ paddingTop: '14.6%', paddingLeft: '8.3%', paddingRight: '8.3%' }}>
                  {titleLines.map((line, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-center"
                      style={{
                        backgroundColor: contentTitleBgColor + 'c8',
                        height: '18px',
                        width: barWidths[i],
                        margin: '0 auto',
                        borderRadius: '3px',
                      }}
                    >
                      <span
                        className="font-extrabold uppercase text-center tracking-wide"
                        style={{
                          color: contentTitleTextColor,
                          fontFamily: '"Poppins", system-ui, sans-serif',
                          fontSize: '5.5px',
                        }}
                      >
                        {line}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Content lines */}
                <div className="relative z-10 space-y-1" style={{ paddingTop: '3.6%', paddingLeft: '10%', paddingRight: '10%' }}>
                  {SAMPLE_CONTENT.map((line, i) => (
                    <div key={i} className="flex items-start gap-1">
                      <span
                        className="font-medium flex-shrink-0"
                        style={{
                          color: mode === 'light' ? '#000000' : '#ffffff',
                          fontSize: '5px',
                        }}
                      >
                        {i + 1}.
                      </span>
                      <p
                        className="font-medium leading-tight"
                        style={{
                          color: mode === 'light' ? '#000000' : '#ffffff',
                          fontFamily: '"Inter", system-ui, sans-serif',
                          fontSize: '5px',
                        }}
                      >
                        {line}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Brand name at bottom */}
                <div className="absolute bottom-1.5 left-0 right-0 text-center z-10">
                  <p
                    className="font-bold uppercase"
                    style={{
                      color: mode === 'light' ? thumbnailTextColor : '#ffffff',
                      fontFamily: '"Poppins", system-ui, sans-serif',
                      fontSize: '4px',
                    }}
                  >
                    {brand.name}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Controls (40%) */}
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
            <p className="text-[10px] text-gray-400 mt-1">Logo is stored for branding but not shown on generated reels/thumbnails.</p>
          </div>

          {/* Brand Color */}
          <ColorPicker label="Brand Color" value={brandColor} onChange={setBrandColor} />

          {/* Mode-specific rendering colors */}
          <div className="border-t border-gray-200 pt-3">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">
              {mode === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode'} Colors
            </h4>

            {/* Thumbnail section */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Thumbnail</p>
            <ColorPicker
              label="Text Color"
              value={thumbnailTextColor}
              onChange={(v) =>
                mode === 'light' ? setLightThumbnailTextColor(v) : setDarkThumbnailTextColor(v)
              }
            />

            {/* Content section */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">Content Title</p>
            <div className="space-y-3">
              <ColorPicker
                label="Text Color"
                value={contentTitleTextColor}
                onChange={(v) =>
                  mode === 'light' ? setLightContentTitleTextColor(v) : setDarkContentTitleTextColor(v)
                }
              />
              <ColorPicker
                label="Bar Background"
                value={contentTitleBgColor}
                onChange={(v) =>
                  mode === 'light' ? setLightContentTitleBgColor(v) : setDarkContentTitleBgColor(v)
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
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
