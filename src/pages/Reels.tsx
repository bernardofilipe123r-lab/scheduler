import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Film, Sparkles, Palette } from 'lucide-react'
import { GeneratorPage } from './Generator'
import { TextVideoTab } from '@/features/reels/TextVideoTab'
import { DesignEditorTab } from '@/features/reels/DesignEditorTab'

type ReelsTab = 'text-reels' | 'text-video' | 'design'

const TABS: { id: ReelsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'text-reels', label: 'Text Reels', icon: <Film className="w-4 h-4" /> },
  { id: 'text-video', label: 'Text-Video ✨', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'design', label: 'Design Editor', icon: <Palette className="w-4 h-4" /> },
]

export function ReelsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as ReelsTab | null
  const [activeTab, setActiveTab] = useState<ReelsTab>(
    tabParam && TABS.some(t => t.id === tabParam) ? tabParam : 'text-reels'
  )

  const handleTabChange = (tab: ReelsTab) => {
    setActiveTab(tab)
    setSearchParams({ tab })
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1 -mb-px">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'text-reels' && <GeneratorPage />}
      {activeTab === 'text-video' && <TextVideoTab />}
      {activeTab === 'design' && <DesignEditorTab />}
    </div>
  )
}
