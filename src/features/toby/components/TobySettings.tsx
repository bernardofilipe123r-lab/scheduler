import { useState, useEffect } from 'react'
import { Save, Loader2, AlertTriangle, Film, LayoutGrid, ChevronRight, ArrowLeft, Globe, Plus, Check } from 'lucide-react'
import { PlatformIcon } from '@/shared/components'
import { apiClient } from '@/shared/api/client'
import { useTobyConfig, useUpdateTobyConfig, useTobyReset, useTobyBrandConfigs, useUpdateTobyBrandConfig } from '../hooks'
import type { TobyBrandConfig } from '../types'
import { SUPPORTED_PLATFORMS, PLATFORM_META, SUPPORTED_CONTENT_TYPES, CONTENT_TYPE_META } from '@/shared/constants/platforms'
import type { Platform, ContentType, EnabledPlatformsConfig } from '@/shared/constants/platforms'

/** Platform brand colors for active state backgrounds. */
const PLATFORM_COLORS: Record<Platform, string> = {
  instagram: '#E4405F',
  facebook: '#1877F2',
  youtube: '#FF0000',
  threads: '#000000',
  tiktok: '#000000',
}

/** Deep-equal compare two EnabledPlatformsConfig values. */
function platformConfigsEqual(a: EnabledPlatformsConfig, b: EnabledPlatformsConfig): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  for (const ct of SUPPORTED_CONTENT_TYPES) {
    const aList = [...(a[ct] ?? [])].sort().join(',')
    const bList = [...(b[ct] ?? [])].sort().join(',')
    if (aList !== bList) return false
  }
  return true
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

function getBrandColor(brand: TobyBrandConfig): string {
  return brand.brand_color || hashBrandColor(brand.brand_id)
}

function getBrandLogoUrl(brand: TobyBrandConfig, logos: Record<string, string>): string | null {
  return logos[brand.brand_id] || null
}

export function TobySettings() {
  const { data: config, isLoading: configLoading } = useTobyConfig()
  const { data: brandConfigsData, isLoading: brandsLoading } = useTobyBrandConfigs()
  const updateMut = useUpdateTobyConfig()
  const updateBrandMut = useUpdateTobyBrandConfig()
  const resetMut = useTobyReset()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [tab, setTab] = useState<'brands' | 'general'>('brands')
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, number | boolean | string>>({})
  const [brandForms, setBrandForms] = useState<Record<string, Record<string, number | boolean | string>>>({})
  const [platformForms, setPlatformForms] = useState<Record<string, EnabledPlatformsConfig>>({})
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({})
  const isLoading = configLoading || brandsLoading

  const brandConfigs = brandConfigsData?.brands ?? []

  // Fetch brand logos
  const brandIdKey = brandConfigs.map(b => b.brand_id).join(',')
  useEffect(() => {
    if (!brandConfigs.length) return
    const fetchLogos = async () => {
      const logos: Record<string, string> = {}
      for (const bc of brandConfigs) {
        try {
          const data = await apiClient.get<{ theme?: { logo?: string } }>(`/api/brands/${bc.brand_id}/theme`)
          if (data.theme?.logo) {
            logos[bc.brand_id] = data.theme.logo.startsWith('http') ? data.theme.logo : `/brand-logos/${data.theme.logo}`
          }
        } catch { /* ignore */ }
      }
      setBrandLogos(logos)
    }
    fetchLogos()
  }, [brandIdKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !config) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="h-5 skeleton rounded w-28 mb-4" />
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 skeleton rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const getVal = (key: string, fallback: number | boolean | string) => form[key] ?? fallback
  const getBrandVal = (brandId: string, key: string, fallback: number | boolean | string) =>
    brandForms[brandId]?.[key] ?? fallback

  const hasGlobalChanges = Object.entries(form).some(
    ([key, val]) => val !== (config as unknown as Record<string, number | boolean | string>)[key],
  )
  const hasBrandChanges = brandConfigs.some((bc) => {
    const bf = brandForms[bc.brand_id]
    const hasScalarChanges = bf ? Object.entries(bf).some(
      ([key, val]) => val !== (bc as unknown as Record<string, number | boolean | string>)[key],
    ) : false
    const hasPlatformChanges = bc.brand_id in platformForms
    return hasScalarChanges || hasPlatformChanges
  })
  const hasChanges = hasGlobalChanges || hasBrandChanges

  const reelsEnabled = getVal('reels_enabled', config.reels_enabled) as boolean
  const postsEnabled = getVal('posts_enabled', config.posts_enabled) as boolean

  const handleSaveGlobal = () => {
    const updates: Record<string, number | boolean | string> = {}
    for (const [key, val] of Object.entries(form)) {
      if (val !== (config as unknown as Record<string, number | boolean | string>)[key]) {
        updates[key] = val
      }
    }
    if (Object.keys(updates).length > 0) {
      updateMut.mutate(updates as any, { onSuccess: () => setForm({}) })
    }
  }

  const handleSaveBrand = (brandId: string) => {
    const brandForm = brandForms[brandId]
    const bc = brandConfigs.find(b => b.brand_id === brandId)
    const data: Record<string, unknown> = {}
    if (brandForm) {
      for (const [key, val] of Object.entries(brandForm)) {
        if (!bc || val !== (bc as unknown as Record<string, number | boolean | string>)[key]) {
          data[key] = val
        }
      }
    }
    if (brandId in platformForms) {
      data.enabled_platforms = platformForms[brandId]
    }
    if (Object.keys(data).length === 0) return
    updateBrandMut.mutate(
      { brandId, data: data as any },
      {
        onSuccess: () => {
          setBrandForms(prev => {
            const next = { ...prev }
            delete next[brandId]
            return next
          })
          setPlatformForms(prev => {
            const next = { ...prev }
            delete next[brandId]
            return next
          })
        },
      },
    )
  }

  const handleSaveAll = () => {
    if (hasGlobalChanges) handleSaveGlobal()
    const brandIdsWithChanges = new Set([...Object.keys(brandForms), ...Object.keys(platformForms)])
    for (const brandId of brandIdsWithChanges) {
      handleSaveBrand(brandId)
    }
  }

  const setGlobalField = (key: string, val: number | boolean | string) => {
    const original = (config as unknown as Record<string, number | boolean | string>)[key]
    if (val === original) {
      setForm(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } else {
      setForm(prev => ({ ...prev, [key]: val }))
    }
  }

  const toggleGlobal = (key: 'reels_enabled' | 'posts_enabled') => {
    const current = getVal(key, config[key]) as boolean
    setGlobalField(key, !current)
  }

  const setBrandField = (brandId: string, key: string, val: number | boolean | string) => {
    const bc = brandConfigs.find(b => b.brand_id === brandId)
    const original = bc ? (bc as unknown as Record<string, number | boolean | string>)[key] : undefined
    setBrandForms(prev => {
      const brandForm = { ...(prev[brandId] || {}) }
      if (val === original) {
        delete brandForm[key]
      } else {
        brandForm[key] = val
      }
      if (Object.keys(brandForm).length === 0) {
        const next = { ...prev }
        delete next[brandId]
        return next
      }
      return { ...prev, [brandId]: brandForm }
    })
  }

  const selectedBrandConfig = selectedBrand
    ? brandConfigs.find(b => b.brand_id === selectedBrand)
    : null

  return (
    <div className="space-y-4">
      {/* Save bar */}
      {hasChanges && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-blue-700">You have unsaved changes</p>
          <button
            onClick={handleSaveAll}
            disabled={updateMut.isPending || updateBrandMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {(updateMut.isPending || updateBrandMut.isPending) ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save All Changes
          </button>
        </div>
      )}

      {/* Main panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Segmented tab bar */}
        <div className="px-5 pt-5 pb-4">
          <div className="inline-flex bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => { setTab('brands'); setSelectedBrand(null) }}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                tab === 'brands'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Brands
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                tab === 'brands'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-200 text-slate-500'
              }`}>
                {brandConfigs.length}
              </span>
            </button>
            <button
              onClick={() => setTab('general')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                tab === 'general'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              General
            </button>
          </div>
        </div>

        {/* ── General Tab ── */}
        {tab === 'general' && (
          <div className="px-5 pb-5 space-y-6">
            <div className="bg-slate-50 rounded-xl p-4 space-y-5">
              <ConfigSlider
                label="Buffer Days"
                desc="How many days ahead to keep the content buffer filled"
                value={getVal('buffer_days', config.buffer_days) as number}
                onChange={(v) => setGlobalField('buffer_days', v)}
                min={1} max={7} step={1}
              />
              <ConfigSlider
                label="Explore Ratio"
                desc="Percentage of content that tries new strategies vs. proven winners"
                value={getVal('explore_ratio', config.explore_ratio) as number}
                onChange={(v) => setGlobalField('explore_ratio', v)}
                min={0} max={1} step={0.05}
                format={(v) => `${(v * 100).toFixed(0)}%`}
              />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Content Types</p>
              <div className="space-y-3">
                <ToggleRow
                  label="Reels" desc="Short-form video content"
                  icon={<Film className="w-4 h-4" />}
                  enabled={reelsEnabled}
                  onChange={() => toggleGlobal('reels_enabled')}
                />
                <ToggleRow
                  label="Carousels" desc="Multi-slide image posts"
                  icon={<LayoutGrid className="w-4 h-4" />}
                  enabled={postsEnabled}
                  onChange={() => toggleGlobal('posts_enabled')}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Brands Tab — Grid ── */}
        {tab === 'brands' && !selectedBrandConfig && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {brandConfigs.map(bc => {
                const color = getBrandColor(bc)
                const logoUrl = getBrandLogoUrl(bc, brandLogos)
                const connectedPlatforms = SUPPORTED_PLATFORMS.filter(
                  p => bc[`has_${p}` as keyof TobyBrandConfig] === true,
                )
                const connectedCount = connectedPlatforms.length
                const reelSlots = getBrandVal(bc.brand_id, 'reel_slots_per_day', bc.reel_slots_per_day) as number
                const postSlots = getBrandVal(bc.brand_id, 'post_slots_per_day', bc.post_slots_per_day) as number
                const enabled = getBrandVal(bc.brand_id, 'enabled', bc.enabled) as boolean

                return (
                  <button
                    key={bc.brand_id}
                    onClick={() => setSelectedBrand(bc.brand_id)}
                    className={`relative bg-white border rounded-xl p-4 text-left hover:shadow-md transition-all group overflow-hidden ${
                      enabled ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 opacity-60'
                    }`}
                  >
                    {/* Top accent bar */}
                    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl" style={{ backgroundColor: color }} />

                    <div className="flex items-center gap-3 mt-1">
                      {/* Brand avatar / logo */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                        style={{ backgroundColor: color }}
                      >
                        {logoUrl ? (
                          <img src={logoUrl} alt={bc.display_name} className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-sm font-bold text-white">
                            {bc.display_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">{bc.display_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {!enabled ? (
                            <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Disabled</span>
                          ) : (
                            <>
                              <span className="text-[11px] text-gray-500 font-medium">{reelSlots}r &middot; {postSlots}c</span>
                              <div className="flex -space-x-1">
                                {connectedPlatforms.slice(0, 4).map(p => (
                                  <div key={p} className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center ring-1 ring-white">
                                    <PlatformIcon platform={p} className="w-2.5 h-2.5 text-gray-500" />
                                  </div>
                                ))}
                                {connectedCount > 4 && (
                                  <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center ring-1 ring-white text-[8px] font-bold text-gray-500">
                                    +{connectedCount - 4}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </div>
                  </button>
                )
              })}

              {/* Add brand placeholder */}
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex items-center justify-center hover:border-gray-300 hover:bg-gray-50/50 transition-colors cursor-default min-h-[76px]">
                <div className="text-center">
                  <Plus className="w-5 h-5 text-gray-300 mx-auto mb-1" />
                  <p className="text-xs text-gray-400">Add brand</p>
                </div>
              </div>
            </div>

            {brandConfigs.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                No brands found. Create a brand first to configure Toby.
              </p>
            )}

            {/* Reset footer */}
            <div className="mt-6 pt-4 border-t border-gray-100">
              {!showResetConfirm ? (
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Reset all learnings
                </button>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-xs text-red-600">Erase all strategy scores and experiments?</p>
                  <button
                    onClick={() => { resetMut.mutate(); setShowResetConfirm(false) }}
                    disabled={resetMut.isPending}
                    className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                  >
                    {resetMut.isPending ? 'Resetting...' : 'Confirm'}
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
        )}

        {/* ── Brands Tab — Detail Panel ── */}
        {tab === 'brands' && selectedBrandConfig && (
          <BrandDetailPanel
            brand={selectedBrandConfig}
            onBack={() => setSelectedBrand(null)}
            reelsEnabled={reelsEnabled}
            postsEnabled={postsEnabled}
            getVal={(key, fb) => getBrandVal(selectedBrandConfig.brand_id, key, fb)}
            onChange={(key, val) => setBrandField(selectedBrandConfig.brand_id, key, val)}
            editedPlatforms={selectedBrandConfig.brand_id in platformForms ? platformForms[selectedBrandConfig.brand_id] : undefined}
            onPlatformChange={(platforms) => setPlatformForms(prev => {
              const original = selectedBrandConfig.enabled_platforms
              if (platformConfigsEqual(platforms, original)) {
                const next = { ...prev }
                delete next[selectedBrandConfig.brand_id]
                return next
              }
              return { ...prev, [selectedBrandConfig.brand_id]: platforms }
            })}
            logoUrl={getBrandLogoUrl(selectedBrandConfig, brandLogos)}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Sub-components
// ---------------------------------------------------------------------------

function BrandDetailPanel({
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
    if (currentConfig === null) return [...connectedPlatforms]
    return (currentConfig[ct] ?? connectedPlatforms) as Platform[]
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

    const allMaxed = connectedPlatforms.length > 0 && SUPPORTED_CONTENT_TYPES.every((c) =>
      connectedPlatforms.every((cp) => nextConfig[c].includes(cp)),
    )
    onPlatformChange(allMaxed ? null : nextConfig)
  }

  const activeContentTypes = SUPPORTED_CONTENT_TYPES.filter((ct) => {
    if (ct === 'reels') return reelsEnabled && reelSlots > 0
    if (ct === 'posts') return postsEnabled && postSlots > 0
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
            {([['text_based', 'Text-Based', 'Classic caption-overlay reels'], ['text_video', 'Text-Video', 'Slideshow reels with text overlays']] as const).map(([val, label, desc]) => {
              const active = (getVal('reel_format', brand.reel_format ?? 'text_based') as string) === val
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

      {/* Platform publishing — redesigned */}
      {enabled && activeContentTypes.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-gray-400" />
            <p className="text-sm font-semibold text-gray-700">Platform Publishing</p>
          </div>

          <div className="space-y-4">
            {activeContentTypes.map((ct) => {
              const meta = CONTENT_TYPE_META[ct]
              const ctPlatforms = getPlatformsForType(ct)
              return (
                <div key={ct} className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <span>{meta.icon}</span> {meta.label}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {SUPPORTED_PLATFORMS.map((p) => {
                      const connected = connectedPlatforms.includes(p)
                      const active = connected && ctPlatforms.includes(p)
                      const pMeta = PLATFORM_META[p]
                      const platformColor = PLATFORM_COLORS[p]
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePlatformForType(ct, p)}
                          disabled={!connected}
                          className={`relative flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl text-center transition-all ${
                            !connected
                              ? 'opacity-30 cursor-not-allowed bg-gray-100'
                              : active
                              ? 'bg-white shadow-sm ring-2 ring-offset-1'
                              : 'bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm'
                          }`}
                          style={active ? { '--tw-ring-color': platformColor } as React.CSSProperties : undefined}
                        >
                          {/* Checkmark badge */}
                          {active && (
                            <div
                              className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: platformColor }}
                            >
                              <Check className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                            active ? 'text-white' : 'bg-gray-100 text-gray-500'
                          }`}
                            style={active ? { backgroundColor: platformColor } : undefined}
                          >
                            <PlatformIcon platform={p} className="w-4 h-4" />
                          </div>
                          <span className={`text-xs font-medium ${active ? 'text-gray-900' : 'text-gray-500'}`}>
                            {pMeta.label}
                          </span>
                          {!connected && (
                            <span className="text-[9px] text-gray-400">Not connected</span>
                          )}
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

function ToggleRow({
  label,
  desc,
  icon,
  enabled,
  onChange,
}: {
  label: string
  desc: string
  icon?: React.ReactNode
  enabled: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-3">
        {icon && (
          <div className={`${enabled ? 'text-blue-600' : 'text-gray-300'} transition-colors`}>
            {icon}
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-gray-700">{label}</p>
          <p className="text-xs text-gray-400">{desc}</p>
        </div>
      </div>
      <button
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          enabled ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

function ConfigSlider({
  label,
  desc,
  value,
  onChange,
  min,
  max,
  step,
  format,
  disabled,
}: {
  label: string
  desc: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  format?: (v: number) => string
  disabled?: boolean
}) {
  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
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
        disabled={disabled}
        className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
      />
    </div>
  )
}
