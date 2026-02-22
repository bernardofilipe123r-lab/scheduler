import { useState } from 'react'
import { Bot, Activity, FlaskConical, Lightbulb, Settings } from 'lucide-react'
import {
  TobyStatusBar,
  TobyActivityFeed,
  TobyExperiments,
  TobyInsights,
  TobyBufferStatus,
  TobySettings,
} from '@/features/toby'

const TABS = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'experiments', label: 'Experiments', icon: FlaskConical },
  { id: 'insights', label: 'Insights', icon: Lightbulb },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

type TabId = typeof TABS[number]['id']

export function TobyPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
          <Bot className="w-7 h-7" />
          Toby — AI Agent
        </h1>
        <p className="text-gray-500 mt-1">
          Autonomous content generation, A/B testing, and optimization
        </p>
      </div>

      {/* Status bar — always visible */}
      <TobyStatusBar />

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TobyActivityFeed />
          </div>
          <div>
            <TobyBufferStatus />
          </div>
        </div>
      )}

      {activeTab === 'experiments' && <TobyExperiments />}

      {activeTab === 'insights' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TobyInsights />
          <TobyBufferStatus />
        </div>
      )}

      {activeTab === 'settings' && <TobySettings />}
    </div>
  )
}
