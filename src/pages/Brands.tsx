import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Layers,
  Plus,
  Settings,
  Palette,
  Check,
  Clock,
  BarChart3,
  Link2,
  Instagram,
  Facebook,
  Youtube,
  Image,
  Type,
  Sparkles
} from 'lucide-react'
import { useBrandsList, useBrandConnections, type BrandConnectionStatus } from '@/features/brands'
import { FullPageLoader, Modal } from '@/shared/components'

interface BrandInfo {
  id: string
  name: string
  color: string
  logo: string
}

interface SettingsModalProps {
  brand: BrandInfo
  connections: BrandConnectionStatus | undefined
  onClose: () => void
}

function BrandSettingsModal({ brand, connections, onClose }: SettingsModalProps) {
  const navigate = useNavigate()
  
  return (
    <div className="p-6 space-y-6">
      {/* Brand header */}
      <div className="flex items-center gap-4">
        <div 
          className="w-16 h-16 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: brand.color }}
        >
          <span className="text-2xl font-bold text-white">
            {brand.name.split(' ').map(w => w[0]).join('')}
          </span>
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900">{brand.name}</h3>
          <p className="text-gray-500">{brand.id}</p>
        </div>
      </div>

      {/* Connection status */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Link2 className="w-4 h-4" />
          Connected Platforms
        </h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                <Instagram className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium">Instagram</span>
            </div>
            {connections?.instagram.connected ? (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                {connections.instagram.account_name}
              </span>
            ) : (
              <span className="text-sm text-gray-400">Not connected</span>
            )}
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <Facebook className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium">Facebook</span>
            </div>
            {connections?.facebook.connected ? (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                {connections.facebook.account_name}
              </span>
            ) : (
              <span className="text-sm text-gray-400">Not connected</span>
            )}
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
                <Youtube className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium">YouTube</span>
            </div>
            {connections?.youtube.connected ? (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                {connections.youtube.account_name}
              </span>
            ) : (
              <span className="text-sm text-gray-400">Not connected</span>
            )}
          </div>
        </div>
        <button
          onClick={() => { onClose(); navigate('/connected'); }}
          className="mt-3 w-full py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
        >
          Manage Connections →
        </button>
      </div>

      {/* Scheduling info */}
      <div className="bg-gray-50 rounded-xl p-4">
        <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Posting Schedule
        </h4>
        <p className="text-sm text-gray-600 mb-2">
          This brand posts 6 times per day with staggered timing:
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white rounded px-2 py-1 text-center">
            <span className="text-gray-500">Light</span>
            <p className="font-medium">12 AM, 8 AM, 4 PM</p>
          </div>
          <div className="bg-gray-800 text-white rounded px-2 py-1 text-center">
            <span className="text-gray-300">Dark</span>
            <p className="font-medium">4 AM, 12 PM, 8 PM</p>
          </div>
          <div className="bg-white rounded px-2 py-1 text-center flex items-center justify-center">
            <span className="text-gray-500 text-xs">+ brand offset</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          Close
        </button>
        <button
          onClick={() => { onClose(); navigate('/scheduled'); }}
          className="flex-1 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
        >
          View Schedule
        </button>
      </div>
    </div>
  )
}

interface ThemeModalProps {
  brand: BrandInfo
  onClose: () => void
}

function BrandThemeModal({ brand, onClose }: ThemeModalProps) {
  // Parse color to RGB for display
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 }
  }
  
  const rgb = hexToRgb(brand.color)

  return (
    <div className="p-6 space-y-6">
      {/* Preview header */}
      <div 
        className="rounded-xl p-6 text-center"
        style={{ backgroundColor: brand.color }}
      >
        <span className="text-4xl font-bold text-white/30">
          {brand.name.split(' ').map(w => w[0]).join('')}
        </span>
        <h3 className="text-xl font-bold text-white mt-2">{brand.name}</h3>
      </div>

      {/* Color info */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Brand Color</label>
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-lg border-2 border-gray-200"
              style={{ backgroundColor: brand.color }}
            />
            <div>
              <p className="font-mono text-sm font-medium">{brand.color.toUpperCase()}</p>
              <p className="text-xs text-gray-500">RGB({rgb.r}, {rgb.g}, {rgb.b})</p>
            </div>
          </div>
        </div>

        {/* Theme elements */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Theme Elements</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Image className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">Logo</span>
              </div>
              <p className="text-xs text-gray-500">{brand.logo || 'Default logo'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Type className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">Typography</span>
              </div>
              <p className="text-xs text-gray-500">Inter font family</p>
            </div>
          </div>
        </div>

        {/* Light/Dark mode preview */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">Reel Variants</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
              <div 
                className="w-full h-16 rounded mb-2 flex items-center justify-center"
                style={{ backgroundColor: brand.color + '20' }}
              >
                <span style={{ color: brand.color }} className="font-bold text-sm">Light Mode</span>
              </div>
              <p className="text-xs text-gray-500">Bright background</p>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-center">
              <div 
                className="w-full h-16 rounded mb-2 flex items-center justify-center"
                style={{ backgroundColor: brand.color }}
              >
                <span className="font-bold text-sm text-white">Dark Mode</span>
              </div>
              <p className="text-xs text-gray-400">Brand color background</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Theme customization is configured in the codebase. 
          Colors, logos, and typography are defined per brand to ensure visual consistency across all reels.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          Close
        </button>
      </div>
    </div>
  )
}

interface CreateBrandModalProps {
  onClose: () => void
}

function CreateBrandModal({ onClose }: CreateBrandModalProps) {
  const [step, setStep] = useState(1)
  const [brandName, setBrandName] = useState('')
  const [brandColor, setBrandColor] = useState('#6366f1')
  const [brandId, setBrandId] = useState('')

  const handleNameChange = (name: string) => {
    setBrandName(name)
    // Auto-generate ID from name
    setBrandId(name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, ''))
  }

  return (
    <div className="p-6 space-y-6">
      {/* Progress steps */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {[1, 2, 3].map(s => (
          <div
            key={s}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              s === step 
                ? 'bg-primary-500 text-white' 
                : s < step 
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-500'
            }`}
          >
            {s < step ? <Check className="w-4 h-4" /> : s}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="text-center mb-6">
            <Sparkles className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Brand Identity</h3>
            <p className="text-sm text-gray-500">Set up your brand name and visual identity</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., Fitness College"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand ID</label>
            <input
              type="text"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              placeholder="fitnesscollege"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Used for internal identification</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="w-12 h-12 rounded-lg cursor-pointer border-0"
              />
              <input
                type="text"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm"
              />
            </div>
          </div>

          {/* Preview */}
          {brandName && (
            <div 
              className="rounded-xl p-4 text-center mt-4"
              style={{ backgroundColor: brandColor }}
            >
              <span className="text-white font-bold">{brandName}</span>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="text-center mb-6">
            <Image className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Brand Assets</h3>
            <p className="text-sm text-gray-500">Upload your logo and visual assets</p>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
            <Image className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 mb-2">Drop your logo here or click to upload</p>
            <p className="text-xs text-gray-400">PNG or SVG, max 2MB</p>
            <button className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
              Choose File
            </button>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              <strong>Coming Soon:</strong> Logo upload will be available in a future update.
            </p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="text-center mb-6">
            <Link2 className="w-12 h-12 text-primary-500 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Connect Platforms</h3>
            <p className="text-sm text-gray-500">Link your social media accounts</p>
          </div>

          <div className="space-y-3">
            <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                <Instagram className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium">Instagram</p>
                <p className="text-sm text-gray-500">Connect business account</p>
              </div>
              <Plus className="w-5 h-5 text-gray-400" />
            </button>

            <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                <Facebook className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium">Facebook</p>
                <p className="text-sm text-gray-500">Connect page</p>
              </div>
              <Plus className="w-5 h-5 text-gray-400" />
            </button>

            <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center">
                <Youtube className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium">YouTube</p>
                <p className="text-sm text-gray-500">Connect channel</p>
              </div>
              <Plus className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              <strong>Coming Soon:</strong> Full brand creation with platform connections will be available in a future update. 
              Currently, brands require backend configuration.
            </p>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3 pt-4 border-t">
        {step > 1 ? (
          <button
            onClick={() => setStep(step - 1)}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Back
          </button>
        ) : (
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Cancel
          </button>
        )}
        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 && !brandName}
            className="flex-1 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        ) : (
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors font-medium"
          >
            Done
          </button>
        )}
      </div>
    </div>
  )
}

export function BrandsPage() {
  const { data: brandsData, isLoading: brandsLoading } = useBrandsList()
  const { data: connectionsData, isLoading: connectionsLoading } = useBrandConnections()
  
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedBrandForSettings, setSelectedBrandForSettings] = useState<BrandInfo | null>(null)
  const [selectedBrandForTheme, setSelectedBrandForTheme] = useState<BrandInfo | null>(null)

  if (brandsLoading || connectionsLoading) {
    return <FullPageLoader text="Loading brands..." />
  }

  const brands = brandsData?.brands || []
  const connections = connectionsData?.brands || []

  // Get connection count for a brand
  const getConnectionCount = (brandId: string) => {
    const brand = connections.find(b => b.brand === brandId)
    if (!brand) return 0
    return (brand.instagram.connected ? 1 : 0) + 
           (brand.facebook.connected ? 1 : 0) + 
           (brand.youtube.connected ? 1 : 0)
  }

  // Get connection status for a brand
  const getConnectionStatus = (brandId: string) => {
    return connections.find(b => b.brand === brandId)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Layers className="w-7 h-7 text-primary-500" />
            Brands
          </h1>
          <p className="text-gray-500 mt-1">
            Manage your brand configurations and settings
          </p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Brand
        </button>
      </div>

      {/* Brand cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {brands.map(brand => (
          <div
            key={brand.id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Brand header with color */}
            <div 
              className="h-24 relative"
              style={{ backgroundColor: brand.color }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl font-bold text-white/30">
                  {brand.name.split(' ').map(w => w[0]).join('')}
                </span>
              </div>
            </div>

            {/* Brand info */}
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">{brand.name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{brand.id}</p>
                </div>
                <div 
                  className="w-8 h-8 rounded-lg"
                  style={{ backgroundColor: brand.color }}
                />
              </div>

              {/* Stats */}
              <div className="mt-4 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-gray-600">
                  <div className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center">
                    <Check className="w-3 h-3" />
                  </div>
                  <span>{getConnectionCount(brand.id)}/3 connected</span>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
                <button
                  onClick={() => setSelectedBrandForSettings(brand)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <button
                  onClick={() => setSelectedBrandForTheme(brand)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Palette className="w-4 h-4" />
                  Theme
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Add new brand card */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center gap-3 hover:border-primary-400 hover:bg-primary-50/50 transition-colors min-h-[280px]"
        >
          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
            <Plus className="w-6 h-6 text-gray-500" />
          </div>
          <span className="font-medium text-gray-600">Create New Brand</span>
          <span className="text-sm text-gray-400 text-center">
            Set up a new brand with custom colors and social accounts
          </span>
        </button>
      </div>

      {/* Features info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Brand Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
              <Palette className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Custom Theming</h3>
              <p className="text-sm text-gray-500 mt-1">
                Each brand has unique colors, logos, and visual identity for reels
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Independent Scheduling</h3>
              <p className="text-sm text-gray-500 mt-1">
                Staggered posting times to maximize reach across brands
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Multi-Platform</h3>
              <p className="text-sm text-gray-500 mt-1">
                Publish to Instagram, Facebook, and YouTube from one place
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <Modal 
        isOpen={!!selectedBrandForSettings} 
        onClose={() => setSelectedBrandForSettings(null)}
        title={`${selectedBrandForSettings?.name} Settings`}
      >
        {selectedBrandForSettings && (
          <BrandSettingsModal 
            brand={selectedBrandForSettings} 
            connections={getConnectionStatus(selectedBrandForSettings.id)}
            onClose={() => setSelectedBrandForSettings(null)} 
          />
        )}
      </Modal>

      {/* Theme Modal */}
      <Modal 
        isOpen={!!selectedBrandForTheme} 
        onClose={() => setSelectedBrandForTheme(null)}
        title={`${selectedBrandForTheme?.name} Theme`}
      >
        {selectedBrandForTheme && (
          <BrandThemeModal 
            brand={selectedBrandForTheme} 
            onClose={() => setSelectedBrandForTheme(null)} 
          />
        )}
      </Modal>

      {/* Create brand modal */}
      <Modal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Create New Brand"
      >
        <CreateBrandModal onClose={() => setShowCreateModal(false)} />
      </Modal>
    </div>
  )
}
