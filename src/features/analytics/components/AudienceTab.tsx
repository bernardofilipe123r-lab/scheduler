import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Users, ChevronDown, RefreshCw, Target, MapPin,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { useAudience, useRefreshAudience } from '@/features/analytics'
import { AnalyticsSkeleton } from '@/shared/components'
import { useDynamicBrands } from '@/features/brands'
import { fmt } from './analytics-utils'
import type { AudienceBrand } from '@/features/analytics/api/analytics-v2-api'

// ─── Constants ──────────────────────────────────────────

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', AU: 'Australia', CA: 'Canada',
  IN: 'India', IE: 'Ireland', ZA: 'South Africa', NZ: 'New Zealand',
  BH: 'Bahrain', KE: 'Kenya', PH: 'Philippines', DE: 'Germany',
  FR: 'France', BR: 'Brazil', MX: 'Mexico', JP: 'Japan', IT: 'Italy',
  ES: 'Spain', NL: 'Netherlands', PT: 'Portugal', SE: 'Sweden',
  NO: 'Norway', DK: 'Denmark', FI: 'Finland', PL: 'Poland',
  AE: 'UAE', SG: 'Singapore', HK: 'Hong Kong', MY: 'Malaysia',
  NG: 'Nigeria', GH: 'Ghana', EG: 'Egypt', KR: 'South Korea',
}

const COUNTRY_FLAGS: Record<string, string> = {
  US: '\u{1F1FA}\u{1F1F8}', GB: '\u{1F1EC}\u{1F1E7}', AU: '\u{1F1E6}\u{1F1FA}',
  CA: '\u{1F1E8}\u{1F1E6}', IN: '\u{1F1EE}\u{1F1F3}', IE: '\u{1F1EE}\u{1F1EA}',
  ZA: '\u{1F1FF}\u{1F1E6}', NZ: '\u{1F1F3}\u{1F1FF}', BH: '\u{1F1E7}\u{1F1ED}',
  KE: '\u{1F1F0}\u{1F1EA}', PH: '\u{1F1F5}\u{1F1ED}', DE: '\u{1F1E9}\u{1F1EA}',
  FR: '\u{1F1EB}\u{1F1F7}', BR: '\u{1F1E7}\u{1F1F7}', MX: '\u{1F1F2}\u{1F1FD}',
  JP: '\u{1F1EF}\u{1F1F5}', IT: '\u{1F1EE}\u{1F1F9}', ES: '\u{1F1EA}\u{1F1F8}',
  NL: '\u{1F1F3}\u{1F1F1}', PT: '\u{1F1F5}\u{1F1F9}', SE: '\u{1F1F8}\u{1F1EA}',
  NO: '\u{1F1F3}\u{1F1F4}', DK: '\u{1F1E9}\u{1F1F0}', FI: '\u{1F1EB}\u{1F1EE}',
  PL: '\u{1F1F5}\u{1F1F1}', AE: '\u{1F1E6}\u{1F1EA}', SG: '\u{1F1F8}\u{1F1EC}',
  HK: '\u{1F1ED}\u{1F1F0}', MY: '\u{1F1F2}\u{1F1FE}', NG: '\u{1F1F3}\u{1F1EC}',
  GH: '\u{1F1EC}\u{1F1ED}', EG: '\u{1F1EA}\u{1F1EC}', KR: '\u{1F1F0}\u{1F1F7}',
}

const GENDER_PIE_COLORS: Record<string, string> = {
  Female: '#ec4899', Male: '#3b82f6', Undisclosed: '#9ca3af',
}

// ─── Types ──────────────────────────────────────────────

interface ParsedBrandAudience {
  brandId: string
  brandLabel: string
  brandColor: string
  totalAudience: number
  topGenderAge: string
  topPlace: string
  ageData: { range: string; followers: number }[]
  genderData: { name: string; value: number; color: string }[]
  cities: { name: string; fans: number }[]
  countries: { code: string; fans: number }[]
}

// ─── Helpers ────────────────────────────────────────────

function parseAudienceData(
  aud: AudienceBrand,
  brandLabel: string,
  brandColor: string,
): ParsedBrandAudience {
  const ageBuckets: Record<string, number> = {}
  const genderTotals: Record<string, number> = {}

  for (const [key, val] of Object.entries(aud.gender_age || {})) {
    const [type, bucket] = key.split('.')
    if (type === 'age' && bucket) {
      ageBuckets[bucket] = (ageBuckets[bucket] || 0) + val
    } else if (type === 'gender' && bucket) {
      const label = bucket === 'M' ? 'Male' : bucket === 'F' ? 'Female' : 'Undisclosed'
      genderTotals[label] = (genderTotals[label] || 0) + val
    }
  }

  const ageData = Object.entries(ageBuckets)
    .sort(([a], [b]) => {
      const na = parseInt(a.split('-')[0]) || 0
      const nb = parseInt(b.split('-')[0]) || 0
      return na - nb
    })
    .map(([range, followers]) => ({ range, followers }))

  const genderData = Object.entries(genderTotals).map(([name, value]) => ({
    name,
    value,
    color: GENDER_PIE_COLORS[name] || '#9ca3af',
  }))

  const cities = Object.entries(aud.top_cities || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, fans]) => ({ name, fans }))

  const countries = Object.entries(aud.top_countries || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([code, fans]) => ({ code, fans }))

  const genderLabel = aud.top_gender || '\u2014'
  const ageLabel = aud.top_age_range || ''
  const topGenderAge = ageLabel ? `${genderLabel}, ${ageLabel}` : genderLabel

  return {
    brandId: aud.brand,
    brandLabel,
    brandColor,
    totalAudience: aud.total_audience,
    topGenderAge,
    topPlace: aud.top_city || '\u2014',
    ageData,
    genderData,
    cities,
    countries,
  }
}

// ─── Sub-components ─────────────────────────────────────

function AudienceAgeChart({ data, brandColor }: { data: { range: string; followers: number }[]; brandColor: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-3">Followers by Age Range</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={fmt} width={48} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,.12)', fontSize: 13 }}
            formatter={(v: number | undefined) => [fmt(v ?? 0), 'Followers']}
            labelFormatter={(l) => `Age ${String(l)}`}
          />
          <Bar dataKey="followers" name="Followers" fill={brandColor} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function AudienceGenderPie({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-2">Gender Split</p>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={52} dataKey="value" stroke="none">
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-1.5">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-sm">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
              <span className="text-gray-500">{d.name}</span>
              <span className="font-semibold text-gray-900">{fmt(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AudienceBrandSection({
  brand,
  isExpanded,
  onToggle,
}: {
  brand: ParsedBrandAudience
  isExpanded: boolean
  onToggle: () => void
}) {
  const maxCity = brand.cities[0]?.fans || 1
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-200 overflow-hidden transition-shadow ${
        isExpanded ? 'shadow-md' : 'shadow-sm'
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
        style={isExpanded ? { background: `${brand.brandColor}06` } : undefined}
      >
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: brand.brandColor }} />
          <span className="text-base font-bold text-gray-900">{brand.brandLabel}</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden sm:flex gap-6 text-sm">
            <span className="text-gray-400">
              Audience:{' '}
              <span className="font-bold text-gray-900">{fmt(brand.totalAudience)}</span>
            </span>
            <span className="text-gray-400">
              Top:{' '}
              <span className="font-semibold text-gray-700">{brand.topGenderAge}</span>
            </span>
            <span className="text-gray-400">
              Location:{' '}
              <span className="font-semibold text-gray-700">{brand.topPlace}</span>
            </span>
          </div>
          <ChevronDown
            className={`w-4.5 h-4.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="px-5 pb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: `${brand.brandColor}0a`, border: `1px solid ${brand.brandColor}18` }}>
              <div className="p-2 rounded-lg" style={{ background: `${brand.brandColor}15` }}>
                <Users className="w-4 h-4" style={{ color: brand.brandColor }} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: brand.brandColor }}>Total Followers</p>
                <p className="text-sm font-bold text-gray-900">{fmt(brand.totalAudience)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3.5 bg-pink-50/60 rounded-xl border border-pink-100/60">
              <div className="p-2 bg-pink-100 rounded-lg">
                <Target className="w-4 h-4 text-pink-500" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-pink-500">Top Demographic</p>
                <p className="text-sm font-bold text-gray-900">{brand.topGenderAge}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-100/60">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <MapPin className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Top Location</p>
                <p className="text-sm font-bold text-gray-900">{brand.topPlace}</p>
              </div>
            </div>
          </div>

          {(brand.ageData.length > 0 || brand.genderData.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 mb-6">
              {brand.ageData.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <AudienceAgeChart data={brand.ageData} brandColor={brand.brandColor} />
                </div>
              )}
              {brand.genderData.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex items-center">
                  <AudienceGenderPie data={brand.genderData} />
                </div>
              )}
            </div>
          )}

          {(brand.cities.length > 0 || brand.countries.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {brand.cities.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Top Cities</p>
                  <div className="flex flex-col gap-2">
                    {brand.cities.slice(0, 6).map((c) => (
                      <div key={c.name} className="flex items-center gap-2.5">
                        <span className="w-32 text-sm text-gray-700 truncate flex-shrink-0">{c.name}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all"
                            style={{ width: `${(c.fans / maxCity) * 100}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs font-semibold text-gray-500 flex-shrink-0">
                          {fmt(c.fans)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {brand.countries.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">Top Countries</p>
                  <div className="grid grid-cols-2 gap-2">
                    {brand.countries.slice(0, 8).map((c) => (
                      <div
                        key={c.code}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100"
                      >
                        <span className="text-base">{COUNTRY_FLAGS[c.code] || '\u{1F30D}'}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">
                            {COUNTRY_NAMES[c.code] || c.code}
                          </p>
                          <p className="text-[11px] text-gray-400">{fmt(c.fans)} followers</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AudienceAggregateOverview({
  brands,
}: {
  brands: ParsedBrandAudience[]
}) {
  const total = brands.reduce((s, b) => s + b.totalAudience, 0)
  const sorted = [...brands].sort((a, b) => b.totalAudience - a.totalAudience)
  const maxAud = sorted[0]?.totalAudience || 1

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4 shadow-sm">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h3 className="text-lg font-bold text-gray-900">All Brands Overview</h3>
          <p className="text-sm text-gray-400 mt-0.5">
            Combined audience across {brands.length} brand{brands.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-extrabold text-gray-900">{fmt(total)}</p>
          <p className="text-xs text-gray-400">Total followers</p>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {sorted.map((b) => {
          const pct = total > 0 ? (b.totalAudience / total) * 100 : 0
          return (
            <div key={b.brandId} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: b.brandColor }} />
              <span className="w-40 text-sm font-semibold text-gray-700 truncate flex-shrink-0">{b.brandLabel}</span>
              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(b.totalAudience / maxAud) * 100}%`, background: b.brandColor }}
                />
              </div>
              <span className="w-14 text-right text-sm font-bold text-gray-900">{fmt(b.totalAudience)}</span>
              <span className="w-12 text-right text-xs text-gray-400">{pct.toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main tab ───────────────────────────────────────────

export function AudienceTab({ brand }: { brand?: string }) {
  const { data, isLoading } = useAudience({
    brand: brand !== 'all' ? brand : undefined,
  })
  const { brands: dynamicBrands } = useDynamicBrands()
  const refreshMutation = useRefreshAudience()
  const autoFetchedRef = useRef(false)
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set())
  const [initialExpanded, setInitialExpanded] = useState(false)

  const handleRefresh = () => {
    refreshMutation.mutate(brand !== 'all' ? brand : undefined)
  }

  const brandLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of dynamicBrands) map[b.id] = b.label
    return map
  }, [dynamicBrands])

  const brandColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of dynamicBrands) map[b.id] = b.color
    return map
  }, [dynamicBrands])

  const parsedBrands = useMemo<ParsedBrandAudience[]>(() => {
    if (!data?.brands) return []
    return data.brands.map((aud) =>
      parseAudienceData(
        aud,
        brandLabelMap[aud.brand] || aud.brand,
        brandColorMap[aud.brand] || '#6B7280',
      ),
    )
  }, [data?.brands, brandLabelMap, brandColorMap])

  useEffect(() => {
    if (parsedBrands.length > 0 && !initialExpanded) {
      setExpandedBrands(new Set([parsedBrands[0].brandId]))
      setInitialExpanded(true)
    }
  }, [parsedBrands, initialExpanded])

  useEffect(() => {
    if (data && !data.has_data && !autoFetchedRef.current && !refreshMutation.isPending) {
      autoFetchedRef.current = true
      refreshMutation.mutate(brand !== 'all' ? brand : undefined)
    }
  }, [data, refreshMutation, brand])

  const toggleBrand = (id: string) => {
    setExpandedBrands((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setExpandedBrands(new Set(parsedBrands.map((b) => b.brandId)))
  const collapseAll = () => setExpandedBrands(new Set())

  if (isLoading || (refreshMutation.isPending && !data?.has_data)) return <AnalyticsSkeleton />

  if (!data?.has_data) {
    return (
      <div className="text-center py-16">
        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-700">No audience data yet</h3>
        <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto mb-4">
          Audience demographics are available for Instagram Business accounts with 100+ followers.
        </p>
        <button
          onClick={handleRefresh}
          disabled={refreshMutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 inline mr-1.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          Fetch Audience Data
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={expandAll}
          className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-500"
        >
          Expand all
        </button>
        <button
          onClick={collapseAll}
          className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-500"
        >
          Collapse all
        </button>
        <button
          onClick={handleRefresh}
          disabled={refreshMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {(!brand || brand === 'all') && parsedBrands.length > 1 && (
        <AudienceAggregateOverview brands={parsedBrands} />
      )}

      <div className="flex flex-col gap-3">
        {parsedBrands.map((b) => (
          <AudienceBrandSection
            key={b.brandId}
            brand={b}
            isExpanded={expandedBrands.has(b.brandId)}
            onToggle={() => toggleBrand(b.brandId)}
          />
        ))}
      </div>
    </div>
  )
}
