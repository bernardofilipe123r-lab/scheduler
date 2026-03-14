export function ToggleRow({
  label,
  desc,
  icon,
  enabled,
  onChange,
}: {
  label: string
  desc: string
  icon?: React.ReactNode
  enabled: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-3">
        {icon && (
          <div className={`${enabled ? 'text-blue-600' : 'text-gray-300'} transition-colors`}>
            {icon}
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-gray-700">{label}</p>
          <p className="text-xs text-gray-400">{desc}</p>
        </div>
      </div>
      <button
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          enabled ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
