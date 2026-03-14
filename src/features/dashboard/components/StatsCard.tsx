import { TrendingUp, TrendingDown } from 'lucide-react'

export function StatsCard({ label, value, sub, change }: { label: string; value: string; sub?: string; change?: number | null }) {
  const hasChange = change !== undefined
  const isPositive = change != null && change >= 0
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums text-gray-900">{value}</div>
      {hasChange ? (
        change != null ? (
          <div className={`flex items-center gap-0.5 mt-1 text-[11px] font-semibold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
            {isPositive
              ? <TrendingUp className="w-3 h-3 shrink-0" />
              : <TrendingDown className="w-3 h-3 shrink-0" />}
            <span>{isPositive ? '+' : ''}{change}% vs last week</span>
          </div>
        ) : (
          <div className="flex items-center gap-0.5 mt-1 text-[11px] font-semibold text-gray-400">
            <span>0% vs last week</span>
          </div>
        )
      ) : sub ? (
        <div className="text-[11px] text-gray-400 mt-1">{sub}</div>
      ) : null}
    </div>
  )
}
