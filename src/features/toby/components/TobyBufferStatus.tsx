import { BatteryLow, BatteryWarning, BatteryFull, Calendar, Info } from 'lucide-react'
import { useTobyBuffer } from '../hooks'

const HEALTH_CONFIG = {
  healthy: {
    icon: BatteryFull,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    barColor: 'bg-emerald-500',
    label: 'Healthy',
    message: 'Your content calendar is well stocked. Toby is keeping things on track.',
  },
  low: {
    icon: BatteryLow,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    barColor: 'bg-amber-500',
    label: 'Running Low',
    message: 'Some upcoming time slots are empty. Toby is working on filling them.',
  },
  critical: {
    icon: BatteryWarning,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    barColor: 'bg-red-500',
    label: 'Critical',
    message: 'Most time slots are empty. Toby will prioritize creating content right away.',
  },
}

function formatSlotDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (date.toDateString() === now.toDateString()) return 'Today'
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
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

  const emptySlots = Array.isArray(buffer.empty_slots) ? buffer.empty_slots : []

  // Group empty slots by date
  const slotsByDate: Record<string, typeof emptySlots> = {}
  for (const slot of emptySlots) {
    const key = slot.date
    if (!slotsByDate[key]) slotsByDate[key] = []
    slotsByDate[key].push(slot)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Content Buffer</h3>
        <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
      </div>

      <div className="p-4">
        {/* Health + percentage */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.bgColor}`}>
            <HealthIcon className={`w-5 h-5 ${cfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">
                {buffer.filled_slots} of {buffer.total_slots} slots filled
              </span>
              <span className={`text-lg font-bold ${cfg.color}`}>{buffer.fill_percent}%</span>
            </div>
            {/* Progress bar */}
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${cfg.barColor}`}
                style={{ width: `${Math.max(buffer.fill_percent, 2)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Human explanation */}
        <div className="flex items-start gap-2 px-3 py-2 bg-gray-50 rounded-lg mb-3">
          <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
          <p className="text-xs text-gray-500 leading-relaxed">{cfg.message}</p>
        </div>

        {/* Empty slots grouped by date */}
        {Object.keys(slotsByDate).length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Empty slots to fill
            </p>
            <div className="space-y-2 max-h-[160px] overflow-y-auto">
              {Object.entries(slotsByDate).slice(0, 5).map(([date, slots]) => (
                <div key={date} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 min-w-[80px]">
                    <Calendar className="w-3 h-3 text-gray-300" />
                    <span className="text-xs font-medium text-gray-600">{formatSlotDate(date)}</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {slots.map((slot, i) => (
                      <span
                        key={i}
                        className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
                          slot.content_type === 'reel'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-purple-50 text-purple-600'
                        }`}
                      >
                        {slot.content_type} @ {slot.time}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
