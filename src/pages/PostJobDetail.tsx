/**
 * Post-specific job detail view.
 * Rendered inside JobDetail when job.variant === "post".
 *
 * Shows per-brand background previews with unique titles,
 * pencil edit per brand, layout controls, auto-schedule.
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Konva from 'konva'
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  Download,
  Calendar,
  Loader2,
  AlertCircle,
  AlertTriangle,
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
  useRetryJob,
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
import { getBrandOutputsList } from '@/shared/types'
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
}

export function PostJobDetail({ job }: Props) {
  const navigate = useNavigate()
  const deleteJob = useDeleteJob()
  const regenerateJob = useRegenerateJob()
  const updateBrandStatus = useUpdateBrandStatus()
  const updateBrandContent = useUpdateBrandContent()
  const regenerateBrandImage = useRegenerateBrandImage()
  const retryJob = useRetryJob()
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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [schedulingBrand, setSchedulingBrand] = useState<string | null>(null)

  // Schedule options modal state
  const [scheduleModalBrand, setScheduleModalBrand] = useState<string | null>(null)
  const [scheduleMode, setScheduleMode] = useState<'auto' | 'custom'>('auto')
  const [customDate, setCustomDate] = useState('')
  const [customTime, setCustomTime] = useState('')

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
        setBrandLogos(prev => ({ ...prev, ...logos }))
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

  // Detect stuck job: generating for >10 minutes without progress
  const isStuck = useMemo(() => {
    if (!isGenerating || !job.updated_at) return false
    const updatedAt = new Date(job.updated_at).getTime()
    const tenMinAgo = Date.now() - 10 * 60 * 1000
    return updatedAt < tenMinAgo
  }, [job, isGenerating])

  const allCompleted = job.brands.every((b) => {
    const outputs = getBrandOutputsList(job.brand_outputs, b)
    return outputs.every((o) => o.status === 'completed' || o.status === 'scheduled')
  })

  const allScheduled = job.brands.every((b) => {
    const outputs = getBrandOutputsList(job.brand_outputs, b)
    return outputs.every((o) => o.status === 'scheduled')
  })

  // ── Per-card font size (keyed by cardKey = `${brand}-${contentIdx}`) ──
  const getAutoFitSize = (_cardKey: string, brand: string) => {
    const title = getBrandTitle(brand)
    const maxWidth = CANVAS_WIDTH - settings.layout.titlePaddingX * 2
    return autoFitFontSize(title || 'PLACEHOLDER', maxWidth, settings.fontSize, 3)
  }

  const getBrandFontSize = (cardKey: string, brand: string) =>
    brandFontSizes[cardKey] ?? getAutoFitSize(cardKey, brand)

  const adjustBrandFontSize = (cardKey: string, brand: string, delta: number) => {
    setBrandFontSizes((prev) => {
      const current = prev[cardKey] ?? getAutoFitSize(cardKey, brand)
      const next = Math.max(30, Math.min(120, current + delta))
      return { ...prev, [cardKey]: next }
    })
  }

  // ── Edit brand modal helpers ────────────────────────────────────────
  // editingBrand stores the cardKey (`brand-contentIdx`)
  const openEditBrand = useCallback((cardKey: string, output: BrandOutput) => {
    setEditTitle(output?.title || job.title || '')
    setEditCaption(output?.caption || '')
    setEditPrompt(output?.ai_prompt || '')
    setEditSlideTexts([...(output?.slide_texts || [])])
    setEditingBrand(cardKey)
  }, [job])

  const saveEditBrand = async () => {
    if (!editingBrand) return
    const brand = editingBrand.split('-')[0]
    try {
      await updateBrandContent.mutateAsync({
        id: job.id,
        brand: brand as BrandName,
        data: {
          title: editTitle,
          caption: editCaption,
          slide_texts: editSlideTexts,
        },
      })
      toast.success('Content updated!')
      setEditingBrand(null)
    } catch {
      toast.error('Failed to update content')
    }
  }

  const handleRegenBrandImage = async (newPrompt?: boolean) => {
    if (!editingBrand) return
    const brand = editingBrand.split('-')[0]
    try {
      await regenerateBrandImage.mutateAsync({
        id: job.id,
        brand: brand as BrandName,
        aiPrompt: newPrompt ? editPrompt : undefined,
      })
      toast.success('Image regeneration started!')
      setEditingBrand(null)
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
    } catch {
      toast.error('Failed to regenerate')
    }
  }

  // ── Download all ───────────────────────────────────────────────────
  const downloadAll = () => {
    let count = 0
    job.brands.forEach((brand) => {
      const outputs = getBrandOutputsList(job.brand_outputs, brand)
      outputs.forEach((_, contentIdx) => {
        const cardKey = `${brand}-${contentIdx}`
        const stage = stageRefs.current.get(cardKey)
        if (!stage) return
        const uri = stage.toDataURL({
          pixelRatio: 1 / GRID_PREVIEW_SCALE,
          mimeType: 'image/png',
        })
        const link = document.createElement('a')
        link.download = `post-${brand}-${contentIdx}-${Date.now()}.png`
        link.href = uri
        link.click()
        count++
      })
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
        const outputs = getBrandOutputsList(job.brand_outputs, brand)

        for (let contentIdx = 0; contentIdx < outputs.length; contentIdx++) {
          const output = outputs[contentIdx]
          const cardKey = `${brand}-${contentIdx}`

          // Skip already-scheduled items
          if (output?.status === 'scheduled') continue

          // Ensure we're on cover slide for primary capture
          setBrandSlideIndex((prev) => ({ ...prev, [cardKey]: 0 }))
          await new Promise((r) => setTimeout(r, 300))

          // Retry logic: wait for stage ref to become available
          let stage = stageRefs.current.get(cardKey)
          if (!stage) {
            setBrandSlideIndex((prev) => ({ ...prev, [cardKey]: 0 }))
            await new Promise((r) => setTimeout(r, 500))
            stage = stageRefs.current.get(cardKey)
          }
          if (!stage) {
            console.error(`Auto-schedule: Canvas ref is null for "${cardKey}". Skipping.`)
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
            setBrandSlideIndex((prev) => ({ ...prev, [cardKey]: s + 1 }))
            await new Promise((r) => setTimeout(r, 400))
            let textStage = textSlideRefs.current.get(cardKey)
            if (!textStage) {
              await new Promise((r) => setTimeout(r, 300))
              textStage = textSlideRefs.current.get(cardKey)
            }
            if (textStage) {
              carouselImages.push(
                textStage.toDataURL({ pixelRatio: 1 / GRID_PREVIEW_SCALE, mimeType: 'image/png' })
              )
            } else {
              console.warn(`Auto-schedule: Text slide ref null for "${cardKey}" slide ${s + 1}`)
            }
          }
          // Reset back to cover
          setBrandSlideIndex((prev) => ({ ...prev, [cardKey]: 0 }))

          const offset = POST_BRAND_OFFSETS[brand] || 0
          const brandTitle = output?.title || job.title

          // 2) Find next free slot: base hours 0 (12AM) and 12 (12PM), with collision avoidance
          const now = new Date()
          let scheduleTime: Date | null = null

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
            markOccupied(brand, scheduleTime)
            try {
              await updateBrandStatus.mutateAsync({
                id: job.id,
                brand: brand as BrandName,
                status: 'scheduled',
              })
            } catch { /* ignore status update failure */ }
          } catch (err) {
            console.error(`Auto-schedule: Failed for "${cardKey}":`, err)
            failed++
          }
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
        setBrandSlideIndex({})
      } else {
        toast.error('Failed to schedule posts', { id: 'sched' })
      }
    } catch {
      toast.error('Failed to schedule posts', { id: 'sched' })
    } finally {
      setIsScheduling(false)
    }
  }

  // ── Open schedule modal for a brand ──────────────────────────────────
  const openScheduleModal = (brand: string) => {
    setScheduleModalBrand(brand)
    setScheduleMode('auto')
    // Default custom date/time to tomorrow at noon
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setCustomDate(tomorrow.toISOString().split('T')[0])
    setCustomTime('12:00')
  }

  const confirmSchedule = () => {
    if (!scheduleModalBrand) return
    let customDateTime: Date | undefined
    if (scheduleMode === 'custom' && customDate && customTime) {
      customDateTime = new Date(`${customDate}T${customTime}:00`)
      if (customDateTime <= new Date()) {
        toast.error('Please select a future date and time')
        return
      }
    }
    setScheduleModalBrand(null)
    scheduleSingleBrand(scheduleModalBrand, customDateTime)
  }

  // ── Schedule single brand ────────────────────────────────────────────
  const scheduleSingleBrand = async (cardKey: string, customScheduleTime?: Date) => {
    const brand = cardKey.split('-')[0]
    const contentIdx = parseInt(cardKey.split('-')[1] || '0', 10)
    const outputs = getBrandOutputsList(job.brand_outputs, brand)
    const output = outputs[contentIdx]
    if (!output || output.status !== 'completed') {
      toast.error('Brand must be completed before scheduling')
      return
    }

    setSchedulingBrand(cardKey)
    toast.loading(`Scheduling ${getBrandConfig(brand).name}...`, { id: `sched-${cardKey}` })

    try {
      // Fetch occupied post slots
      let occupiedByBrand: Record<string, string[]> = {}
      try {
        const occData = await apiClient.get<{ occupied?: Record<string, string[]> }>('/reels/scheduled/occupied-post-slots')
        occupiedByBrand = occData.occupied || {}
      } catch {
        console.warn('Could not fetch occupied post slots')
      }

      const isSlotOccupied = (b: string, dt: Date): boolean => {
        const brandSlots = occupiedByBrand[b.toLowerCase()] || []
        const dtMinute = dt.toISOString().slice(0, 16)
        return brandSlots.some(s => s.slice(0, 16) === dtMinute)
      }

      // Ensure cover slide for capture
      setBrandSlideIndex((prev) => ({ ...prev, [cardKey]: 0 }))
      await new Promise((r) => setTimeout(r, 300))

      let stage = stageRefs.current.get(cardKey)
      if (!stage) {
        setBrandSlideIndex((prev) => ({ ...prev, [cardKey]: 0 }))
        await new Promise((r) => setTimeout(r, 500))
        stage = stageRefs.current.get(cardKey)
      }
      if (!stage) {
        toast.error(`Failed to capture image for ${getBrandConfig(brand).name}`, { id: `sched-${cardKey}` })
        return
      }

      const imageData = stage.toDataURL({
        pixelRatio: 1 / GRID_PREVIEW_SCALE,
        mimeType: 'image/png',
      })

      // Capture carousel text slides
      const slideTexts = output?.slide_texts || []
      const carouselImages: string[] = []
      for (let s = 0; s < slideTexts.length; s++) {
        setBrandSlideIndex((prev) => ({ ...prev, [cardKey]: s + 1 }))
        await new Promise((r) => setTimeout(r, 400))
        let textStage = textSlideRefs.current.get(cardKey)
        if (!textStage) {
          await new Promise((r) => setTimeout(r, 300))
          textStage = textSlideRefs.current.get(cardKey)
        }
        if (textStage) {
          carouselImages.push(
            textStage.toDataURL({ pixelRatio: 1 / GRID_PREVIEW_SCALE, mimeType: 'image/png' })
          )
        }
      }
      setBrandSlideIndex((prev) => ({ ...prev, [cardKey]: 0 }))

      const offset = POST_BRAND_OFFSETS[brand] || 0
      const brandTitle = output?.title || job.title

      // Use custom time if provided, otherwise find next free slot
      let scheduleTime: Date | null = customScheduleTime || null
      if (!scheduleTime) {
        const now = new Date()
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
          scheduleTime = new Date(now)
          scheduleTime.setDate(scheduleTime.getDate() + 30)
          scheduleTime.setHours(offset, 0, 0, 0)
        }
      }

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

      await updateBrandStatus.mutateAsync({
        id: job.id,
        brand: brand as BrandName,
        status: 'scheduled',
      })

      toast.success(`${getBrandConfig(brand).name} scheduled!`, { id: `sched-${cardKey}` })
    } catch {
      toast.error(`Failed to schedule ${getBrandConfig(brand).name}`, { id: `sched-${cardKey}` })
    } finally {
      setSchedulingBrand(null)
    }
  }

  // ── Refresh brand slides ───────────────────────────────────────────
  const refreshBrandSlides = async (brand: string) => {
    try {
      const d = await apiClient.get<{ theme?: { logo?: string } }>(`/api/brands/${brand}/theme`)
      if (d.theme?.logo) {
        const url = d.theme.logo.startsWith('http') ? d.theme.logo : `/brand-logos/${d.theme.logo}`
        setBrandLogos(prev => ({ ...prev, [brand]: url }))
        saveBrandLogo(brand, url)
      }
      toast.success('Slides refreshed with latest brand settings!')
    } catch {
      toast.error('Failed to refresh brand settings')
    }
  }

  // Helper: get per-brand title (supports content index)
  const getBrandTitle = (brand: string, contentIdx: number = 0): string => {
    const outputs = getBrandOutputsList(job.brand_outputs, brand)
    const output = outputs[contentIdx]
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

        <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
          {!isGenerating && (job.brands?.length ?? 0) > 1 && (
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
      {isGenerating && isStuck && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Generation appears stuck</p>
              <p className="text-xs text-amber-600">No progress for over 10 minutes. Click Retry to resume.</p>
            </div>
          </div>
          <button
            onClick={() => {
              retryJob.mutate(job.id, {
                onSuccess: () => toast.success('Retrying generation...'),
                onError: (err: any) => toast.error(err?.message || 'Failed to retry'),
              })
            }}
            disabled={retryJob.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-white bg-amber-600 rounded-[7px] hover:brightness-110 transition disabled:opacity-50 flex-shrink-0"
          >
            {retryJob.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Retry
          </button>
        </div>
      )}
      {isGenerating && !isStuck && (
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
            Auto Schedule All
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
        {job.brands.flatMap((brand) => {
          const outputs = getBrandOutputsList(job.brand_outputs, brand)
          const isMulti = outputs.length > 1

          return outputs.map((output, contentIdx) => {
          const cardKey = `${brand}-${contentIdx}`
          // Ensure we have a valid URL, not an empty string
          const rawBgUrl = output?.thumbnail_path || null
          const bgUrl = (rawBgUrl && rawBgUrl.trim() !== '') ? rawBgUrl : null
          const status = output?.status || 'pending'
          const brandTitle = getBrandTitle(brand, contentIdx)
          const brandCaption = output?.caption || ''
          const logoUrl = brandLogos[brand] || null
          const slideTexts = output?.slide_texts || []
          const carouselPaths = output?.carousel_paths || []
          const hasPreRendered = carouselPaths.length > 0
          const totalSlides = hasPreRendered ? carouselPaths.length : 1 + slideTexts.length
          const currentSlide = brandSlideIndex[cardKey] || 0

          return (
            <div
              key={`${cardKey}-${fontLoaded}`}
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
                {isMulti && (
                  <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                    #{contentIdx + 1}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  {(status === 'completed' || status === 'scheduled') && (
                    <>
                      <button
                        onClick={() => adjustBrandFontSize(cardKey, brand, -2)}
                        className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        title="Decrease font size"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-[10px] text-gray-400 tabular-nums min-w-[28px] text-center">
                        {getBrandFontSize(cardKey, brand)}
                      </span>
                      <button
                        onClick={() => adjustBrandFontSize(cardKey, brand, 2)}
                        className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        title="Increase font size"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => openEditBrand(cardKey, output)}
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
                {(schedulingBrand === cardKey || isScheduling) && (status === 'completed' || status === 'scheduled') && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-lg">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                      <span className="text-sm text-gray-500">Scheduling...</span>
                    </div>
                  </div>
                )}
                {status === 'completed' || status === 'scheduled' ? (
                  hasPreRendered ? (
                    <img
                      src={carouselPaths[currentSlide]}
                      alt={currentSlide === 0 ? 'Cover' : `Slide ${currentSlide}`}
                      style={{
                        width: CANVAS_WIDTH * GRID_PREVIEW_SCALE,
                        height: CANVAS_HEIGHT * GRID_PREVIEW_SCALE,
                      }}
                      className="w-full object-contain"
                    />
                  ) : currentSlide === 0 ? (
                    <PostCanvas
                      brand={brand}
                      title={brandTitle}
                      backgroundImage={bgUrl}
                      settings={{
                        ...settings,
                        fontSize: getBrandFontSize(cardKey, brand),
                      }}
                      scale={GRID_PREVIEW_SCALE}
                      logoUrl={logoUrl}
                      autoFitMaxLines={brandFontSizes[cardKey] !== undefined ? 0 : 3}
                      stageRef={(node) => {
                        if (node) stageRefs.current.set(cardKey, node)
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
                        if (node) textSlideRefs.current.set(cardKey, node)
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
              {(status === 'completed' || status === 'scheduled') && totalSlides > 1 && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  <button
                    onClick={() => setBrandSlideIndex((prev) => ({ ...prev, [cardKey]: Math.max(0, currentSlide - 1) }))}
                    disabled={currentSlide === 0}
                    className="p-1 rounded-full hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalSlides }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setBrandSlideIndex((prev) => ({ ...prev, [cardKey]: i }))}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          i === currentSlide
                            ? 'bg-blue-500 scale-125'
                            : 'bg-gray-300 hover:bg-gray-400'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setBrandSlideIndex((prev) => ({ ...prev, [cardKey]: Math.min(totalSlides - 1, currentSlide + 1) }))}
                    disabled={currentSlide >= totalSlides - 1}
                    className="p-1 rounded-full hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <span className="text-[10px] text-gray-400 ml-1">
                    {currentSlide === 0 ? 'Cover' : `Slide ${currentSlide} of ${totalSlides - 1}`}
                  </span>
                  <button
                    onClick={() => setExpandedBrand(cardKey)}
                    className="p-1 rounded-full hover:bg-gray-100 transition-colors ml-auto"
                    title="Full quality preview"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              )}

              {/* Per-brand schedule button */}
              {status === 'completed' && (
                <button
                  onClick={() => openScheduleModal(cardKey)}
                  disabled={schedulingBrand === cardKey || isScheduling}
                  className="w-full flex items-center justify-center gap-1.5 mt-2 px-3 py-1.5 bg-primary-500 text-white text-xs rounded-lg hover:bg-primary-600 disabled:opacity-50"
                >
                  {schedulingBrand === cardKey ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Calendar className="w-3 h-3" />
                  )}
                  Schedule
                </button>
              )}

              {/* Caption preview */}
              {brandCaption && (status === 'completed' || status === 'scheduled') && (
                <div className="mt-2">
                  <p
                    className={`text-[10px] text-gray-400 leading-relaxed whitespace-pre-line ${
                      expandedCaptions.has(cardKey) ? '' : 'line-clamp-2'
                    }`}
                  >
                    {brandCaption}
                  </p>
                  <button
                    onClick={() =>
                      setExpandedCaptions((prev) => {
                        const next = new Set(prev)
                        if (next.has(cardKey)) next.delete(cardKey)
                        else next.add(cardKey)
                        return next
                      })
                    }
                    className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-700 mt-1 transition-colors"
                  >
                    {expandedCaptions.has(cardKey) ? (
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
        })
        })}
      </div>

      {/* Edit Brand Modal */}
      {editingBrand && (() => {
        const editBrand = editingBrand.split('-')[0]
        return (
        <Modal
          isOpen={!!editingBrand}
          onClose={() => setEditingBrand(null)}
          title={`Edit — ${editBrand ? getBrandConfig(editBrand).name : ''}`}
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

            {/* Refresh slides with latest brand settings */}
            <button
              onClick={() => editingBrand && refreshBrandSlides(editingBrand.split('-')[0])}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Slides
            </button>

            <hr className="border-gray-200" />

            {/* Logo */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Brand Logo</label>
              {brandLogos[editingBrand.split('-')[0]] ? (
                <div className="flex items-center gap-3">
                  <img
                    src={brandLogos[editingBrand.split('-')[0]]}
                    alt="Logo"
                    className="w-12 h-12 object-contain rounded border border-gray-200"
                  />
                  <button
                    onClick={() => handleRemoveLogo(editingBrand.split('-')[0])}
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
                      onChange={(e) => handleLogoUpload(editingBrand.split('-')[0], e)}
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
                    onChange={(e) => handleLogoUpload(editingBrand.split('-')[0], e)}
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
        )
      })()}

      {/* Schedule Options Modal */}
      {scheduleModalBrand && (
        <Modal
          isOpen={!!scheduleModalBrand}
          onClose={() => setScheduleModalBrand(null)}
          title={`Schedule — ${scheduleModalBrand ? getBrandConfig(scheduleModalBrand.split('-')[0]).name : ''}`}
        >
          <div className="space-y-4">
            {/* Mode selection */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setScheduleMode('auto')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  scheduleMode === 'auto'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Calendar className={`w-5 h-5 ${scheduleMode === 'auto' ? 'text-primary-600' : 'text-gray-400'}`} />
                <span className={`text-sm font-medium ${scheduleMode === 'auto' ? 'text-primary-700' : 'text-gray-600'}`}>
                  Schedule Now
                </span>
                <span className="text-[10px] text-gray-400 text-center">Next available time</span>
              </button>
              <button
                onClick={() => setScheduleMode('custom')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  scheduleMode === 'custom'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Clock className={`w-5 h-5 ${scheduleMode === 'custom' ? 'text-primary-600' : 'text-gray-400'}`} />
                <span className={`text-sm font-medium ${scheduleMode === 'custom' ? 'text-primary-700' : 'text-gray-600'}`}>
                  Custom Time
                </span>
                <span className="text-[10px] text-gray-400 text-center">Pick date & time</span>
              </button>
            </div>

            {/* Custom date/time picker */}
            {scheduleMode === 'custom' && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Date</label>
                  <input
                    type="date"
                    value={customDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Time</label>
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>
            )}

            {/* Confirm */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setScheduleModalBrand(null)}
                className="flex-1 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmSchedule}
                disabled={scheduleMode === 'custom' && (!customDate || !customTime)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                <Calendar className="w-4 h-4" />
                {scheduleMode === 'auto' ? 'Schedule Now' : 'Schedule'}
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
            disabled={deleteJob.isPending}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
          >
            {deleteJob.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </Modal>
      {/* Full-quality preview modal */}
      {expandedBrand && (() => {
        const expBrand = expandedBrand.split('-')[0]
        const expIdx = parseInt(expandedBrand.split('-')[1] || '0', 10)
        const outputs = getBrandOutputsList(job.brand_outputs, expBrand)
        const output = outputs[expIdx]
        // Ensure we have a valid URL, not an empty string
        const rawBgUrl = output?.thumbnail_path || null
        const bgUrl = (rawBgUrl && rawBgUrl.trim() !== '') ? rawBgUrl : null
        const slideTexts = output?.slide_texts || []
        const expandedCarouselPaths = output?.carousel_paths || []
        const expandedHasPreRendered = expandedCarouselPaths.length > 0
        const brandTitle = getBrandTitle(expBrand, expIdx)
        const logoUrl = brandLogos[expBrand] || null
        const currentSlide = brandSlideIndex[expandedBrand] || 0
        const totalSlides = expandedHasPreRendered ? expandedCarouselPaths.length : 1 + slideTexts.length
        const FULL_SCALE = 0.45

        return (
          <div
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6"
            onClick={() => setExpandedBrand(null)}
          >
            <div
              className="relative flex flex-col items-center gap-3 max-h-[calc(100dvh-3rem)] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setExpandedBrand(null)}
                className="absolute top-0 right-0 z-10 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>

              {/* Canvas at higher scale — capped for viewport fit */}
              <div className="rounded-xl overflow-hidden shadow-2xl shrink-0">
                {expandedHasPreRendered ? (
                  <img
                    src={expandedCarouselPaths[currentSlide]}
                    alt={currentSlide === 0 ? 'Cover' : `Slide ${currentSlide}`}
                    style={{
                      width: CANVAS_WIDTH * FULL_SCALE,
                      height: CANVAS_HEIGHT * FULL_SCALE,
                    }}
                    className="object-contain"
                  />
                ) : currentSlide === 0 ? (
                  <PostCanvas
                    brand={expBrand}
                    title={brandTitle}
                    backgroundImage={bgUrl}
                    settings={{
                      ...settings,
                      fontSize: getBrandFontSize(expandedBrand, expBrand),
                    }}
                    scale={FULL_SCALE}
                    logoUrl={logoUrl}
                    autoFitMaxLines={brandFontSizes[expandedBrand] !== undefined ? 0 : 3}
                  />
                ) : (
                  <CarouselTextSlide
                    brand={expBrand}
                    text={slideTexts[currentSlide - 1] || ''}
                    allSlideTexts={slideTexts}
                    isLastSlide={currentSlide === slideTexts.length}
                    scale={FULL_SCALE}
                    logoUrl={logoUrl}
                    fontFamily={settings.slideFontFamily}
                    brandHandle={dynamicBrands.find(b => b.id === expBrand)?.instagram_handle}
                    brandDisplayName={dynamicBrands.find(b => b.id === expBrand)?.label}
                    brandColor={dynamicBrands.find(b => b.id === expBrand)?.color}
                  />
                )}
              </div>

              {/* Navigation */}
              {totalSlides > 1 && (
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
                    onClick={() => setBrandSlideIndex((prev) => ({ ...prev, [expandedBrand]: Math.min(totalSlides - 1, currentSlide + 1) }))}
                    disabled={currentSlide >= totalSlides - 1}
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
                {getBrandConfig(expBrand).name} — Full Quality Preview
              </p>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
