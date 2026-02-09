/**
 * Post-specific job detail view.
 * Rendered inside JobDetail when job.variant === "post".
 *
 * Shows per-brand background previews, layout controls, auto-schedule.
 */
import { useState, useRef, useEffect } from 'react'
import Konva from 'konva'
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  Download,
  Calendar,
  Loader2,
  AlertCircle,
  Check,
  Clock,
  Settings2,
  ChevronDown,
  Save,
  RotateCcw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import {
  useDeleteJob,
  useRegenerateJob,
  useUpdateBrandStatus,
} from '@/features/jobs'
import { getBrandLabel, getBrandColor } from '@/features/brands'
import { StatusBadge, Modal } from '@/shared/components'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_PREVIEW_SCALE,
  BRAND_CONFIGS,
  DEFAULT_GENERAL_SETTINGS,
  SETTINGS_STORAGE_KEY,
  POST_BRAND_OFFSETS,
  loadGeneralSettings,
  saveGeneralSettings as persistSettings,
  PostCanvas,
} from '@/shared/components/PostCanvas'
import type { GeneralSettings, LayoutConfig } from '@/shared/components/PostCanvas'
import type { Job, BrandName, BrandOutput } from '@/shared/types'

interface Props {
  job: Job
  refetch: () => void
}

export function PostJobDetail({ job, refetch }: Props) {
  const navigate = useNavigate()
  const deleteJob = useDeleteJob()
  const regenerateJob = useRegenerateJob()
  const updateBrandStatus = useUpdateBrandStatus()

  // Font loading
  const [fontLoaded, setFontLoaded] = useState(false)
  useEffect(() => {
    document.fonts.load('1em Anton').then(() => setFontLoaded(true))
  }, [])

  // Layout settings
  const [settings, setSettings] = useState<GeneralSettings>(loadGeneralSettings)
  const [showSettings, setShowSettings] = useState(false)

  // Scheduling state
  const [isScheduling, setIsScheduling] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)

  // Stage refs for export (one per brand)
  const stageRefs = useRef<Map<string, Konva.Stage>>(new Map())

  const updateLayout = (updates: Partial<LayoutConfig>) => {
    setSettings((prev) => ({
      ...prev,
      layout: { ...prev.layout, ...updates },
    }))
  }

  const saveSettings = () => {
    persistSettings(settings)
    toast.success('Settings saved!')
  }

  const resetToDefault = () => {
    setSettings(DEFAULT_GENERAL_SETTINGS)
    localStorage.removeItem(SETTINGS_STORAGE_KEY)
    toast.success('Settings reset to default')
  }

  const isGenerating = job.status === 'generating' || job.status === 'pending'

  const allCompleted = job.brands.every(
    (b) => job.brand_outputs[b]?.status === 'completed' || job.brand_outputs[b]?.status === 'scheduled'
  )

  const allScheduled = job.brands.every(
    (b) => job.brand_outputs[b]?.status === 'scheduled'
  )

  // ── Delete ─────────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      await deleteJob.mutateAsync(job.id)
      toast.success('Job deleted')
      navigate('/history')
    } catch {
      toast.error('Failed to delete job')
    }
  }

  // ── Regenerate ─────────────────────────────────────────────────────
  const handleRegenerate = async () => {
    try {
      await regenerateJob.mutateAsync(job.id)
      toast.success('Regeneration started')
      refetch()
    } catch {
      toast.error('Failed to regenerate')
    }
  }

  // ── Download all ───────────────────────────────────────────────────
  const downloadAll = () => {
    let count = 0
    job.brands.forEach((brand) => {
      const stage = stageRefs.current.get(brand)
      if (!stage) return
      const uri = stage.toDataURL({
        pixelRatio: 1 / GRID_PREVIEW_SCALE,
        mimeType: 'image/png',
      })
      const link = document.createElement('a')
      link.download = `post-${brand}-${Date.now()}.png`
      link.href = uri
      link.click()
      count++
    })
    if (count) toast.success(`${count} image(s) downloaded!`)
  }

  // ── Auto Schedule ──────────────────────────────────────────────────
  const handleAutoSchedule = async () => {
    if (!allCompleted) {
      toast.error('Wait for all backgrounds to finish generating')
      return
    }
    setIsScheduling(true)
    toast.loading('Scheduling posts for all brands...', { id: 'sched' })

    let scheduled = 0
    let failed = 0

    try {
      for (const brand of job.brands) {
        const stage = stageRefs.current.get(brand)
        if (!stage) { failed++; continue }

        const imageData = stage.toDataURL({
          pixelRatio: 1 / GRID_PREVIEW_SCALE,
          mimeType: 'image/png',
        })
        const offset = POST_BRAND_OFFSETS[brand] || 0

        // Find next slot: base hours 0 (12AM) and 12 (12PM)
        const now = new Date()
        let scheduleTime: Date | null = null
        for (const baseHour of [0, 12]) {
          const slot = new Date(now)
          slot.setHours(baseHour + offset, 0, 0, 0)
          if (slot > now) {
            scheduleTime = slot
            break
          }
        }
        if (!scheduleTime) {
          scheduleTime = new Date(now)
          scheduleTime.setDate(scheduleTime.getDate() + 1)
          scheduleTime.setHours(offset, 0, 0, 0)
        }

        try {
          const resp = await fetch('/reels/schedule-post-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brand,
              title: job.title,
              image_data: imageData,
              schedule_time: scheduleTime.toISOString(),
            }),
          })
          if (resp.ok) {
            scheduled++
            // Mark brand as scheduled in the job
            try {
              await updateBrandStatus.mutateAsync({
                id: job.id,
                brand: brand as BrandName,
                status: 'scheduled',
              })
            } catch { /* ignore status update failure */ }
          } else {
            failed++
          }
        } catch {
          failed++
        }
      }

      if (scheduled > 0) {
        const msg =
          failed > 0
            ? `${scheduled} brand(s) scheduled! ${failed} failed.`
            : `All ${scheduled} brand(s) scheduled!`
        toast.success(msg, { id: 'sched', duration: 5000 })
        refetch()
      } else {
        toast.error('Failed to schedule posts', { id: 'sched' })
      }
    } catch {
      toast.error('Failed to schedule posts', { id: 'sched' })
    } finally {
      setIsScheduling(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/history')}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-mono text-gray-400">
                #{job.id}
              </span>
              <StatusBadge status={job.status} size="md" />
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                Post
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 whitespace-pre-line">
              {job.title}
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              Created{' '}
              {format(new Date(job.created_at), 'MMMM d, yyyy h:mm a')}
            </p>
            {/* AI Image Prompt */}
            {job.ai_prompt && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs font-medium text-gray-500 mb-1">AI Image Prompt</p>
                <p className="text-xs text-gray-600 leading-relaxed">{job.ai_prompt}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isGenerating && (
            <button
              onClick={handleRegenerate}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </button>
          )}
          <button
            onClick={() => setDeleteModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar when generating */}
      {isGenerating && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="font-medium text-blue-900">
              {job.current_step || 'Processing...'}
            </span>
            <span className="ml-auto text-sm text-blue-600">
              {job.progress_percent ?? 0}%
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${job.progress_percent ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions bar */}
      {allCompleted && !allScheduled && (
        <div className="flex items-center gap-3">
          <button
            onClick={downloadAll}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Download All
          </button>
          <button
            onClick={handleAutoSchedule}
            disabled={isScheduling}
            className="flex items-center gap-2 px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            {isScheduling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Calendar className="w-4 h-4" />
            )}
            Auto Schedule
          </button>
        </div>
      )}

      {allScheduled && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-600" />
          <span className="font-medium text-green-900">
            All brands scheduled!
          </span>
          <button
            onClick={() => navigate('/scheduled')}
            className="ml-auto text-sm text-green-700 hover:underline"
          >
            View Scheduled →
          </button>
        </div>
      )}

      {/* Brand Previews Grid */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${
            CANVAS_WIDTH * GRID_PREVIEW_SCALE + 30
          }px, 1fr))`,
        }}
      >
        {job.brands.map((brand) => {
          const output: BrandOutput | undefined = job.brand_outputs[brand as BrandName]
          const bgUrl = output?.thumbnail_path || null
          const status = output?.status || 'pending'

          return (
            <div
              key={`${brand}-${fontLoaded}`}
              className="bg-white rounded-xl border border-gray-200 p-3"
            >
              {/* Brand header */}
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor:
                      BRAND_CONFIGS[brand]?.color || getBrandColor(brand as BrandName),
                  }}
                />
                <span className="text-sm font-medium text-gray-900">
                  {BRAND_CONFIGS[brand]?.name || getBrandLabel(brand as BrandName)}
                </span>
                <span className="ml-auto">
                  {status === 'generating' && (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  )}
                  {status === 'completed' && (
                    <Check className="w-4 h-4 text-green-500" />
                  )}
                  {status === 'scheduled' && (
                    <Clock className="w-4 h-4 text-purple-500" />
                  )}
                  {status === 'failed' && (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                  {status === 'pending' && (
                    <Clock className="w-4 h-4 text-gray-400" />
                  )}
                </span>
              </div>

              {/* Progress message */}
              {status === 'generating' && output?.progress_message && (
                <p className="text-xs text-blue-600 mb-2 truncate">
                  {output.progress_message}
                </p>
              )}

              {/* Canvas */}
              <div className="rounded-lg overflow-hidden border border-gray-100">
                {status === 'completed' || status === 'scheduled' ? (
                  <PostCanvas
                    brand={brand}
                    title={job.title}
                    backgroundImage={bgUrl}
                    settings={settings}
                    scale={GRID_PREVIEW_SCALE}
                    stageRef={(node) => {
                      if (node) stageRefs.current.set(brand, node)
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: CANVAS_WIDTH * GRID_PREVIEW_SCALE,
                      height: CANVAS_HEIGHT * GRID_PREVIEW_SCALE,
                    }}
                    className="bg-gray-100 flex items-center justify-center"
                  >
                    {status === 'generating' ? (
                      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    ) : status === 'failed' ? (
                      <AlertCircle className="w-8 h-8 text-red-400" />
                    ) : (
                      <Clock className="w-8 h-8 text-gray-300" />
                    )}
                  </div>
                )}
              </div>

              {/* Error */}
              {status === 'failed' && output?.error && (
                <p className="text-xs text-red-500 mt-2 truncate">
                  {output.error}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Layout Settings (collapsible) */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <button
          onClick={() => setShowSettings((prev) => !prev)}
          className="w-full font-semibold text-gray-900 flex items-center gap-2 cursor-pointer hover:text-primary-600 transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          Layout Settings
          <span className="text-xs font-normal text-gray-500">
            (applies to all brands)
          </span>
          <ChevronDown
            className={`w-4 h-4 ml-auto transition-transform ${
              showSettings ? 'rotate-180' : ''
            }`}
          />
        </button>

        {showSettings && (
          <>
            <div className="mt-4 mb-4">
              <label className="text-sm text-gray-600 mb-1 block">
                Font Size: {settings.fontSize}px
              </label>
              <input
                type="range"
                min={40}
                max={90}
                value={settings.fontSize}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    fontSize: Number(e.target.value),
                  }))
                }
                className="w-full accent-primary-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-gray-500">
                  Read Caption Bottom: {settings.layout.readCaptionBottom}px
                </label>
                <input
                  type="range"
                  min={20}
                  max={80}
                  value={settings.layout.readCaptionBottom}
                  onChange={(e) =>
                    updateLayout({
                      readCaptionBottom: Number(e.target.value),
                    })
                  }
                  className="w-full accent-primary-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">
                  Title Gap: {settings.layout.titleGap}px
                </label>
                <input
                  type="range"
                  min={10}
                  max={300}
                  value={settings.layout.titleGap}
                  onChange={(e) =>
                    updateLayout({ titleGap: Number(e.target.value) })
                  }
                  className="w-full accent-primary-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">
                  Logo Gap: {settings.layout.logoGap}px
                </label>
                <input
                  type="range"
                  min={20}
                  max={60}
                  value={settings.layout.logoGap}
                  onChange={(e) =>
                    updateLayout({ logoGap: Number(e.target.value) })
                  }
                  className="w-full accent-primary-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">
                  Horizontal Padding: {settings.layout.titlePaddingX}px
                </label>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={settings.layout.titlePaddingX}
                  onChange={(e) =>
                    updateLayout({ titlePaddingX: Number(e.target.value) })
                  }
                  className="w-full accent-primary-500"
                />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 mb-4">
              <label className="text-xs text-gray-500 mb-1 block">
                Bar Width:{' '}
                {settings.barWidth === 0
                  ? 'Auto (match title)'
                  : `${settings.barWidth}px`}
              </label>
              <input
                type="range"
                min={0}
                max={400}
                value={settings.barWidth}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    barWidth: Number(e.target.value),
                  }))
                }
                className="w-full accent-primary-500"
              />
            </div>

            <div className="border-t border-gray-100 pt-4 flex gap-2">
              <button
                onClick={saveSettings}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600"
              >
                <Save className="w-4 h-4" />
                Save Settings
              </button>
              <button
                onClick={resetToDefault}
                className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>
          </>
        )}
      </div>

      {/* Delete Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Job"
      >
        <p className="text-gray-600 mb-6">
          Are you sure you want to delete this post job? This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setDeleteModalOpen(false)}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  )
}
