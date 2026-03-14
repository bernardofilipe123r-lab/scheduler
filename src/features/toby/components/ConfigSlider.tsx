export function ConfigSlider({
  label,
  desc,
  value,
  onChange,
  min,
  max,
  step,
  format,
  disabled,
}: {
  label: string
  desc: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  format?: (v: number) => string
  disabled?: boolean
}) {
  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm font-semibold text-gray-900">{format ? format(value) : value}</span>
      </div>
      <p className="text-xs text-gray-400 mb-2">{desc}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
      />
    </div>
  )
}
