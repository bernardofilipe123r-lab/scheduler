import { BatteryLow, BatteryWarning, BatteryFull } from 'lucide-react'
import { useTobyBuffer } from '../hooks'

const HEALTH_CONFIG = {
  healthy: { icon: BatteryFull, color: 'text-emerald-600', bgColor: 'bg-emerald-50', barColor: 'bg-emerald-500' },
  low: { icon: BatteryLow, color: 'text-amber-600', bgColor: 'bg-amber-50', barColor: 'bg-amber-500' },
  critical: { icon: BatteryWarning, color: 'text-red-600', bgColor: 'bg-red-50', barColor: 'bg-red-500' },
}

export function TobyBufferStatus() {
  const { data: buffer, isLoading } = useTobyBuffer()

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="h-5 bg-gray-100 rounded w-32 mb-4 animate-pulse" />
        <div className="h-4 bg-gray-100 rounded-full w-full mb-3 animate-pulse" />
        <div className="h-3 bg-gray-100 rounded w-48 animate-pulse" />
      </div>
    )
  }

  if (!buffer) return null

  const cfg = HEALTH_CONFIG[buffer.health] || HEALTH_CONFIG.healthy
  const HealthIcon = cfg.icon

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Buffer Status</h3>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.bgColor}`}>
            <HealthIcon className={`w-5 h-5 ${cfg.color}`} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${cfg.color}`}>{buffer.health.charAt(0).toUpperCase() + buffer.health.slice(1)}</p>
            <p className="text-xs text-gray-500">{buffer.filled_slots} of {buffer.total_slots} slots filled</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold text-gray-900">{buffer.fill_percent}%</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.barColor}`}
            style={{ width: `${buffer.fill_percent}%` }}
          />
        </div>

        {/* Empty slots preview */}
        {buffer.empty_slots.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-400 mb-2">{buffer.empty_slots.length} empty slot{buffer.empty_slots.length !== 1 ? 's' : ''}</p>
            <div className="grid grid-cols-2 gap-1.5 max-h-[120px] overflow-y-auto">
              {buffer.empty_slots.slice(0, 8).map((slot, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-md text-xs">
                  <span className="text-gray-500">{slot.brand_id}</span>
                  <span className="text-gray-400">{slot.date}</span>
                  <span className="text-gray-300">{slot.content_type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
