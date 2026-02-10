/**
 * God Automation 🔱
 *
 * Premium batch-generation + Tinder-style review system.
 *
 * Architecture:
 *   GodAutomation (orchestrator)
 *   ├── BatchSelector     — pick rounds (2/4/8/10)
 *   ├── PreGenProgress    — animated circular progress
 *   ├── ReviewCard        — single post card with canvas + controls
 *   └── CompletionSummary — done screen with stats + links
 *
 * Persistence:
 *   Session saved to localStorage on every state change.
 *   On mount, if a previous session exists, user can resume.
 *
 * Flow:
 *   1. Select batch → pre-generate 2 rounds of content + images
 *   2. Tinder review: Yes → schedule / No → regenerate
 *   3. Each Yes captures canvas → POST /reels/schedule-post-image
 *   4. Done → summary, link to Scheduled page
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import Konva from 'konva'
import {
  X,
  Loader2,
  Check,
  ThumbsDown,
  Pencil,
  RefreshCw,
  Minus,
  Plus,
  Zap,
  Calendar,
  ExternalLink,
  RotateCcw,
  Type,
  Sparkles,
  ArrowRight,
  Play,
  ImageOff,
  MessageSquareX,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PostCanvas,
} from '@/shared/components/PostCanvas'
import type { GeneralSettings } from '@/shared/components/PostCanvas'
import { CarouselTextSlide } from '@/shared/components/CarouselTextSlide'
import type { BrandName } from '@/shared/types'
import { getBrandLabel, getBrandColor } from '@/features/brands'

// ─── Constants ───────────────────────────────────────────────────────
const STORAGE_KEY = 'god-automation-session'
const REVIEW_SCALE = 0.3
const MAX_CONCURRENT = 5
const DEFAULT_POSTS_PER_DAY = 6

// ─── Rejection feedback types ────────────────────────────────────────
type RejectCategory = 'bad_image' | 'bad_topic'
type ImageIssue = 'not_centered' | 'image_bug' | 'image_mismatch'

// Reel brand offsets (matching db_scheduler.py) — used for post interleaving
const BRAND_REEL_OFFSETS: Record<string, number> = {
  holisticcollege: 0,
  healthycollege: 1,
  vitalitycollege: 2,
  longevitycollege: 3,
  wellbeingcollege: 4,
}

// ─── Types ───────────────────────────────────────────────────────────
interface GodPost {
  index: number
  brand: BrandName
  round: number
  title: string
  caption: string
  slideTexts: string[]
  aiPrompt: string
  backgroundUrl: string | null
  scheduledTime: string | null
  scheduleId: string | null
  status: GodPostStatus
}

type GodPostStatus =
  | 'pending_content'
  | 'pending_image'
  | 'generating_image'
  | 'ready'
  | 'accepted'
  | 'rejected'
  | 'scheduling'

type Phase = 'batch_select' | 'pre_generating' | 'reviewing' | 'done'

interface GodSession {
  phase: Phase
  batchSize: number
  queue: GodPost[]
  reviewIndex: number
  occupiedSlots: Record<string, string[]>
  startedAt: string
  brands: BrandName[]
}

interface Props {
  brands: BrandName[]
  settings: GeneralSettings
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────
function sortBrandsByOffset(brands: BrandName[]): BrandName[] {
  return [...brands].sort(
    (a, b) => (BRAND_REEL_OFFSETS[a] ?? 99) - (BRAND_REEL_OFFSETS[b] ?? 99),
  )
}

function buildQueue(brands: BrandName[], rounds: number): GodPost[] {
  const sorted = sortBrandsByOffset(brands)
  const queue: GodPost[] = []
  let idx = 0
  for (let r = 0; r < rounds; r++) {
    for (const brand of sorted) {
      queue.push({
        index: idx++,
        brand,
        round: r,
        title: '',
        caption: '',
        slideTexts: [],
        aiPrompt: '',
        backgroundUrl: null,
        scheduledTime: null,
        scheduleId: null,
        status: 'pending_content',
      })
    }
  }
  return queue
}

function saveSession(session: GodSession) {
  try {
    // Strip backgroundUrl (too large for localStorage)
    const lite: GodSession = {
      ...session,
      queue: session.queue.map((p) => ({ ...p, backgroundUrl: null })),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lite))
  } catch {
    /* quota exceeded */
  }
}

function loadSession(): GodSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as GodSession
  } catch {
    return null
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
}

function getNextSlotForBrand(
  brand: BrandName,
  occupied: Record<string, string[]>,
  postsPerDay: number = DEFAULT_POSTS_PER_DAY,
): Date {
  const reelOffset = BRAND_REEL_OFFSETS[brand.toLowerCase()] ?? 0
  // Posts interleave between reels: reels at offset+0h, offset+4h, ...
  // Posts sit 2h after each reel. For variable postsPerDay, evenly space across 24h.
  const gap = 24 / postsPerDay
  const postSlots: Array<{ h: number; m: number }> = []
  for (let i = 0; i < postsPerDay; i++) {
    const raw = (reelOffset + 2 + i * gap) % 24
    postSlots.push({ h: Math.floor(raw), m: Math.round((raw - Math.floor(raw)) * 60) })
  }
  // Sort ascending by time
  postSlots.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m))

  const now = new Date()
  const brandOccupied = occupied[brand.toLowerCase()] || []
  const isOccupied = (dt: Date): boolean => {
    const key = dt.toISOString().slice(0, 16)
    return brandOccupied.some((s) => s.slice(0, 16) === key)
  }
  for (let dayOff = 0; dayOff < 90; dayOff++) {
    for (const { h, m } of postSlots) {
      const slot = new Date(now)
      slot.setDate(slot.getDate() + dayOff)
      slot.setHours(h, m, 0, 0)
      if (slot <= now) continue
      if (isOccupied(slot)) continue
      return slot
    }
  }
  const fb = new Date(now)
  fb.setDate(fb.getDate() + 90)
  fb.setHours(reelOffset + 2, 0, 0, 0)
  return fb
}

function formatSlot(dt: Date): string {
  return dt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export function GodAutomation({ brands, settings, onClose }: Props) {
  const NUM_BRANDS = brands.length

  // Lock body scroll while overlay is open
  useEffect(() => {
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'
    return () => { html.style.overflow = prev }
  }, [])

  // ── Core state ─────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('batch_select')
  const [batchSize, setBatchSize] = useState(4)
  const [queue, setQueue] = useState<GodPost[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [preGenProgress, setPreGenProgress] = useState(0)
  const [activeGens, setActiveGens] = useState(0)
  const [isSchedulingCurrent, setIsSchedulingCurrent] = useState(false)
  const [preGenStep, setPreGenStep] = useState<'slots' | 'titles' | 'images'>('slots')
  const [preGenStartTime, setPreGenStartTime] = useState<number>(0)

  // Edit state for current review card
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [fontSizeOverride, setFontSizeOverride] = useState<number | null>(null)
  const [showRejectMenu, setShowRejectMenu] = useState<false | 'main' | 'image_sub'>(false)
  const [rejectNote, setRejectNote] = useState('')
  const [currentSlide, setCurrentSlide] = useState(0) // 0 = cover image, 1-3 = text slides

  // Refs
  const stageRef = useRef<Konva.Stage | null>(null)
  const textSlideRef = useRef<Konva.Stage | null>(null)
  const occupiedRef = useRef<Record<string, string[]>>({})
  const unlockedRef = useRef<Set<number>>(new Set())
  const queueRef = useRef<GodPost[]>([])
  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  // Reset slide index when reviewing a different post
  useEffect(() => {
    setCurrentSlide(0)
  }, [reviewIndex])

  // Resume session
  const [resumeSession, setResumeSession] = useState<GodSession | null>(null)
  useEffect(() => {
    const saved = loadSession()
    if (saved && saved.phase !== 'done' && saved.queue.length > 0) {
      setResumeSession(saved)
    }
  }, [])

  // Persist session on state changes
  useEffect(() => {
    if (phase === 'batch_select' || queue.length === 0) return
    saveSession({
      phase,
      batchSize,
      queue,
      reviewIndex,
      occupiedSlots: occupiedRef.current,
      startedAt: new Date().toISOString(),
      brands,
    })
  }, [phase, queue, reviewIndex, batchSize, brands])

  // ── Derived state ──────────────────────────────────────────────────
  const totalPosts = batchSize * NUM_BRANDS
  const currentPost = queue[reviewIndex] ?? null
  const isCurrentReady = currentPost?.status === 'ready'
  const isCurrentGenerating =
    currentPost?.status === 'pending_content' ||
    currentPost?.status === 'pending_image' ||
    currentPost?.status === 'generating_image'

  const displayTitle = editingTitle ? editTitleValue : currentPost?.title || ''
  const displayFontSize = fontSizeOverride ?? settings.fontSize

  const stats = useMemo(() => {
    const accepted = queue.filter((p) => p.status === 'accepted').length
    const ready = queue.filter((p) => p.status === 'ready').length
    const generating = queue.filter(
      (p) =>
        p.status === 'pending_content' ||
        p.status === 'pending_image' ||
        p.status === 'generating_image',
    ).length
    return { accepted, ready, generating }
  }, [queue])

  // ── Fetch occupied slots ───────────────────────────────────────────
  const fetchOccupiedSlots = async () => {
    try {
      const resp = await fetch('/reels/scheduled/occupied-post-slots')
      if (resp.ok) {
        const data = await resp.json()
        occupiedRef.current = data.occupied || {}
      }
    } catch {
      /* continue */
    }
  }

  // ── Generate image for a single post ───────────────────────────────
  const generateImageForPost = useCallback(async (idx: number) => {
    const post = queueRef.current[idx]
    if (!post || !post.aiPrompt) return

    setQueue((prev) => {
      const next = [...prev]
      if (next[idx]) next[idx] = { ...next[idx], status: 'generating_image' }
      return next
    })
    setActiveGens((c) => c + 1)

    try {
      const resp = await fetch('/reels/generate-post-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: post.brand, prompt: post.aiPrompt }),
      })
      if (!resp.ok) throw new Error('Image gen failed')
      const data = await resp.json()
      setQueue((prev) => {
        const next = [...prev]
        if (next[idx]) {
          next[idx] = {
            ...next[idx],
            backgroundUrl: data.background_data,
            status: 'ready',
          }
        }
        return next
      })
    } catch {
      // Mark ready so user can retry
      setQueue((prev) => {
        const next = [...prev]
        if (next[idx]) next[idx] = { ...next[idx], status: 'ready' }
        return next
      })
    } finally {
      setActiveGens((c) => Math.max(0, c - 1))
    }
  }, [])

  // ── Generate content + image for a single post ─────────────────────
  const generateSinglePost = useCallback(
    async (idx: number, _brand: BrandName) => {
      setQueue((prev) => {
        const next = [...prev]
        if (next[idx]) {
          next[idx] = {
            ...next[idx],
            title: '',
            caption: '',
            aiPrompt: '',
            backgroundUrl: null,
            status: 'pending_content',
          }
        }
        return next
      })

      try {
        const contentResp = await fetch('/reels/generate-post-titles-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: 1 }),
        })
        if (!contentResp.ok) throw new Error('Content gen failed')
        const { posts } = await contentResp.json()
        const c = posts[0]

        setQueue((prev) => {
          const next = [...prev]
          if (next[idx]) {
            next[idx] = {
              ...next[idx],
              title: c.title || '',
              caption: c.caption || '',
              slideTexts: c.slide_texts || [],
              aiPrompt: c.image_prompt || '',
              status: 'pending_image',
            }
          }
          return next
        })

        // Update ref so generateImageForPost reads correct aiPrompt
        queueRef.current = [...queueRef.current]
        queueRef.current[idx] = {
          ...queueRef.current[idx],
          aiPrompt: c.image_prompt || '',
        }
        await new Promise((r) => setTimeout(r, 50))
        await generateImageForPost(idx)
      } catch {
        toast.error('Failed to regenerate post')
        setQueue((prev) => {
          const next = [...prev]
          if (next[idx]) next[idx] = { ...next[idx], status: 'ready' }
          return next
        })
      }
    },
    [generateImageForPost],
  )

  // ── Start generation (streaming pipeline) ─────────────────────────
  // Strategy: generate just 2 titles → 2 images → review immediately.
  // Continue generating the rest in background pairs while user swipes.
  const startGeneration = async (rounds: number) => {
    const q = buildQueue(brands, rounds)
    setQueue(q)
    queueRef.current = q
    setPhase('pre_generating')
    setPreGenProgress(0)
    setPreGenStep('slots')
    setPreGenStartTime(Date.now())
    await fetchOccupiedSlots()

    const FIRST_BATCH = 5 // Generate 5 posts before review starts
    const firstCount = Math.min(FIRST_BATCH, q.length)
    setPreGenProgress(10)
    setPreGenStep('titles')

    // 1. Generate 5 titles
    console.log(`[GOD] Generating first ${firstCount} titles...`)
    let firstPosts: Array<{ title: string; caption: string; image_prompt: string; slide_texts?: string[] }>
    try {
      const contentResp = await fetch('/reels/generate-post-titles-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: firstCount }),
      })
      if (!contentResp.ok) throw new Error('Failed to generate content')
      const data = await contentResp.json()
      firstPosts = data.posts
      console.log(`[GOD] Got ${firstPosts.length} titles`)
    } catch (err) {
      console.error('[GOD] Title gen failed:', err)
      toast.error('Failed to generate content')
      setPhase('batch_select')
      return
    }

    // Apply titles to queue
    const updatedQ = [...q]
    for (let i = 0; i < firstCount && i < firstPosts.length; i++) {
      updatedQ[i] = {
        ...updatedQ[i],
        title: firstPosts[i].title || '',
        caption: firstPosts[i].caption || '',
        slideTexts: firstPosts[i].slide_texts || [],
        aiPrompt: firstPosts[i].image_prompt || '',
        status: 'pending_image' as GodPostStatus,
      }
    }
    setQueue(updatedQ)
    queueRef.current = updatedQ
    setPreGenProgress(30)
    setPreGenStep('images')

    // 2. Generate 5 images in parallel
    console.log(`[GOD] Generating first ${firstCount} images...`)
    let imgDone = 0
    await Promise.all(
      Array.from({ length: firstCount }, (_, i) =>
        generateImageForPost(i).then(() => {
          imgDone++
          setPreGenProgress(30 + Math.round((imgDone / firstCount) * 65))
        }),
      ),
    )

    setPreGenProgress(100)
    console.log('[GOD] First batch ready — switching to review')
    await new Promise((r) => setTimeout(r, 300))
    setPhase('reviewing')
    setReviewIndex(0)

    // 3. Background: generate remaining posts in pairs while user swipes
    const remaining = q.length - firstCount
    if (remaining > 0) {
      console.log(`[GOD] Background: generating remaining ${remaining} posts in pairs...`)
      backgroundGenerateRemaining(firstCount, q.length)
    }
  }

  // Background generation — runs during review, generates content+image in pairs
  const backgroundGenerateRemaining = async (startIdx: number, total: number) => {
    const PAIR_SIZE = 2
    for (let i = startIdx; i < total; i += PAIR_SIZE) {
      const count = Math.min(PAIR_SIZE, total - i)
      console.log(`[GOD] BG: generating titles for posts ${i}-${i + count - 1}`)

      try {
        const contentResp = await fetch('/reels/generate-post-titles-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count }),
        })
        if (!contentResp.ok) {
          console.error(`[GOD] BG: title gen failed for batch starting at ${i}`)
          continue
        }
        const { posts: contentPosts } = await contentResp.json()

        // Apply content
        setQueue((prev) => {
          const next = [...prev]
          for (let j = 0; j < count && j < contentPosts.length; j++) {
            const idx = i + j
            if (next[idx]) {
              next[idx] = {
                ...next[idx],
                title: contentPosts[j].title || '',
                caption: contentPosts[j].caption || '',
                slideTexts: contentPosts[j].slide_texts || [],
                aiPrompt: contentPosts[j].image_prompt || '',
                status: 'pending_image',
              }
            }
          }
          return next
        })
        // Update ref for image gen
        for (let j = 0; j < count && j < contentPosts.length; j++) {
          const idx = i + j
          queueRef.current = [...queueRef.current]
          if (queueRef.current[idx]) {
            queueRef.current[idx] = {
              ...queueRef.current[idx],
              aiPrompt: contentPosts[j].image_prompt || '',
            }
          }
        }
        await new Promise((r) => setTimeout(r, 50))

        // Generate images for this pair in parallel
        console.log(`[GOD] BG: generating images for posts ${i}-${i + count - 1}`)
        await Promise.all(
          Array.from({ length: count }, (_, j) => generateImageForPost(i + j)),
        )
        console.log(`[GOD] BG: posts ${i}-${i + count - 1} ready`)
      } catch (err) {
        console.error(`[GOD] BG: error generating batch at ${i}:`, err)
      }
    }
    console.log('[GOD] BG: all background generation complete')
  }

  // ── Resume previous session ────────────────────────────────────────
  const handleResume = async (session: GodSession) => {
    setPhase(session.phase)
    setBatchSize(session.batchSize)
    setReviewIndex(session.reviewIndex)
    occupiedRef.current = session.occupiedSlots || {}

    // Posts that were "ready" but lost images need regeneration
    const restoredQueue = session.queue.map((p) => {
      if (p.status === 'ready' && !p.backgroundUrl && p.aiPrompt) {
        return { ...p, status: 'pending_image' as GodPostStatus }
      }
      return p
    })
    setQueue(restoredQueue)
    queueRef.current = restoredQueue

    const needImage = restoredQueue
      .map((p, i) => (p.status === 'pending_image' && p.aiPrompt ? i : -1))
      .filter((i) => i >= 0)

    if (needImage.length > 0) {
      setPhase('pre_generating')
      setPreGenProgress(10)
      let done = 0
      for (let i = 0; i < needImage.length; i += MAX_CONCURRENT) {
        const chunk = needImage.slice(i, i + MAX_CONCURRENT)
        await Promise.all(chunk.map((idx) => generateImageForPost(idx)))
        done += chunk.length
        setPreGenProgress(10 + Math.round((done / needImage.length) * 90))
      }
      setPhase(session.phase === 'pre_generating' ? 'reviewing' : session.phase)
    }
    setResumeSession(null)
  }

  // ── Retry image for current post ───────────────────────────────────
  const retryImage = useCallback(async () => {
    const idx = reviewIndex
    setQueue((prev) => {
      const next = [...prev]
      if (next[idx]) {
        next[idx] = { ...next[idx], status: 'generating_image', backgroundUrl: null }
      }
      return next
    })
    await generateImageForPost(idx)
  }, [reviewIndex, generateImageForPost])

  // ── Schedule a single post ─────────────────────────────────────────
  const schedulePost = useCallback(
    async (post: GodPost, idx: number): Promise<boolean> => {
      // Ensure we're on slide 0 (cover) for the primary image capture
      setCurrentSlide(0)
      await new Promise((r) => setTimeout(r, 100))

      if (!stageRef.current) {
        toast.error('Canvas not ready — try again')
        return false
      }

      setIsSchedulingCurrent(true)
      setQueue((prev) => {
        const next = [...prev]
        if (next[idx]) next[idx] = { ...next[idx], status: 'scheduling' }
        return next
      })

      try {
        // Capture cover image (slide 0)
        const coverImage = stageRef.current.toDataURL({
          pixelRatio: 1 / REVIEW_SCALE,
          mimeType: 'image/png',
        })

        // Capture text slide images by cycling through them
        const slideImages: string[] = []
        const slideCount = post.slideTexts?.length || 0
        for (let s = 0; s < slideCount; s++) {
          setCurrentSlide(s + 1)
          await new Promise((r) => setTimeout(r, 150)) // wait for render
          if (textSlideRef.current) {
            slideImages.push(
              textSlideRef.current.toDataURL({
                pixelRatio: 1 / REVIEW_SCALE,
                mimeType: 'image/png',
              }),
            )
          }
        }
        // Reset back to cover
        setCurrentSlide(0)

        const slot = getNextSlotForBrand(post.brand, occupiedRef.current, settings.postsPerDay ?? DEFAULT_POSTS_PER_DAY)

        const resp = await fetch('/reels/schedule-post-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand: post.brand,
            title: post.title,
            caption: post.caption,
            image_data: coverImage,
            carousel_images: slideImages,
            slide_texts: post.slideTexts || [],
            schedule_time: slot.toISOString(),
          }),
        })
        if (!resp.ok) throw new Error()
        const result = await resp.json()

        // Mark as occupied
        const key = post.brand.toLowerCase()
        if (!occupiedRef.current[key]) occupiedRef.current[key] = []
        occupiedRef.current[key].push(slot.toISOString())

        setQueue((prev) => {
          const next = [...prev]
          if (next[idx]) {
            next[idx] = {
              ...next[idx],
              status: 'accepted',
              scheduledTime: slot.toISOString(),
              scheduleId: result.schedule_id || null,
            }
          }
          return next
        })
        return true
      } catch {
        toast.error(`Failed to schedule ${getBrandLabel(post.brand)}`)
        setQueue((prev) => {
          const next = [...prev]
          if (next[idx]) next[idx] = { ...next[idx], status: 'ready' }
          return next
        })
        return false
      } finally {
        setIsSchedulingCurrent(false)
      }
    },
    [],
  )

  // ── Unlock next post for same brand ────────────────────────────────
  const unlockNextForBrand = useCallback(
    (answeredIndex: number) => {
      const nextIdx = answeredIndex + NUM_BRANDS
      if (nextIdx >= queueRef.current.length) return
      if (unlockedRef.current.has(nextIdx)) return
      unlockedRef.current.add(nextIdx)
      const post = queueRef.current[nextIdx]
      if (!post || post.status !== 'pending_content') return
      generateSinglePost(nextIdx, post.brand)
    },
    [NUM_BRANDS, generateSinglePost],
  )

  // ── Find next reviewable post ──────────────────────────────────────
  const findNextReviewable = useCallback(
    (fromIndex: number, q: GodPost[]): number | null => {
      // Forward from current
      for (let i = fromIndex + 1; i < q.length; i++) {
        if (q[i].status === 'ready') return i
      }
      // Wrap
      for (let i = 0; i <= fromIndex; i++) {
        if (q[i].status === 'ready') return i
      }
      // Still generating?
      const hasPending = q.some(
        (p) =>
          p.status === 'pending_content' ||
          p.status === 'pending_image' ||
          p.status === 'generating_image',
      )
      if (hasPending) return fromIndex
      return null
    },
    [],
  )

  // ── YES ────────────────────────────────────────────────────────────
  const handleYes = async () => {
    if (!currentPost || !isCurrentReady) return
    const idx = reviewIndex
    const slot = getNextSlotForBrand(currentPost.brand, occupiedRef.current)

    toast.loading(
      `Scheduling ${getBrandLabel(currentPost.brand)} → ${formatSlot(slot)}`,
      { id: 'god-sched' },
    )

    const ok = await schedulePost(currentPost, idx)
    if (ok) {
      toast.success(`${getBrandLabel(currentPost.brand)} scheduled!`, {
        id: 'god-sched',
        duration: 1500,
        icon: '✅',
      })
    } else {
      toast.dismiss('god-sched')
    }

    unlockNextForBrand(idx)
    setFontSizeOverride(null)
    setEditingTitle(false)
    setCurrentSlide(0)

    const next = findNextReviewable(idx, queueRef.current)
    if (next === null) {
      setPhase('done')
      clearSession()
    } else {
      setReviewIndex(next)
    }
  }

  // ── NO — with rejection reason ──────────────────────────────────
  const handleNo = (category: RejectCategory, imageIssue?: ImageIssue) => {
    if (!currentPost || !isCurrentReady) return
    const idx = reviewIndex

    // Capture canvas image before regeneration changes it
    let imageData = ''
    try {
      if (stageRef.current) {
        imageData = stageRef.current.toDataURL({ pixelRatio: 1 / REVIEW_SCALE, mimeType: 'image/png' })
      }
    } catch (e) {
      console.warn('[GOD] Could not capture canvas for feedback:', e)
    }

    // Save feedback permanently to server (fire-and-forget)
    const note = rejectNote.trim() || undefined
    fetch('/reels/rejection-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        detail: imageIssue || null,
        note,
        title: currentPost.title,
        caption: currentPost.caption || '',
        image_prompt: currentPost.aiPrompt || '',
        image_data: imageData,
        brand: currentPost.brand || null,
      }),
    })
      .then((r) => {
        if (r.ok) console.log(`[GOD] Feedback saved to server: ${category}${imageIssue ? ' / ' + imageIssue : ''}`)
        else console.warn('[GOD] Feedback save failed:', r.status)
      })
      .catch((e) => console.warn('[GOD] Feedback save error:', e))

    console.log(`[GOD] Rejection: ${category}${imageIssue ? ' / ' + imageIssue : ''}${note ? ' — note: ' + note : ''} — "${currentPost.title.slice(0, 40)}"`)

    setShowRejectMenu(false)
    setRejectNote('')
    setCurrentSlide(0)

    // If bad image only, just retry image (keep the same title)
    if (category === 'bad_image') {
      setQueue((prev) => {
        const next = [...prev]
        if (next[idx]) {
          next[idx] = { ...next[idx], status: 'generating_image', backgroundUrl: null }
        }
        return next
      })
      generateImageForPost(idx)
      // Try to advance to another ready post while regenerating
      const next = findNextReviewable(idx, queueRef.current)
      if (next !== null && next !== idx) setReviewIndex(next)
    } else {
      // Bad topic — regenerate everything
      generateSinglePost(idx, currentPost.brand)
      setFontSizeOverride(null)
      setEditingTitle(false)
      const next = findNextReviewable(idx, queueRef.current)
      if (next !== null && next !== idx) setReviewIndex(next)
    }
  }

  // ── Commit title edit ──────────────────────────────────────────────
  const commitTitleEdit = () => {
    if (editTitleValue.trim()) {
      setQueue((prev) => {
        const next = [...prev]
        next[reviewIndex] = {
          ...next[reviewIndex],
          title: editTitleValue.trim(),
        }
        return next
      })
    }
    setEditingTitle(false)
  }

  // ── Close with confirmation ────────────────────────────────────────
  const handleClose = () => {
    if (phase === 'reviewing' && stats.accepted < totalPosts) {
      const yes = window.confirm(
        `You have ${stats.accepted} of ${totalPosts} posts scheduled.\nYour session is saved — you can resume later.\n\nClose anyway?`,
      )
      if (!yes) return
    }
    if (phase === 'done') clearSession()
    onClose()
  }

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex flex-col overflow-hidden" style={{ top: 0, left: 0, right: 0, bottom: 0, marginTop: 0, }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-none">
              God Automation
            </h1>
            {phase !== 'batch_select' && (
              <p className="text-white/40 text-xs mt-0.5">
                {stats.accepted}/{totalPosts} scheduled
                {activeGens > 0 && ` · ${activeGens} generating`}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleClose}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {/* Resume dialog */}
        {phase === 'batch_select' && resumeSession && (
          <ResumeDialog
            session={resumeSession}
            onResume={() => handleResume(resumeSession)}
            onDiscard={() => {
              clearSession()
              setResumeSession(null)
            }}
          />
        )}

        {/* Batch selector */}
        {phase === 'batch_select' && !resumeSession && (
          <BatchSelector
            batchSize={batchSize}
            setBatchSize={setBatchSize}
            numBrands={NUM_BRANDS}
            onStart={() => startGeneration(batchSize)}
          />
        )}

        {/* Pre-generating */}
        {phase === 'pre_generating' && (
          <PreGenProgress
            progress={preGenProgress}
            activeGens={activeGens}
            totalPosts={5}
            step={preGenStep}
            startTime={preGenStartTime}
          />
        )}

        {/* ─── Reviewing — DESKTOP HORIZONTAL LAYOUT ────────────── */}
        {phase === 'reviewing' && currentPost && (
          <div className="flex items-center gap-8 px-8 w-full max-w-5xl">
            {/* Left: Reject button + menu */}
            <div className="shrink-0 relative">
              {!showRejectMenu ? (
                <button
                  onClick={() => setShowRejectMenu('main')}
                  disabled={!isCurrentReady || isSchedulingCurrent}
                  className="group w-16 h-16 rounded-full bg-white/5 border-2 border-red-400/40 text-red-400 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-red-500/20 hover:border-red-400 hover:scale-110 active:scale-95"
                  title="Reject — tell us why"
                >
                  <ThumbsDown className="w-6 h-6 group-hover:scale-110 transition-transform" />
                </button>
              ) : (
                <div className="w-56 bg-gray-800 border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-left-2 duration-150">
                  {showRejectMenu === 'main' ? (
                    <>
                      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                        <span className="text-xs font-semibold text-white/60">Why reject?</span>
                        <button onClick={() => { setShowRejectMenu(false); setRejectNote('') }} className="text-white/30 hover:text-white/60">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        onClick={() => setShowRejectMenu('image_sub')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
                      >
                        <ImageOff className="w-4 h-4 text-red-400 shrink-0" />
                        <span>Bad Image</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-auto text-white/30" />
                      </button>
                      <button
                        onClick={() => handleNo('bad_topic')}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
                      >
                        <MessageSquareX className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Bad Topic</span>
                      </button>
                      {/* Optional note */}
                      <div className="px-3 py-2 border-t border-white/10">
                        <textarea
                          value={rejectNote}
                          onChange={(e) => setRejectNote(e.target.value)}
                          placeholder="Optional note (details)..."
                          rows={2}
                          className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 placeholder:text-white/30 resize-none focus:outline-none focus:border-white/20"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2">
                        <button onClick={() => setShowRejectMenu('main')} className="text-white/30 hover:text-white/60">
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-semibold text-white/60">What's wrong?</span>
                      </div>
                      <button
                        onClick={() => handleNo('bad_image', 'not_centered')}
                        className="w-full text-left px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
                      >
                        🖼️ Not centered / needs more content
                      </button>
                      <button
                        onClick={() => handleNo('bad_image', 'image_bug')}
                        className="w-full text-left px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
                      >
                        🐛 Bug (extra limbs, artifacts)
                      </button>
                      <button
                        onClick={() => handleNo('bad_image', 'image_mismatch')}
                        className="w-full text-left px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
                      >
                        🔗 Doesn't match topic
                      </button>
                      {/* Optional note */}
                      <div className="px-3 py-2 border-t border-white/10">
                        <textarea
                          value={rejectNote}
                          onChange={(e) => setRejectNote(e.target.value)}
                          placeholder="Optional note (details)..."
                          rows={2}
                          className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/80 placeholder:text-white/30 resize-none focus:outline-none focus:border-white/20"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Center: Canvas with carousel navigation */}
            <div className="shrink-0 flex flex-col items-center gap-3">
              {isCurrentGenerating ? (
                <div
                  className="flex flex-col items-center justify-center bg-white/5 rounded-2xl border border-white/10"
                  style={{ width: CANVAS_WIDTH * REVIEW_SCALE, height: CANVAS_HEIGHT * REVIEW_SCALE }}
                >
                  <div className="w-12 h-12 rounded-full border-[3px] border-amber-200 border-t-amber-500 animate-spin" />
                  <p className="text-sm text-white/40 mt-4 font-medium">
                    {currentPost.status === 'pending_content'
                      ? 'Creating content...'
                      : 'Generating image...'}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/30 relative">
                  {/* Scheduling overlay — hides slide cycling flicker during capture */}
                  {isSchedulingCurrent && (
                    <div
                      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 rounded-2xl backdrop-blur-sm"
                      style={{ width: CANVAS_WIDTH * REVIEW_SCALE, height: CANVAS_HEIGHT * REVIEW_SCALE }}
                    >
                      <div className="w-10 h-10 rounded-full border-[3px] border-green-200 border-t-green-500 animate-spin" />
                      <p className="text-sm text-white/60 mt-3 font-medium">Scheduling...</p>
                    </div>
                  )}
                  {currentSlide === 0 ? (
                    <PostCanvas
                      brand={currentPost.brand}
                      title={displayTitle || 'GENERATING...'}
                      backgroundImage={currentPost.backgroundUrl}
                      settings={{ ...settings, fontSize: displayFontSize }}
                      scale={REVIEW_SCALE}
                      stageRef={(node: Konva.Stage | null) => { stageRef.current = node }}
                    />
                  ) : (
                    <CarouselTextSlide
                      brand={currentPost.brand}
                      text={(currentPost.slideTexts || [])[currentSlide - 1] || ''}
                      isLastSlide={currentSlide === (currentPost.slideTexts?.length || 0)}
                      scale={REVIEW_SCALE}
                      stageRef={(node: Konva.Stage | null) => { textSlideRef.current = node }}
                    />
                  )}
                </div>
              )}

              {/* Carousel slide navigation */}
              {!isCurrentGenerating && (currentPost.slideTexts?.length || 0) > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentSlide((s) => Math.max(0, s - 1))}
                    disabled={currentSlide === 0}
                    className="p-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/15 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-white/70" />
                  </button>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: 1 + (currentPost.slideTexts?.length || 0) }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentSlide(i)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          i === currentSlide
                            ? 'bg-amber-400 scale-125'
                            : 'bg-white/20 hover:bg-white/40'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setCurrentSlide((s) => Math.min((currentPost.slideTexts?.length || 0), s + 1))}
                    disabled={currentSlide >= (currentPost.slideTexts?.length || 0)}
                    className="p-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/15 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-white/70" />
                  </button>
                  <span className="text-xs text-white/30 ml-1">
                    {currentSlide === 0 ? 'Cover' : `Slide ${currentSlide}`} / {1 + (currentPost.slideTexts?.length || 0)}
                  </span>
                </div>
              )}
            </div>

            {/* Right: Controls panel */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              {/* Progress bar */}
              <ReviewProgressBar
                accepted={stats.accepted}
                total={totalPosts}
                ready={stats.ready}
                generating={stats.generating}
              />

              {/* Brand badge */}
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full ring-2 ring-white/20"
                  style={{ backgroundColor: getBrandColor(currentPost.brand) }}
                />
                <span className="text-white/80 text-sm font-semibold">
                  {getBrandLabel(currentPost.brand)}
                </span>
                <span className="text-white/30 text-xs">
                  Round {currentPost.round + 1}
                </span>
              </div>

              {/* Title edit */}
              <div>
                <label className="text-white/30 text-xs font-medium mb-1 block">Title</label>
                {editingTitle ? (
                  <input
                    type="text"
                    value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    onBlur={commitTitleEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') commitTitleEdit()
                    }}
                    autoFocus
                    className="w-full text-sm px-3 py-2 border border-amber-400/50 rounded-lg bg-amber-500/10 text-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 placeholder-white/30"
                    placeholder="Enter title..."
                  />
                ) : (
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition-colors group"
                    onClick={() => {
                      setEditTitleValue(currentPost.title)
                      setEditingTitle(true)
                    }}
                  >
                    <p className="flex-1 text-sm text-white/80 font-medium truncate">
                      {currentPost.title || 'No title'}
                    </p>
                    <Pencil className="w-3.5 h-3.5 text-white/30 group-hover:text-white/60 transition-colors shrink-0" />
                  </div>
                )}
              </div>

              {/* Caption / description */}
              {currentPost.caption && (
                <div>
                  <label className="text-white/30 text-xs font-medium mb-1 block">Caption</label>
                  <div className="max-h-32 overflow-y-auto rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white/60 leading-relaxed whitespace-pre-wrap custom-scrollbar">
                    {currentPost.caption}
                  </div>
                </div>
              )}

              {/* Font size + retry image */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-white/5 rounded-lg px-2 py-1 border border-white/10">
                  <button
                    onClick={() =>
                      setFontSizeOverride((prev) =>
                        Math.max(30, (prev ?? settings.fontSize) - 4),
                      )
                    }
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <Minus className="w-3 h-3 text-white/50" />
                  </button>
                  <span className="text-xs text-white/60 font-mono w-7 text-center">
                    {displayFontSize}
                  </span>
                  <button
                    onClick={() =>
                      setFontSizeOverride((prev) =>
                        Math.min(120, (prev ?? settings.fontSize) + 4),
                      )
                    }
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <Plus className="w-3 h-3 text-white/50" />
                  </button>
                </div>
                <button
                  onClick={retryImage}
                  disabled={isCurrentGenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg disabled:opacity-40 transition-colors text-white/60"
                >
                  <RefreshCw className="w-3 h-3" />
                  New Image
                </button>
              </div>

              {/* Accept button */}
              <button
                onClick={handleYes}
                disabled={!isCurrentReady || isSchedulingCurrent}
                className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:shadow-green-500/40 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isSchedulingCurrent ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Schedule Post
                  </>
                )}
              </button>

              <p className="text-white/20 text-xs text-center">
                Click title to edit · Reject to regenerate
              </p>
            </div>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <CompletionSummary
            queue={queue}
            totalPosts={totalPosts}
            numBrands={NUM_BRANDS}
            onClose={() => {
              clearSession()
              onClose()
            }}
          />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

/** Resume previous session dialog */
function ResumeDialog({
  session,
  onResume,
  onDiscard,
}: {
  session: GodSession
  onResume: () => void
  onDiscard: () => void
}) {
  const accepted = session.queue.filter((p) => p.status === 'accepted').length
  return (
    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <RotateCcw className="w-7 h-7 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Resume Session?</h2>
        <p className="text-gray-500 mt-2 text-sm">
          You have an unfinished session with{' '}
          <strong>
            {accepted}/{session.queue.length}
          </strong>{' '}
          posts scheduled.
        </p>
      </div>
      <div className="space-y-3">
        <button
          onClick={onResume}
          className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-colors"
        >
          <Play className="w-4 h-4 inline mr-2" />
          Resume Session
        </button>
        <button
          onClick={onDiscard}
          className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
        >
          Start Fresh
        </button>
      </div>
    </div>
  )
}

/** Batch size selector */
function BatchSelector({
  batchSize,
  setBatchSize,
  numBrands,
  onStart,
}: {
  batchSize: number
  setBatchSize: (n: number) => void
  numBrands: number
  onStart: () => void
}) {
  const total = batchSize * numBrands

  return (
    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-200/50">
          <Zap className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">God Automation</h2>
        <p className="text-gray-500 mt-2 text-sm leading-relaxed">
          Batch generate, review, and auto-schedule
          <br />
          posts across all <strong>{numBrands} brands</strong>.
        </p>
      </div>

      <label className="block text-sm font-semibold text-gray-700 mb-3">
        Rounds per brand
      </label>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[2, 4, 8, 10].map((n) => (
          <button
            key={n}
            onClick={() => setBatchSize(n)}
            className={`py-3.5 rounded-xl font-bold text-lg transition-all ${
              batchSize === n
                ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-200/50 scale-105'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 mb-8 py-2 px-4 bg-gray-50 rounded-lg">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <span className="text-sm text-gray-600">
          {batchSize} rounds × {numBrands} brands ={' '}
          <strong className="text-gray-900">{total} posts</strong>
        </span>
      </div>

      <button
        onClick={onStart}
        className="w-full py-4 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-amber-200/40 hover:shadow-amber-300/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        <Zap className="w-5 h-5 inline mr-2" />
        Start God Mode
        <ArrowRight className="w-5 h-5 inline ml-2" />
      </button>
    </div>
  )
}

/** Pre-generation progress screen with ETA */
function PreGenProgress({
  progress,
  activeGens,
  totalPosts,
  step,
  startTime,
}: {
  progress: number
  activeGens: number
  totalPosts: number
  step: 'slots' | 'titles' | 'images'
  startTime: number
}) {
  const circumference = 2 * Math.PI * 34

  const stepLabel =
    step === 'slots'
      ? 'Checking schedule slots...'
      : step === 'titles'
        ? `Generating ${totalPosts} titles...`
        : `Generating ${totalPosts} images...`

  // ETA calculation
  const elapsed = startTime > 0 ? (Date.now() - startTime) / 1000 : 0
  let etaLabel = ''
  if (progress > 5 && progress < 100 && startTime > 0) {
    const totalEstimate = (elapsed / progress) * 100
    const remaining = Math.max(0, totalEstimate - elapsed)
    if (remaining < 60) {
      etaLabel = `~${Math.ceil(remaining)}s remaining`
    } else {
      etaLabel = `~${Math.ceil(remaining / 60)}m remaining`
    }
  }

  return (
    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
      <div className="relative w-20 h-20 mx-auto mb-6">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            stroke="#f3f4f6"
            strokeWidth="6"
          />
          <circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            stroke="url(#amber-grad)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${circumference * (1 - progress / 100)}`}
            className="transition-all duration-500"
          />
          <defs>
            <linearGradient id="amber-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#eab308" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-gray-900">{progress}%</span>
        </div>
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Preparing first posts</h2>
      <p className="text-gray-500 text-sm mb-3">
        Just {totalPosts} posts to start — rest generates while you review
      </p>
      <div className="flex flex-col items-center gap-1.5 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          {step === 'images' && activeGens > 0 ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Type className="w-3.5 h-3.5" />
          )}
          {stepLabel}
        </span>
        {etaLabel && (
          <span className="text-gray-300 font-medium">{etaLabel}</span>
        )}
      </div>
    </div>
  )
}

/** Progress bar in review mode */
function ReviewProgressBar({
  accepted,
  total,
  ready,
  generating,
}: {
  accepted: number
  total: number
  ready: number
  generating: number
}) {
  const pct = total > 0 ? (accepted / total) * 100 : 0
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-white/50">
          {accepted} of {total} scheduled
        </span>
        <div className="flex items-center gap-3 text-white/40">
          {ready > 0 && (
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              {ready} ready
            </span>
          )}
          {generating > 0 && (
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {generating} generating
            </span>
          )}
        </div>
      </div>
      <div className="w-full bg-white/10 rounded-full h-1.5">
        <div
          className="bg-gradient-to-r from-green-400 to-emerald-400 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/** Completion summary */
function CompletionSummary({
  queue,
  totalPosts,
  onClose,
}: {
  queue: GodPost[]
  totalPosts: number
  numBrands: number
  onClose: () => void
}) {
  const accepted = queue.filter((p) => p.status === 'accepted')
  const byBrand = accepted.reduce(
    (acc, p) => {
      acc[p.brand] = (acc[p.brand] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  return (
    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-green-200/50">
        <Check className="w-8 h-8 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">
        God Mode Complete
      </h2>
      <p className="text-gray-500 text-sm mb-6">
        {accepted.length} of {totalPosts} posts scheduled
      </p>

      {/* Per-brand breakdown */}
      <div className="space-y-2 mb-6">
        {Object.entries(byBrand).map(([brand, count]) => (
          <div
            key={brand}
            className="flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-xl"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: getBrandColor(brand as BrandName),
                }}
              />
              <span className="text-sm font-medium text-gray-700">
                {getBrandLabel(brand as BrandName)}
              </span>
            </div>
            <span className="text-sm font-bold text-gray-900">
              {count} posts
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <a
          href="/scheduled"
          className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-white rounded-xl font-semibold hover:from-amber-600 hover:to-yellow-600 transition-colors"
        >
          <Calendar className="w-4 h-4" />
          View Scheduled Posts
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button
          onClick={onClose}
          className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
