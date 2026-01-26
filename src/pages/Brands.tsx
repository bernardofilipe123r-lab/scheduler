import { useState } from 'react'
import { 
  Layers,
  Plus,
  Settings,
  Palette,
  Check,
  Clock,
  BarChart3
} from 'lucide-react'
import { useBrandsList, useBrandConnections } from '@/features/brands'
import { FullPageLoader, Modal } from '@/shared/components'

export function BrandsPage() {
  const { data: brandsData, isLoading: brandsLoading } = useBrandsList()
  const { data: connectionsData, isLoading: connectionsLoading } = useBrandConnections()
  const [showCreateModal, setShowCreateModal] = useState(false)

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
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
                <button
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

      {/* Create brand modal */}
      <Modal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Create New Brand"
      >
        <div className="p-6">
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Coming Soon!</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              Dynamic brand creation is in development. Currently, brands are configured 
              in the codebase. Contact the developer to add a new brand.
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mt-4">
            <h4 className="font-medium text-gray-900 mb-2">What you'll be able to do:</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Set custom brand name and colors
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Upload brand logo
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Configure posting schedule
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-500" />
                Connect social media accounts
              </li>
            </ul>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
