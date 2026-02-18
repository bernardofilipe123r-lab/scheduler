/**
 * Post-specific job detail view.
 * Rendered inside JobDetail when job.variant === "post".
 *
 * Shows per-brand background previews with unique titles,
 * pencil edit per brand, layout controls, auto-schedule.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
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
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Save,
  RotateCcw,
  Pencil,
  Minus,
  Plus,
  Upload,
  ImagePlus,
  X,
  Maximize2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import {
  useDeleteJob,
  useRegenerateJob,
  useUpdateBrandStatus,
  useUpdateBrandContent,
  useRegenerateBrandImage,
} from '@/features/jobs'
import { StatusBadge, Modal } from '@/shared/components'
import { useDynamicBrands } from '@/features/brands'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_PREVIEW_SCALE,
  getBrandConfig,
  POST_BRAND_OFFSETS,
  loadGeneralSettings,
  PostCanvas,
  autoFitFontSize,
} from '@/shared/components/PostCanvas'
import { CarouselTextSlide } from '@/shared/components/CarouselTextSlide'
import type { Job, BrandName, BrandOutput } from '@/shared/types'
import { apiClient } from '@/shared/api/client'

// ─── Logo storage helpers ────────────────────────────────────────────
const LOGOS_STORAGE_KEY = 'post-brand-logos'

function loadBrandLogos(): Record<string, string> {
  try {
    const saved = localStorage.getItem(LOGOS_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return {}
}

function saveBrandLogo(brand: string, dataUrl: string) {
  const logos = loadBrandLogos()
  logos[brand] = dataUrl
  localStorage.setItem(LOGOS_STORAGE_KEY, JSON.stringify(logos))
}

function removeBrandLogo(brand: string) {
  const logos = loadBrandLogos()
  delete logos[brand]
  localStorage.setItem(LOGOS_STORAGE_KEY, JSON.stringify(logos))
}

interface Props {
  job: Job
  refetch: () => void
}

export function PostJobDetail({ job, refetch }: Props) {
  const navigate = useNavigate()
  const deleteJob = useDeleteJob()
  const regenerateJob = useRegenerateJob()
  const updateBrandStatus = useUpdateBrandStatus()
  const updateBrandContent = useUpdateBrandContent()
  const regenerateBrandImage = useRegenerateBrandImage()
  const { brands: dynamicBrands } = useDynamicBrands()

  // Font loading
  const [fontLoaded, setFontLoaded] = useState(false)
  useEffect(() => {
    document.fonts.load('1em Anton').then(() => setFontLoaded(true))
  }, [])

  // Layout settings (read-only from /posts page)
  const settings = loadGeneralSettings()

  // Scheduling state
  const [isScheduling, setIsScheduling] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)

  // Per-brand font size overrides (session-only, not persisted)
  // Auto-fit runs by default; manual +/- adjustments apply only while viewing this job
  const [brandFontSizes, setBrandFontSizes] = useState<Record<string, number>>({})

  // Brand logos — start with localStorage, then overlay theme logos from server
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>(loadBrandLogos)

  // Fetch theme logos from /brands API on mount (server logos take priority)
  useEffect(() => {
    const fetchThemeLogos = async () => {
      const allBrands = job.brands || []
      const logos: Record<string, string> = {}
      for (const brand of allBrands) {
        try {
          const d = await apiClient.get<{ theme?: { logo?: string } }>(`/api/brands/${brand}/theme`)
          if (d.theme?.logo) {
            const url = d.theme.logo.startsWith('http') ? d.theme.logo : `/brand-logos/${d.theme.logo}`
            logos[brand] = url
          }
        } catch { /* ignore */ }
      }
      if (Object.keys(logos).length > 0) {
        setBrandLogos(prev => ({ ...logos, ...prev }))
      }
    }
    fetchThemeLogos()
  }, [job.brands])

  // Edit modal state
  const [editingBrand, setEditingBrand] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editCaption, setEditCaption] = useState('')
  const [editPrompt, setEditPrompt] = useState('')

  // Expanded captions (track which brands have expanded captions)
  const [expandedCaptions, setExpandedCaptions] = useState<Set<string>>(new Set())

  // Full-quality preview modal
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null)

  // Per-brand carousel slide index (0 = cover image, 1+ = text slides)
  const [brandSlideIndex, setBrandSlideIndex] = useState<Record<string, number>>({})

  // Slide text editing in edit modal
  const [editSlideTexts, setEditSlideTexts] = useState<string[]>([])

  // Stage refs for export (one per brand)
  const stageRefs = useRef<Map<string, Konva.Stage>>(new Map())
  const textSlideRefs = useRef<Map<string, Konva.Stage>>(new Map())

  const isGenerating = job.status === 'generating' || job.status === 'pending'

  const allCompleted = job.brands.every(
    (b) => job.brand_outputs[b]?.status === 'completed' || job.brand_outputs[b]?.status === 'scheduled'
  )

  const allScheduled = job.brands.every(
    (b) => job.brand_outputs[b]?.status === 'scheduled'
  )

  // ── Per-brand font size ─────────────────────────────────────────────
  // Compute auto-fit size for a brand (what the canvas actually renders)
  const getAutoFitSize = (brand: string) => {
    const title = getBrandTitle(brand)
    const maxWidth = CANVAS_WIDTH - settings.layout.titlePaddingX * 2
    return autoFitFontSize(title || 'PLACEHOLDER', maxWidth, settings.fontSize, 3)
  }

  // Get the effective font size: manual override or auto-fit
  const getBrandFontSize = (brand: string) =>
    brandFontSizes[brand] ?? getAutoFitSize(brand)

  const adjustBrandFontSize = (brand: string, delta: number) => {
    setBrandFontSizes((prev) => {
      // Initialize from auto-fit value if no manual override yet
      const current = prev[brand] ?? getAutoFitSize(brand)
      const next = Math.max(30, Math.min(120, current + delta))
      return { ...prev, [brand]: next }
    })
  }

  // ── Edit brand modal helpers ────────────────────────────────────────
  const openEditBrand = useCallback((brand: string) => {
    const output = job.brand_outputs[brand as BrandName]
    setEditTitle(output?.title || job.title || '')
    setEditCaption(output?.caption || '')
    setEditPrompt(output?.ai_prompt || '')
    setEditSlideTexts([...(output?.slide_texts || [])])
    setEditingBrand(brand)
  }, [job])

  const saveEditBrand = async () => {
    if (!editingBrand) return
    try {
      await updateBrandContent.mutateAsync({
        id: job.id,
        brand: editingBrand as BrandName,
        data: {
          title: editTitle,
          caption: editCaption,
          slide_texts: editSlideTexts,
        },
      })
      toast.success('Content updated!')
      setEditingBrand(null)
      refetch()
    } catch {
      toast.error('Failed to update content')
    }
  }

  const handleRegenBrandImage = async (newPrompt?: boolean) => {
    if (!editingBrand) return
    try {
      await regenerateBrandImage.mutateAsync({
        id: job.id,
        brand: editingBrand as BrandName,
        aiPrompt: newPrompt ? editPrompt : undefined,
      })
      toast.success('Image regeneration started!')
      setEditingBrand(null)
      refetch()
    } catch {
      toast.error('Failed to regenerate image')
    }
  }

  const handleLogoUpload = (brand: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      saveBrandLogo(brand, dataUrl)
      setBrandLogos((prev) => ({ ...prev, [brand]: dataUrl }))
      toast.success('Logo saved!')
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveLogo = (brand: string) => {
    removeBrandLogo(brand)
    setBrandLogos((prev) => {
      const next = { ...prev }
      delete next[brand]
      return next
    })
    toast.success('Logo removed')
  }

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
    // Auto-save any pending edits before scheduling
    if (editingBrand) {
      try {
        await updateBrandContent.mutateAsync({
          id: job.id,
          brand: editingBrand as BrandName,
          data: {
            title: editTitle,
            caption: editCaption,
            slide_texts: editSlideTexts,
          },
        })
        await refetch()
        setEditingBrand(null)
      } catch {
        toast.error('Failed to save edits before scheduling')
        return
      }
    }

    if (!allCompleted) {
      toast.error('Wait for all backgrounds to finish generating')
      return
    }
    setIsScheduling(true)
    setIsCapturing(true)
    toast.loading('Scheduling posts for all brands...', { id: 'sched' })

    let scheduled = 0
    let failed = 0
    const scheduledBrands: string[] = []

    try {
      // 1) Fetch already-occupied post slots from the backend
      let occupiedByBrand: Record<string, string[]> = {}
      try {
        const occData = await apiClient.get<{ occupied?: Record<string, string[]> }>('/reels/scheduled/occupied-post-slots')
        occupiedByBrand = occData.occupied || {}
      } catch {
        // If fetch fails, continue without collision data
        console.warn('Could not fetch occupied post slots')
      }

      // Helper: check if a slot is occupied for a brand (compare to minute)
      const isSlotOccupied = (brand: string, dt: Date): boolean => {
        const brandSlots = occupiedByBrand[brand.toLowerCase()] || []
        const dtMinute = dt.toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM
        return brandSlots.some(s => s.slice(0, 16) === dtMinute)
      }

      // Helper: mark a slot as occupied (so subsequent brands in this batch don't collide)
      const markOccupied = (brand: string, dt: Date) => {
        const key = brand.toLowerCase()
        if (!occupiedByBrand[key]) occupiedByBrand[key] = []
        occupiedByBrand[key].push(dt.toISOString())
      }

      for (const brand of job.brands) {
        const output = job.brand_outputs[brand as BrandName]

        // Ensure we're on cover slide for primary capture
        setBrandSlideIndex((prev) => ({ ...prev, [brand]: 0 }))
        await new Promise((r) => setTimeout(r, 300))

        // Retry logic: wait for stage ref to become available
        let stage = stageRefs.current.get(brand)
        if (!stage) {
          // Force a re-render and wait longer
          setBrandSlideIndex((prev) => ({ ...prev, [brand]: 0 }))
          await new Promise((r) => setTimeout(r, 500))
          stage = stageRefs.current.get(brand)
        }
        if (!stage) {
          console.error(`Auto-schedule: Canvas ref is null for brand "${brand}". Skipping.`)
          toast.error(`Failed to capture image for ${getBrandConfig(brand).name}`)
          failed++
          continue
        }

        const imageData = stage.toDataURL({
          pixelRatio: 1 / GRID_PREVIEW_SCALE,
          mimeType: 'image/png',
        })

        // Capture carousel text slides
        const slideTexts = output?.slide_texts || []
        const carouselImages: string[] = []
        for (let s = 0; s < slideTexts.length; s++) {
          setBrandSlideIndex((prev) => ({ ...prev, [brand]: s + 1 }))
          await new Promise((r) => setTimeout(r, 400))
          let textStage = textSlideRefs.current.get(brand)
          if (!textStage) {
            // Retry once with extra wait
            await new Promise((r) => setTimeout(r, 300))
            textStage = textSlideRefs.current.get(brand)
          }
          if (textStage) {
            carouselImages.push(
              textStage.toDataURL({ pixelRatio: 1 / GRID_PREVIEW_SCALE, mimeType: 'image/png' })
            )
          } else {
            console.warn(`Auto-schedule: Text slide ref null for brand "${brand}" slide ${s + 1}`)
          }
        }
        // Reset back to cover
        setBrandSlideIndex((prev) => ({ ...prev, [brand]: 0 }))

        const offset = POST_BRAND_OFFSETS[brand] || 0
        const brandTitle = output?.title || job.title

        // 2) Find next free slot: base hours 0 (12AM) and 12 (12PM), with collision avoidance
        const now = new Date()
        let scheduleTime: Date | null = null

        // Try slots for the next 30 days to find a free one
        for (let dayOffset = 0; dayOffset < 30 && !scheduleTime; dayOffset++) {
          for (const baseHour of [0, 12]) {
            const slot = new Date(now)
            slot.setDate(slot.getDate() + dayOffset)
            slot.setHours(baseHour + offset, 0, 0, 0)
            if (slot <= now) continue
            if (isSlotOccupied(brand, slot)) continue
            scheduleTime = slot
            break
          }
        }

        if (!scheduleTime) {
          // Fallback: 30 days out at offset hour
          scheduleTime = new Date(now)
          scheduleTime.setDate(scheduleTime.getDate() + 30)
          scheduleTime.setHours(offset, 0, 0, 0)
        }

        try {
          await apiClient.post('/reels/schedule-post-image', {
            brand,
            title: brandTitle,
            caption: output?.caption || '',
            image_data: imageData,
            carousel_images: carouselImages,
            slide_texts: slideTexts,
            schedule_time: scheduleTime.toISOString(),
            job_id: job.id,
          })
          scheduled++
          scheduledBrands.push(getBrandConfig(brand).name)
          // Mark this slot as occupied for the rest of this batch
          markOccupied(brand, scheduleTime)
          try {
            await updateBrandStatus.mutateAsync({
              id: job.id,
              brand: brand as BrandName,
              status: 'scheduled',
            })
          } catch { /* ignore status update failure */ }
        } catch (err) {
          console.error(`Auto-schedule: Failed for brand "${brand}":`, err)
          failed++
        }
      }

      if (scheduled > 0) {
        const msg =
          failed > 0
            ? `${scheduled} posts scheduled, ${failed} failed`
            : scheduledBrands.length === 1
              ? 'Post was scheduled successfully'
              : 'Posts were scheduled successfully for all brands'
        toast.success(msg, { id: 'sched', duration: 5000 })
        await refetch()
        setBrandSlideIndex({})
      } else {
        toast.error('Failed to schedule posts', { id: 'sched' })
      }
    } catch {
      toast.error('Failed to schedule posts', { id: 'sched' })
    } finally {
      setIsCapturing(false)
      setIsScheduling(false)
    }
  }

  // Helper: get per-brand title
  const getBrandTitle = (brand: string): string => {
    const output = job.brand_outputs[brand as BrandName]
    return output?.title || job.title || ''
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
            <h1 className="text-xl font-bold text-gray-900">
              Unique Posts ({job.brands.length} brands)
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              Created{' '}
              {format(new Date(job.created_at), 'MMMM d, yyyy h:mm a')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isGenerating && (
            <button
              onClick={handleRegenerate}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerate All
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
            {job.brands.length === 1
              ? 'Post was scheduled successfully'
              : 'Posts were scheduled successfully for all brands'}
          </span>
          <button
            onClick={() => navigate('/calendar')}
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
          gridTemplateColumns: `repeat(auto-fill, ${
            CANVAS_WIDTH * GRID_PREVIEW_SCALE + 24
          }px)`,
        }}
      >
        {job.brands.map((brand) => {
          const output: BrandOutput | undefined = job.brand_outputs[brand as BrandName]
          // Ensure we have a valid URL, not an empty string
          const rawBgUrl = output?.thumbnail_path || null
          const bgUrl = (rawBgUrl && rawBgUrl.trim() !== '') ? rawBgUrl : null
          const status = output?.status || 'pending'
          const brandTitle = getBrandTitle(brand)
          const brandCaption = output?.caption || ''
          const logoUrl = brandLogos[brand] || null
          const slideTexts = output?.slide_texts || []
          const totalSlides = 1 + slideTexts.length
          const currentSlide = brandSlideIndex[brand] || 0

          return (
            <div
              key={`${brand}-${fontLoaded}`}
              className="bg-white rounded-xl border border-gray-200 p-3"
            >
              {/* Brand header with edit button */}
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: getBrandConfig(brand).color,
                  }}
                />
                <span className="text-sm font-medium text-gray-900 truncate">
                  {getBrandConfig(brand).name}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  {(status === 'completed' || status === 'scheduled') && (
                    <>
                      <button
                        onClick={() => adjustBrandFontSize(brand, -2)}
                        className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        title="Decrease font size"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-[10px] text-gray-400 tabular-nums min-w-[28px] text-center">
                        {getBrandFontSize(brand)}
                      </span>
                      <button
                        onClick={() => adjustBrandFontSize(brand, 2)}
                        className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        title="Increase font size"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => openEditBrand(brand)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        title="Edit brand"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
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

              {/* Per-brand title preview */}
              {brandTitle && (status === 'completed' || status === 'scheduled') && (
                <p className="text-xs text-gray-600 mb-2 line-clamp-2 leading-relaxed">
                  {brandTitle}
                </p>
              )}

              {/* Progress message */}
              {status === 'generating' && output?.progress_message && (
                <p className="text-xs text-blue-600 mb-2 truncate">
                  {output.progress_message}
                </p>
              )}

              {/* Canvas with carousel navigation */}
              <div className="rounded-lg overflow-hidden border border-gray-100 relative">
                {isCapturing && (status === 'completed' || status === 'scheduled') && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-lg">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                      <span className="text-sm text-gray-500">Scheduling...</span>
                    </div>
                  </div>
                )}
                {status === 'completed' || status === 'scheduled' ? (
                  currentSlide === 0 ? (
                    <PostCanvas
                      brand={brand}
                      title={brandTitle}
                      backgroundImage={bgUrl}
                      settings={{
                        ...settings,
                        fontSize: getBrandFontSize(brand),
                      }}
                      scale={GRID_PREVIEW_SCALE}
                      logoUrl={logoUrl}
                      autoFitMaxLines={brandFontSizes[brand] !== undefined ? 0 : 3}
                      stageRef={(node) => {
                        if (node) stageRefs.current.set(brand, node)
                      }}
                    />
                  ) : (
                    <CarouselTextSlide
                      brand={brand}
                      text={slideTexts[currentSlide - 1] || ''}
                      allSlideTexts={slideTexts}
                      isLastSlide={currentSlide === slideTexts.length}
                      scale={GRID_PREVIEW_SCALE}
                      logoUrl={logoUrl}
                      fontFamily={settings.slideFontFamily}
                      brandHandle={dynamicBrands.find(b => b.id === brand)?.instagram_handle}
                      brandDisplayName={dynamicBrands.find(b => b.id === brand)?.label}
                      brandColor={dynamicBrands.find(b => b.id === brand)?.color}
                      stageRef={(node) => {
                        if (node) textSlideRefs.current.set(brand, node)
                      }}
                    />
                  )
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

              {/* Carousel slide navigation */}
              {(status === 'completed' || status === 'scheduled') && slideTexts.length > 0 && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  <button
                    onClick={() => setBrandSlideIndex((prev) => ({ ...prev, [brand]: Math.max(0, currentSlide - 1) }))}
                    disabled={currentSlide === 0}
                    className="p-1 rounded-full hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalSlides }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setBrandSlideIndex((prev) => ({ ...prev, [brand]: i }))}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          i === currentSlide
                            ? 'bg-blue-500 scale-125'
                            : 'bg-gray-300 hover:bg-gray-400'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setBrandSlideIndex((prev) => ({ ...prev, [brand]: Math.min(slideTexts.length, currentSlide + 1) }))}
                    disabled={currentSlide >= slideTexts.length}
                    className="p-1 rounded-full hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <span className="text-[10px] text-gray-400 ml-1">
                    {currentSlide === 0 ? 'Cover' : `Slide ${currentSlide} of ${totalSlides - 1}`}
                  </span>
                  <button
                    onClick={() => setExpandedBrand(brand)}
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors ml-auto"
                    title="Full quality preview"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              )}

              {/* Caption preview */}
              {brandCaption && (status === 'completed' || status === 'scheduled') && (
                <div className="mt-2">
                  <p
                    className={`text-[10px] text-gray-400 leading-relaxed whitespace-pre-line ${
                      expandedCaptions.has(brand) ? '' : 'line-clamp-2'
                    }`}
                  >
                    {brandCaption}
                  </p>
                  <button
                    onClick={() =>
                      setExpandedCaptions((prev) => {
                        const next = new Set(prev)
                        if (next.has(brand)) next.delete(brand)
                        else next.add(brand)
                        return next
                      })
                    }
                    className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-700 mt-1 transition-colors"
                  >
                    {expandedCaptions.has(brand) ? (
                      <>
                        <ChevronUp className="w-3 h-3" /> Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" /> Show more
                      </>
                    )}
                  </button>
                </div>
              )}

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

      {/* Edit Brand Modal */}
      {editingBrand && (
        <Modal
          isOpen={!!editingBrand}
          onClose={() => setEditingBrand(null)}
          title={`Edit — ${editingBrand ? getBrandConfig(editingBrand).name : ''}`}
        >
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Caption */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Caption</label>
              <textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
              />
            </div>

            {/* Carousel Slide Texts */}
            {editSlideTexts.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Carousel Slides ({editSlideTexts.length})
                </label>
                <div className="space-y-3">
                  {editSlideTexts.map((text, idx) => (
                    <div key={idx}>
                      <label className="text-xs text-gray-500 block mb-1">
                        Slide {idx + 1} {idx === editSlideTexts.length - 1 ? '(CTA)' : ''}
                      </label>
                      <textarea
                        value={text}
                        onChange={(e) => {
                          const updated = [...editSlideTexts]
                          updated[idx] = e.target.value
                          setEditSlideTexts(updated)
                        }}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-y leading-relaxed"
                        placeholder={`Slide ${idx + 1} text...`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save title/caption/slides */}
            <button
              onClick={saveEditBrand}
              disabled={updateBrandContent.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 disabled:opacity-50"
            >
              {updateBrandContent.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Content
            </button>

            <hr className="border-gray-200" />

            {/* Logo */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Brand Logo</label>
              {brandLogos[editingBrand] ? (
                <div className="flex items-center gap-3">
                  <img
                    src={brandLogos[editingBrand]}
                    alt="Logo"
                    className="w-12 h-12 object-contain rounded border border-gray-200"
                  />
                  <button
                    onClick={() => handleRemoveLogo(editingBrand)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                  >
                    <X className="w-3 h-3" />
                    Remove
                  </button>
                  <label className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <Upload className="w-3 h-3" />
                    Replace
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleLogoUpload(editingBrand, e)}
                    />
                  </label>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 cursor-pointer">
                  <ImagePlus className="w-4 h-4" />
                  Upload Logo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleLogoUpload(editingBrand, e)}
                  />
                </label>
              )}
            </div>

            <hr className="border-gray-200" />

            {/* AI Image Prompt */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">AI Image Prompt</label>
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none font-mono text-xs"
              />
            </div>

            {/* Retry buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleRegenBrandImage(true)}
                disabled={regenerateBrandImage.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {regenerateBrandImage.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Retry with New Prompt
              </button>
              <button
                onClick={() => handleRegenBrandImage(false)}
                disabled={regenerateBrandImage.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Retry Same Prompt
              </button>
            </div>

          </div>
        </Modal>
      )}

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
      {/* Full-quality preview modal */}
      {expandedBrand && (() => {
        const output = job.brand_outputs[expandedBrand as BrandName]
        // Ensure we have a valid URL, not an empty string
        const rawBgUrl = output?.thumbnail_path || null
        const bgUrl = (rawBgUrl && rawBgUrl.trim() !== '') ? rawBgUrl : null
        const slideTexts = output?.slide_texts || []
        const brandTitle = getBrandTitle(expandedBrand)
        const logoUrl = brandLogos[expandedBrand] || null
        const currentSlide = brandSlideIndex[expandedBrand] || 0
        const totalSlides = 1 + slideTexts.length
        const FULL_SCALE = 0.55

        return (
          <div
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center"
            onClick={() => setExpandedBrand(null)}
          >
            <div
              className="relative flex flex-col items-center gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setExpandedBrand(null)}
                className="absolute -top-2 -right-2 z-10 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>

              {/* Canvas at higher scale */}
              <div className="rounded-xl overflow-hidden shadow-2xl">
                {currentSlide === 0 ? (
                  <PostCanvas
                    brand={expandedBrand}
                    title={brandTitle}
                    backgroundImage={bgUrl}
                    settings={{
                      ...settings,
                      fontSize: getBrandFontSize(expandedBrand),
                    }}
                    scale={FULL_SCALE}
                    logoUrl={logoUrl}
                    autoFitMaxLines={brandFontSizes[expandedBrand] !== undefined ? 0 : 3}
                  />
                ) : (
                  <CarouselTextSlide
                    brand={expandedBrand}
                    text={slideTexts[currentSlide - 1] || ''}
                    allSlideTexts={slideTexts}
                    isLastSlide={currentSlide === slideTexts.length}
                    scale={FULL_SCALE}
                    logoUrl={logoUrl}
                    fontFamily={settings.slideFontFamily}
                    brandHandle={dynamicBrands.find(b => b.id === expandedBrand)?.instagram_handle}
                    brandDisplayName={dynamicBrands.find(b => b.id === expandedBrand)?.label}
                    brandColor={dynamicBrands.find(b => b.id === expandedBrand)?.color}
                  />
                )}
              </div>

              {/* Navigation */}
              {slideTexts.length > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setBrandSlideIndex((prev) => ({ ...prev, [expandedBrand]: Math.max(0, currentSlide - 1) }))}
                    disabled={currentSlide === 0}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5 text-white" />
                  </button>
                  <div className="flex items-center gap-2">
                    {Array.from({ length: totalSlides }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setBrandSlideIndex((prev) => ({ ...prev, [expandedBrand]: i }))}
                        className={`w-2 h-2 rounded-full transition-all ${
                          i === currentSlide
                            ? 'bg-white scale-125'
                            : 'bg-white/40 hover:bg-white/60'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setBrandSlideIndex((prev) => ({ ...prev, [expandedBrand]: Math.min(slideTexts.length, currentSlide + 1) }))}
                    disabled={currentSlide >= slideTexts.length}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 text-white" />
                  </button>
                  <span className="text-sm text-white/60 ml-2">
                    {currentSlide === 0 ? 'Cover' : `Slide ${currentSlide} of ${totalSlides - 1}`}
                  </span>
                </div>
              )}

              <p className="text-xs text-white/40">
                {getBrandConfig(expandedBrand).name} — Full Quality Preview
              </p>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
