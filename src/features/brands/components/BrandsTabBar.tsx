import { Layers, Layout, Link2 } from 'lucide-react'

const TABS = [
  { key: 'brands', label: 'My Brands', icon: Layers },
  { key: 'templates', label: 'Templates', icon: Layout },
  { key: 'connections', label: 'Connections', icon: Link2 },
] as const

export type BrandsTab = (typeof TABS)[number]['key']

interface BrandsTabBarProps {
  activeTab: BrandsTab
  onTabChange: (tab: BrandsTab) => void
}

export function BrandsTabBar({ activeTab, onTabChange }: BrandsTabBarProps) {
  return (
    <div className="border-b border-gray-200">
      <nav className="flex gap-6" aria-label="Brands tabs">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key
          return (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
