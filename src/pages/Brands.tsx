import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layers, Plus } from 'lucide-react'
import { BrandsTabBar, type BrandsTab } from '@/features/brands/components/BrandsTabBar'
import { MyBrandsTab } from '@/features/brands/components/MyBrandsTab'
import { ConnectionsTab } from '@/features/brands/components/ConnectionsTab'
import { SettingsTab } from '@/features/brands/components/SettingsTab'

export function BrandsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') || 'brands') as BrandsTab
  const [showCreateModal, setShowCreateModal] = useState(false)

  const handleTabChange = useCallback(
    (tab: BrandsTab) => {
      if (tab === 'brands') {
        setSearchParams({})
      } else {
        setSearchParams({ tab })
      }
    },
    [setSearchParams],
  )

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

        {activeTab === 'brands' && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Brand
          </button>
        )}
      </div>

      {/* Tabs */}
      <BrandsTabBar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Tab content */}
      {activeTab === 'brands' && (
        <MyBrandsTab showCreateModal={showCreateModal} setShowCreateModal={setShowCreateModal} />
      )}
      {activeTab === 'connections' && <ConnectionsTab />}
      {activeTab === 'settings' && <SettingsTab />}
    </div>
  )
}
