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

export function BrandThemeModal({ brand, onClose, onSave }: BrandThemeModalProps) {
  const [mode, setMode] = useState<'light' | 'dark'>('light')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const themeDefaults = BRAND_THEMES[brand.id] ?? {
    brandColor: brand.color,
    lightTitleColor: '#000000',
    lightBgColor: '#FFFFFF',
    darkTitleColor: '#F7FAFC',
    darkBgColor: '#000000',
  }

  const [brandColor, setBrandColor] = useState(themeDefaults.brandColor)
  const [lightTitleColor, setLightTitleColor] = useState(themeDefaults.lightTitleColor)
  const [lightBgColor, setLightBgColor] = useState(themeDefaults.lightBgColor)
  const [darkTitleColor, setDarkTitleColor] = useState(themeDefaults.darkTitleColor)
  const [darkBgColor, setDarkBgColor] = useState(themeDefaults.darkBgColor)

  // Derived from current mode
  const titleColor = mode === 'light' ? lightTitleColor : darkTitleColor
  const bgColor = mode === 'light' ? lightBgColor : darkBgColor
  const contentTextColor = mode === 'light' ? '#374151' : '#D1D5DB'

  useEffect(() => {
    const fetchTheme = async () => {
      try {
        const data = await apiClient.get<{ has_overrides: boolean; theme: Record<string, string> }>(`/api/brands/${brand.id}/theme`)
        if (data.has_overrides && data.theme) {
          if (data.theme.brand_color) setBrandColor(data.theme.brand_color)
          if (data.theme.light_title_color) setLightTitleColor(data.theme.light_title_color)
          if (data.theme.light_bg_color) setLightBgColor(data.theme.light_bg_color)
          if (data.theme.dark_title_color) setDarkTitleColor(data.theme.dark_title_color)
          if (data.theme.dark_bg_color) setDarkBgColor(data.theme.dark_bg_color)
          if (data.theme.logo) {
            const logoUrl = `/brand-logos/${data.theme.logo}?t=${Date.now()}`
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
      formData.append('light_title_color', lightTitleColor)
      formData.append('light_bg_color', lightBgColor)
      formData.append('dark_title_color', darkTitleColor)
      formData.append('dark_bg_color', darkBgColor)
      if (logoFile) formData.append('logo', logoFile)

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const resp = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/brands/${brand.id}/theme`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
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

  const setTitleColor = (c: string) => mode === 'light' ? setLightTitleColor(c) : setDarkTitleColor(c)
  const setBgColorForMode = (c: string) => mode === 'light' ? setLightBgColor(c) : setDarkBgColor(c)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-6">
        {/* LEFT: Live Preview */}
        <div className="flex-[3] space-y-4">
          {/* Mode Toggle */}
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

          {/* Thumbnail Preview (16:9) */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Thumbnail Preview</p>
            <div
              className="w-full rounded-xl overflow-hidden border border-gray-200 relative"
              style={{ backgroundColor: bgColor, aspectRatio: '16/9' }}
            >
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <h2
                  className="text-2xl md:text-3xl font-black text-center uppercase tracking-wide"
                  style={{ color: titleColor }}
                >
                  SAMPLE TITLE TEXT
                </h2>
              </div>
              {logoPreview && (
                <img
                  src={logoPreview}
                  alt="Logo"
                  className="absolute bottom-3 right-3 w-8 h-8 object-contain opacity-80"
                />
              )}
            </div>
          </div>

          {/* Content/Reel Preview (9:16) */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Reel Preview</p>
            <div
              className="w-full max-w-[240px] mx-auto rounded-2xl overflow-hidden border border-gray-200 relative"
              style={{ backgroundColor: bgColor, aspectRatio: '9/16' }}
            >
              {/* Title bar */}
              <div className="mt-8 mx-3">
                <div
                  className="rounded-lg px-3 py-2"
                  style={{ backgroundColor: brandColor }}
                >
                  <p
                    className="text-xs font-black uppercase text-center"
                    style={{ color: titleColor }}
                  >
                    SAMPLE TITLE
                  </p>
                </div>
              </div>

              {/* Content lines */}
              <div className="mt-4 mx-4 space-y-2">
                {['First content line here', 'Second content line', 'Third content line'].map((line, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className="text-xs font-bold mt-0.5 flex-shrink-0"
                      style={{ color: brandColor }}
                    >
                      {i + 1}.
                    </span>
                    <p className="text-xs" style={{ color: contentTextColor }}>
                      {line}
                    </p>
                  </div>
                ))}
              </div>

              {/* Brand name */}
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <p className="text-[10px] font-medium opacity-60" style={{ color: contentTextColor }}>
                  {brand.name}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Controls */}
        <div className="flex-[2] space-y-5">
          {/* Logo Upload */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Logo</label>
            <label className="flex items-center gap-3 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 transition-colors">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-10 h-10 object-contain" />
              ) : (
                <Upload className="w-5 h-5 text-gray-400" />
              )}
              <span className="text-sm text-gray-500">{logoFile ? logoFile.name : 'Upload logo'}</span>
              <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </label>
          </div>

          {/* Brand Color */}
          <ColorPicker label="Brand Color" value={brandColor} onChange={setBrandColor} />

          {/* Mode-specific colors */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">
              {mode === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode'} Colors
            </h4>
            <div className="space-y-4">
              <ColorPicker label="Title Color" value={titleColor} onChange={setTitleColor} />
              <ColorPicker label="Background" value={bgColor} onChange={setBgColorForMode} />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
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
