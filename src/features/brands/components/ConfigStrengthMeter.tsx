import type { NicheConfig } from '../types/niche-config'
import {
  getConfigStrength,
  getStrengthLabel,
  getStrengthBarColor,
  getStrengthPercent,
} from '../types/niche-config'

interface ConfigStrengthMeterProps {
  config: NicheConfig
}

export function ConfigStrengthMeter({ config }: ConfigStrengthMeterProps) {
  const strength = getConfigStrength(config)
  const label = getStrengthLabel(strength)
  const barColor = getStrengthBarColor(strength)
  const percent = getStrengthPercent(strength)

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">Configuration Strength</span>
        <span className={`text-sm font-semibold uppercase ${
          strength === 'basic' ? 'text-red-600' :
          strength === 'good' ? 'text-yellow-600' :
          'text-green-600'
        }`}>
          {strength}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}
