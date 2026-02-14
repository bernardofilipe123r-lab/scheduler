import type { Clock } from 'lucide-react'

interface StatusPillProps {
  label: string
  value: string
  icon: typeof Clock
}

export function StatusPill({ label, value, icon: Icon }: StatusPillProps) {
  return (
    <div className="bg-white/10 rounded-xl px-3 py-2 border border-white/10">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-white/60" />
        <div>
          <div className="text-sm font-semibold text-white">{value}</div>
          <div className="text-xs text-white/50">{label}</div>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  icon: typeof Clock
  color: 'purple' | 'yellow' | 'green' | 'red' | 'gray'
}

export function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  const colors = {
    purple: 'bg-violet-50 text-violet-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    gray: 'bg-gray-50 text-gray-600',
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  )
}
