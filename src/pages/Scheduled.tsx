import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  List,
  Grid,
  ExternalLink,
  Trash2,
  Loader2,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Clock,
  Send,
  Filter,
  X,
  Check,
  Wrench,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  parseISO
} from 'date-fns'
import { useScheduledPosts, useDeleteScheduled, useDeleteScheduledForDay, useRetryFailed, useReschedule, usePublishNow } from '@/features/scheduling'
import { BrandBadge, getBrandColor, getBrandLabel, useDynamicBrands } from '@/features/brands'
import { PageLoader, Modal } from '@/shared/components'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PostCanvas,
  loadGeneralSettings,
} from '@/shared/components/PostCanvas'
import { CarouselTextSlide } from '@/shared/components/CarouselTextSlide'
import { apiClient } from '@/shared/api/client'
import type { ScheduledPost, BrandName, Variant } from '@/shared/types'

// Time slot configuration per brand
// Each brand has 6 slots per day: 3 light and 3 dark
// Pattern: Every 4 hours, alternating L/D/L/D/L/D
// Each brand is offset by N hours from 12:00 AM
// Offsets now come from the DB via useDynamicBrands()

// Platform type for filtering
type PlatformFilter = 'all' | 'instagram' | 'facebook' | 'youtube'
type ContentTypeFilter = 'all' | 'reels' | 'posts'

const BASE_SLOTS: Array<{ hour: number; variant: Variant }> = [
  { hour: 0, variant: 'light' },   // 12 AM
  { hour: 4, variant: 'dark' },    // 4 AM  
  { hour: 8, variant: 'light' },   // 8 AM
  { hour: 12, variant: 'dark' },   // 12 PM
  { hour: 16, variant: 'light' },  // 4 PM
  { hour: 20, variant: 'dark' },   // 8 PM
]

function getBrandSlots(brand: BrandName, brandOffsets: Record<string, number>): Array<{ hour: number; variant: Variant }> {
  const offset = brandOffsets[brand] || 0
  return BASE_SLOTS.map(slot => ({
    hour: (slot.hour + offset) % 24,
    variant: slot.variant
  }))
}

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM'
  if (hour === 12) return '12:00 PM'
  if (hour < 12) return `${hour}:00 AM`
  return `${hour - 12}:00 PM`
}

/** Format an ISO datetime string as local time */
function formatTime(iso: string, fmt: '24h' | '12h' = '24h'): string {
  return format(parseISO(iso), fmt === '24h' ? 'HH:mm' : 'h:mm a')
}

/** Format an ISO datetime string as a full local date + time */
function formatDateTime(iso: string): string {
  return format(parseISO(iso), 'MMMM d, yyyy h:mm a')
}

export function ScheduledPage() {
  const navigate = useNavigate()
  const { data: posts = [], isLoading } = useScheduledPosts()
  const deleteScheduled = useDeleteScheduled()
  const deleteScheduledForDay = useDeleteScheduledForDay()
  const retryFailed = useRetryFailed()
  const reschedule = useReschedule()
  const publishNow = usePublishNow()
  const { brands: dynamicBrands } = useDynamicBrands()
  
  // Build brand offsets dynamically from DB schedule_offset
  const brandOffsets = useMemo(() => {
    const offsets: Record<string, number> = {}
    dynamicBrands.forEach(b => { offsets[b.id] = b.scheduleOffset })
    return offsets
  }, [dynamicBrands])
  
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [statsFilter, setStatsFilter] = useState<'future' | 'all'>('future')
  const [brandFilter, setBrandFilter] = useState<BrandName | null>(null)
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all')
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentTypeFilter>('all')
  const [selectedDayForMissing, setSelectedDayForMissing] = useState<Date | null>(null)
  const [isCleaning, setIsCleaning] = useState(false)
  const [isCleaningReels, setIsCleaningReels] = useState(false)
  const [detailSlideIndex, setDetailSlideIndex] = useState(0)

  // Post preview: brand logos + layout settings (mirrors PostJobDetail)
  const [brandLogos, setBrandLogos] = useState<Record<string, string>>({})
  const postSettings = useMemo(() => loadGeneralSettings(), [])
  const DETAIL_PREVIEW_SCALE = 320 / CANVAS_WIDTH

  // Fetch brand logo when a post is selected
  useEffect(() => {
    if (!selectedPost) return
    const brand = selectedPost.brand
    if (brandLogos[brand]) return
    const fetchLogo = async () => {
      try {
        const d = await apiClient.get<{ theme?: { logo?: string } }>(`/api/brands/${brand}/theme`)
        if (d.theme?.logo) {
          const url = d.theme.logo.startsWith('http') ? d.theme.logo : `/brand-logos/${d.theme.logo}`
          setBrandLogos(prev => ({ ...prev, [brand]: url }))
        }
      } catch { /* ignore */ }
    }
    fetchLogo()
  }, [selectedPost?.brand])

  
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calendarStart = startOfWeek(monthStart)
    const calendarEnd = endOfWeek(monthEnd)
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  }, [currentDate])
  
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate)
    const weekEnd = endOfWeek(currentDate)
    return eachDayOfInterval({ start: weekStart, end: weekEnd })
  }, [currentDate])
  
  const postsByDate = useMemo(() => {
    const grouped: Record<string, ScheduledPost[]> = {}
    
    posts.forEach(post => {
      // Apply content type filter
      if (contentTypeFilter !== 'all') {
        const variant = post.metadata?.variant || 'light'
        const isPost = variant === 'post'
        if (contentTypeFilter === 'posts' && !isPost) return
        if (contentTypeFilter === 'reels' && isPost) return
      }

      const d = parseISO(post.scheduled_time)
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!grouped[dateKey]) {
        grouped[dateKey] = []
      }
      grouped[dateKey].push(post)
    })
    
    return grouped
  }, [posts, contentTypeFilter])
  
  // Analyze slots for a specific brand on a specific day
  const analyzeSlots = useMemo(() => {
    if (!brandFilter) return null
    
    const brandSlots = getBrandSlots(brandFilter, brandOffsets)
    const lightSlots = brandSlots.filter(s => s.variant === 'light').map(s => s.hour)
    const darkSlots = brandSlots.filter(s => s.variant === 'dark').map(s => s.hour)
    
    return (day: Date) => {
      // Use same key format as getPostsForDay (local calendar date)
      const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
      const dayPosts = postsByDate[dateKey] || []
      
      // Filter to just this brand's posts
      const brandPosts = dayPosts.filter(p => p.brand === brandFilter)
      
      // Extract scheduled hours by variant
      const scheduledLight: number[] = []
      const scheduledDark: number[] = []
      
      brandPosts.forEach(post => {
        const hour = parseISO(post.scheduled_time).getHours()
        const variant = post.metadata?.variant || 'light'
        if (variant === 'light') {
          scheduledLight.push(hour)
        } else {
          scheduledDark.push(hour)
        }
      })
      
      // Find missing slots
      const missingLight = lightSlots.filter(h => !scheduledLight.includes(h))
      const missingDark = darkSlots.filter(h => !scheduledDark.includes(h))
      
      const totalExpected = 6 // 3 light + 3 dark
      const totalScheduled = brandPosts.length
      const allFilled = missingLight.length === 0 && missingDark.length === 0
      
      return {
        allFilled,
        totalExpected,
        totalScheduled,
        missingLight,
        missingDark,
        lightSlots,
        darkSlots
      }
    }
  }, [brandFilter, postsByDate, brandOffsets])
  
  const getPostsForDay = (date: Date) => {
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    let dayPosts = postsByDate[dateKey] || []
    
    // Apply platform filter
    if (platformFilter !== 'all') {
      dayPosts = dayPosts.filter(post => {
        // Check metadata for platform info, or assume all posts go to all platforms
        const platforms = post.metadata?.platforms || ['instagram', 'facebook', 'youtube']
        return platforms.includes(platformFilter)
      })
    }
    
    return dayPosts
  }
  
  const goToToday = () => setCurrentDate(new Date())
  const goPrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(prev => subMonths(prev, 1))
    } else {
      setCurrentDate(prev => subWeeks(prev, 1))
    }
  }
  const goNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(prev => addMonths(prev, 1))
    } else {
      setCurrentDate(prev => addWeeks(prev, 1))
    }
  }
  
  const handleDelete = async (post: ScheduledPost) => {
    try {
      await deleteScheduled.mutateAsync(post.id)
      toast.success('Post unscheduled')
      setSelectedPost(null)
    } catch {
      toast.error('Failed to unschedule')
    }
  }
  
  const handleRetry = async (post: ScheduledPost) => {
    try {
      await retryFailed.mutateAsync(post.id)
      toast.success('Post queued for retry')
      setSelectedPost(null)
    } catch {
      toast.error('Failed to retry')
    }
  }
  
  const handlePublishNow = async (post: ScheduledPost) => {
    try {
      await publishNow.mutateAsync(post.id)
      toast.success('Post queued for immediate publishing')
      setSelectedPost(null)
    } catch {
      toast.error('Failed to queue for publishing')
    }
  }

  const handleCleanPostSlots = async () => {
    setIsCleaning(true)
    toast.loading('Cleaning post schedule collisions...', { id: 'clean' })
    try {
      const resp = await fetch('/reels/scheduled/clean-post-slots', { method: 'POST' })
      if (!resp.ok) throw new Error('Failed')
      const data = await resp.json()
      if (data.collisions_found === 0) {
        toast.success('No collisions found – schedule is clean!', { id: 'clean' })
      } else {
        toast.success(data.message, { id: 'clean', duration: 5000 })
      }
      // Refresh the posts list
      window.location.reload()
    } catch {
      toast.error('Failed to clean post slots', { id: 'clean' })
    } finally {
      setIsCleaning(false)
    }
  }
  
  const handleCleanReelSlots = async () => {
    setIsCleaningReels(true)
    toast.loading('Cleaning reel schedule slots...', { id: 'clean-reels' })
    try {
      const resp = await fetch('/reels/scheduled/clean-reel-slots', { method: 'POST' })
      if (!resp.ok) throw new Error('Failed')
      const data = await resp.json()
      if (data.total_fixed === 0) {
        toast.success('All reels are on correct slots!', { id: 'clean-reels' })
      } else {
        toast.success(data.message, { id: 'clean-reels', duration: 5000 })
      }
      // Refresh the posts list
      window.location.reload()
    } catch {
      toast.error('Failed to clean reel slots', { id: 'clean-reels' })
    } finally {
      setIsCleaningReels(false)
    }
  }

  const openRescheduleModal = (post: ScheduledPost) => {
    const currentTime = parseISO(post.scheduled_time)
    setRescheduleDate(format(currentTime, 'yyyy-MM-dd'))
    setRescheduleTime(format(currentTime, 'HH:mm'))
    setShowRescheduleModal(true)
  }
  
  const handleReschedule = async () => {
    if (!selectedPost || !rescheduleDate || !rescheduleTime) return
    
    try {
      const isoString = `${rescheduleDate}T${rescheduleTime}:00`
      await reschedule.mutateAsync({
        id: selectedPost.id,
        scheduledTime: new Date(isoString).toISOString()
      })
      toast.success(`Post rescheduled to ${rescheduleDate} ${rescheduleTime}`)
      setShowRescheduleModal(false)
      setSelectedPost(null)
    } catch {
      toast.error('Failed to reschedule')
    }
  }
  
  const stats = useMemo(() => {
    const now = new Date()
    let filteredPosts = statsFilter === 'future'
      ? posts.filter(post => parseISO(post.scheduled_time) > now)
      : posts

    // Apply content type filter to stats too
    if (contentTypeFilter !== 'all') {
      filteredPosts = filteredPosts.filter(post => {
        const variant = post.metadata?.variant || 'light'
        const isPost = variant === 'post'
        if (contentTypeFilter === 'posts') return isPost
        if (contentTypeFilter === 'reels') return !isPost
        return true
      })
    }
    
    const byBrand: Record<string, number> = {}
    filteredPosts.forEach(post => {
      byBrand[post.brand] = (byBrand[post.brand] || 0) + 1
    })
    return {
      total: filteredPosts.length,
      byBrand,
    }
  }, [posts, statsFilter, contentTypeFilter])
  
  if (isLoading) {
    return <PageLoader page="calendar" />
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduled</h1>
          <p className="text-gray-500">{stats.total} posts scheduled</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleCleanReelSlots}
            disabled={isCleaningReels}
            className="btn btn-secondary text-sm"
            title="Fix reels on wrong slots or collisions: ensures every reel sits on its correct brand time slot"
          >
            {isCleaningReels ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            Reel Scheduler Cleaner
          </button>
          <button
            onClick={handleCleanPostSlots}
            disabled={isCleaning}
            className="btn btn-secondary text-sm"
            title="Fix collisions: if multiple posts share the same time slot, re-schedule the extras"
          >
            {isCleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            Post Schedule Cleaner
          </button>
          
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('month')}
            className={clsx(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              viewMode === 'month'
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <Grid className="w-4 h-4 inline mr-1" />
            Month
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={clsx(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              viewMode === 'week'
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            <List className="w-4 h-4 inline mr-1" />
            Week
          </button>
        </div>
        </div>
      </div>
      
      {/* Stats */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">Statistics</span>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setStatsFilter('future')}
            className={clsx(
              'px-3 py-1 rounded-md text-xs font-medium transition-colors',
              statsFilter === 'future'
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            Upcoming
          </button>
          <button
            onClick={() => setStatsFilter('all')}
            className={clsx(
              'px-3 py-1 rounded-md text-xs font-medium transition-colors',
              statsFilter === 'all'
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            )}
          >
            All Time
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Total</p>
        </div>
        {dynamicBrands.map(brand => (
          <div 
            key={brand.id}
            className="card p-4 text-center"
            style={{ borderLeftColor: brand.color, borderLeftWidth: '3px' }}
          >
            <p className="text-2xl font-bold text-gray-900">{stats.byBrand[brand.id] || 0}</p>
            <p className="text-sm text-gray-500">{brand.shortName}</p>
          </div>
        ))}
      </div>
      
      {/* Calendar Navigation */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={goPrev} className="p-2 rounded-lg hover:bg-gray-100">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={goNext} className="p-2 rounded-lg hover:bg-gray-100">
              <ChevronRight className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-semibold text-gray-900 ml-2">
              {viewMode === 'month' 
                ? format(currentDate, 'MMMM yyyy')
                : `Week of ${format(startOfWeek(currentDate), 'MMM d')} - ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`
              }
            </h2>
          </div>
          
          <button onClick={goToToday} className="btn btn-secondary">
            <CalendarIcon className="w-4 h-4" />
            Today
          </button>
        </div>
        
        {/* Brand Filter for Slot Analysis */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Slot Tracker:</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {dynamicBrands.map(brand => (
                <button
                  key={brand.id}
                  onClick={() => setBrandFilter(brandFilter === brand.id ? null : brand.id)}
                  className={clsx(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                    brandFilter === brand.id
                      ? 'ring-2 ring-offset-1'
                      : 'opacity-60 hover:opacity-100'
                  )}
                  style={{ 
                    backgroundColor: `${brand.color}20`,
                    color: brand.color,
                    ...(brandFilter === brand.id && { ringColor: brand.color })
                  }}
                >
                  {brand.shortName}
                </button>
              ))}
              {brandFilter && (
                <button
                  onClick={() => setBrandFilter(null)}
                  className="p-1 rounded-full hover:bg-gray-200 text-gray-500"
                  title="Clear filter"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          {brandFilter && (
            <div className="mt-2 flex items-center gap-4 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-100 border border-green-400"></span>
                6/6 slots filled
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-amber-100 border border-amber-400"></span>
                Partial (some missing)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-white border border-gray-300"></span>
                No posts scheduled
              </span>
              <span className="text-gray-400">• Click any day to see slot details</span>
            </div>
          )}
        </div>

        {/* Content Type Filter */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Content:</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setContentTypeFilter('all')}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
                  contentTypeFilter === 'all'
                    ? 'bg-gray-800 text-white'
                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                )}
              >
                All
              </button>
              <button
                onClick={() => setContentTypeFilter('reels')}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
                  contentTypeFilter === 'reels'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                )}
              >
                🎬 Reels
              </button>
              <button
                onClick={() => setContentTypeFilter('posts')}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
                  contentTypeFilter === 'posts'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                )}
              >
                🖼️ Posts
              </button>
            </div>
            {contentTypeFilter !== 'all' && (
              <span className="text-xs text-gray-500">
                Showing {contentTypeFilter} only
              </span>
            )}
          </div>
        </div>

        {/* Platform Filter */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Platform:</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPlatformFilter('all')}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
                  platformFilter === 'all'
                    ? 'bg-gray-800 text-white'
                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                )}
              >
                All
              </button>
              <button
                onClick={() => setPlatformFilter('instagram')}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
                  platformFilter === 'instagram'
                    ? 'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 text-white'
                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                )}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                Instagram
              </button>
              <button
                onClick={() => setPlatformFilter('facebook')}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
                  platformFilter === 'facebook'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                )}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Facebook
              </button>
              <button
                onClick={() => setPlatformFilter('youtube')}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
                  platformFilter === 'youtube'
                    ? 'bg-red-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                )}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                YouTube
              </button>
            </div>
            {platformFilter !== 'all' && (
              <span className="text-xs text-gray-500">
                Showing {platformFilter} posts only
              </span>
            )}
          </div>
        </div>
        
        {/* Month View */}
        {viewMode === 'month' && (
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="bg-gray-50 p-2 text-center text-sm font-medium text-gray-500">
                {day}
              </div>
            ))}
            
            {calendarDays.map(day => {
              const dayPosts = getPostsForDay(day)
              const isCurrentMonth = isSameMonth(day, currentDate)
              const isCurrentDay = isToday(day)
              const slotAnalysis = analyzeSlots ? analyzeSlots(day) : null
              const hasSlotData = slotAnalysis && slotAnalysis.totalScheduled > 0
              
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => {
                    if (brandFilter && slotAnalysis) {
                      setSelectedDayForMissing(day)
                    } else if (dayPosts.length > 0) {
                      setSelectedDay(day)
                    }
                  }}
                  className={clsx(
                    'p-2 min-h-[100px] cursor-pointer transition-colors relative',
                    !isCurrentMonth && 'bg-gray-50',
                    // Brand filter slot coloring
                    brandFilter && slotAnalysis?.allFilled && 'bg-green-50 hover:bg-green-100',
                    brandFilter && slotAnalysis && !slotAnalysis.allFilled && hasSlotData && 'bg-amber-50 hover:bg-amber-100',
                    brandFilter && slotAnalysis && !slotAnalysis.allFilled && !hasSlotData && 'bg-white hover:bg-gray-50',
                    // Default when no filter
                    !brandFilter && 'bg-white',
                    !brandFilter && dayPosts.length > 0 && 'hover:bg-gray-50'
                  )}
                  style={brandFilter && slotAnalysis?.allFilled ? { 
                    borderLeft: `3px solid ${getBrandColor(brandFilter)}` 
                  } : undefined}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className={clsx(
                      'text-sm font-medium',
                      isCurrentDay && 'w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center',
                      !isCurrentMonth && 'text-gray-400'
                    )}>
                      {format(day, 'd')}
                    </div>
                    {/* Slot count indicator when brand filter is active */}
                    {brandFilter && slotAnalysis && hasSlotData && (
                      <span 
                        className={clsx(
                          'text-xs font-medium px-1.5 py-0.5 rounded',
                          slotAnalysis.allFilled 
                            ? 'bg-green-200 text-green-800' 
                            : 'bg-amber-200 text-amber-800'
                        )}
                      >
                        {slotAnalysis.totalScheduled}/6
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-1">
                    {dayPosts.slice(0, 3).map(post => (
                      <div
                        key={post.id}
                        className="text-xs px-1.5 py-0.5 rounded truncate"
                        style={{ 
                          backgroundColor: `${getBrandColor(post.brand)}20`,
                          color: getBrandColor(post.brand)
                        }}
                      >
                        {formatTime(post.scheduled_time)}
                      </div>
                    ))}
                    {dayPosts.length > 3 && (
                      <div className="text-xs text-gray-500 px-1">
                        +{dayPosts.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        
        {/* Week View */}
        {viewMode === 'week' && (
          <div className="grid grid-cols-7 gap-4">
            {weekDays.map(day => {
              const dayPosts = getPostsForDay(day)
              const isCurrentDay = isToday(day)
              
              return (
                <div
                  key={day.toISOString()}
                  className={clsx(
                    'bg-white rounded-lg p-3 border',
                    isCurrentDay ? 'border-primary-500 shadow-sm' : 'border-gray-200'
                  )}
                >
                  <div className={clsx(
                    'text-center mb-3 pb-2 border-b',
                    isCurrentDay && 'border-primary-200'
                  )}>
                    <div className="text-xs text-gray-500 uppercase">
                      {format(day, 'EEE')}
                    </div>
                    <div className={clsx(
                      'text-xl font-bold',
                      isCurrentDay ? 'text-primary-600' : 'text-gray-900'
                    )}>
                      {format(day, 'd')}
                    </div>
                  </div>
                  
                  <div className="space-y-2 min-h-[200px]">
                    {dayPosts.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center">No posts</p>
                    ) : (
                      dayPosts.map(post => (
                        <div
                          key={post.id}
                          onClick={() => { setDetailSlideIndex(0); setSelectedPost(post) }}
                          className="p-2 rounded cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ 
                            backgroundColor: `${getBrandColor(post.brand)}15`,
                            borderLeft: `3px solid ${getBrandColor(post.brand)}`
                          }}
                        >
                          <div className="text-xs font-medium" style={{ color: getBrandColor(post.brand) }}>
                            {formatTime(post.scheduled_time, '12h')}
                          </div>
                          <div className="text-xs text-gray-600 truncate mt-0.5">
                            {post.title.split('\n')[0]}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      
      {/* Day Modal */}
      <Modal
        isOpen={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? format(selectedDay, 'EEEE, MMMM d, yyyy') : ''}
        size="md"
      >
        {selectedDay && (
          <div className="space-y-3">
            {/* Delete buttons for this day */}
            {getPostsForDay(selectedDay).length > 0 && (
              <div className="flex justify-end gap-2 flex-wrap">
                <button
                  onClick={async () => {
                    const dayStr = format(selectedDay, 'yyyy-MM-dd')
                    if (!confirm(`Delete all REELS for ${format(selectedDay, 'MMMM d, yyyy')}?`)) return
                    try {
                      await deleteScheduledForDay.mutateAsync({ date: dayStr, variant: 'reel' })
                      toast.success(`Deleted reels for ${format(selectedDay, 'MMM d')}`)
                      setSelectedDay(null)
                    } catch {
                      toast.error('Failed to delete reels')
                    }
                  }}
                  disabled={deleteScheduledForDay.isPending}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {deleteScheduledForDay.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>🎬</span>}
                  Delete Reels
                </button>
                <button
                  onClick={async () => {
                    const dayStr = format(selectedDay, 'yyyy-MM-dd')
                    if (!confirm(`Delete all POSTS for ${format(selectedDay, 'MMMM d, yyyy')}?`)) return
                    try {
                      await deleteScheduledForDay.mutateAsync({ date: dayStr, variant: 'post' })
                      toast.success(`Deleted posts for ${format(selectedDay, 'MMM d')}`)
                      setSelectedDay(null)
                    } catch {
                      toast.error('Failed to delete posts')
                    }
                  }}
                  disabled={deleteScheduledForDay.isPending}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {deleteScheduledForDay.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>🖼️</span>}
                  Delete Posts
                </button>
                <button
                  onClick={async () => {
                    const dayStr = format(selectedDay, 'yyyy-MM-dd')
                    const count = getPostsForDay(selectedDay).length
                    if (!confirm(`Delete ALL ${count} entries for ${format(selectedDay, 'MMMM d, yyyy')}?`)) return
                    try {
                      await deleteScheduledForDay.mutateAsync({ date: dayStr })
                      toast.success(`Deleted everything for ${format(selectedDay, 'MMM d')}`)
                      setSelectedDay(null)
                    } catch {
                      toast.error('Failed to delete')
                    }
                  }}
                  disabled={deleteScheduledForDay.isPending}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg border border-red-300 bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {deleteScheduledForDay.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>🗑️</span>}
                  Delete All
                </button>
              </div>
            )}
            {getPostsForDay(selectedDay).map(post => (
              <div
                key={post.id}
                onClick={() => {
                  setDetailSlideIndex(0)
                  setSelectedPost(post)
                  setSelectedDay(null)
                }}
                className="card p-4 hover:shadow-md transition-shadow cursor-pointer"
                style={{ borderLeftColor: getBrandColor(post.brand), borderLeftWidth: '3px' }}
              >
                <div className="flex items-start gap-3">
                  {post.thumbnail_path && (
                    <img
                      src={post.thumbnail_path}
                      alt=""
                      className="w-16 h-24 object-cover object-top rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <BrandBadge brand={post.brand} size="sm" />
                      <span className="text-sm text-gray-500">
                        {formatTime(post.scheduled_time, '12h')}
                      </span>
                      <span className={clsx(
                        'text-xs px-1.5 py-0.5 rounded',
                        post.metadata?.variant === 'post'
                          ? 'bg-purple-100 text-purple-700'
                          : (post.metadata?.variant || 'light') === 'dark'
                            ? 'bg-gray-800 text-white'
                            : 'bg-amber-100 text-amber-700'
                      )}>
                        {post.metadata?.variant === 'post' ? '📄 Post' : (post.metadata?.variant || 'light') === 'dark' ? '🌙' : '☀️'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {post.title.split('\n')[0]}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
      
      {/* Missing Slots Modal - shows when brand filter is active and day is clicked */}
      <Modal
        isOpen={!!selectedDayForMissing && !!brandFilter}
        onClose={() => setSelectedDayForMissing(null)}
        title={selectedDayForMissing ? `${getBrandLabel(brandFilter!)} - ${format(selectedDayForMissing, 'EEEE, MMMM d, yyyy')}` : ''}
        size="md"
      >
        {selectedDayForMissing && brandFilter && analyzeSlots && (() => {
          const analysis = analyzeSlots(selectedDayForMissing)
          const dayPosts = getPostsForDay(selectedDayForMissing).filter(p => p.brand === brandFilter)
          
          return (
            <div className="space-y-4">
              {/* Summary */}
              <div className={clsx(
                'p-4 rounded-lg',
                analysis.allFilled ? 'bg-green-50' : 'bg-amber-50'
              )}>
                <div className="flex items-center justify-between">
                  <span className={clsx(
                    'font-medium',
                    analysis.allFilled ? 'text-green-800' : 'text-amber-800'
                  )}>
                    {analysis.allFilled ? '✓ All slots filled!' : `${analysis.totalScheduled}/6 slots scheduled`}
                  </span>
                  <span 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getBrandColor(brandFilter) }}
                  ></span>
                </div>
              </div>
              
              {/* Light Mode Slots */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-400"></span>
                  Light Mode Slots (3 per day)
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {analysis.lightSlots.map(hour => {
                    const isMissing = analysis.missingLight.includes(hour)
                    
                    return (
                      <div 
                        key={`light-${hour}`}
                        className={clsx(
                          'p-2 rounded text-center text-sm',
                          isMissing 
                            ? 'bg-red-50 border border-red-200 text-red-700' 
                            : 'bg-green-50 border border-green-200 text-green-700'
                        )}
                      >
                        <div className="font-medium">{formatHour(hour)}</div>
                        <div className="text-xs mt-0.5">
                          {isMissing ? '❌ Missing' : '✓ Scheduled'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              
              {/* Dark Mode Slots */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-gray-700 border border-gray-900"></span>
                  Dark Mode Slots (3 per day)
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {analysis.darkSlots.map(hour => {
                    const isMissing = analysis.missingDark.includes(hour)
                    
                    return (
                      <div 
                        key={`dark-${hour}`}
                        className={clsx(
                          'p-2 rounded text-center text-sm',
                          isMissing 
                            ? 'bg-red-50 border border-red-200 text-red-700' 
                            : 'bg-green-50 border border-green-200 text-green-700'
                        )}
                      >
                        <div className="font-medium">{formatHour(hour)}</div>
                        <div className="text-xs mt-0.5">
                          {isMissing ? '❌ Missing' : '✓ Scheduled'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              
              {/* Show scheduled posts for this day/brand */}
              {dayPosts.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Scheduled Posts</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {dayPosts.map(post => (
                      <div
                        key={post.id}
                        onClick={() => {
                          setDetailSlideIndex(0)
                          setSelectedPost(post)
                          setSelectedDayForMissing(null)
                        }}
                        className="p-2 rounded border border-gray-200 hover:bg-gray-50 cursor-pointer flex items-center gap-3"
                      >
                        <span className="text-sm font-medium text-gray-700">
                          {formatTime(post.scheduled_time, '12h')}
                        </span>
                        <span className={clsx(
                          'text-xs px-2 py-0.5 rounded',
                          (post.metadata?.variant || 'light') === 'light' 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-gray-700 text-white'
                        )}>
                          {(post.metadata?.variant || 'light').toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-500 truncate flex-1">
                          {post.title.split('\n')[0]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Action to view all posts */}
              {dayPosts.length > 0 && (
                <button
                  onClick={() => {
                    setSelectedDayForMissing(null)
                    setSelectedDay(selectedDayForMissing)
                  }}
                  className="btn btn-secondary w-full"
                >
                  View All Posts for This Day
                </button>
              )}
            </div>
          )
        })()}
      </Modal>
      
      {/* Post Detail Modal */}
      <Modal
        isOpen={!!selectedPost}
        onClose={() => { setSelectedPost(null); setDetailSlideIndex(0) }}
        title="Post Details"
        size="lg"
      >
        {selectedPost && (() => {
          const carouselPaths = selectedPost.metadata?.carousel_image_paths || []
          const slideTexts = selectedPost.metadata?.slide_texts || []
          const isPost = selectedPost.metadata?.variant === 'post' || selectedPost.metadata?.variant === 'carousel'
          const totalSlides = isPost ? 1 + Math.max(carouselPaths.length, slideTexts.length) : 1
          // Derive raw AI background URL from reel_id
          // Ensure we have a valid URL, not an empty string
          const rawBgUrl = selectedPost.thumbnail_path || selectedPost.metadata?.thumbnail_path || null
          const bgUrl = (rawBgUrl && rawBgUrl.trim() !== '') ? rawBgUrl : null
          const logoUrl = brandLogos[selectedPost.brand] || null

          return (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <BrandBadge brand={selectedPost.brand} size="md" />
              <span className="text-gray-500">
                {formatDateTime(selectedPost.scheduled_time)}
              </span>
              {selectedPost.status === 'failed' && (
                <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Failed
                </span>
              )}
              {selectedPost.status === 'publishing' && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Publishing
                </span>
              )}
              {selectedPost.status === 'published' && (
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  Published
                </span>
              )}
              {selectedPost.status === 'partial' && (
                <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Partial Failure
                </span>
              )}
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 whitespace-pre-line">
              {selectedPost.title}
            </h3>
            
            <div className={isPost ? '' : 'grid grid-cols-2 gap-4'}>
              {/* Post carousel: cover + text slides — uses same Konva components as PostJobDetail */}
              {isPost ? (
                <div className="flex flex-col items-center">
                  <div className="relative" style={{ width: Math.round(CANVAS_WIDTH * DETAIL_PREVIEW_SCALE) }}>
                    {/* Slide content — Konva canvas for cover, CarouselTextSlide for text slides */}
                    <div className="rounded-lg overflow-hidden shadow-lg bg-zinc-100">
                      {detailSlideIndex === 0 ? (
                        <PostCanvas
                          brand={selectedPost.brand}
                          title={selectedPost.title}
                          backgroundImage={bgUrl}
                          settings={postSettings}
                          scale={DETAIL_PREVIEW_SCALE}
                          logoUrl={logoUrl}
                          autoFitMaxLines={3}
                        />
                      ) : slideTexts.length > 0 ? (
                        <CarouselTextSlide
                          brand={selectedPost.brand}
                          text={slideTexts[detailSlideIndex - 1] || ''}
                          allSlideTexts={slideTexts}
                          isLastSlide={detailSlideIndex === slideTexts.length}
                          scale={DETAIL_PREVIEW_SCALE}
                          logoUrl={logoUrl}
                          fontFamily={postSettings.slideFontFamily}
                        />
                      ) : (
                        /* Fallback to pre-rendered image if no slide_texts available */
                        carouselPaths[detailSlideIndex - 1] ? (
                          <img
                            src={carouselPaths[detailSlideIndex - 1]}
                            alt={`Slide ${detailSlideIndex}`}
                            style={{ width: Math.round(CANVAS_WIDTH * DETAIL_PREVIEW_SCALE) }}
                            className="w-full object-contain"
                          />
                        ) : (
                          <div className="flex items-center justify-center text-zinc-500 text-sm"
                               style={{ height: Math.round(CANVAS_HEIGHT * DETAIL_PREVIEW_SCALE) }}>
                            Image not available
                          </div>
                        )
                      )}
                    </div>

                    {/* Prev/Next arrows overlaid */}
                    {totalSlides > 1 && (
                      <>
                        <button
                          onClick={() => setDetailSlideIndex(i => Math.max(0, i - 1))}
                          disabled={detailSlideIndex === 0}
                          className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/40 hover:bg-black/60 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="w-5 h-5 text-white" />
                        </button>
                        <button
                          onClick={() => setDetailSlideIndex(i => Math.min(totalSlides - 1, i + 1))}
                          disabled={detailSlideIndex >= totalSlides - 1}
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/40 hover:bg-black/60 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRight className="w-5 h-5 text-white" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Slide indicator dots + counter */}
                  {totalSlides > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <div className="flex items-center gap-1.5">
                        {Array.from({ length: totalSlides }).map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setDetailSlideIndex(i)}
                            className={clsx(
                              'w-2 h-2 rounded-full transition-all',
                              i === detailSlideIndex
                                ? 'bg-blue-500 scale-125'
                                : 'bg-gray-300 hover:bg-gray-400'
                            )}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-gray-400 ml-1">
                        {detailSlideIndex === 0 ? 'Cover' : `Slide ${detailSlideIndex}`} / {totalSlides}
                      </span>
                    </div>
                  )}
                </div>
              ) : selectedPost.thumbnail_path && (
                <div className={clsx(
                  'bg-gray-100 rounded-lg overflow-hidden',
                  isPost ? 'aspect-[4/5] max-w-[280px]' : 'aspect-[9/16]'
                )}>
                  <img
                    src={selectedPost.thumbnail_path}
                    alt="Thumbnail"
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              )}
              {selectedPost.video_path && (
                <div className="aspect-[9/16] bg-gray-900 rounded-lg overflow-hidden">
                  <video
                    src={selectedPost.video_path}
                    className="w-full h-full object-cover"
                    controls
                  />
                </div>
              )}
            </div>
            
            {selectedPost.caption && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Caption</p>
                <p className="text-sm text-gray-600 whitespace-pre-line">
                  {selectedPost.caption}
                </p>
              </div>
            )}
            
            {/* Publish Results - Show when published, partial, or failed */}
            {(selectedPost.status === 'published' || selectedPost.status === 'partial' || selectedPost.status === 'failed') && selectedPost.metadata?.publish_results && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-3">
                  {selectedPost.status === 'partial' ? '⚠️ Publish Status (Partial Failure)' : 'Publish Details'}
                </p>
                <div className="space-y-2">
                  {Object.entries(selectedPost.metadata.publish_results as Record<string, {success: boolean; post_id?: string; account_id?: string; brand_used?: string; error?: string}>).map(([platform, result]) => (
                    <div 
                      key={platform}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {result.success ? (
                          <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                            <AlertTriangle className="w-3 h-3 text-white" />
                          </span>
                        )}
                        <span className={`font-medium capitalize ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                          {platform}
                        </span>
                        {result.success && (
                          <>
                            <span className="text-xs text-gray-500">→</span>
                            <span className="text-xs text-gray-600">
                              {result.brand_used || 'unknown'} ({result.account_id || 'N/A'})
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-xs max-w-[200px]">
                        {result.success ? (
                          <span className="text-green-600">
                            ✓ Posted (ID: {result.post_id?.slice(-8)}...)
                          </span>
                        ) : (
                          <span className="text-red-600 block text-right">
                            ✗ {result.error || 'Failed'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Retry hint for partial failures */}
                {selectedPost.status === 'partial' && (
                  <p className="text-xs text-amber-600 mt-3 bg-amber-50 p-2 rounded border border-amber-200">
                    💡 Click <strong>Retry</strong> below to re-attempt only the failed platform(s). Successfully posted platforms will not be duplicated.
                  </p>
                )}
              </div>
            )}
            
            {/* Show error message for failed/partial posts without detailed results */}
            {(selectedPost.status === 'failed' || selectedPost.status === 'partial') && selectedPost.error && !selectedPost.metadata?.publish_results && (
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {selectedPost.status === 'partial' ? 'Partial Failure Details' : 'Error Details'}
                </p>
                <p className="text-sm text-red-600 whitespace-pre-line">{selectedPost.error}</p>
                {selectedPost.status === 'partial' && (
                  <p className="text-xs text-amber-600 mt-3 bg-amber-50 p-2 rounded">
                    💡 Click <strong>Retry</strong> to attempt publishing again for the failed platform(s).
                  </p>
                )}
              </div>
            )}
            
            {/* Action buttons for scheduled/failed posts */}
            {selectedPost.status !== 'published' && (
              <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
                {/* Reschedule button - only for scheduled or failed posts */}
                {(selectedPost.status === 'scheduled' || selectedPost.status === 'failed' || selectedPost.status === 'partial') && (
                  <button
                    onClick={() => openRescheduleModal(selectedPost)}
                    className="btn btn-secondary flex-1"
                  >
                    <Clock className="w-4 h-4" />
                    Reschedule
                  </button>
                )}
                
                {/* Publish Now button - only for scheduled posts */}
                {selectedPost.status === 'scheduled' && (
                  <button
                    onClick={() => handlePublishNow(selectedPost)}
                    disabled={publishNow.isPending}
                    className="btn btn-primary flex-1"
                  >
                    {publishNow.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Publish Now
                  </button>
                )}
                
                {/* Retry button - for failed/partial/publishing */}
                {(selectedPost.status === 'failed' || selectedPost.status === 'partial' || selectedPost.status === 'publishing') && (
                  <button
                    onClick={() => handleRetry(selectedPost)}
                    disabled={retryFailed.isPending}
                    className="btn btn-primary flex-1"
                  >
                    {retryFailed.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Retry
                  </button>
                )}
              </div>
            )}
            
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  navigate(`/job/${selectedPost.job_id}`)
                  setSelectedPost(null)
                }}
                className="btn btn-secondary flex-1"
              >
                <ExternalLink className="w-4 h-4" />
                View Job
              </button>
              
              <button
                onClick={() => handleDelete(selectedPost)}
                disabled={deleteScheduled.isPending}
                className="btn btn-danger"
              >
                {deleteScheduled.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Unschedule
              </button>
            </div>
          </div>
          )
        })()}
      </Modal>
      
      {/* Reschedule Modal */}
      <Modal
        isOpen={showRescheduleModal}
        onClose={() => setShowRescheduleModal(false)}
        title="Reschedule Post"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time
            </label>
            <input
              type="time"
              value={rescheduleTime}
              onChange={(e) => setRescheduleTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowRescheduleModal(false)}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleReschedule}
              disabled={reschedule.isPending || !rescheduleDate || !rescheduleTime}
              className="btn btn-primary flex-1"
            >
              {reschedule.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Clock className="w-4 h-4" />
              )}
              Reschedule
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
