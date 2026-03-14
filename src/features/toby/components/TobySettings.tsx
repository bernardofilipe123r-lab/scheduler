import { useState, useEffect } from 'react'
import { Save, Loader2, AlertTriangle, Film, LayoutGrid, MessageCircle, ChevronRight, ChevronDown, Plus, Download, Bell, Settings2, Palette } from 'lucide-react'
import { PlatformIcon } from '@/shared/components'
import { apiClient } from '@/shared/api/client'
import { useTobyConfig, useUpdateTobyConfig, useTobyReset, useTobyBrandConfigs, useUpdateTobyBrandConfig } from '../hooks'
import type { TobyBrandConfig } from '../types'
import { SUPPORTED_PLATFORMS } from '@/shared/constants/platforms'
import type { EnabledPlatformsConfig } from '@/shared/constants/platforms'
import { BrandDetailPanel, getBrandColor, getBrandLogoUrl, platformConfigsEqual } from './BrandDetailPanel'
import { ToggleRow } from './ToggleRow'
import { ConfigSlider } from './ConfigSlider'


export function TobySettings() {
  const { data: config, isLoading: configLoading } = useTobyConfig()
  const { data: brandConfigsData, isLoading: brandsLoading } = useTobyBrandConfigs()
  const updateMut = useUpdateTobyConfig()
  const updateBrandMut = useUpdateTobyBrandConfig()
  const resetMut = useTobyReset()
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [generalOpen, setGeneralOpen] = useState(true)
  const [brandsOpen, setBrandsOpen] = useState(true)
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
  const threadsEnabled = getVal('threads_enabled', config.threads_enabled) as boolean
  const autoSchedule = getVal('auto_schedule', config.auto_schedule) as boolean
  const bufferReminderEnabled = getVal('buffer_reminder_enabled', config.buffer_reminder_enabled) as boolean

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

  const toggleGlobal = (key: 'reels_enabled' | 'posts_enabled' | 'threads_enabled' | 'auto_schedule' | 'buffer_reminder_enabled') => {
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

      {/* ── General Section ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <button
          onClick={() => setGeneralOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Settings2 className="w-4.5 h-4.5 text-gray-400" />
            <span className="text-sm font-semibold text-gray-900">General</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${generalOpen ? '' : '-rotate-90'}`} />
        </button>

        {generalOpen && (
          <div className="px-5 pb-5 space-y-6 border-t border-gray-100">
            <div className="bg-slate-50 rounded-xl p-4 space-y-5 mt-4">
              <ConfigSlider
                label="Buffer Days"
                desc="How many days ahead to keep the content buffer filled"
                value={getVal('buffer_days', config.buffer_days) as number}
                onChange={(v) => setGlobalField('buffer_days', v)}
                min={1} max={10} step={1}
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
                <ToggleRow
                  label="Threads" desc="Text-based thread posts"
                  icon={<MessageCircle className="w-4 h-4" />}
                  enabled={threadsEnabled}
                  onChange={() => toggleGlobal('threads_enabled')}
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Pipeline</p>
              <div className="space-y-3">
                <ToggleRow
                  label="Auto-Schedule" desc="When off, accepted content downloads instead of scheduling"
                  icon={<Download className="w-4 h-4" />}
                  enabled={autoSchedule}
                  onChange={() => toggleGlobal('auto_schedule')}
                />
                <ToggleRow
                  label="Buffer Reminder" desc="Email reminder 1 day before your content buffer expires"
                  icon={<Bell className="w-4 h-4" />}
                  enabled={bufferReminderEnabled}
                  onChange={() => toggleGlobal('buffer_reminder_enabled')}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Brands Section ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <button
          onClick={() => { setBrandsOpen(o => !o); setSelectedBrand(null) }}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Palette className="w-4.5 h-4.5 text-gray-400" />
            <span className="text-sm font-semibold text-gray-900">Brands</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {brandConfigs.length}
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${brandsOpen ? '' : '-rotate-90'}`} />
        </button>

        {brandsOpen && !selectedBrandConfig && (
          <div className="px-5 pb-5 border-t border-gray-100 pt-4">
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
                              <span className="text-[11px] text-gray-500 font-medium">{reelSlots > 0 && `${reelSlots}r`}{reelSlots > 0 && postSlots > 0 && ' · '}{postSlots > 0 && `${postSlots}c`}</span>
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

        {/* ── Brand Detail Panel ── */}
        {brandsOpen && selectedBrandConfig && (
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
