import { useState, useCallback } from 'react'
import { Settings, ChevronDown } from 'lucide-react'
import { useTobyStatus } from '@/features/toby'
import {
  TobyHero,
  TobyGuide,
  TobyPipeline,
  TobyBufferHealth,
  TobyExperiments,
  TobyInsights,
  TobySettings,
} from '@/features/toby'

export function TobyPage() {
  const { data: status } = useTobyStatus()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const showGuide = useCallback(() => setGuideOpen(true), [])
  const hideGuide = useCallback(() => setGuideOpen(false), [])

  return (
    <div className="space-y-6">
      {/* Hero — status, phase journey, metrics */}
      <TobyHero onLearnMore={showGuide} />

      {/* Onboarding guide — shown on first visit, re-openable via Learn more */}
      <TobyGuide forceOpen={guideOpen} onClose={hideGuide} />

      {status?.enabled && (
        <>
          {/* Pipeline + Buffer */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <TobyPipeline />
            </div>
            <div className="lg:col-span-2">
              <TobyBufferHealth />
            </div>
          </div>

          {/* Experiments + Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TobyExperiments />
            <TobyInsights />
          </div>

          {/* Collapsible Settings */}
          <div>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-3"
            >
              <Settings className="w-4 h-4" />
              <span className="font-medium">{settingsOpen ? 'Hide settings' : 'Show settings'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${settingsOpen ? 'rotate-180' : ''}`} />
            </button>
            {settingsOpen && <TobySettings />}
          </div>
        </>
      )}
    </div>
  )
}
