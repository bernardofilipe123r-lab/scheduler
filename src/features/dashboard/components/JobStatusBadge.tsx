export function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    completed: { bg: 'bg-green-50', text: 'text-green-600', label: 'Completed' },
    generating: { bg: 'bg-orange-50', text: 'text-orange-600', label: 'Generating' },
    pending: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Pending' },
    failed: { bg: 'bg-red-50', text: 'text-red-600', label: 'Failed' },
    cancelled: { bg: 'bg-gray-100', text: 'text-gray-400', label: 'Cancelled' },
    scheduled: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Scheduled' },
  }
  const s = map[status] || { bg: 'bg-gray-100', text: 'text-gray-500', label: status }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}
