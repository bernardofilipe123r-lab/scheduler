import { useState } from 'react'
import { Settings, Save, Loader2, RotateCcw, Film, LayoutGrid, ChevronDown, ChevronUp, Power, Globe } from 'lucide-react'
import { useTobyConfig, useUpdateTobyConfig, useTobyReset, useTobyBrandConfigs, useUpdateTobyBrandConfig } from '../hooks'
import type { TobyBrandConfig } from '../types'
import { SUPPORTED_PLATFORMS, PLATFORM_META, SUPPORTED_CONTENT_TYPES, CONTENT_TYPE_META } from '@/shared/constants/platforms'
import type { Platform, ContentType, EnabledPlatformsConfig } from '@/shared/constants/platforms'

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

export function TobySettings() {
  const { data: config, isLoading: configLoading } = useTobyConfig()
  const { data: brandConfigsData, isLoading: brandsLoading } = useTobyBrandConfigs()
  const updateMut = useUpdateTobyConfig()
  const updateBrandMut = useUpdateTobyBrandConfig()
  const resetMut = useTobyReset()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, number | boolean>>({})
  const [brandForms, setBrandForms] = useState<Record<string, Record<string, number | boolean>>>({})
  // Platform selection forms — tracks per-brand per-content-type platform edits
  const [platformForms, setPlatformForms] = useState<Record<string, EnabledPlatformsConfig>>({})
  const isLoading = configLoading || brandsLoading

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

  const brandConfigs = brandConfigsData?.brands ?? []

  const getVal = (key: string, fallback: number | boolean) => form[key] ?? fallback
  const getBrandVal = (brandId: string, key: string, fallback: number | boolean) =>
    brandForms[brandId]?.[key] ?? fallback

  const hasGlobalChanges = Object.entries(form).some(
    ([key, val]) => val !== (config as unknown as Record<string, number | boolean>)[key],
  )
  const hasBrandChanges = brandConfigs.some((bc) => {
    // Check scalar fields
    const bf = brandForms[bc.brand_id]
    const hasScalarChanges = bf ? Object.entries(bf).some(
      ([key, val]) => val !== (bc as unknown as Record<string, number | boolean>)[key],
    ) : false
    // Check platform selection
    const hasPlatformChanges = bc.brand_id in platformForms
    return hasScalarChanges || hasPlatformChanges
  })
  const hasChanges = hasGlobalChanges || hasBrandChanges

  const reelsEnabled = getVal('reels_enabled', config.reels_enabled) as boolean
  const postsEnabled = getVal('posts_enabled', config.posts_enabled) as boolean

  const handleSaveGlobal = () => {
    const updates: Record<string, number | boolean> = {}
    for (const [key, val] of Object.entries(form)) {
      if (val !== (config as unknown as Record<string, number | boolean>)[key]) {
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
    // Scalar fields
    if (brandForm) {
      for (const [key, val] of Object.entries(brandForm)) {
        if (!bc || val !== (bc as unknown as Record<string, number | boolean>)[key]) {
          data[key] = val
        }
      }
    }
    // Platform selection
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

  const setGlobalField = (key: string, val: number | boolean) => {
    const original = (config as unknown as Record<string, number | boolean>)[key]
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

  const setBrandField = (brandId: string, key: string, val: number | boolean) => {
    const bc = brandConfigs.find(b => b.brand_id === brandId)
    const original = bc ? (bc as unknown as Record<string, number | boolean>)[key] : undefined
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

  return (
    <div className="space-y-5">
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

      {/* Global Configuration */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-400" />
            General Configuration
          </h3>
        </div>

        <div className="p-5 space-y-5">
          <ConfigSlider
            label="Buffer Days"
            desc="How many days ahead to keep the content buffer filled"
            value={getVal('buffer_days', config.buffer_days) as number}
            onChange={(v) => setGlobalField('buffer_days', v)}
            min={1}
            max={7}
            step={1}
          />
          <ConfigSlider
            label="Explore Ratio"
            desc="Percentage of content that tries new strategies vs. proven winners"
            value={getVal('explore_ratio', config.explore_ratio) as number}
            onChange={(v) => setGlobalField('explore_ratio', v)}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${(v * 100).toFixed(0)}%`}
          />
        </div>
      </div>

      {/* Content Types */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Film className="w-4 h-4 text-gray-400" />
            Content Types
          </h3>
          <p className="text-xs text-gray-400 mt-1">Enable or disable content types globally across all brands</p>
        </div>

        <div className="p-5 space-y-3">
          <ToggleRow
            label="Reels"
            desc="Short-form video content"
            icon={<Film className="w-4 h-4" />}
            enabled={reelsEnabled}
            onChange={() => toggleGlobal('reels_enabled')}
          />
          <ToggleRow
            label="Carousels"
            desc="Multi-slide image posts"
            icon={<LayoutGrid className="w-4 h-4" />}
            enabled={postsEnabled}
            onChange={() => toggleGlobal('posts_enabled')}
          />
        </div>
      </div>

      {/* Per-Brand Configuration */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Power className="w-4 h-4 text-gray-400" />
            Brand Configuration
          </h3>
          <p className="text-xs text-gray-400 mt-1">Configure which brands Toby posts for and how many pieces per day</p>
        </div>

        <div className="divide-y divide-gray-100">
          {brandConfigs.map((bc) => (
            <BrandConfigRow
              key={bc.brand_id}
              brand={bc}
              expanded={expandedBrand === bc.brand_id}
              onToggleExpand={() => setExpandedBrand(expandedBrand === bc.brand_id ? null : bc.brand_id)}
              reelsEnabled={reelsEnabled}
              postsEnabled={postsEnabled}
              getVal={(key, fb) => getBrandVal(bc.brand_id, key, fb)}
              onChange={(key, val) => setBrandField(bc.brand_id, key, val)}
              editedPlatforms={bc.brand_id in platformForms ? platformForms[bc.brand_id] : undefined}
              onPlatformChange={(platforms) => setPlatformForms(prev => {
                // If setting back to original value, remove from dirty state
                const original = bc.enabled_platforms
                if (platformConfigsEqual(platforms, original)) {
                  const next = { ...prev }
                  delete next[bc.brand_id]
                  return next
                }
                return { ...prev, [bc.brand_id]: platforms }
              })}
            />
          ))}
          {brandConfigs.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-gray-400">No brands found. Create a brand first to configure Toby.</p>
            </div>
          )}
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-red-600 flex items-center gap-2">
            <RotateCcw className="w-4 h-4" />
            Danger Zone
          </h3>
        </div>
        <div className="px-5 py-4">
          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset all learnings
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-xs text-red-600">This will erase all strategy scores and experiments. Are you sure?</p>
              <button
                onClick={() => { resetMut.mutate(); setShowResetConfirm(false) }}
                disabled={resetMut.isPending}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {resetMut.isPending ? 'Resetting...' : 'Confirm Reset'}
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Sub-components
// ---------------------------------------------------------------------------

function BrandConfigRow({
  brand,
  expanded,
  onToggleExpand,
  reelsEnabled,
  postsEnabled,
  getVal,
  onChange,
  editedPlatforms,
  onPlatformChange,
}: {
  brand: TobyBrandConfig
  expanded: boolean
  onToggleExpand: () => void
  reelsEnabled: boolean
  postsEnabled: boolean
  getVal: (key: string, fallback: number | boolean) => number | boolean
  onChange: (key: string, val: number | boolean) => void
  editedPlatforms: EnabledPlatformsConfig | undefined  // undefined = no edit
  onPlatformChange: (platforms: EnabledPlatformsConfig) => void
}) {
  const enabled = getVal('enabled', brand.enabled) as boolean
  const reelSlots = getVal('reel_slots_per_day', brand.reel_slots_per_day) as number
  const postSlots = getVal('post_slots_per_day', brand.post_slots_per_day) as number

  // Derive which platforms are connected on this brand
  const connectedPlatforms = SUPPORTED_PLATFORMS.filter(
    (p) => brand[`has_${p}` as keyof TobyBrandConfig] === true,
  )

  // Current effective config: edited → saved → null (all connected)
  const currentConfig: EnabledPlatformsConfig =
    editedPlatforms !== undefined ? editedPlatforms : brand.enabled_platforms

  // Get the platform list for a specific content type
  const getPlatformsForType = (ct: ContentType): Platform[] => {
    if (currentConfig === null) return [...connectedPlatforms]
    return (currentConfig[ct] ?? connectedPlatforms) as Platform[]
  }

  const togglePlatformForType = (ct: ContentType, p: Platform) => {
    if (!connectedPlatforms.includes(p)) return

    const currentList = getPlatformsForType(ct)
    let nextList: Platform[]
    if (currentList.includes(p)) {
      nextList = currentList.filter((x) => x !== p)
    } else {
      nextList = [...currentList, p]
    }

    // Build the full config dict
    const nextConfig: Record<ContentType, Platform[]> = {} as Record<ContentType, Platform[]>
    for (const otherCt of SUPPORTED_CONTENT_TYPES) {
      nextConfig[otherCt] = otherCt === ct ? nextList : getPlatformsForType(otherCt)
    }

    // If every content type has all connected platforms selected, store null
    const allMaxed = connectedPlatforms.length > 0 && SUPPORTED_CONTENT_TYPES.every((c) =>
      connectedPlatforms.every((cp) => nextConfig[c].includes(cp)),
    )

    onPlatformChange(allMaxed ? null : nextConfig)
  }

  // Count total unique platforms across all content types
  const totalEnabled = new Set(
    SUPPORTED_CONTENT_TYPES.flatMap((ct) => getPlatformsForType(ct)),
  ).size

  // Which content types are actually active (globally enabled + slots > 0)
  const activeContentTypes = SUPPORTED_CONTENT_TYPES.filter((ct) => {
    if (ct === 'reels') return reelsEnabled && reelSlots > 0
    if (ct === 'posts') return postsEnabled && postSlots > 0
    return false
  })

  return (
    <div className={!enabled ? 'opacity-60' : ''}>
      <button
        onClick={onToggleExpand}
        className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
          <div>
            <p className="text-sm font-medium text-gray-900">{brand.display_name}</p>
            <p className="text-xs text-gray-400">
              {!enabled
                ? 'Disabled'
                : [
                    reelsEnabled && reelSlots > 0 ? `${reelSlots} reel${reelSlots !== 1 ? 's' : ''}/day` : null,
                    postsEnabled && postSlots > 0 ? `${postSlots} carousel${postSlots !== 1 ? 's' : ''}/day` : null,
                    connectedPlatforms.length > 0
                      ? `${totalEnabled}/${connectedPlatforms.length} platforms`
                      : 'No platforms connected',
                  ].filter(Boolean).join(' · ') || 'No content types enabled'
              }
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-4 border-t border-gray-50 pt-4">
          {/* Enable toggle */}
          <ToggleRow
            label="Enable for Toby"
            desc="Allow Toby to create and publish content for this brand"
            enabled={enabled}
            onChange={() => onChange('enabled', !enabled)}
          />

          {/* Reel slots */}
          {reelsEnabled && (
            <ConfigSlider
              label="Reels / Day"
              desc="Number of reels Toby publishes per day for this brand"
              value={reelSlots}
              onChange={(v) => onChange('reel_slots_per_day', v)}
              min={0}
              max={6}
              step={1}
              disabled={!enabled}
            />
          )}

          {/* Post slots */}
          {postsEnabled && (
            <ConfigSlider
              label="Carousels / Day"
              desc="Number of carousel posts Toby publishes per day for this brand"
              value={postSlots}
              onChange={(v) => onChange('post_slots_per_day', v)}
              min={0}
              max={2}
              step={1}
              disabled={!enabled}
            />
          )}

          {!reelsEnabled && !postsEnabled && enabled && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Both Reels and Carousels are disabled globally. Enable at least one content type above.
            </p>
          )}

          {/* Per-content-type platform selection */}
          {enabled && activeContentTypes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Globe className="w-4 h-4 text-gray-400" />
                <p className="text-sm font-medium text-gray-700">Platform Publishing</p>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Choose which platforms Toby publishes to for each content type
              </p>

              <div className="space-y-4">
                {activeContentTypes.map((ct) => {
                  const meta = CONTENT_TYPE_META[ct]
                  const ctPlatforms = getPlatformsForType(ct)
                  return (
                    <div key={ct}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        {meta.icon} {meta.label}
                      </p>
                      <div className="space-y-1">
                        {SUPPORTED_PLATFORMS.map((p) => {
                          const connected = connectedPlatforms.includes(p)
                          const active = connected && ctPlatforms.includes(p)
                          const pMeta = PLATFORM_META[p]
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => togglePlatformForType(ct, p)}
                              disabled={!connected}
                              className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-left transition-colors ${
                                !connected
                                  ? 'opacity-40 cursor-not-allowed bg-gray-50'
                                  : active
                                  ? 'bg-blue-50 border border-blue-200'
                                  : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                              }`}
                            >
                              <span className="text-sm">{pMeta.emoji}</span>
                              <span className={`text-sm font-medium flex-1 ${active ? 'text-blue-700' : 'text-gray-600'}`}>
                                {pMeta.label}
                              </span>
                              {connected ? (
                                <div
                                  className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                    active ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                                  }`}
                                >
                                  {active && (
                                    <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">Not connected</span>
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
