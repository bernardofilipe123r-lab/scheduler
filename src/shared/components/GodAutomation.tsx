/**
 * God Automation 🔱 — batch post generation with Tinder-style review.
 *
 * Flow:
 * 1. User picks batch size (2 / 4 / 8 / 10 rounds per brand).
 * 2. Pre-generate 2 full rounds of content + images (10 posts).
 * 3. Enter Tinder review: one card at a time.
 *    • Yes → auto-schedule immediately, unlock next post for that brand.
 *    • No  → discard, generate replacement (new topic + title + image).
 * 4. User can edit title, font size, or retry image on each card.
 *
 * Window: at most NUM_BRANDS concurrent image-generation requests.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
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
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_PREVIEW_SCALE,
  POST_BRAND_OFFSETS,
  PostCanvas,
} from '@/shared/components/PostCanvas'
import type { GeneralSettings } from '@/shared/components/PostCanvas'
import type { BrandName } from '@/shared/types'
import { getBrandLabel, getBrandColor } from '@/features/brands'

// ─── Types ───────────────────────────────────────────────────────────
interface GodPost {
  /** Global sequential index (0-based) */
  index: number
  /** Which brand */
  brand: BrandName
  /** Which round (0-based) for this brand */
  round: number
  /** AI-generated title */
  title: string
  /** AI-generated caption */
  caption: string
  /** AI image prompt */
  aiPrompt: string
  /** Base64 data URL of the background, or null if not yet generated */
  backgroundUrl: string | null
  /** Current lifecycle */
  status:
    | 'pending_content'    // waiting for title/caption
    | 'pending_image'      // content ready, image not yet generated
    | 'generating_image'   // image being generated
    | 'ready'              // fully generated, awaiting review
    | 'reviewing'          // currently shown to user
    | 'accepted'           // user said Yes (scheduled)
    | 'rejected'           // user said No (will be replaced)
}

type Phase = 'batch_select' | 'pre_generating' | 'reviewing' | 'done'

interface Props {
  brands: BrandName[]
  settings: GeneralSettings
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Order brands by their POST_BRAND_OFFSETS (ascending). */
function sortBrandsByOffset(brands: BrandName[]): BrandName[] {
  return [...brands].sort(
    (a, b) => (POST_BRAND_OFFSETS[a] ?? 99) - (POST_BRAND_OFFSETS[b] ?? 99)
  )
}

/** Build the full queue: rounds × brands in offset order. */
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
        aiPrompt: '',
        backgroundUrl: null,
        status: 'pending_content',
      })
    }
  }
  return queue
}

// ──────────────────────────────────────────────────────────────────────
export function GodAutomation({ brands, settings, onClose }: Props) {
  const NUM_BRANDS = brands.length

  // ── State ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('batch_select')
  const [batchSize, setBatchSize] = useState(2)
  const [queue, setQueue] = useState<GodPost[]>([])
  const [reviewIndex, setReviewIndex] = useState(0) // index into queue of current card
  const [activeImageGens, setActiveImageGens] = useState(0)
  const [preGenProgress, setPreGenProgress] = useState(0)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [fontSizeOverride, setFontSizeOverride] = useState<number | null>(null)
  const stageRef = useRef<Konva.Stage | null>(null)

  // Occupied slots tracker (brand → ISO strings)
  const occupiedRef = useRef<Record<string, string[]>>({})

  // Track which indices have been "unlocked" for generation
  const unlockedRef = useRef<Set<number>>(new Set())

  // ── Batch selection ────────────────────────────────────────────────
  const totalPosts = batchSize * NUM_BRANDS

  const startGeneration = async () => {
    const q = buildQueue(brands, batchSize)
    setQueue(q)
    setPhase('pre_generating')
    setPreGenProgress(0)

    // Fetch occupied slots
    try {
      const resp = await fetch('/reels/scheduled/occupied-post-slots')
      if (resp.ok) {
        const data = await resp.json()
        occupiedRef.current = data.occupied || {}
      }
    } catch {
      /* continue without */
    }

    // 1) Generate content for the first 2 rounds (2 × NUM_BRANDS posts)
    const preGenCount = Math.min(2 * NUM_BRANDS, q.length)
    try {
      const contentResp = await fetch('/reels/generate-post-titles-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: preGenCount }),
      })
      if (!contentResp.ok) throw new Error('Failed to generate content')
      const { posts: contentPosts } = await contentResp.json()

      // Apply content to queue
      setQueue((prev) => {
        const next = [...prev]
        for (let i = 0; i < preGenCount && i < contentPosts.length; i++) {
          next[i] = {
            ...next[i],
            title: contentPosts[i].title || '',
            caption: contentPosts[i].caption || '',
            aiPrompt: contentPosts[i].image_prompt || '',
            status: 'pending_image',
          }
        }
        return next
      })
    } catch (err) {
      toast.error('Failed to generate content')
      setPhase('batch_select')
      return
    }

    setPreGenProgress(20)

    // 2) Generate images for the first 2 rounds (up to NUM_BRANDS concurrent)
    // We'll generate them sequentially-ish but with a concurrency window
    await generateImagesForRange(q, 0, preGenCount)

    setPhase('reviewing')
    setReviewIndex(0)
  }

  /** Generate images for posts in range [start, end), respecting concurrency. */
  const generateImagesForRange = useCallback(
    async (currentQueue: GodPost[], start: number, end: number) => {
      const promises: Promise<void>[] = []
      let completed = 0
      const total = end - start

      for (let i = start; i < end; i++) {
        const idx = i
        const p = (async () => {
          // Wait for content to be available
          // Content was pre-filled in startGeneration
          const post = currentQueue[idx]
          if (!post || !post.aiPrompt) return

          setQueue((prev) => {
            const next = [...prev]
            if (next[idx]) next[idx] = { ...next[idx], status: 'generating_image' }
            return next
          })
          setActiveImageGens((prev) => prev + 1)

          try {
            const resp = await fetch('/reels/generate-post-background', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                brand: post.brand,
                prompt: post.aiPrompt,
              }),
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
            // Mark as ready even without image (user can retry)
            setQueue((prev) => {
              const next = [...prev]
              if (next[idx]) next[idx] = { ...next[idx], status: 'ready' }
              return next
            })
          } finally {
            setActiveImageGens((prev) => Math.max(0, prev - 1))
            completed++
            setPreGenProgress(20 + Math.round((completed / total) * 80))
          }
        })()

        promises.push(p)

        // Concurrency control: if we've launched NUM_BRANDS, wait for one to finish
        if (promises.length >= NUM_BRANDS) {
          await Promise.race(promises)
        }
      }

      await Promise.all(promises)
    },
    [NUM_BRANDS]
  )

  // ── Generate a single post (for rejection replacements or later rounds) ──
  const generateSinglePost = useCallback(
    async (idx: number, brand: BrandName) => {
      // 1) Generate new content
      setQueue((prev) => {
        const next = [...prev]
        if (next[idx]) next[idx] = { ...next[idx], status: 'pending_content' }
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
        const content = posts[0]

        setQueue((prev) => {
          const next = [...prev]
          if (next[idx]) {
            next[idx] = {
              ...next[idx],
              title: content.title || '',
              caption: content.caption || '',
              aiPrompt: content.image_prompt || '',
              status: 'generating_image',
            }
          }
          return next
        })

        // 2) Generate image
        setActiveImageGens((prev) => prev + 1)
        const imgResp = await fetch('/reels/generate-post-background', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand,
            prompt: content.image_prompt,
          }),
        })
        if (!imgResp.ok) throw new Error('Image gen failed')
        const imgData = await imgResp.json()

        setQueue((prev) => {
          const next = [...prev]
          if (next[idx]) {
            next[idx] = {
              ...next[idx],
              backgroundUrl: imgData.background_data,
              status: 'ready',
            }
          }
          return next
        })
      } catch {
        toast.error('Failed to regenerate post')
        setQueue((prev) => {
          const next = [...prev]
          if (next[idx]) next[idx] = { ...next[idx], status: 'ready' }
          return next
        })
      } finally {
        setActiveImageGens((prev) => Math.max(0, prev - 1))
      }
    },
    []
  )

  // ── Retry image only ───────────────────────────────────────────────
  const retryImage = useCallback(async (idx: number) => {
    setQueue((prev) => {
      const next = [...prev]
      if (next[idx]) next[idx] = { ...next[idx], status: 'generating_image', backgroundUrl: null }
      return next
    })
    setActiveImageGens((prev) => prev + 1)

    try {
      const post = queue[idx]
      if (!post) return
      const resp = await fetch('/reels/generate-post-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: post.brand, prompt: post.aiPrompt }),
      })
      if (!resp.ok) throw new Error()
      const data = await resp.json()
      setQueue((prev) => {
        const next = [...prev]
        if (next[idx]) {
          next[idx] = { ...next[idx], backgroundUrl: data.background_data, status: 'ready' }
        }
        return next
      })
    } catch {
      toast.error('Failed to regenerate image')
      setQueue((prev) => {
        const next = [...prev]
        if (next[idx]) next[idx] = { ...next[idx], status: 'ready' }
        return next
      })
    } finally {
      setActiveImageGens((prev) => Math.max(0, prev - 1))
    }
  }, [queue])

  // ── Find next schedule slot for a brand ────────────────────────────
  const getNextSlotForBrand = (brand: BrandName): Date => {
    const offset = POST_BRAND_OFFSETS[brand] || 0
    const now = new Date()
    const occupied = occupiedRef.current[brand.toLowerCase()] || []

    const isOccupied = (dt: Date): boolean => {
      const key = dt.toISOString().slice(0, 16)
      return occupied.some((s) => s.slice(0, 16) === key)
    }

    for (let dayOff = 0; dayOff < 60; dayOff++) {
      for (const baseHour of [0, 12]) {
        const slot = new Date(now)
        slot.setDate(slot.getDate() + dayOff)
        slot.setHours(baseHour + offset, 0, 0, 0)
        if (slot <= now) continue
        if (isOccupied(slot)) continue
        return slot
      }
    }
    // Fallback
    const fb = new Date(now)
    fb.setDate(fb.getDate() + 60)
    fb.setHours(offset, 0, 0, 0)
    return fb
  }

  // ── Auto-schedule a single post ────────────────────────────────────
  const schedulePost = useCallback(
    async (post: GodPost) => {
      if (!stageRef.current) return false

      const imageData = stageRef.current.toDataURL({
        pixelRatio: 1 / GRID_PREVIEW_SCALE,
        mimeType: 'image/png',
      })

      const slot = getNextSlotForBrand(post.brand)

      try {
        const resp = await fetch('/reels/schedule-post-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand: post.brand,
            title: post.title,
            caption: post.caption,
            image_data: imageData,
            schedule_time: slot.toISOString(),
          }),
        })
        if (!resp.ok) throw new Error()

        // Mark slot as occupied
        const key = post.brand.toLowerCase()
        if (!occupiedRef.current[key]) occupiedRef.current[key] = []
        occupiedRef.current[key].push(slot.toISOString())

        return true
      } catch {
        toast.error(`Failed to schedule ${getBrandLabel(post.brand)} post`)
        return false
      }
    },
    [queue]
  )

  // ── Unlock generation of the next post for a brand after user answers ──
  const unlockNextForBrand = useCallback(
    (answeredIndex: number) => {
      const nextIdx = answeredIndex + NUM_BRANDS
      if (nextIdx >= queue.length) return
      if (unlockedRef.current.has(nextIdx)) return
      unlockedRef.current.add(nextIdx)

      const post = queue[nextIdx]
      if (!post || post.status !== 'pending_content') return

      // Generate content + image for this post
      generateSinglePost(nextIdx, post.brand)
    },
    [queue, NUM_BRANDS, generateSinglePost]
  )

  // ── Swipe handlers ─────────────────────────────────────────────────
  const handleYes = async () => {
    const post = queue[reviewIndex]
    if (!post) return

    toast.loading('Scheduling...', { id: 'god-sched' })
    const ok = await schedulePost(post)
    if (ok) {
      toast.success(
        `✅ ${getBrandLabel(post.brand)} scheduled!`,
        { id: 'god-sched', duration: 2000 }
      )
    } else {
      toast.error('Schedule failed', { id: 'god-sched' })
    }

    setQueue((prev) => {
      const next = [...prev]
      next[reviewIndex] = { ...next[reviewIndex], status: 'accepted' }
      return next
    })

    // Unlock next post for this brand
    unlockNextForBrand(reviewIndex)

    // Reset overrides
    setFontSizeOverride(null)
    setEditingTitle(false)

    // Move to next unreviewed post
    advanceToNext(reviewIndex)
  }

  const handleNo = () => {
    const post = queue[reviewIndex]
    if (!post) return

    // Mark as rejected
    setQueue((prev) => {
      const next = [...prev]
      next[reviewIndex] = { ...next[reviewIndex], status: 'rejected' }
      return next
    })

    // Generate replacement at same index (same brand, new content)
    generateSinglePost(reviewIndex, post.brand)

    // Reset overrides
    setFontSizeOverride(null)
    setEditingTitle(false)

    // Stay on same index (it will regenerate and become 'ready' again)
    // But we can advance to the next ready post while this one regenerates
    advanceToNextOrWait()
  }

  /** Find the next post to review. */
  const advanceToNext = (fromIndex: number) => {
    for (let i = fromIndex + 1; i < queue.length; i++) {
      if (queue[i].status === 'ready' || queue[i].status === 'reviewing') {
        setReviewIndex(i)
        return
      }
    }
    // Check if we wrapped around or if all are done/pending
    // Look for any remaining non-accepted post
    const remaining = queue.filter(
      (p, idx) => idx > fromIndex && p.status !== 'accepted' && p.status !== 'rejected'
    )
    if (remaining.length === 0) {
      // Check all
      const allDone = queue.every(
        (p) => p.status === 'accepted'
      )
      if (allDone) {
        setPhase('done')
        return
      }
    }
    // Stay or find first non-accepted
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status !== 'accepted' && queue[i].status !== 'rejected') {
        setReviewIndex(i)
        return
      }
    }
    setPhase('done')
  }

  const advanceToNextOrWait = () => {
    // Try to find next ready post after current
    for (let i = reviewIndex + 1; i < queue.length; i++) {
      if (queue[i].status === 'ready') {
        setReviewIndex(i)
        return
      }
    }
    // Wrap around
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === 'ready' && i !== reviewIndex) {
        setReviewIndex(i)
        return
      }
    }
    // Stay on current (it's regenerating, will become ready)
  }

  // Watch queue changes to update review if current card becomes ready after rejection replacement
  useEffect(() => {
    if (phase !== 'reviewing') return
    const current = queue[reviewIndex]
    if (!current) return
    // If current is still being generated, don't advance
  }, [queue, reviewIndex, phase])

  // ── Current post helpers ───────────────────────────────────────────
  const currentPost = queue[reviewIndex]
  const isCurrentReady = currentPost?.status === 'ready'
  const isCurrentGenerating =
    currentPost?.status === 'pending_content' ||
    currentPost?.status === 'pending_image' ||
    currentPost?.status === 'generating_image'

  const displayTitle = editingTitle ? editTitleValue : currentPost?.title || ''
  const displayFontSize = fontSizeOverride ?? settings.fontSize

  const acceptedCount = queue.filter((p) => p.status === 'accepted').length
  const readyCount = queue.filter((p) => p.status === 'ready').length

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="relative w-full h-full max-w-6xl mx-auto flex flex-col p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* ─── Phase: Batch Selection ─────────────────────────────── */}
        {phase === 'batch_select' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <div className="text-center mb-8">
                <div className="text-5xl mb-3">🔱</div>
                <h2 className="text-2xl font-bold text-gray-900">God Automation</h2>
                <p className="text-gray-500 mt-2 text-sm">
                  Generate and review posts for all {NUM_BRANDS} brands.
                  <br />
                  Total = rounds × {NUM_BRANDS} brands.
                </p>
              </div>

              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Rounds per brand
              </label>
              <div className="grid grid-cols-4 gap-3 mb-2">
                {[2, 4, 8, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setBatchSize(n)}
                    className={`py-3 rounded-xl font-bold text-lg transition-all ${
                      batchSize === n
                        ? 'bg-amber-500 text-white shadow-lg shadow-amber-200/50 scale-105'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 text-center mb-6">
                {batchSize} rounds × {NUM_BRANDS} brands = <strong>{totalPosts} posts</strong>
              </p>

              <button
                onClick={startGeneration}
                className="w-full py-4 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-amber-200/50 hover:from-amber-600 hover:via-yellow-600 hover:to-amber-700 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Zap className="w-5 h-5 inline mr-2" />
                Start God Mode
              </button>
            </div>
          </div>
        )}

        {/* ─── Phase: Pre-generating ──────────────────────────────── */}
        {phase === 'pre_generating' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
              <div className="text-5xl mb-4 animate-pulse">🔱</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Generating posts...
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                Creating content and images for the first {Math.min(2 * NUM_BRANDS, totalPosts)} posts
              </p>

              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div
                  className="bg-gradient-to-r from-amber-500 to-yellow-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${preGenProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">{preGenProgress}%</p>

              <div className="mt-4 text-xs text-gray-400">
                {activeImageGens > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {activeImageGens} image(s) generating...
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Phase: Tinder Review ───────────────────────────────── */}
        {phase === 'reviewing' && currentPost && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            {/* Progress bar */}
            <div className="w-full max-w-xl">
              <div className="flex items-center justify-between text-sm text-white/70 mb-1">
                <span>
                  Post {acceptedCount + 1} of {totalPosts}
                </span>
                <span>
                  ✅ {acceptedCount} accepted · 🔄 {readyCount} ready
                </span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-2">
                <div
                  className="bg-green-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(acceptedCount / totalPosts) * 100}%` }}
                />
              </div>
            </div>

            {/* Brand indicator */}
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getBrandColor(currentPost.brand) }}
              />
              <span className="text-white font-medium text-sm">
                {getBrandLabel(currentPost.brand)} · Round {currentPost.round + 1}
              </span>
            </div>

            {/* Card */}
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-sm">
              {isCurrentGenerating ? (
                <div
                  className="flex items-center justify-center bg-gray-100"
                  style={{ width: CANVAS_WIDTH * GRID_PREVIEW_SCALE, height: CANVAS_HEIGHT * GRID_PREVIEW_SCALE }}
                >
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Generating...</p>
                  </div>
                </div>
              ) : (
                <PostCanvas
                  brand={currentPost.brand}
                  title={displayTitle || 'GENERATING...'}
                  backgroundImage={currentPost.backgroundUrl}
                  settings={{ ...settings, fontSize: displayFontSize }}
                  scale={GRID_PREVIEW_SCALE}
                  stageRef={(node) => { stageRef.current = node }}
                />
              )}

              {/* Controls under card */}
              <div className="p-3 space-y-2">
                {/* Title edit */}
                <div className="flex items-center gap-2">
                  {editingTitle ? (
                    <input
                      type="text"
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onBlur={() => {
                        if (editTitleValue.trim()) {
                          setQueue((prev) => {
                            const next = [...prev]
                            next[reviewIndex] = { ...next[reviewIndex], title: editTitleValue }
                            return next
                          })
                        }
                        setEditingTitle(false)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          ;(e.target as HTMLInputElement).blur()
                        }
                      }}
                      autoFocus
                      className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded"
                    />
                  ) : (
                    <p className="flex-1 text-xs text-gray-600 truncate">
                      {currentPost.title}
                    </p>
                  )}
                  <button
                    onClick={() => {
                      setEditTitleValue(currentPost.title)
                      setEditingTitle(true)
                    }}
                    className="p-1 hover:bg-gray-100 rounded"
                    title="Edit title"
                  >
                    <Pencil className="w-3 h-3 text-gray-400" />
                  </button>
                </div>

                {/* Font size + retry image */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        setFontSizeOverride((prev) =>
                          Math.max(30, (prev ?? settings.fontSize) - 4)
                        )
                      }
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs text-gray-500 w-8 text-center">
                      {displayFontSize}
                    </span>
                    <button
                      onClick={() =>
                        setFontSizeOverride((prev) =>
                          Math.min(120, (prev ?? settings.fontSize) + 4)
                        )
                      }
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => retryImage(reviewIndex)}
                    disabled={isCurrentGenerating}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry Image
                  </button>
                </div>
              </div>
            </div>

            {/* Swipe buttons */}
            <div className="flex items-center gap-6 mt-2">
              <button
                onClick={handleNo}
                disabled={!isCurrentReady}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-200/50 disabled:opacity-50 transition-all hover:scale-110 active:scale-95"
                title="No — regenerate"
              >
                <ThumbsDown className="w-7 h-7" />
              </button>
              <button
                onClick={handleYes}
                disabled={!isCurrentReady}
                className="w-20 h-20 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg shadow-green-200/50 disabled:opacity-50 transition-all hover:scale-110 active:scale-95"
                title="Yes — schedule"
              >
                <Check className="w-9 h-9" />
              </button>
            </div>
          </div>
        )}

        {/* ─── Phase: Done ────────────────────────────────────────── */}
        {phase === 'done' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                God Mode Complete
              </h2>
              <p className="text-gray-500 mb-6">
                {acceptedCount} posts scheduled across {NUM_BRANDS} brands.
              </p>
              <button
                onClick={onClose}
                className="w-full py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
