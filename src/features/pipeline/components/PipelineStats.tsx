import { Loader2, Clock, CalendarCheck, Globe, XCircle } from 'lucide-react'
import { useTobyBuffer } from '@/features/toby'
import type { PipelineStats as Stats } from '../model/types'

function formatContentUntilDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDate()
  const month = d.toLocaleString('en-US', { month: 'long' })
  const suffix = day === 1 || day === 21 || day === 31 ? 'st'
    : day === 2 || day === 22 ? 'nd'
    : day === 3 || day === 23 ? 'rd'
    : 'th'
  return `${day}${suffix} ${month}`
}

function getContentUntilDate(buffer: { empty_slots: Array<{ date: string }>; buffer_days: number; fill_percent: number } | undefined): string | null {
  if (!buffer || buffer.buffer_days === 0) return null
  if (buffer.fill_percent <= 0) return null

  if (buffer.empty_slots.length === 0) {
    const end = new Date()
    end.setDate(end.getDate() + buffer.buffer_days)
    return formatContentUntilDate(end.toISOString().slice(0, 10))
  }

  const sortedDates = [...new Set(buffer.empty_slots.map(s => s.date))].sort()
  const firstGap = sortedDates[0]
  const gapDate = new Date(firstGap + 'T12:00:00')
  gapDate.setDate(gapDate.getDate() - 1)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (gapDate < today) return null
  return formatContentUntilDate(gapDate.toISOString().slice(0, 10))
}

interface Props {
  stats: Stats | undefined
  isLoading: boolean
}

export function PipelineStats({ stats, isLoading }: Props) {
  const { data: buffer } = useTobyBuffer()
  const contentUntil = getContentUntilDate(buffer)
  const approvalRate = stats?.rate ?? 0
  const dasharray = `${approvalRate}, 100`

  if (isLoading) {
    return <div className="h-[72px] rounded-2xl bg-gray-100 animate-pulse" />
  }

  return (
    <div className="space-y-3">
      {contentUntil && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CalendarCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-700">
            You have content until {contentUntil}
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5">
        <div className="grid grid-cols-6 divide-x divide-gray-100">

          {/* Generating */}
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <Loader2 className="w-[18px] h-[18px] text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{stats?.generating ?? 0}</p>
              <p className="text-[11px] text-gray-400 font-medium mt-0.5">Generating</p>
            </div>
          </div>

          {/* Pending Review */}
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-amber-50/40">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Clock className="w-[18px] h-[18px] text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{stats?.pending_review ?? 0}</p>
              <p className="text-[11px] text-amber-600 font-semibold mt-0.5">Pending Review</p>
            </div>
          </div>

          {/* Scheduled */}
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <CalendarCheck className="w-[18px] h-[18px] text-indigo-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{stats?.scheduled ?? 0}</p>
              <p className="text-[11px] text-gray-400 font-medium mt-0.5">Scheduled</p>
            </div>
          </div>

          {/* Published */}
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
              <Globe className="w-[18px] h-[18px] text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{stats?.published ?? 0}</p>
              <p className="text-[11px] text-gray-400 font-medium mt-0.5">Published</p>
            </div>
          </div>

          {/* Rejected */}
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <XCircle className="w-[18px] h-[18px] text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{stats?.rejected ?? 0}</p>
              <p className="text-[11px] text-gray-400 font-medium mt-0.5">Rejected</p>
            </div>
          </div>

          {/* Approval Rate */}
          <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl">
            <div className="w-9 h-9 rounded-xl bg-[#f0f7fa] flex items-center justify-center shrink-0">
              <svg width="22" height="22" viewBox="0 0 36 36" className="text-[#006d8f]">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={dasharray} strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">
                {approvalRate}<span className="text-base text-gray-400 font-medium">%</span>
              </p>
              <p className="text-[11px] text-gray-400 font-medium mt-0.5">Approval</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
