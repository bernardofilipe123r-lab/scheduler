/**
 * Settings Page
 * 
 * Manage application-wide settings including API keys, content generation settings,
 * and scheduling configuration.
 */
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
  Server,
  Globe
} from 'lucide-react'
import toast from 'react-hot-toast'
import { 
  useSettings, 
  useBulkUpdateSettings, 
  type Setting 
} from '@/features/settings/api/use-settings'

// Category icons
const CATEGORY_ICONS: Record<string, typeof SettingsIcon> = {
  ai: Sparkles,
  content: Sparkles,
  scheduling: Calendar,
  meta: Key,
  youtube: Key,
  application: Globe,
}

// Category labels
const CATEGORY_LABELS: Record<string, string> = {
  ai: 'AI & Content Generation',
  content: 'Content Settings',
  scheduling: 'Scheduling',
  meta: 'Meta/Instagram',
  youtube: 'YouTube',
  application: 'Application',
}

// Source badges
const SOURCE_BADGE: Record<string, { label: string; className: string; icon: typeof Database }> = {
  database: { label: 'DB', className: 'bg-green-100 text-green-700', icon: Database },
  environment: { label: 'ENV', className: 'bg-blue-100 text-blue-700', icon: Server },
  default: { label: 'Default', className: 'bg-gray-100 text-gray-500', icon: SettingsIcon },
}

export function SettingsPage() {
  const { data, isLoading, error, refetch } = useSettings()
  const bulkUpdate = useBulkUpdateSettings()
  
  // Local state for editing
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())
  
  // Check if there are unsaved changes
  const hasChanges = Object.keys(editedValues).length > 0
  
  // Toggle password visibility
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
  
  // Update a setting value locally
  const handleChange = (key: string, value: string) => {
    setEditedValues(prev => ({
      ...prev,
      [key]: value
    }))
  }
  
  // Save all changes
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
  
  // Reset unsaved changes
  const handleReset = () => {
    setEditedValues({})
    toast.success('Changes discarded')
  }
  
  // Get current value (edited or original)
  const getValue = (setting: Setting): string => {
    if (editedValues[setting.key] !== undefined) {
      return editedValues[setting.key]
    }
    return setting.value || ''
  }
  
  // Check if a setting has been edited
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
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <SettingsIcon className="w-7 h-7 text-primary-500" />
            Settings
          </h1>
          <p className="text-gray-500 mt-1">
            Manage API keys, content generation, and scheduling settings
          </p>
        </div>
        
        <div className="flex items-center gap-3">
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
      </div>
      
      {/* Settings by Category */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([category, settings]) => {
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
                              className="w-full pl-3 py-2 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
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
      
      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">About Settings</h3>
            <p className="text-sm text-blue-700 mt-1">
              Settings stored here take precedence over environment variables set on Railway.
              If a setting is empty, the system will fall back to the corresponding environment variable.
            </p>
            <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
              <li><span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium"><Database className="w-3 h-3" />DB</span> — Value saved in database (takes priority)</li>
              <li><span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium"><Server className="w-3 h-3" />ENV</span> — Value from Railway/environment variable (fallback)</li>
              <li><span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs font-medium">Default</span> — Using built-in default value</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
