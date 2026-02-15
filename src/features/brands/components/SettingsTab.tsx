import { useState, useEffect } from 'react'
import { 
  Settings as SettingsIcon, 
  Key, 
  Sparkles, 
  Calendar, 
  Save,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  AlertCircle,
  Database,
  Server,
  Instagram
} from 'lucide-react'
import toast from 'react-hot-toast'
import { 
  useSettings, 
  useBulkUpdateSettings, 
  type Setting 
} from '@/features/settings/api/use-settings'
import { useUpdateBrandCredentials } from '@/features/brands/api/use-brands'
import { apiClient } from '@/shared/api/client'
import { CompetitorSection } from '@/features/ai-team/components/CompetitorSection'

// Category icons
const CATEGORY_ICONS: Record<string, typeof SettingsIcon> = {
  content: Sparkles,
  scheduling: Calendar,
  youtube: Key,
}

// Category labels
const CATEGORY_LABELS: Record<string, string> = {
  content: 'Content Settings',
  scheduling: 'Scheduling',
  youtube: 'YouTube',
}

// Categories and keys visible to normal users (in display order)
const VISIBLE_CATEGORIES = ['youtube', 'content', 'scheduling'] as const
const VISIBLE_KEYS = new Set([
  'youtube_client_id', 'youtube_client_secret', 'youtube_redirect_uri',
  'default_caption_count', 'default_content_lines',
  'default_posts_per_day', 'scheduling_timezone',
])

// Per-brand credential fields
interface BrandCredentials {
  id: string
  display_name: string
  color: string
  facebook_page_id: string
  instagram_business_account_id: string
  meta_access_token: string
}

const CREDENTIAL_FIELDS = [
  { key: 'facebook_page_id' as const, label: 'Facebook Page ID', sensitive: false },
  { key: 'instagram_business_account_id' as const, label: 'Instagram Business Account ID', sensitive: false },
  { key: 'meta_access_token' as const, label: 'Meta Access Token', sensitive: true },
]

// Source badges
const SOURCE_BADGE: Record<string, { label: string; className: string; icon: typeof Database }> = {
  database: { label: 'DB', className: 'bg-green-100 text-green-700', icon: Database },
  environment: { label: 'ENV', className: 'bg-blue-100 text-blue-700', icon: Server },
  default: { label: 'Default', className: 'bg-gray-100 text-gray-500', icon: SettingsIcon },
}

export function SettingsTab() {
  const { data, isLoading, error, refetch } = useSettings()
  const bulkUpdate = useBulkUpdateSettings()
  const updateCredentials = useUpdateBrandCredentials()
  
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  
  // Per-brand credentials state
  const [brandCreds, setBrandCreds] = useState<BrandCredentials[]>([])
  const [brandsLoading, setBrandsLoading] = useState(true)
  const [editedCreds, setEditedCreds] = useState<Record<string, Record<string, string>>>({})
  const [revealedCredKeys, setRevealedCredKeys] = useState<Set<string>>(new Set())
  const [savingBrand, setSavingBrand] = useState<string | null>(null)
  
  // Fetch brand credentials
  useEffect(() => {
    const fetchCreds = async () => {
      try {
        const resp = await apiClient.get<{ brands: BrandCredentials[] }>('/api/v2/brands/credentials')
        setBrandCreds(resp.brands)
      } catch {
        // ignore
      }
      setBrandsLoading(false)
    }
    fetchCreds()
  }, [])
  
  const hasSettingsChanges = Object.keys(editedValues).length > 0
  const hasCredChanges = Object.keys(editedCreds).length > 0
  const hasChanges = hasSettingsChanges || hasCredChanges
  
  const toggleReveal = (key: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  
  const toggleCredReveal = (compositeKey: string) => {
    setRevealedCredKeys(prev => {
      const next = new Set(prev)
      if (next.has(compositeKey)) next.delete(compositeKey)
      else next.add(compositeKey)
      return next
    })
  }
  
  const handleChange = (key: string, value: string) => {
    setEditedValues(prev => ({
      ...prev,
      [key]: value
    }))
  }
  
  const handleCredChange = (brandId: string, field: string, value: string) => {
    setEditedCreds(prev => ({
      ...prev,
      [brandId]: {
        ...(prev[brandId] || {}),
        [field]: value,
      },
    }))
  }
  
  const handleSave = async () => {
    // Save global settings
    if (hasSettingsChanges) {
      try {
        await bulkUpdate.mutateAsync(editedValues)
        toast.success('Settings saved')
        setEditedValues({})
      } catch {
        toast.error('Failed to save settings')
      }
    }
    
    // Save per-brand credentials
    if (hasCredChanges) {
      let allOk = true
      for (const [brandId, fields] of Object.entries(editedCreds)) {
        setSavingBrand(brandId)
        try {
          await updateCredentials.mutateAsync({ id: brandId, ...fields })
        } catch {
          allOk = false
          toast.error(`Failed to save credentials for ${brandId}`)
        }
      }
      setSavingBrand(null)
      if (allOk) {
        toast.success('Brand credentials saved')
        // Refresh brand creds
        try {
          const resp = await apiClient.get<{ brands: BrandCredentials[] }>('/api/v2/brands/credentials')
          setBrandCreds(resp.brands)
        } catch { /* ignore */ }
        setEditedCreds({})
      }
    }
  }
  
  const handleReset = () => {
    setEditedValues({})
    setEditedCreds({})
    toast.success('Changes discarded')
  }
  
  const getValue = (setting: Setting): string => {
    if (editedValues[setting.key] !== undefined) {
      return editedValues[setting.key]
    }
    return setting.value || ''
  }
  
  const isEdited = (key: string): boolean => {
    if (editedValues[key] === undefined) return false
    // Compare against original value to avoid false positives from browser autofill
    const original = data?.settings.find(s => s.key === key)?.value || ''
    return editedValues[key] !== original
  }
  
  const getCredValue = (brandId: string, field: keyof BrandCredentials): string => {
    if (editedCreds[brandId]?.[field] !== undefined) {
      return editedCreds[brandId][field]
    }
    const brand = brandCreds.find(b => b.id === brandId)
    return (brand?.[field] as string) || ''
  }
  
  const isCredEdited = (brandId: string, field: string): boolean => {
    if (editedCreds[brandId]?.[field] === undefined) return false
    const brand = brandCreds.find(b => b.id === brandId)
    const original = (brand?.[field as keyof BrandCredentials] as string) || ''
    return editedCreds[brandId][field] !== original
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-gray-600">Failed to load settings</p>
        <button 
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
        >
          Retry
        </button>
      </div>
    )
  }
  
  const grouped = data?.grouped || {}
  
  // Filter to only user-visible categories and keys, in defined order
  const visibleGrouped = VISIBLE_CATEGORIES.reduce<Record<string, Setting[]>>((acc, cat) => {
    const settings = grouped[cat]
    if (settings) {
      const filtered = settings.filter(s => VISIBLE_KEYS.has(s.key))
      if (filtered.length > 0) acc[cat] = filtered
    }
    return acc
  }, {})
  
  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3">
        {hasChanges && (
          <button
            onClick={handleReset}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            Discard Changes
          </button>
        )}
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
        <button
          onClick={handleSave}
          disabled={!hasChanges || bulkUpdate.isPending || savingBrand !== null}
          className="flex items-center gap-2 px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(bulkUpdate.isPending || savingBrand !== null) ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Changes
        </button>
      </div>
      
      {/* Brand Connections (per-brand credentials) */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Instagram className="w-5 h-5 text-primary-500" />
            Brand Connections
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Facebook Page ID, Instagram Business Account ID, and Meta Access Token for each brand
          </p>
        </div>
        
        {brandsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
          </div>
        ) : brandCreds.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            No brands found
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {brandCreds.map((brand) => (
              <div key={brand.id} className="px-6 py-5">
                {/* Brand header */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: brand.color }}
                  >
                    <span className="text-white font-bold text-sm">
                      {brand.display_name.charAt(0)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900">{brand.display_name}</h3>
                  {savingBrand === brand.id && (
                    <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                  )}
                </div>
                
                {/* Credential fields */}
                <div className="space-y-3 ml-11">
                  {CREDENTIAL_FIELDS.map((field) => {
                    const compositeKey = `${brand.id}:${field.key}`
                    const value = getCredValue(brand.id, field.key)
                    const edited = isCredEdited(brand.id, field.key)
                    
                    return (
                      <div key={field.key} className="flex items-center gap-3">
                        <label className="text-sm font-medium text-gray-600 w-56 flex-shrink-0 flex items-center gap-2">
                          {field.label}
                          {edited && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-yellow-100 text-yellow-700 rounded-full">
                              Modified
                            </span>
                          )}
                        </label>
                        {field.sensitive ? (
                          <div className="relative flex-1">
                            <input
                              type={revealedCredKeys.has(compositeKey) ? 'text' : 'password'}
                              value={value}
                              onChange={(e) => handleCredChange(brand.id, field.key, e.target.value)}
                              placeholder="Enter value..."
                              autoComplete="off"
                              className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => toggleCredReveal(compositeKey)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                            >
                              {revealedCredKeys.has(compositeKey) ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => handleCredChange(brand.id, field.key, e.target.value)}
                            placeholder="Enter value..."
                            autoComplete="off"
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Settings by Category */}
      <div className="space-y-6">
        {Object.entries(visibleGrouped).map(([category, settings]) => {
          const Icon = CATEGORY_ICONS[category] || SettingsIcon
          const label = CATEGORY_LABELS[category] || category.charAt(0).toUpperCase() + category.slice(1)
          
          return (
            <div key={category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Icon className="w-5 h-5 text-primary-500" />
                  {label}
                </h2>
              </div>
              
              <div className="divide-y divide-gray-100">
                {settings.map((setting: Setting) => {
                  const sourceBadge = SOURCE_BADGE[setting.source || 'default']
                  const SourceIcon = sourceBadge?.icon || SettingsIcon
                  
                  return (
                  <div key={setting.key} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <label className="font-medium text-gray-900">
                            {setting.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </label>
                          {isEdited(setting.key) && (
                            <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">
                              Modified
                            </span>
                          )}
                          {sourceBadge && (
                            <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${sourceBadge.className}`}
                              title={setting.source === 'environment' 
                                ? `Value from env var: ${setting.env_var_name}` 
                                : setting.source === 'database'
                                ? 'Value stored in database'
                                : 'Using default value'}
                            >
                              <SourceIcon className="w-3 h-3" />
                              {sourceBadge.label}
                            </span>
                          )}
                        </div>
                        {setting.description && (
                          <p className="text-sm text-gray-500 mt-1">{setting.description}</p>
                        )}
                        {setting.env_var_name && (
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">
                            ENV: {setting.env_var_name}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 w-80">
                        {setting.value_type === 'boolean' ? (
                          <select
                            value={getValue(setting)}
                            onChange={(e) => handleChange(setting.key, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        ) : setting.sensitive ? (
                          <div className="relative w-full">
                            <input
                              type={revealedKeys.has(setting.key) ? 'text' : 'password'}
                              value={getValue(setting)}
                              onChange={(e) => handleChange(setting.key, e.target.value)}
                              placeholder="Enter value..."
                              autoComplete="off"
                              className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => toggleReveal(setting.key)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                            >
                              {revealedKeys.has(setting.key) ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <input
                            type={setting.value_type === 'number' ? 'number' : 'text'}
                            value={getValue(setting)}
                            onChange={(e) => handleChange(setting.key, e.target.value)}
                            placeholder="Enter value..."
                            autoComplete="off"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Competitor Accounts Section */}
      <div className="mt-8 border-t border-gray-700 pt-6">
        <h3 className="text-lg font-semibold text-white mb-2">Competitor Accounts</h3>
        <p className="text-sm text-gray-400 mb-4">
          Add Instagram accounts for your AI agents to learn from. They'll analyze top-performing content to improve your strategy.
        </p>
        <CompetitorSection />
      </div>

    </div>
  )
}
