import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  Download,
  Calendar,
  Edit2,
  Copy,
  Play,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Check,
  Clock,
  CalendarClock,
  Youtube,
  Pencil,
  Save,
  X,
  Music,
  Shuffle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  useJob,
  useDeleteJob,
  useRegenerateJob,
  useRegenerateBrand,
  useUpdateJob,
  useJobNextSlots,
  useUpdateBrandStatus,
  useUpdateBrandContent,
  useRetryJob,
  useChangeJobMusic,
} from '@/features/jobs'
import { useAutoScheduleReel } from '@/features/scheduling'
import { useTrendingMusic } from '@/features/brands/api/use-trending-music'
import { BrandBadge, getBrandLabel, getBrandColor } from '@/features/brands'
import { StatusBadge, JobDetailSkeleton, Modal } from '@/shared/components'
import { createFacebookCaption } from '@/shared/lib/captionUtils'
import { PostJobDetail } from './PostJobDetail'
import { ThreadsJobDetail } from './ThreadsJobDetail'
import type { BrandName, BrandOutput } from '@/shared/types'
import { getBrandOutputsList } from '@/shared/types'

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const id = jobId || ''

  // ── Data fetching ─────────────────────────────────────────────────
  const { data: job, isLoading, error } = useJob(id)
  const { data: nextSlots } = useJobNextSlots(id)
  const deleteJob = useDeleteJob()
  const regenerateJob = useRegenerateJob()
  const regenerateBrand = useRegenerateBrand()
  const updateJob = useUpdateJob()
  const updateBrandStatus = useUpdateBrandStatus()
  const updateBrandContent = useUpdateBrandContent()
  const autoSchedule = useAutoScheduleReel()
  const retryJob = useRetryJob()
  const changeMusic = useChangeJobMusic()
  const { data: trendingMusicData } = useTrendingMusic()
  const trendingTracks = trendingMusicData?.tracks ?? []

  // ── Modal states ──────────────────────────────────────────────────
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [editTitleModalOpen, setEditTitleModalOpen] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [customScheduleModalOpen, setCustomScheduleModalOpen] = useState(false)
  const [customScheduleDate, setCustomScheduleDate] = useState('')
  const [customScheduleTime, setCustomScheduleTime] = useState('')

  // ── Loading states ────────────────────────────────────────────────
  const [schedulingBrand, setSchedulingBrand] = useState<BrandName | null>(null)
  const [schedulingAll, setSchedulingAll] = useState(false)
  const [schedulingCustom, setSchedulingCustom] = useState(false)

  // ── Per-brand title editing ───────────────────────────────────────
  const [editingTitleBrand, setEditingTitleBrand] = useState<string | null>(null)
  const [editingTitleValue, setEditingTitleValue] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)

  // ── Per-brand schedule modal ──────────────────────────────────────
  const [brandScheduleModalBrand, setBrandScheduleModalBrand] = useState<BrandName | null>(null)
  const [brandScheduleMode, setBrandScheduleMode] = useState<'auto' | 'custom'>('auto')
  const [brandCustomDate, setBrandCustomDate] = useState('')
  const [brandCustomTime, setBrandCustomTime] = useState('')

  // ── Dismiss-all confirmation ──────────────────────────────────────
  const [dismissAllModalOpen, setDismissAllModalOpen] = useState(false)
  const [pendingDismissBrand, setPendingDismissBrand] = useState<BrandName | null>(null)

  // ── Prompt details expand per card ────────────────────────────────
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set())

  // ── Derived state ─────────────────────────────────────────────────
  const isGenerating = job?.status === 'generating' || job?.status === 'pending'
  const isFormatB = job?.variant === 'format_b'

  const isStuck = useMemo(() => {
    if (!job || !isGenerating || !job.updated_at) return false
    const updatedAt = new Date(job.updated_at).getTime()
    return updatedAt < Date.now() - 10 * 60 * 1000
  }, [job, isGenerating])

  const totalContentItems = useMemo(() => {
    if (!job) return { total: 0, dismissed: 0, active: 0 }
    const allOutputs = Object.entries(job.brand_outputs || {})
      .flatMap(([, o]) => Array.isArray(o) ? o : [o])
    const dismissed = allOutputs.filter(o => o.status === 'dismissed').length
    return { total: allOutputs.length, dismissed, active: allOutputs.length - dismissed }
  }, [job])

  const formatDisplayTitle = (raw: string) => {
    const singleLine = raw.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    if (singleLine === singleLine.toUpperCase() && singleLine.length > 1) {
      return singleLine.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    }
    return singleLine
  }

  const isAutoGenerated = job ? !job.fixed_title && (job.brands?.length || 0) > 1 : false

  const completedCount = job ? Object.entries(job.brand_outputs || {})
    .flatMap(([, o]) => Array.isArray(o) ? o : [o])
    .filter(o => o.status === 'completed').length : 0
  const dismissedCount = job ? Object.entries(job.brand_outputs || {})
    .flatMap(([, o]) => Array.isArray(o) ? o : [o])
    .filter(o => o.status === 'dismissed').length : 0
  const scheduledCount = job ? Object.entries(job.brand_outputs || {})
    .flatMap(([, o]) => Array.isArray(o) ? o : [o])
    .filter(o => o.status === 'scheduled').length : 0

  const allScheduled = job ? Object.entries(job.brand_outputs || {})
    .flatMap(([, o]) => Array.isArray(o) ? o : [o])
    .filter(o => o.status === 'completed' || o.status === 'scheduled')
    .every(o => o.status === 'scheduled') : false

  const scheduleButtonLabel = completedCount === 1
    ? 'Schedule Reel'
    : scheduledCount > 0
      ? `Schedule ${completedCount} Remaining`
      : `Schedule All (${completedCount})`

  // ── Handlers ──────────────────────────────────────────────────────

  const startEditingTitle = (brand: string) => {
    const output = job?.brand_outputs?.[brand as BrandName]
    setEditingTitleValue(output?.title || job?.title || '')
    setEditingTitleBrand(brand)
  }

  const saveBrandTitle = async () => {
    if (!editingTitleBrand || !job) return
    setSavingTitle(true)
    try {
      await updateBrandContent.mutateAsync({
        id: job.id,
        brand: editingTitleBrand as BrandName,
        data: { title: editingTitleValue },
      })
      toast.success('Title updated!')
      setEditingTitleBrand(null)
    } catch {
      toast.error('Failed to update title')
    } finally {
      setSavingTitle(false)
    }
  }

  const handleDismissBrand = async (brand: BrandName) => {
    if (!job) return
    if (totalContentItems.active <= 1) {
      setPendingDismissBrand(brand)
      setDismissAllModalOpen(true)
      return
    }
    try {
      await updateBrandStatus.mutateAsync({ id, brand, status: 'dismissed' })
      toast.success(`${getBrandLabel(brand)} removed from scheduling`)
    } catch {
      toast.error('Failed to dismiss brand')
    }
  }

  const handleConfirmDismissAll = async () => {
    if (!pendingDismissBrand) return
    try {
      await deleteJob.mutateAsync(id)
      toast.success('All content dismissed — job deleted')
      navigate('/history')
    } catch {
      toast.error('Failed to delete job')
    } finally {
      setDismissAllModalOpen(false)
      setPendingDismissBrand(null)
    }
  }

  const handleRestoreBrand = async (brand: BrandName) => {
    if (!job) return
    try {
      await updateBrandStatus.mutateAsync({ id, brand, status: 'completed' })
      toast.success(`${getBrandLabel(brand)} restored`)
    } catch {
      toast.error('Failed to restore brand')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteJob.mutateAsync(id)
      toast.success('Job deleted')
      navigate('/history')
    } catch {
      toast.error('Failed to delete job')
    }
  }

  const handleRegenerateBrand = async (brand: BrandName) => {
    try {
      await regenerateBrand.mutateAsync({ id, brand })
      toast.success(`Regenerating ${getBrandLabel(brand)}`)
    } catch {
      toast.error('Failed to regenerate')
    }
  }

  const openEditTitleModal = () => {
    setEditedTitle(job?.title || '')
    setEditTitleModalOpen(true)
  }

  const handleSaveTitle = async () => {
    if (!editedTitle.trim()) {
      toast.error('Title cannot be empty')
      return
    }
    try {
      await updateJob.mutateAsync({ id, data: { title: editedTitle } })
      setEditTitleModalOpen(false)
      toast.success('Title updated')
      await regenerateJob.mutateAsync(id)
      toast.success('Regenerating with new title')
    } catch {
      toast.error('Failed to update title')
    }
  }

  const openBrandScheduleModal = (brand: BrandName) => {
    setBrandScheduleModalBrand(brand)
    setBrandScheduleMode('auto')
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setBrandCustomDate(tomorrow.toISOString().split('T')[0])
    setBrandCustomTime('12:00')
  }

  const confirmBrandSchedule = () => {
    if (!brandScheduleModalBrand || !job) return
    const output = job.brand_outputs?.[brandScheduleModalBrand]
    if (!output) return

    let customTime: string | undefined
    if (brandScheduleMode === 'custom' && brandCustomDate && brandCustomTime) {
      const dt = new Date(`${brandCustomDate}T${brandCustomTime}:00`)
      if (dt <= new Date()) {
        toast.error('Please select a future date and time')
        return
      }
      customTime = dt.toISOString()
    }

    const brand = brandScheduleModalBrand
    setBrandScheduleModalBrand(null)
    handleScheduleBrand(brand, output, customTime)
  }

  const handleScheduleBrand = async (brand: BrandName, output: BrandOutput, customScheduleTime?: string) => {
    if (!output.reel_id || !job) {
      toast.error('No reel to schedule')
      return
    }
    const caption = output.caption || `${job.title}\n\nGenerated content for ${brand}`
    setSchedulingBrand(brand)
    try {
      await autoSchedule.mutateAsync({
        brand,
        reel_id: output.reel_id,
        variant: job.variant,
        caption,
        yt_title: output.yt_title,
        yt_thumbnail_path: output.yt_thumbnail_path,
        video_path: output.video_path,
        thumbnail_path: output.thumbnail_path,
        platforms: job.platforms,
        ...(customScheduleTime ? { scheduled_time: customScheduleTime } : {}),
      })
      await updateBrandStatus.mutateAsync({ id, brand, status: 'scheduled' })
      toast.success(`${getBrandLabel(brand)} scheduled!`)
    } catch {
      toast.error('Failed to schedule')
    } finally {
      setSchedulingBrand(null)
    }
  }

  const handleScheduleAll = async () => {
    if (!job) return
    const schedulable: { brand: BrandName; output: BrandOutput }[] = []
    for (const brand of job.brands || []) {
      const outputs = getBrandOutputsList(job.brand_outputs, brand)
      for (const output of outputs) {
        if (output.status === 'completed') schedulable.push({ brand: brand as BrandName, output })
      }
    }
    if (schedulable.length === 0) { toast.error('No completed brands to schedule'); return }

    setSchedulingAll(true)
    let scheduled = 0, failed = 0
    for (const { brand, output } of schedulable) {
      if (output?.reel_id) {
        try {
          const caption = output.caption || `${job.title}\n\nGenerated content for ${brand}`
          await autoSchedule.mutateAsync({
            brand, reel_id: output.reel_id, variant: job.variant, caption,
            yt_title: output.yt_title, yt_thumbnail_path: output.yt_thumbnail_path,
            video_path: output.video_path, thumbnail_path: output.thumbnail_path,
            platforms: job.platforms,
          })
          await updateBrandStatus.mutateAsync({ id, brand, status: 'scheduled' })
          scheduled++
        } catch (error) {
          console.error(`Failed to schedule ${brand}:`, error)
          failed++
        }
      }
    }
    setSchedulingAll(false)
    if (scheduled > 0) {
      const message = failed > 0
        ? `${scheduled} reel${scheduled !== 1 ? 's' : ''} scheduled! ${failed} failed.`
        : scheduled === 1 ? 'Reel scheduled successfully!' : `All ${scheduled} reels scheduled!`
      toast.success(message, { duration: 4000 })
      setTimeout(() => navigate('/calendar'), 1500)
    } else if (failed > 0) {
      toast.error('Failed to schedule brands')
    }
  }

  const openCustomScheduleModal = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setCustomScheduleDate(tomorrow.toISOString().split('T')[0])
    setCustomScheduleTime('10:00')
    setCustomScheduleModalOpen(true)
  }

  const isCustomScheduleInPast = (() => {
    if (!customScheduleDate || !customScheduleTime) return false
    return new Date(`${customScheduleDate}T${customScheduleTime}`) <= new Date()
  })()

  const handleCustomScheduleAll = async () => {
    if (!job || !customScheduleDate || !customScheduleTime) { toast.error('Please select a date and time'); return }
    if (isCustomScheduleInPast) { toast.error('Cannot schedule in the past'); return }

    const schedulable: { brand: BrandName; output: BrandOutput }[] = []
    for (const brand of job.brands || []) {
      const outputs = getBrandOutputsList(job.brand_outputs, brand)
      for (const output of outputs) {
        if (output.status === 'completed') schedulable.push({ brand: brand as BrandName, output })
      }
    }
    if (schedulable.length === 0) { toast.error('No completed brands to schedule'); return }

    setSchedulingCustom(true)
    let scheduled = 0, failed = 0
    const baseDateTime = new Date(`${customScheduleDate}T${customScheduleTime}`)

    for (let i = 0; i < schedulable.length; i++) {
      const { brand, output } = schedulable[i]
      if (output?.reel_id) {
        try {
          const caption = output.caption || `${job.title}\n\nGenerated content for ${brand}`
          const scheduledTime = new Date(baseDateTime)
          scheduledTime.setHours(scheduledTime.getHours() + i)
          await autoSchedule.mutateAsync({
            brand, reel_id: output.reel_id, variant: job.variant, caption,
            yt_title: output.yt_title, yt_thumbnail_path: output.yt_thumbnail_path,
            video_path: output.video_path, thumbnail_path: output.thumbnail_path,
            scheduled_time: scheduledTime.toISOString(), platforms: job.platforms,
          })
          await updateBrandStatus.mutateAsync({ id, brand, status: 'scheduled' })
          scheduled++
        } catch (error) {
          console.error(`Failed to schedule ${brand}:`, error)
          failed++
        }
      }
    }
    setSchedulingCustom(false)
    setCustomScheduleModalOpen(false)
    if (scheduled > 0) {
      const message = failed > 0
        ? `${scheduled} reel${scheduled !== 1 ? 's' : ''} scheduled for ${customScheduleDate}! ${failed} failed.`
        : scheduled === 1 ? `Reel scheduled for ${customScheduleDate}!` : `All ${scheduled} reels scheduled for ${customScheduleDate}!`
      toast.success(message, { duration: 4000 })
      setTimeout(() => navigate('/calendar'), 1500)
    } else if (failed > 0) {
      toast.error('Failed to schedule brands')
    }
  }

  const handleDownload = (_brand: BrandName, output: BrandOutput) => {
    if (output.video_path) {
      const link = document.createElement('a')
      link.href = output.video_path
      link.download = `${_brand}_${output.reel_id || 'reel'}.mp4`
      link.click()
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied!`)
  }

  const togglePromptDetails = (key: string) => {
    setExpandedPrompts(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ── Loading / Error / Delegation ──────────────────────────────────

  if (isLoading) return <JobDetailSkeleton />

  if (error || !job) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Job not found</h2>
        <p className="text-sm text-gray-400 mb-6">It may have been deleted or doesn't exist.</p>
        <button onClick={() => navigate('/history')} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:brightness-110 transition">
          Back to Jobs
        </button>
      </div>
    )
  }

  if (job.variant === 'post') return <PostJobDetail job={job} />
  if (job.variant === 'threads') return <ThreadsJobDetail job={job} />

  // ── Variant label for display ─────────────────────────────────────
  const variantBadge = isFormatB
    ? { label: 'Format B', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100' }
    : job.variant === 'dark'
      ? { label: 'Dark', bg: 'bg-stone-50', text: 'text-stone-600', border: 'border-stone-100' }
      : { label: 'Light', bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-100' }

  /* ═════════════════════════════════════════════════════════════════════
     RENDER
     ═════════════════════════════════════════════════════════════════════ */

  return (
    <div className="max-w-5xl mx-auto space-y-4">

      {/* ── Navigation Bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/history')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          {!isAutoGenerated && (
            <button
              onClick={openEditTitleModal}
              disabled={isGenerating || allScheduled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-40"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit Title
            </button>
          )}
          <button
            onClick={() => setDeleteModalOpen(true)}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-500 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>

      {/* ── Hero Section ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5">
          {/* Meta row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-[11px] font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
              {job.id}
            </span>
            <StatusBadge status={job.status} size="md" />
            <span className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${variantBadge.bg} ${variantBadge.text} border ${variantBadge.border}`}>
              {variantBadge.label}
            </span>
            {job.content_count && job.content_count > 1 && (
              <span className="text-[11px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                {job.content_count}x per brand
              </span>
            )}
          </div>

          {/* Title */}
          {isAutoGenerated ? (
            <>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">Auto-Generated Viral Reels</h1>
              <p className="text-sm text-gray-400 mt-1">
                {job.brands.length} brand{job.brands.length !== 1 ? 's' : ''} · each with unique content
                {dismissedCount > 0 && <span className="text-gray-500"> · {dismissedCount} dismissed</span>}
              </p>
            </>
          ) : (
            <h1 className="text-xl font-bold text-gray-900 leading-tight">
              {formatDisplayTitle(job.title)}
            </h1>
          )}

          <p className="text-xs text-gray-400 mt-1.5">
            {format(new Date(job.created_at), 'MMM d, yyyy · h:mm a')}
          </p>

          {/* Source content (non-auto-generated only) */}
          {!isAutoGenerated && job.content_lines && job.content_lines.length > 0 && (
            <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Source Content</p>
              {isFormatB ? (
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{job.content_lines.join('\n')}</p>
              ) : (
                <ul className="list-disc list-inside space-y-0.5 text-sm text-gray-600">
                  {job.content_lines.map((line, idx) => <li key={idx}>{line}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* Dark variant AI prompt */}
          {job.variant === 'dark' && job.ai_prompt && (
            <div className="mt-3 bg-violet-50 rounded-lg p-3 border border-violet-100">
              <p className="text-xs font-semibold text-violet-700 mb-0.5">AI Background Prompt</p>
              <p className="text-sm text-violet-600 italic">{job.ai_prompt}</p>
            </div>
          )}
        </div>

        {/* Error banner (attached to hero) */}
        {job.error_message && (
          <div className="px-6 pb-5">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700">Error</p>
                <p className="text-sm text-red-600 break-words">{job.error_message}</p>
              </div>
              {job.status === 'failed' && (
                <button
                  onClick={() => retryJob.mutate(id, {
                    onSuccess: () => toast.success('Retrying incomplete brands...'),
                    onError: (err: any) => toast.error(err?.message || 'Failed to retry'),
                  })}
                  disabled={retryJob.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded-md hover:brightness-110 transition flex-shrink-0 disabled:opacity-50"
                >
                  {retryJob.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Stuck Banner ───────────────────────────────────────────── */}
      {isStuck && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Generation appears stuck</p>
              <p className="text-xs text-amber-600">No progress for over 10 minutes. Click Retry to resume.</p>
            </div>
          </div>
          <button
            onClick={() => retryJob.mutate(id, {
              onSuccess: () => toast.success('Retrying generation...'),
              onError: (err: any) => toast.error(err?.message || 'Failed to retry'),
            })}
            disabled={retryJob.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:brightness-110 transition disabled:opacity-50 flex-shrink-0"
          >
            {retryJob.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Retry
          </button>
        </div>
      )}

      {/* ── Action Toolbar (Schedule + Music) ──────────────────────── */}
      {!isGenerating && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {/* Schedule row */}
          {completedCount > 0 && (
            <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-600" />
                <span className="text-sm font-semibold text-gray-900">Schedule</span>
                <span className="text-xs text-gray-400">
                  {completedCount} ready{scheduledCount > 0 ? ` · ${scheduledCount} scheduled` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleScheduleAll}
                  disabled={schedulingAll || schedulingCustom || allScheduled}
                  className="inline-flex items-center gap-1.5 px-3.5 py-[7px] text-xs font-semibold text-white bg-teal-600 rounded-lg hover:brightness-110 transition disabled:opacity-50"
                >
                  {schedulingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : allScheduled ? <Check className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
                  {allScheduled ? 'All Scheduled' : scheduleButtonLabel}
                </button>
                {!allScheduled && (
                  <button
                    onClick={openCustomScheduleModal}
                    disabled={schedulingAll || schedulingCustom}
                    className="inline-flex items-center gap-1.5 px-3 py-[7px] text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    <CalendarClock className="w-3.5 h-3.5" />
                    Custom
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Music row */}
          <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-teal-600" />
              <span className="text-sm font-semibold text-gray-900">Music</span>
              <span className="text-xs text-gray-400">
                {job.music_source === 'trending_random' ? 'Random Trending' :
                 job.music_source === 'trending_pick' ? 'Trending Track' : 'No Music'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={job.music_source ?? 'none'}
                onChange={(e) => changeMusic.mutate(
                  { id, musicTrackId: null, musicSource: e.target.value },
                  {
                    onSuccess: () => toast.success(e.target.value === 'none' ? 'Music removed — regenerating...' : 'Music changed — regenerating...'),
                    onError: () => toast.error('Failed to change music'),
                  },
                )}
                disabled={changeMusic.isPending || allScheduled}
                className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              >
                <option value="none">No Music</option>
                <option value="trending_random">Random Trending</option>
                {trendingTracks.length > 0 && <option value="trending_pick">Pick from Trending</option>}
              </select>
              {job.music_source === 'trending_random' && (
                <button
                  onClick={() => changeMusic.mutate(
                    { id, musicTrackId: null, musicSource: 'trending_random' },
                    {
                      onSuccess: () => toast.success('New random trending music — regenerating...'),
                      onError: () => toast.error('Failed to re-roll music'),
                    },
                  )}
                  disabled={changeMusic.isPending || allScheduled}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-400 bg-white border border-gray-200 rounded-lg hover:text-gray-600 transition disabled:opacity-50"
                >
                  {changeMusic.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />}
                  Re-roll
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Content Cards ──────────────────────────────────────────── */}
      <div className="space-y-4">
        {job.brands?.flatMap(brand => {
          const outputs = getBrandOutputsList(job.brand_outputs, brand)
          const isMulti = outputs.length > 1
          const slot = nextSlots?.[brand]

          return outputs.map((output, contentIdx) => {
            const cardKey = `${brand}-${contentIdx}`
            const isCompleted = output.status === 'completed'
            const isScheduled = output.status === 'scheduled'
            const isFailed = output.status === 'failed'
            const isDismissed = output.status === 'dismissed'
            const isBrandGenerating = !output.status || output.status === 'generating' || output.status === 'pending'
            const brandColor = getBrandColor(brand)

            const itemFormatBData = isMulti && (job.format_b_data as any)?.content_items?.[contentIdx]
              ? (job.format_b_data as any).content_items[contentIdx]
              : job.format_b_data

            return (
              <div
                key={cardKey}
                className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-opacity ${isDismissed ? 'opacity-40' : ''}`}
              >
                {/* ── Card Header ──────────────────────────────── */}
                <div
                  className="px-5 py-3.5 flex items-center justify-between border-b border-gray-100"
                  style={{ borderLeft: `3px solid ${brandColor}` }}
                >
                  <div className="flex items-center gap-2.5">
                    <BrandBadge brand={brand} size="md" />
                    <StatusBadge status={isDismissed ? 'dismissed' : output.status} />
                    {isMulti && (
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        #{contentIdx + 1}
                      </span>
                    )}
                    {slot && !isScheduled && !isDismissed && (
                      <span className="text-[11px] text-gray-400 flex items-center gap-1 ml-1">
                        <Clock className="w-3 h-3" /> Next: {slot.formatted}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isDismissed ? (
                      <button
                        onClick={() => handleRestoreBrand(brand)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-teal-600 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 transition"
                      >
                        <RefreshCw className="w-3 h-3" /> Restore
                      </button>
                    ) : (isCompleted && !isGenerating) ? (
                      <button
                        onClick={() => handleDismissBrand(brand)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-rose-400 hover:text-rose-600 transition rounded"
                      >
                        <X className="w-3 h-3" /> Dismiss
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* ── Card Body ─────────────────────────────────── */}
                <div className="p-5">
                  {/* -- Dismissed state -- */}
                  {isDismissed && (
                    <div className="text-center py-8 text-gray-300">
                      <X className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">Dismissed — won't be scheduled</p>
                    </div>
                  )}

                  {/* -- Generating state -- */}
                  {!isDismissed && isBrandGenerating && (
                    <FormatBProgress message={output.progress_message} percent={output.progress_percent} brand={getBrandLabel(brand)} />
                  )}

                  {/* -- Failed state -- */}
                  {!isDismissed && isFailed && (
                    <div className="text-center py-10">
                      <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 mb-4">{output.error || 'Generation failed'}</p>
                      <button
                        onClick={() => handleRegenerateBrand(brand)}
                        disabled={regenerateBrand.isPending}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:brightness-110 transition disabled:opacity-50"
                      >
                        <RefreshCw className="w-4 h-4" /> Retry
                      </button>
                    </div>
                  )}

                  {/* -- Completed / Scheduled state -- */}
                  {!isDismissed && (isCompleted || isScheduled) && (
                    <div className="space-y-5">

                      {/* Per-brand AI prompt (auto-generated jobs) */}
                      {isAutoGenerated && output.ai_prompt && (
                        <div className="bg-violet-50 rounded-lg p-3 border border-violet-100">
                          <p className="text-[11px] font-semibold text-violet-600 mb-0.5">AI Prompt</p>
                          <p className="text-xs text-violet-500 italic">{output.ai_prompt}</p>
                        </div>
                      )}

                      {/* -- Media + Content Grid -- */}
                      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

                        {/* Left: Media previews (3 cols on lg) */}
                        <div className="lg:col-span-3">
                          <div className="grid grid-cols-3 gap-3">
                            {/* IG/FB Thumbnail */}
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 text-center">IG / FB</p>
                              {output.thumbnail_path ? (
                                <div className="aspect-[9/16] bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
                                  <img src={output.thumbnail_path} alt="Thumbnail" className="w-full h-full object-cover object-top" />
                                </div>
                              ) : (
                                <div className="aspect-[9/16] bg-gray-50 rounded-lg flex flex-col items-center justify-center text-gray-300 border border-gray-100">
                                  <AlertCircle className="w-6 h-6 mb-1" />
                                  <p className="text-[10px]">No thumbnail</p>
                                </div>
                              )}
                            </div>

                            {/* YouTube Thumbnail */}
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 text-center">YouTube</p>
                              {output.yt_thumbnail_path ? (
                                <div className="aspect-[9/16] bg-gray-50 rounded-lg overflow-hidden border border-gray-100">
                                  <img src={output.yt_thumbnail_path} alt="YT Thumbnail" className="w-full h-full object-cover object-top" />
                                </div>
                              ) : (
                                <div className="aspect-[9/16] bg-gray-50 rounded-lg flex flex-col items-center justify-center text-gray-300 border border-gray-100">
                                  <Youtube className="w-6 h-6 mb-1" />
                                  <p className="text-[10px]">No YT thumb</p>
                                </div>
                              )}
                            </div>

                            {/* Video */}
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5 text-center">Video</p>
                              {output.video_path ? (
                                <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden border border-gray-100">
                                  <video
                                    key={output.video_path}
                                    src={output.video_path}
                                    className="w-full h-full"
                                    style={{ objectFit: 'contain' }}
                                    controls
                                    playsInline
                                    preload="auto"
                                    controlsList="nodownload"
                                  />
                                </div>
                              ) : (
                                <div className="aspect-[9/16] bg-gray-50 rounded-lg flex flex-col items-center justify-center text-gray-300 border border-gray-100">
                                  <Play className="w-6 h-6 mb-1" />
                                  <p className="text-[10px]">No video</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Title + Content Lines (2 cols on lg) */}
                        <div className="lg:col-span-2 flex flex-col">
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 flex-1 flex flex-col">
                            {/* Title */}
                            <div className="mb-3 pb-3 border-b border-gray-200">
                              {editingTitleBrand === brand ? (
                                <div className="flex items-start gap-2">
                                  <textarea
                                    value={editingTitleValue}
                                    onChange={(e) => setEditingTitleValue(e.target.value)}
                                    rows={2}
                                    className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveBrandTitle() }
                                      if (e.key === 'Escape') setEditingTitleBrand(null)
                                    }}
                                  />
                                  <button onClick={saveBrandTitle} disabled={savingTitle} className="p-1.5 rounded hover:bg-green-50 text-green-600">
                                    {savingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                  </button>
                                  <button onClick={() => setEditingTitleBrand(null)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-semibold text-gray-900 leading-snug flex-1">
                                    {formatDisplayTitle(output.title || job.title)}
                                  </p>
                                  {(isCompleted || isScheduled) && (
                                    <button onClick={() => startEditingTitle(brand)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex-shrink-0">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Content lines */}
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Content</span>
                              <button
                                onClick={() => copyToClipboard((output.content_lines || job.content_lines || []).join('\n'), 'Content')}
                                className="p-1 rounded hover:bg-gray-200"
                              >
                                <Copy className="w-3.5 h-3.5 text-gray-400" />
                              </button>
                            </div>
                            <div className="space-y-1.5 overflow-y-auto max-h-[350px] flex-1">
                              {isFormatB ? (
                                <div className="text-sm text-gray-700 py-2 px-3 bg-white rounded-md border-l-[3px] border-teal-500 whitespace-pre-line leading-relaxed">
                                  {(output.content_lines || job.content_lines || []).join('\n')}
                                </div>
                              ) : (
                                (output.content_lines || job.content_lines || []).map((line, idx) => (
                                  <div key={idx} className="text-sm text-gray-700 py-1.5 px-2.5 bg-white rounded-md border-l-[3px] border-teal-500">
                                    <span className="text-xs font-mono text-gray-400 mr-1.5">{idx + 1}.</span>
                                    {line}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* -- AI Prompt Details (Format B) -- */}
                      {isFormatB && itemFormatBData && (
                        <div className="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                          <button
                            onClick={() => togglePromptDetails(cardKey)}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-gray-500 hover:bg-gray-100/60 transition"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded">AI</span>
                              <span>DeepSeek & {
                                (itemFormatBData as any)?.image_service === 'freepik' ? 'Freepik'
                                : (itemFormatBData as any)?.image_service === 'searchapi' ? 'SearchApi'
                                : 'DeAPI'
                              } Prompt Details</span>
                            </div>
                            {expandedPrompts.has(cardKey) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          {expandedPrompts.has(cardKey) && (
                            <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                              {(itemFormatBData as any).deepseek_response && (
                                <div className="mt-3">
                                  <p className="text-[10px] font-semibold text-teal-600 mb-1">DeepSeek Full Response</p>
                                  <pre className="text-[11px] text-gray-600 bg-white rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-[250px] overflow-y-auto font-mono border border-gray-100">
                                    {(itemFormatBData as any).deepseek_response}
                                  </pre>
                                </div>
                              )}
                              {((itemFormatBData as any).images || []).length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-green-600 mb-1">
                                    {(itemFormatBData as any)?.image_service === 'freepik' ? 'Freepik Image Prompts:'
                                      : (itemFormatBData as any)?.image_service === 'searchapi' ? 'SearchApi Image Queries:'
                                      : 'DeAPI Image Prompts (Flux1schnell):'}
                                  </p>
                                  <div className="space-y-1.5">
                                    {((itemFormatBData as any).images as { query: string }[]).map((img, idx) => (
                                      <div key={idx} className="text-[11px] bg-white rounded-md p-2 border-l-[3px] border-green-500 border border-gray-100">
                                        <span className="text-green-600 font-medium">Image {idx + 1}:</span>
                                        <span className="text-gray-600 ml-1.5">{img.query}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {(itemFormatBData as any).thumbnail_image?.query && (
                                <div>
                                  <p className="text-[10px] font-semibold text-amber-600 mb-1">Thumbnail Image Prompt</p>
                                  <div className="text-[11px] bg-white rounded-md p-2 border-l-[3px] border-amber-500 border border-gray-100 text-gray-600">
                                    {(itemFormatBData as any).thumbnail_image.query}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* -- Captions Section -- */}
                      {output.caption && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Instagram Caption */}
                          {(!job.platforms || job.platforms.includes('instagram')) && (
                            <CaptionCard
                              platform="Instagram"
                              color="bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400"
                              content={output.caption}
                              onCopy={() => copyToClipboard(output.caption!, 'Instagram Caption')}
                            />
                          )}

                          {/* Facebook Caption */}
                          {(!job.platforms || job.platforms.includes('facebook')) && (
                            <CaptionCard
                              platform="Facebook"
                              color="bg-blue-600"
                              subtitle="shorter"
                              content={createFacebookCaption(output.caption)}
                              onCopy={() => copyToClipboard(createFacebookCaption(output.caption!), 'Facebook Caption')}
                            />
                          )}

                          {/* YouTube Shorts */}
                          {(!job.platforms || job.platforms.includes('youtube')) && (
                            <div className="bg-white rounded-lg p-4 border border-gray-100 md:col-span-2">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="w-2 h-2 rounded-full bg-red-600" />
                                <span className="text-sm font-medium text-gray-700">YouTube Shorts</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Title</span>
                                    <button onClick={() => copyToClipboard(output.yt_title || job.title, 'YouTube Title')} className="p-1 rounded hover:bg-gray-50">
                                      <Copy className="w-3 h-3 text-gray-400" />
                                    </button>
                                  </div>
                                  <p className="text-sm font-medium text-gray-900 bg-gray-50 rounded-md px-2.5 py-1.5">
                                    {output.yt_title || job.title}
                                  </p>
                                </div>
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Description</span>
                                    <button onClick={() => copyToClipboard(createFacebookCaption(output.caption!), 'YouTube Description')} className="p-1 rounded hover:bg-gray-50">
                                      <Copy className="w-3 h-3 text-gray-400" />
                                    </button>
                                  </div>
                                  <div className="max-h-[100px] overflow-y-auto bg-gray-50 rounded-md px-2.5 py-1.5">
                                    <p className="text-sm text-gray-600 whitespace-pre-line">{createFacebookCaption(output.caption!)}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* -- Scheduled Info -- */}
                      {isScheduled && output.scheduled_time && (
                        <div className="bg-teal-50 rounded-lg p-3.5 flex items-center gap-3 border border-teal-100">
                          <Check className="w-5 h-5 text-teal-600" />
                          <div>
                            <p className="text-sm font-semibold text-teal-700">Scheduled</p>
                            <p className="text-xs text-teal-600">{format(new Date(output.scheduled_time), 'MMMM d, yyyy h:mm a')}</p>
                          </div>
                        </div>
                      )}

                      {/* -- Action Buttons -- */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleDownload(brand, output)}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                        >
                          <Download className="w-3.5 h-3.5" /> Download
                        </button>

                        {isCompleted && (
                          <>
                            <button
                              onClick={() => openBrandScheduleModal(brand)}
                              disabled={schedulingBrand === brand || isGenerating}
                              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-green-600 rounded-lg hover:brightness-110 shadow-sm transition disabled:opacity-50"
                            >
                              {schedulingBrand === brand ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
                              Schedule
                            </button>
                            <button
                              onClick={() => handleRegenerateBrand(brand)}
                              disabled={regenerateBrand.isPending || isGenerating}
                              className="flex items-center justify-center p-2 text-xs text-gray-400 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-600 transition disabled:opacity-50"
                              title="Regenerate"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        {isScheduled && (
                          <>
                            <button
                              onClick={() => copyToClipboard(output.caption || '', 'Caption')}
                              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                            >
                              <Copy className="w-3.5 h-3.5" /> Copy Caption
                            </button>
                            <button
                              onClick={() => copyToClipboard(job.title || '', 'Title')}
                              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                            >
                              <Copy className="w-3.5 h-3.5" /> Copy Title
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* -- Waiting state -- */}
                  {!isDismissed && !isBrandGenerating && !isFailed && !isCompleted && !isScheduled && (
                    <div className="text-center py-10 text-gray-400 text-sm">
                      Waiting to generate...
                    </div>
                  )}
                </div>
              </div>
            )
          })
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
         MODALS
         ═══════════════════════════════════════════════════════════════ */}

      {/* Dismiss-All → Delete Confirmation */}
      <Modal
        isOpen={dismissAllModalOpen}
        onClose={() => { setDismissAllModalOpen(false); setPendingDismissBrand(null) }}
        title="Delete Job?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            This is the last remaining content. Dismissing it will <span className="font-semibold text-gray-700">delete the entire job</span> and all generated media.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setDismissAllModalOpen(false); setPendingDismissBrand(null) }}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDismissAll}
              disabled={deleteJob.isPending}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-lg hover:brightness-110 transition disabled:opacity-50"
            >
              {deleteJob.isPending ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Deleting...</span> : 'Delete Job'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Job"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Are you sure? This will delete all generated media.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteModalOpen(false)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button onClick={handleDelete} disabled={deleteJob.isPending} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-lg hover:brightness-110 transition disabled:opacity-50">
              {deleteJob.isPending ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Deleting...</span> : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Title Modal */}
      <Modal
        isOpen={editTitleModalOpen}
        onClose={() => setEditTitleModalOpen(false)}
        title="Edit Title"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">New Title</label>
            <textarea
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
              placeholder="Enter new title..."
            />
          </div>
          <p className="text-xs text-gray-400">Changing the title will regenerate all brand images.</p>
          <div className="flex gap-3">
            <button onClick={() => setEditTitleModalOpen(false)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button onClick={handleSaveTitle} disabled={updateJob.isPending || !editedTitle.trim()} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:brightness-110 transition disabled:opacity-50">
              {updateJob.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save & Regenerate'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Per-brand Schedule Options Modal */}
      {brandScheduleModalBrand && (
        <Modal
          isOpen={!!brandScheduleModalBrand}
          onClose={() => setBrandScheduleModalBrand(null)}
          title={`Schedule — ${getBrandLabel(brandScheduleModalBrand)}`}
          size="md"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setBrandScheduleMode('auto')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${brandScheduleMode === 'auto' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
              >
                <Calendar className={`w-5 h-5 ${brandScheduleMode === 'auto' ? 'text-teal-600' : 'text-gray-400'}`} />
                <span className={`text-sm font-medium ${brandScheduleMode === 'auto' ? 'text-teal-700' : 'text-gray-500'}`}>Schedule Now</span>
                <span className="text-[10px] text-gray-400">Next available time</span>
              </button>
              <button
                onClick={() => setBrandScheduleMode('custom')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${brandScheduleMode === 'custom' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
              >
                <Clock className={`w-5 h-5 ${brandScheduleMode === 'custom' ? 'text-teal-600' : 'text-gray-400'}`} />
                <span className={`text-sm font-medium ${brandScheduleMode === 'custom' ? 'text-teal-700' : 'text-gray-500'}`}>Custom Time</span>
                <span className="text-[10px] text-gray-400">Pick date & time</span>
              </button>
            </div>
            {brandScheduleMode === 'custom' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                  <input type="date" value={brandCustomDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => setBrandCustomDate(e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Time</label>
                  <input type="time" value={brandCustomTime} onChange={(e) => setBrandCustomTime(e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setBrandScheduleModalBrand(null)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
              <button
                onClick={confirmBrandSchedule}
                disabled={brandScheduleMode === 'custom' && (!brandCustomDate || !brandCustomTime)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:brightness-110 transition disabled:opacity-50"
              >
                <Calendar className="w-4 h-4" />
                {brandScheduleMode === 'auto' ? 'Schedule Now' : 'Schedule'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Custom Schedule Modal */}
      <Modal
        isOpen={customScheduleModalOpen}
        onClose={() => setCustomScheduleModalOpen(false)}
        title="Custom Schedule"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Choose a date and time to schedule {completedCount === 1 ? 'this brand' : scheduledCount > 0 ? `the ${completedCount} remaining brands` : `all ${completedCount} brands`}.
            {completedCount > 1 && ' Brands will be staggered by 1 hour each.'}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={customScheduleDate} onChange={(e) => setCustomScheduleDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Time</label>
              <input type="time" value={customScheduleTime} onChange={(e) => setCustomScheduleTime(e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
            </div>
          </div>

          {isCustomScheduleInPast && (
            <p className="text-xs text-red-500">Cannot schedule in the past.</p>
          )}

          {customScheduleDate && customScheduleTime && !isCustomScheduleInPast && completedCount > 0 && (
            <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600 border border-gray-100">
              <p className="font-medium mb-1.5 text-gray-900 text-xs">Schedule Preview</p>
              <ul className="space-y-1">
                {Object.entries(job?.brand_outputs || {})
                  .filter(([_, output]) => output.status === 'completed')
                  .map(([brand], index) => {
                    const baseTime = new Date(`${customScheduleDate}T${customScheduleTime}`)
                    baseTime.setHours(baseTime.getHours() + index)
                    return (
                      <li key={brand} className="flex items-center gap-2 text-xs">
                        <span className="capitalize font-medium">{brand}</span>
                        <span className="text-gray-300">&rarr;</span>
                        <span>{format(baseTime, 'MMM d, h:mm a')}</span>
                      </li>
                    )
                  })}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setCustomScheduleModalOpen(false)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            <button
              onClick={handleCustomScheduleAll}
              disabled={schedulingCustom || !customScheduleDate || !customScheduleTime || isCustomScheduleInPast}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:brightness-110 transition disabled:opacity-50"
            >
              {schedulingCustom ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CalendarClock className="w-4 h-4" />{scheduleButtonLabel}</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

/** Reusable caption card for IG/FB platforms */
function CaptionCard({ platform, color, subtitle, content, onCopy }: {
  platform: string
  color: string
  subtitle?: string
  content: string
  onCopy: () => void
}) {
  return (
    <div className="bg-white rounded-lg p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${color}`} />
          <span className="text-sm font-medium text-gray-700">{platform}</span>
          {subtitle && <span className="text-[10px] text-gray-400">({subtitle})</span>}
        </div>
        <button onClick={onCopy} className="p-1 rounded hover:bg-gray-50">
          <Copy className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{content}</p>
      </div>
    </div>
  )
}

/** Step-based progress for generating states */

const FORMAT_B_STEPS = [
  { id: 'content', label: 'Content', icon: '📝' },
  { id: 'images', label: 'Images', icon: '🖼️' },
  { id: 'thumbnail', label: 'Thumbnail', icon: '🎨' },
  { id: 'video', label: 'Video', icon: '🎬' },
  { id: 'upload', label: 'Upload', icon: '☁️' },
] as const

function getActiveStep(message?: string, percent?: number): number {
  if (!message && !percent) return 0
  const msg = (message || '').toLowerCase()
  if (msg.includes('upload')) return 4
  if (msg.includes('composing video') || msg.includes('slideshow')) return 3
  if (msg.includes('composing thumbnail') || msg.includes('thumbnail')) return 2
  if (msg.includes('generating image') || msg.includes('generating images') || msg.includes('sourcing')) return 1
  if (msg.includes('generating content') || msg.includes('starting') || msg.includes('discover')) return 0
  if (typeof percent === 'number') {
    if (percent >= 80) return 4
    if (percent >= 55) return 3
    if (percent >= 40) return 2
    if (percent >= 5) return 1
  }
  return 0
}

function FormatBProgress({ message, percent, brand }: { message?: string; percent?: number; brand: string }) {
  const activeStep = getActiveStep(message, percent)

  return (
    <div className="py-8 px-2">
      {/* Step circles with connecting lines */}
      <div className="flex items-center justify-between mb-6 relative">
        {FORMAT_B_STEPS.map((step, idx) => {
          const isDone = idx < activeStep
          const isActive = idx === activeStep
          return (
            <div key={step.id} className="flex flex-col items-center relative z-10 flex-1">
              {idx < FORMAT_B_STEPS.length - 1 && (
                <div className={`absolute top-5 left-[calc(50%+16px)] right-[calc(-50%+16px)] h-[2px] transition-all duration-700 ease-out ${isDone ? 'bg-teal-400' : 'bg-gray-200'}`} />
              )}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-500 ${
                isDone ? 'bg-teal-100 ring-2 ring-teal-400 scale-100'
                  : isActive ? 'bg-stone-800 ring-4 ring-stone-300 scale-110 shadow-lg animate-pulse'
                  : 'bg-gray-100 ring-1 ring-gray-200 scale-90 opacity-50'
              }`}>
                {isDone ? <Check className="w-4 h-4 text-teal-600" /> : <span className={`text-sm ${isActive ? '' : 'grayscale'}`}>{step.icon}</span>}
              </div>
              <span className={`text-[10px] mt-2 font-medium transition-colors ${isDone ? 'text-teal-600' : isActive ? 'text-stone-800' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-gray-700">{message || `Generating ${brand}...`}</p>
        {typeof percent === 'number' && (
          <div className="mt-3 mx-auto max-w-xs">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-700 ease-out rounded-full" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
