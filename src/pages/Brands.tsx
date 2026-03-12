import { useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Layers, Plus } from 'lucide-react'
import { BrandsTabBar, type BrandsTab } from '@/features/brands/components/BrandsTabBar'
import { MyBrandsTab } from '@/features/brands/components/MyBrandsTab'
import { NicheConfigForm } from '@/features/brands/components/NicheConfigForm'
import { DNAProfilesManager } from '@/features/content-dna/components/DNAProfilesManager'

export function BrandsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') || 'brands') as BrandsTab
  const navigate = useNavigate()

  const handleTabChange = useCallback(
    (tab: BrandsTab) => {
      if (tab === activeTab) return

      if (tab === 'brands') {
        setSearchParams({})
      } else {
        setSearchParams({ tab })
      }
    },
    [activeTab, setSearchParams],
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
            onClick={() => navigate('/brands/new')}
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
      {activeTab === 'brands' && <MyBrandsTab />}
      {activeTab === 'dna-profiles' && <DNAProfilesManager />}
      {activeTab === 'prompts' && <NicheConfigForm />}
    </div>
  )
}
