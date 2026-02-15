import { useState } from 'react'
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
  Server
} from 'lucide-react'
import toast from 'react-hot-toast'
import { 
  useSettings, 
  useBulkUpdateSettings, 
  type Setting 
} from '@/features/settings/api/use-settings'
import { CompetitorSection } from '@/features/ai-team/components/CompetitorSection'

// Category icons
const CATEGORY_ICONS: Record<string, typeof SettingsIcon> = {
  content: Sparkles,
  scheduling: Calendar,
  meta: Key,
  youtube: Key,
}

// Category labels
const CATEGORY_LABELS: Record<string, string> = {
  content: 'Content Settings',
  scheduling: 'Scheduling',
  meta: 'Meta/Instagram',
  youtube: 'YouTube',
}

// Categories and keys visible to normal users (in display order)
const VISIBLE_CATEGORIES = ['meta', 'youtube', 'content', 'scheduling'] as const
const VISIBLE_KEYS = new Set([
  'instagram_app_id', 'instagram_app_secret',
  'youtube_client_id', 'youtube_client_secret', 'youtube_redirect_uri',
  'default_caption_count', 'default_content_lines',
  'default_posts_per_day', 'scheduling_timezone',
])

// Source badges
const SOURCE_BADGE: Record<string, { label: string; className: string; icon: typeof Database }> = {
  database: { label: 'DB', className: 'bg-green-100 text-green-700', icon: Database },
  environment: { label: 'ENV', className: 'bg-blue-100 text-blue-700', icon: Server },
  default: { label: 'Default', className: 'bg-gray-100 text-gray-500', icon: SettingsIcon },
}

export function SettingsTab() {
  const { data, isLoading, error, refetch } = useSettings()
  const bulkUpdate = useBulkUpdateSettings()
  
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  
  const hasChanges = Object.keys(editedValues).length > 0
  
  const toggleReveal = (key: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }
  
  const handleChange = (key: string, value: string) => {
    setEditedValues(prev => ({
      ...prev,
      [key]: value
    }))
  }
  
  const handleSave = async () => {
    if (!hasChanges) return
    
    try {
      await bulkUpdate.mutateAsync(editedValues)
      toast.success('Settings saved successfully')
      setEditedValues({})
    } catch (error) {
      toast.error('Failed to save settings')
    }
  }
  
  const handleReset = () => {
    setEditedValues({})
    toast.success('Changes discarded')
  }
  
  const getValue = (setting: Setting): string => {
    if (editedValues[setting.key] !== undefined) {
      return editedValues[setting.key]
    }
    return setting.value || ''
  }
  
  const isEdited = (key: string): boolean => {
    return editedValues[key] !== undefined
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
          disabled={!hasChanges || bulkUpdate.isPending}
          className="flex items-center gap-2 px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {bulkUpdate.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Changes
        </button>
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
