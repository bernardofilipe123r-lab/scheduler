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
    <div className="min-h-screen">
      {/* Tab Navigation */}
      <div className="border-b border-gray-700/50 bg-gray-900/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 -mb-px">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === 'text-reels' && <GeneratorPage />}
        {activeTab === 'text-video' && <TextVideoTab />}
        {activeTab === 'design' && <DesignEditorTab />}
      </div>
    </div>
  )
}
