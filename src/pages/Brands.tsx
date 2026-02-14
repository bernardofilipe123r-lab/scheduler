import { useState, useMemo, useEffect } from 'react'
import { 
  Layers,
  Plus,
  Settings,
  Palette,
  Check,
  Clock,
  BarChart3,
  ArrowRight,
} from 'lucide-react'
import { useBrandsList, useBrandConnections } from '@/features/brands'
import { useBrands } from '@/features/brands/api/use-brands'
import { FullPageLoader, Modal } from '@/shared/components'
import { BrandSettingsModal } from '@/features/brands/components/BrandSettingsModal'
import { BrandThemeModal } from '@/features/brands/components/BrandThemeModal'
import { CreateBrandModal } from '@/features/brands/components/CreateBrandModal'
import {
  type BrandInfo,
  BRAND_SCHEDULES,
  generateSchedule,
  formatHour,
} from '@/features/brands/constants'

export function BrandsPage() {
  const { data: brandsData, isLoading: brandsLoading } = useBrandsList()
  const { data: connectionsData, isLoading: connectionsLoading } = useBrandConnections()
  
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedBrandForSettings, setSelectedBrandForSettings] = useState<BrandInfo | null>(null)
  const [selectedBrandForTheme, setSelectedBrandForTheme] = useState<BrandInfo | null>(null)
  
  // Store logos loaded from backend (keyed by brand id)
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({})
  
  // Fetch saved themes/logos for all brands on mount
  useEffect(() => {
    const fetchBrandThemes = async () => {
      const brands = brandsData?.brands || []
      const logos: Record<string, string> = {}
      
      for (const brand of brands) {
        try {
          const response = await fetch(`/api/brands/${brand.id}/theme`)
          if (response.ok) {
            const data = await response.json()
            if (data.theme?.logo) {
              // Check if logo file actually exists by trying to fetch it
              const logoUrl = `/brand-logos/${data.theme.logo}`
              const logoCheck = await fetch(logoUrl, { method: 'HEAD' })
              if (logoCheck.ok) {
                logos[brand.id] = logoUrl
              }
            }
          }
        } catch (error) {
          console.error(`Failed to fetch theme for ${brand.id}:`, error)
        }
      }
      
      setBrandLogos(logos)
    }
    
    if (brandsData?.brands?.length) {
      fetchBrandThemes()
    }
  }, [brandsData?.brands])
  
  // Function to refresh a single brand's logo
  const refreshBrandLogo = async (brandId: string) => {
    try {
      const response = await fetch(`/api/brands/${brandId}/theme`)
      if (response.ok) {
        const data = await response.json()
        if (data.theme?.logo) {
          const logoUrl = `/brand-logos/${data.theme.logo}?t=${Date.now()}` // Cache bust
          const logoCheck = await fetch(logoUrl, { method: 'HEAD' })
          if (logoCheck.ok) {
            setBrandLogos(prev => ({ ...prev, [brandId]: logoUrl }))
          }
        }
      }
    } catch (error) {
      console.error(`Failed to refresh logo for ${brandId}:`, error)
    }
  }

  // Use v2 brands data for schedule info
  const { data: v2Brands } = useBrands()
  
  // Helper: get schedule for any brand - v2 API data > hardcoded fallback
  const getBrandScheduleData = (brandId: string) => {
    const v2Brand = v2Brands?.find(b => b.id === brandId)
    return {
      offset: v2Brand?.schedule_offset ?? BRAND_SCHEDULES[brandId]?.offset ?? 0,
      postsPerDay: v2Brand?.posts_per_day ?? BRAND_SCHEDULES[brandId]?.postsPerDay ?? 6,
    }
  }

  // Sort brands by offset
  const sortedBrands = useMemo(() => {
    const brands = brandsData?.brands || []
    return [...brands].sort((a, b) => {
      const offsetA = getBrandScheduleData(a.id).offset
      const offsetB = getBrandScheduleData(b.id).offset
      return offsetA - offsetB
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandsData?.brands, v2Brands])

  if (brandsLoading || connectionsLoading) {
    return <FullPageLoader text="Loading brands..." />
  }

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

  // Get schedule info for a brand - v2 API data with hardcoded fallback
  const getBrandSchedule = (brandId: string) => {
    return getBrandScheduleData(brandId)
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

      {/* Schedule explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          How Scheduling Works
        </h3>
        <p className="text-sm text-blue-800">
          Each brand has a <strong>time offset</strong> that determines when its first post goes out each day. 
          Posts alternate between Light and Dark variants throughout the day.
          Brands are ordered below by their offset to show the posting sequence.
        </p>
      </div>

      {/* Brand list - Vertical layout sorted by offset */}
      <div className="space-y-4">
        {sortedBrands.map((brand, index) => {
          const schedule = getBrandSchedule(brand.id)
          const previewSlots = generateSchedule(schedule.offset, schedule.postsPerDay)
          
          return (
            <div
              key={brand.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="flex items-stretch">
                {/* Offset indicator */}
                <div 
                  className="w-20 flex flex-col items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: brand.color }}
                >
                  <span className="text-xs opacity-80">OFFSET</span>
                  <span className="text-2xl font-bold">+{schedule.offset}h</span>
                  <span className="text-xs opacity-80">#{index + 1}</span>
                </div>

                {/* Brand info */}
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                        style={{ backgroundColor: brand.color }}
                      >
                        {brandLogos[brand.id] ? (
                          <img 
                            src={brandLogos[brand.id]} 
                            alt={brand.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <span className="text-lg font-bold text-white">
                            {brand.name.split(' ').map(w => w[0]).join('')}
                          </span>
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{brand.name}</h3>
                        <p className="text-sm text-gray-500">{brand.id}</p>
                      </div>
                    </div>
                    
                    {/* Connection count */}
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-green-500" />
                      <span>{getConnectionCount(brand.id)}/3</span>
                    </div>
                  </div>

                  {/* Schedule preview */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 mr-1">Schedule:</span>
                    {previewSlots.slice(0, 6).map((slot, i) => (
                      <span
                        key={i}
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          slot.variant === 'light' 
                            ? 'bg-gray-100 text-gray-700' 
                            : 'bg-gray-800 text-white'
                        }`}
                      >
                        {formatHour(slot.hour)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 p-4 border-l border-gray-100">
                  <button
                    onClick={() => setSelectedBrandForSettings(brand)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </button>
                  <button
                    onClick={() => setSelectedBrandForTheme(brand)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Palette className="w-4 h-4" />
                    Theme
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {/* Add new brand card */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 flex items-center justify-center gap-3 hover:border-primary-400 hover:bg-primary-50/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
            <Plus className="w-5 h-5 text-gray-500" />
          </div>
          <div className="text-left">
            <span className="font-medium text-gray-600 block">Create New Brand</span>
            <span className="text-sm text-gray-400">Set up a new brand with custom colors and schedule</span>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-400 ml-auto" />
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
            allBrands={sortedBrands}
            onClose={() => setSelectedBrandForSettings(null)} 
          />
        )}
      </Modal>

      {/* Theme Modal */}
      <Modal 
        isOpen={!!selectedBrandForTheme} 
        onClose={() => setSelectedBrandForTheme(null)}
        title={`${selectedBrandForTheme?.name} Theme`}
        size="xl"
      >
        {selectedBrandForTheme && (
          <BrandThemeModal 
            brand={selectedBrandForTheme} 
            onClose={() => setSelectedBrandForTheme(null)}
            onSave={() => refreshBrandLogo(selectedBrandForTheme.id)}
          />
        )}
      </Modal>

      {/* Create brand modal */}
      <Modal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        title="Create New Brand"
      >
        <CreateBrandModal 
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => setShowCreateModal(false)}
        />
      </Modal>
    </div>
  )
}
