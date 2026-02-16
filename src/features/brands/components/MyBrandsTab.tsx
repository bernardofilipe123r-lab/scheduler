import { useState, useMemo, useEffect } from 'react'
import { Plus, ArrowRight } from 'lucide-react'
import { useBrandConnections } from '@/features/brands/hooks/use-connections'
import { useBrands } from '@/features/brands/api/use-brands'
import { apiClient } from '@/shared/api/client'
import { PageLoader, Modal } from '@/shared/components'
import { BrandSettingsModal } from './BrandSettingsModal'
import { BrandThemeModal } from './BrandThemeModal'
import { CreateBrandModal } from './CreateBrandModal'
import { DeleteBrandDialog } from './DeleteBrandDialog'
import { BrandCard } from './BrandCard'
import { type BrandInfo } from '@/features/brands/constants'

interface MyBrandsTabProps {
  showCreateModal: boolean
  setShowCreateModal: (open: boolean) => void
}

export function MyBrandsTab({ showCreateModal, setShowCreateModal }: MyBrandsTabProps) {
  const { data: v2Brands, isLoading: brandsLoading } = useBrands()
  const { data: connectionsData, isLoading: connectionsLoading } = useBrandConnections()

  const [selectedBrandForSettings, setSelectedBrandForSettings] = useState<BrandInfo | null>(null)
  const [selectedBrandForTheme, setSelectedBrandForTheme] = useState<BrandInfo | null>(null)
  const [deletingBrand, setDeletingBrand] = useState<BrandInfo | null>(null)

  // Store logos loaded from backend
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({})

  // Build BrandInfo list from v2 API data
  const brands: BrandInfo[] = useMemo(() => {
    if (!v2Brands) return []
    return v2Brands.map((b) => ({
      id: b.id,
      name: b.display_name,
      color: b.colors?.primary || '#666666',
      logo: b.logo_path || '',
    }))
  }, [v2Brands])

  // Fetch brand logos on mount
  useEffect(() => {
    const fetchBrandThemes = async () => {
      const logos: Record<string, string> = {}
      for (const brand of brands) {
        try {
          const data = await apiClient.get<{ theme?: { logo?: string } }>(`/api/brands/${brand.id}/theme`)
          if (data.theme?.logo) {
            const logoUrl = `/brand-logos/${data.theme.logo}`
            const logoCheck = await fetch(logoUrl, { method: 'HEAD' })
            if (logoCheck.ok) {
              logos[brand.id] = logoUrl
            }
          }
        } catch {
          // ignore
        }
      }
      setBrandLogos(logos)
    }
    if (brands.length) fetchBrandThemes()
  }, [brands])

  const refreshBrandLogo = async (brandId: string) => {
    try {
      const data = await apiClient.get<{ theme?: { logo?: string } }>(`/api/brands/${brandId}/theme`)
      if (data.theme?.logo) {
        const logoUrl = `/brand-logos/${data.theme.logo}?t=${Date.now()}`
        const logoCheck = await fetch(logoUrl, { method: 'HEAD' })
        if (logoCheck.ok) {
          setBrandLogos((prev) => ({ ...prev, [brandId]: logoUrl }))
        }
      }
    } catch {
      // ignore
    }
  }

  const getBrandScheduleData = (brandId: string) => {
    const v2Brand = v2Brands?.find((b) => b.id === brandId)
    return {
      offset: v2Brand?.schedule_offset ?? 0,
      postsPerDay: v2Brand?.posts_per_day ?? 6,
    }
  }

  const sortedBrands = useMemo(() => {
    return [...brands].sort((a, b) => {
      const offsetA = getBrandScheduleData(a.id).offset
      const offsetB = getBrandScheduleData(b.id).offset
      return offsetA - offsetB
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands, v2Brands])

  const connections = connectionsData?.brands || []

  const getConnectionCount = (brandId: string) => {
    const brand = connections.find((b) => b.brand === brandId)
    if (!brand) return 0
    return (brand.instagram.connected ? 1 : 0) + (brand.facebook.connected ? 1 : 0) + (brand.youtube.connected ? 1 : 0)
  }

  const getConnectionStatus = (brandId: string) => {
    return connections.find((b) => b.brand === brandId)
  }

  if (brandsLoading || connectionsLoading) {
    return <PageLoader page="brands" />
  }

  return (
    <>
      <div className="space-y-4">
        {sortedBrands.map((brand, index) => (
          <BrandCard
            key={brand.id}
            brand={brand}
            index={index}
            schedule={getBrandScheduleData(brand.id)}
            connectionCount={getConnectionCount(brand.id)}
            logoUrl={brandLogos[brand.id]}
            onSettings={() => setSelectedBrandForSettings(brand)}
            onTheme={() => setSelectedBrandForTheme(brand)}
            onDelete={() => setDeletingBrand(brand)}
          />
        ))}

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
        size="2xl"
      >
        <CreateBrandModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => setShowCreateModal(false)}
        />
      </Modal>

      {/* Delete confirmation */}
      {deletingBrand && (
        <DeleteBrandDialog
          isOpen={!!deletingBrand}
          brandId={deletingBrand.id}
          brandName={deletingBrand.name}
          onClose={() => setDeletingBrand(null)}
          onDeleted={() => setDeletingBrand(null)}
        />
      )}
    </>
  )
}
