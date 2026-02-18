interface ChipSelectProps {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  allowCustom?: boolean
}

export function ChipSelect({ options, selected, onChange }: ChipSelectProps) {
  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option))
    } else {
      onChange([...selected, option])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              isSelected
                ? 'bg-primary-500 text-white border-primary-500'
                : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
