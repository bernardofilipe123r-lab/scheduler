import { ArrowLeft, Film, Globe } from 'lucide-react'
import { PlatformIcon } from '@/shared/components'
import {
  SUPPORTED_PLATFORMS,
  PLATFORM_META,
  SUPPORTED_CONTENT_TYPES,
  CONTENT_TYPE_META,
  getPlatformsForContentType,
} from '@/shared/constants/platforms'
import type { Platform, ContentType, EnabledPlatformsConfig } from '@/shared/constants/platforms'
import type { TobyBrandConfig } from '../types'

/** Deep-equal compare two EnabledPlatformsConfig values. */
export function platformConfigsEqual(a: EnabledPlatformsConfig, b: EnabledPlatformsConfig): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  for (const ct of SUPPORTED_CONTENT_TYPES) {
    const aList = [...(a[ct] ?? [])].sort().join(',')
    const bList = [...(b[ct] ?? [])].sort().join(',')
    if (aList !== bList) return false
  }
  return true
}
import { ToggleRow } from './ToggleRow'
import { ConfigSlider } from './ConfigSlider'

/** Platform brand colors for active state backgrounds. */
const PLATFORM_COLORS: Record<Platform, string> = {
  instagram: '#E4405F',
  facebook: '#1877F2',
  youtube: '#FF0000',
  threads: '#000000',
  tiktok: '#000000',
  bluesky: '#0085FF',
}

/** Fallback brand accent colors derived from brand ID hash. */
const BRAND_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
]

function hashBrandColor(brandId: string): string {
  let hash = 0
  for (let i = 0; i < brandId.length; i++) {
    hash = ((hash << 5) - hash + brandId.charCodeAt(i)) | 0
  }
  return BRAND_COLORS[Math.abs(hash) % BRAND_COLORS.length]
}

export function getBrandColor(brand: TobyBrandConfig): string {
  return brand.brand_color || hashBrandColor(brand.brand_id)
}

export function getBrandLogoUrl(brand: TobyBrandConfig, logos: Record<string, string>): string | null {
  return logos[brand.brand_id] || null
}

export function BrandDetailPanel({
  brand,
  onBack,
  reelsEnabled,
  postsEnabled,
  getVal,
  onChange,
  editedPlatforms,
  onPlatformChange,
  logoUrl,
}: {
  brand: TobyBrandConfig
  onBack: () => void
  reelsEnabled: boolean
  postsEnabled: boolean
  getVal: (key: string, fallback: number | boolean | string) => number | boolean | string
  onChange: (key: string, val: number | boolean | string) => void
  editedPlatforms: EnabledPlatformsConfig | undefined
  onPlatformChange: (platforms: EnabledPlatformsConfig) => void
  logoUrl: string | null
}) {
  const enabled = getVal('enabled', brand.enabled) as boolean
  const reelSlots = getVal('reel_slots_per_day', brand.reel_slots_per_day) as number
  const postSlots = getVal('post_slots_per_day', brand.post_slots_per_day) as number
  const color = getBrandColor(brand)

  const connectedPlatforms = SUPPORTED_PLATFORMS.filter(
    (p) => brand[`has_${p}` as keyof TobyBrandConfig] === true,
  )

  const currentConfig: EnabledPlatformsConfig =
    editedPlatforms !== undefined ? editedPlatforms : brand.enabled_platforms

  const getPlatformsForType = (ct: ContentType): Platform[] => {
    const eligible = getPlatformsForContentType(ct) as Platform[]
    if (currentConfig === null) return connectedPlatforms.filter(p => eligible.includes(p))
    return ((currentConfig[ct] ?? connectedPlatforms.filter(p => eligible.includes(p))) as Platform[])
  }

  const togglePlatformForType = (ct: ContentType, p: Platform) => {
    if (!connectedPlatforms.includes(p)) return
    const currentList = getPlatformsForType(ct)
    const nextList = currentList.includes(p)
      ? currentList.filter((x) => x !== p)
      : [...currentList, p]

    const nextConfig: Record<ContentType, Platform[]> = {} as Record<ContentType, Platform[]>
    for (const otherCt of SUPPORTED_CONTENT_TYPES) {
      nextConfig[otherCt] = otherCt === ct ? nextList : getPlatformsForType(otherCt)
    }

    const allMaxed = connectedPlatforms.length > 0 && SUPPORTED_CONTENT_TYPES.every((c) => {
      const eligible = getPlatformsForContentType(c) as Platform[]
      return connectedPlatforms
        .filter((cp) => eligible.includes(cp))
        .every((cp) => nextConfig[c].includes(cp))
    })
    onPlatformChange(allMaxed ? null : nextConfig)
  }

  const activeContentTypes = SUPPORTED_CONTENT_TYPES.filter((ct) => {
    if (ct === 'reels') return reelsEnabled && reelSlots > 0
    if (ct === 'posts') return postsEnabled && postSlots > 0
    if (ct === 'threads') {
      const eligible = getPlatformsForContentType('threads') as Platform[]
      return eligible.some(p => connectedPlatforms.includes(p))
    }
    return false
  })

  return (
    <div className="px-5 pb-5 animate-slide-in">
      {/* Header with logo */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt={brand.display_name} className="w-full h-full object-contain" />
          ) : (
            <span className="text-sm font-bold text-white">
              {brand.display_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">{brand.display_name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {connectedPlatforms.map(p => (
              <div
                key={p}
                className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center"
                title={PLATFORM_META[p].label}
              >
                <PlatformIcon platform={p} className="w-2.5 h-2.5 text-gray-500" />
              </div>
            ))}
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
          enabled ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-gray-100 text-gray-500'
        }`}>
          {enabled ? 'Active' : 'Disabled'}
        </span>
      </div>

      {/* Enable toggle */}
      <ToggleRow
        label="Enable for Toby"
        desc="Allow Toby to create and publish content for this brand"
        enabled={enabled}
        onChange={() => onChange('enabled', !enabled)}
      />

      {/* Reel format selector */}
      {enabled && reelsEnabled && (
        <div className="bg-slate-50 rounded-xl p-4 mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Reel Format</p>
          <div className="flex gap-2">
            {([['format_a', 'Format A', 'Classic caption-overlay reels'], ['format_b', 'Format B', 'Slideshow reels with text overlays']] as const).map(([val, label, desc]) => {
              const active = (getVal('reel_format', brand.reel_format ?? 'format_a') as string) === val
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => onChange('reel_format', val)}
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition-all ${
                    active
                      ? 'border-blue-300 bg-blue-50 shadow-sm shadow-blue-100'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className={`text-sm font-medium ${active ? 'text-blue-700' : 'text-gray-700'}`}>{label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Reels share-to-feed toggle (Instagram-specific) */}
      {enabled && reelsEnabled && brand.has_instagram && (
        <div className="bg-slate-50 rounded-xl p-4 mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Instagram Reels</p>
          <ToggleRow
            label="Show on Profile Grid"
            desc="When off, reels appear only in the Reels tab — not on the main profile grid"
            icon={<Film className="w-4 h-4" />}
            enabled={(getVal('reels_share_to_feed', brand.reels_share_to_feed ?? true) as boolean)}
            onChange={() => onChange('reels_share_to_feed', !(getVal('reels_share_to_feed', brand.reels_share_to_feed ?? true) as boolean))}
          />
        </div>
      )}

      {/* Volume sliders */}
      <div className={`bg-slate-50 rounded-xl p-4 mt-4 space-y-5 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Volume</p>
        {reelsEnabled && (
          <ConfigSlider
            label="Reels / Day"
            desc="Number of reels Toby publishes per day for this brand"
            value={reelSlots}
            onChange={(v) => onChange('reel_slots_per_day', v)}
            min={0} max={6} step={1}
          />
        )}
        {postsEnabled && (
          <ConfigSlider
            label="Carousels / Day"
            desc="Number of carousel posts Toby publishes per day"
            value={postSlots}
            onChange={(v) => onChange('post_slots_per_day', v)}
            min={0} max={2} step={1}
          />
        )}
        {!reelsEnabled && !postsEnabled && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Both Reels and Carousels are disabled globally. Enable at least one in the General tab.
          </p>
        )}
      </div>

      {/* Platform publishing — compact inline rows */}
      {enabled && activeContentTypes.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-gray-400" />
            <p className="text-sm font-semibold text-gray-700">Platform Publishing</p>
          </div>

          <div className="bg-slate-50 rounded-xl divide-y divide-gray-200/60">
            {activeContentTypes.map((ct) => {
              const meta = CONTENT_TYPE_META[ct]
              const ctPlatforms = getPlatformsForType(ct)
              return (
                <div key={ct} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap flex items-center gap-1.5 w-24 shrink-0">
                    <span>{meta.icon}</span> {meta.label}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(getPlatformsForContentType(ct) as Platform[]).map((p) => {
                      const connected = connectedPlatforms.includes(p)
                      const active = connected && ctPlatforms.includes(p)
                      const platformColor = PLATFORM_COLORS[p]
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePlatformForType(ct, p)}
                          disabled={!connected}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            !connected
                              ? 'opacity-30 cursor-not-allowed bg-gray-100 text-gray-400'
                              : active
                              ? 'bg-white shadow-sm ring-1 text-gray-900'
                              : 'bg-white/60 border border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}
                          style={active ? { '--tw-ring-color': platformColor, borderColor: platformColor } as React.CSSProperties : undefined}
                        >
                          <div className={`w-4 h-4 rounded flex items-center justify-center ${
                            active ? 'text-white' : 'text-gray-400'
                          }`}
                            style={active ? { backgroundColor: platformColor } : undefined}
                          >
                            <PlatformIcon platform={p} className="w-2.5 h-2.5" />
                          </div>
                          {PLATFORM_META[p].label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {connectedPlatforms.length > 0 &&
            activeContentTypes.some((ct) => getPlatformsForType(ct).length === 0) && (
              <p className="text-xs text-red-500 mt-2">
                At least one platform per content type is recommended. Toby will skip content types with no platforms.
              </p>
            )}
        </div>
      )}
    </div>
  )
}
