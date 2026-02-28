import { useState } from 'react'
import { LayoutDashboard, Brain, Compass, Activity, Settings } from 'lucide-react'
import { useTobyStatus } from '@/features/toby'
import {
  TobyHero,
  TobyGuide,
  TobyOverviewTab,
  TobyBrainTab,
  TobyScoutTab,
  TobyOperationsTab,
  TobySettings,
} from '@/features/toby'

type Tab = 'overview' | 'brain' | 'scout' | 'operations' | 'settings'

const TABS: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview',    label: 'Overview',    icon: LayoutDashboard },
  { id: 'brain',       label: 'Brain',       icon: Brain           },
  { id: 'scout',       label: 'Scout',       icon: Compass         },
  { id: 'operations',  label: 'Operations',  icon: Activity        },
  { id: 'settings',    label: 'Settings',    icon: Settings        },
]

export function TobyPage() {
  const { data: status } = useTobyStatus()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [guideOpen, setGuideOpen] = useState(false)

  return (
    <div className="space-y-5">
      {/* Hero — always visible, no matter what tab */}
      <TobyHero onLearnMore={() => setGuideOpen(true)} />

      {/* Onboarding guide — slides in when triggered */}
      <TobyGuide forceOpen={guideOpen} onClose={() => setGuideOpen(false)} />

      {status?.enabled && (
        <>
          {/* Tab Navigation */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
            <div className="flex overflow-x-auto">
              {TABS.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all border-b-2 first:rounded-tl-2xl last:rounded-tr-2xl ${
                      isActive
                        ? 'border-violet-500 text-violet-700 bg-violet-50/50'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-violet-500' : ''}`} />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview'   && <TobyOverviewTab />}
          {activeTab === 'brain'      && <TobyBrainTab />}
          {activeTab === 'scout'      && <TobyScoutTab />}
          {activeTab === 'operations' && <TobyOperationsTab />}
          {activeTab === 'settings'   && <TobySettings />}
        </>
      )}
    </div>
  )
}
