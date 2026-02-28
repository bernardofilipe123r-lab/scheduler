import { useState, useEffect, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Plus,
  Upload,
  X,
  AlertCircle,
  Loader2,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  XCircle,
  SlidersHorizontal,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, parseISO, addDays } from 'date-fns'
import { clsx } from 'clsx'
import { apiClient } from '@/shared/api/client'
import { useDynamicBrands } from '@/features/brands'
import { useScheduledPosts } from '@/features/scheduling'
import type { ScheduledPost } from '@/shared/types'

interface ConnectedPlatform {
  name: string
  handle: string
  connected: boolean
}

interface BrandPlatforms {
  brand_id: string
  display_name: string
  platforms: ConnectedPlatform[]
}

type CreatorFilter = 'all' | 'user' | 'toby'
type ContentTypeFilter = 'all' | 'reels' | 'posts'
type StatusFilter = 'all' | 'scheduled' | 'published' | 'partial' | 'failed'

function Calendar() {
  const { brands } = useDynamicBrands()
  const { data: scheduledPosts = [], isLoading: postsLoading } = useScheduledPosts()

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [view, setView] = useState<'month' | 'week'>('month')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [brandPlatforms, setBrandPlatforms] = useState<BrandPlatforms[]>([])
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [detailSlideIndex, setDetailSlideIndex] = useState(0)

  // Filters
  const [showFilters, setShowFilters] = useState(false)
  const [filterBrand, setFilterBrand] = useState<string | null>(null)
  const [filterCreator, setFilterCreator] = useState<CreatorFilter>('all')
  const [filterContentType, setFilterContentType] = useState<ContentTypeFilter>('all')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all')

  // Upload form state
  const [selectedBrand, setSelectedBrand] = useState<string>(brands[0]?.id || '')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['instagram'])
  const [caption, setCaption] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [contentType, setContentType] = useState<'reel' | 'carousel' | null>(null)
  const [scheduledTime, setScheduledTime] = useState<string>('')
  const [socialMedia, setSocialMedia] = useState('')

  // Load connected platforms for upload modal
  useEffect(() => {
    const loadPlatforms = async () => {
      try {
        const platRes = await apiClient.get('/reels/manual/connected-platforms')
        setBrandPlatforms((platRes as any).data || [])
      } catch {
        // Manual routes may not be deployed yet — platforms will be empty in modal
        setBrandPlatforms([])
      }
    }
    loadPlatforms()
  }, [])

  // Auto-detect content type when file is selected
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadedFile(file)
    setUploadedFileName(file.name)

    // Detect content type from extension
    const ext = file.name.split('.').pop()?.toLowerCase()
    const videoExts = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'flv']
    const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']

    if (videoExts.includes(ext!)) {
      setContentType('reel')
    } else if (imageExts.includes(ext!)) {
      setContentType('carousel')
    }
  }

  const handleUpload = async () => {
    if (!uploadedFile || !selectedBrand || !caption || !scheduledTime || selectedPlatforms.length === 0) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      setUploadLoading(true)

      const formData = new FormData()
      formData.append('brand_id', selectedBrand)
      formData.append('caption', caption)
      formData.append('platforms', JSON.stringify(selectedPlatforms))
      formData.append('scheduled_time', scheduledTime)
      if (socialMedia) {
        formData.append('social_media', socialMedia)
      }
      formData.append('file', uploadedFile)

      await apiClient.post('/reels/manual/upload-and-schedule', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      toast.success(`${contentType === 'reel' ? 'Reel' : 'Carousel'} scheduled successfully!`)
      
      // Reset form
      setUploadedFile(null)
      setUploadedFileName('')
      setCaption('')
      setContentType(null)
      setScheduledTime('')
      setSocialMedia('')
      setShowUploadModal(false)

      // Data auto-refreshes via useScheduledPosts hook
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to schedule content')
    } finally {
      setUploadLoading(false)
    }
  }

  // Index posts by date for fast calendar lookup
  const postsByDate = useMemo(() => {
    const map: Record<string, ScheduledPost[]> = {}
    for (const post of scheduledPosts) {
      if (!post.scheduled_time) continue

      // Apply filters
      if (filterBrand && post.brand !== filterBrand) continue
      if (filterCreator !== 'all') {
        const creator = post.created_by || 'toby'
        if (creator !== filterCreator) continue
      }
      if (filterContentType !== 'all') {
        const variant = post.metadata?.variant || 'light'
        const isPost = variant === 'post'
        if (filterContentType === 'posts' && !isPost) continue
        if (filterContentType === 'reels' && isPost) continue
      }
      if (filterStatus !== 'all' && post.status !== filterStatus) continue

      const dateKey = post.scheduled_time.slice(0, 10)
      if (!map[dateKey]) map[dateKey] = []
      map[dateKey].push(post)
    }
    return map
  }, [scheduledPosts, filterBrand, filterCreator, filterContentType, filterStatus])

  const getContentForDate = (date: Date): ScheduledPost[] => {
    return postsByDate[format(date, 'yyyy-MM-dd')] || []
  }

  const pendingCount = useMemo(
    () => scheduledPosts.filter(s => s.status === 'scheduled').length,
    [scheduledPosts]
  )
  const publishedCount = useMemo(
    () => scheduledPosts.filter(s => s.status === 'published').length,
    [scheduledPosts]
  )

  const getPlatformLabel = (platform: string) =>
    platform.charAt(0).toUpperCase() + platform.slice(1)

  // Brand name helper
  const getBrandName = (brandId: string) => {
    const brand = brands.find(b => b.id === brandId)
    return brand?.shortName || brand?.label || brandId
  }

  if (postsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-4" />
          <p className="text-gray-700">Loading calendar...</p>
        </div>
      </div>
    )
  }

  const currentBrandPlatforms = brandPlatforms.find(bp => bp.brand_id === selectedBrand)?.platforms || []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white/80 backdrop-blur-lg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarIcon className="h-8 w-8 text-emerald-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
                <p className="text-sm text-gray-600">
                  {pendingCount} scheduled, {publishedCount} published
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-sm"
            >
              <Plus className="h-5 w-5" />
              Add Content
            </button>
          </div>
        </div>
      </div>

      {/* Calendar View Controls */}
      <div className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-gray-700" />
              </button>
              <h2 className="text-lg font-semibold text-gray-900 px-4">
                {format(currentMonth, 'MMMM yyyy')}
              </h2>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-gray-700" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setView('month')}
                className={clsx(
                  'px-3 py-2 rounded-lg font-medium transition-colors',
                  view === 'month'
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                )}
              >
                Month
              </button>
              <button
                onClick={() => setView('week')}
                className={clsx(
                  'px-3 py-2 rounded-lg font-medium transition-colors',
                  view === 'week'
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                )}
              >
                Week
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filters toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                showFilters ? 'bg-gray-200 text-gray-900' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {((filterBrand ? 1 : 0) + (filterCreator !== 'all' ? 1 : 0) + (filterContentType !== 'all' ? 1 : 0) + (filterStatus !== 'all' ? 1 : 0)) > 0 && (
                <span className="bg-emerald-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {(filterBrand ? 1 : 0) + (filterCreator !== 'all' ? 1 : 0) + (filterContentType !== 'all' ? 1 : 0) + (filterStatus !== 'all' ? 1 : 0)}
                </span>
              )}
            </button>

            {/* Active filter chips */}
            {filterBrand && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-orange-50 text-orange-700 rounded-full">
                {brands.find(b => b.id === filterBrand)?.shortName || filterBrand}
                <button onClick={() => setFilterBrand(null)} className="ml-0.5 hover:text-orange-900"><X className="h-3 w-3" /></button>
              </span>
            )}
            {filterCreator !== 'all' && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-violet-50 text-violet-700 rounded-full">
                {filterCreator === 'toby' ? '🤖 Toby' : '👤 Manual'}
                <button onClick={() => setFilterCreator('all')} className="ml-0.5 hover:text-violet-900"><X className="h-3 w-3" /></button>
              </span>
            )}
            {filterContentType !== 'all' && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
                {filterContentType === 'reels' ? '🎬 Reels' : '🖼️ Posts'}
                <button onClick={() => setFilterContentType('all')} className="ml-0.5 hover:text-blue-900"><X className="h-3 w-3" /></button>
              </span>
            )}
            {filterStatus !== 'all' && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full capitalize">
                {filterStatus}
                <button onClick={() => setFilterStatus('all')} className="ml-0.5 hover:text-gray-900"><X className="h-3 w-3" /></button>
              </span>
            )}
            {(filterBrand || filterCreator !== 'all' || filterContentType !== 'all' || filterStatus !== 'all') && (
              <button
                onClick={() => { setFilterBrand(null); setFilterCreator('all'); setFilterContentType('all'); setFilterStatus('all') }}
                className="text-xs text-gray-500 hover:text-gray-800 underline"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Filter Popover */}
          {showFilters && (
            <div className="mt-2 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg p-4 space-y-4">
              {/* Brand */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Brand</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFilterBrand(null)}
                    className={clsx(
                      'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                      !filterBrand ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    )}
                  >
                    All brands
                  </button>
                  {brands.map(brand => (
                    <button
                      key={brand.id}
                      onClick={() => setFilterBrand(filterBrand === brand.id ? null : brand.id)}
                      className={clsx(
                        'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                        filterBrand === brand.id ? 'ring-2 ring-offset-1' : 'opacity-60 hover:opacity-100'
                      )}
                      style={{ backgroundColor: `${brand.color}20`, color: brand.color }}
                    >
                      {brand.shortName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Creator */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Creator</p>
                <div className="flex gap-1.5">
                  {(['all', 'toby', 'user'] as const).map(c => (
                    <button
                      key={c}
                      onClick={() => setFilterCreator(c)}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                        filterCreator === c
                          ? c === 'toby' ? 'bg-violet-600 text-white' : c === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-white'
                          : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                      )}
                    >
                      {c === 'all' ? 'All' : c === 'toby' ? '🤖 Toby' : '👤 Manual'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Type */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Content type</p>
                <div className="flex gap-1.5">
                  {(['all', 'reels', 'posts'] as const).map(ct => (
                    <button
                      key={ct}
                      onClick={() => setFilterContentType(ct)}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                        filterContentType === ct
                          ? ct === 'reels' ? 'bg-indigo-600 text-white' : ct === 'posts' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-white'
                          : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                      )}
                    >
                      {ct === 'all' ? 'All' : ct === 'reels' ? '🎬 Reels' : '🖼️ Posts'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Status</p>
                <div className="flex gap-1.5 flex-wrap">
                  {(['all', 'scheduled', 'published', 'partial', 'failed'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize',
                        filterStatus === s
                          ? s === 'published' ? 'bg-green-600 text-white'
                            : s === 'failed' ? 'bg-red-600 text-white'
                            : s === 'partial' ? 'bg-orange-500 text-white'
                            : s === 'scheduled' ? 'bg-yellow-500 text-white'
                            : 'bg-gray-800 text-white'
                          : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'
                      )}
                    >
                      {s === 'all' ? 'All' : s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Calendar */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-sm font-semibold text-gray-600 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Cells */}
        <div className="grid grid-cols-7 gap-2">
          {(view === 'month' 
            ? eachDayOfInterval({ 
                start: startOfWeek(startOfMonth(currentMonth)), 
                end: endOfWeek(endOfMonth(currentMonth)) 
              })
            : eachDayOfInterval({ 
                start: startOfWeek(currentMonth), 
                end: addDays(startOfWeek(currentMonth), 6) 
              })
          ).map(day => {
            const dayContent = getContentForDate(day)
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const isCurrentDay = isToday(day)

            return (
              <div
                key={day.toString()}
                onClick={() => { if (getContentForDate(day).length > 0) setSelectedDay(day) }}
                className={clsx(
                  'min-h-32 rounded-lg border-2 p-2 cursor-pointer transition-all shadow-sm',
                  isCurrentDay
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-md bg-white',
                  !isCurrentMonth && 'bg-gray-50 opacity-60'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={clsx(
                    'text-sm font-semibold',
                    isCurrentDay ? 'text-emerald-600' : 'text-gray-700'
                  )}>
                    {format(day, 'd')}
                  </span>
                  {dayContent.length > 0 && (
                    <span className="text-xs bg-emerald-600 text-white rounded-full px-2 py-0.5">
                      {dayContent.length}
                    </span>
                  )}
                </div>

                {/* Content Preview */}
                <div className="space-y-1 text-xs">
                  {dayContent.slice(0, 3).map(content => (
                    <div
                      key={content.id}
                      className={clsx(
                        'flex items-center gap-1 p-1 rounded truncate transition-colors',
                        content.created_by === 'user'
                          ? 'bg-blue-50 hover:bg-blue-100'
                          : 'bg-gray-100 hover:bg-gray-200'
                      )}
                    >
                      <span className={clsx(
                        'inline-block w-1.5 h-1.5 rounded-full flex-shrink-0',
                        content.status === 'published' ? 'bg-green-500' :
                        content.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                      )} />
                      <span className="truncate text-gray-700">
                        {format(parseISO(content.scheduled_time), 'HH:mm')} {getBrandName(content.brand)}
                      </span>
                    </div>
                  ))}
                  {dayContent.length > 3 && (
                    <p className="text-gray-500">+{dayContent.length - 3} more</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Day Detail Modal */}
      {selectedDay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setSelectedDay(null); setSelectedPost(null) }}>
          <div className="max-w-lg w-full bg-white rounded-xl border border-gray-200 overflow-hidden max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>

            {/* Post Detail View */}
            {selectedPost ? (
              <>
                <div className="border-b border-gray-200 px-6 py-4 flex items-center gap-3 bg-gray-50">
                  <button onClick={() => setSelectedPost(null)} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
                    <ArrowLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <h2 className="text-lg font-bold text-gray-900 flex-1 min-w-0">Post Details</h2>
                  <button onClick={() => { setSelectedDay(null); setSelectedPost(null) }} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
                    <X className="h-5 w-5 text-gray-600" />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 p-6 space-y-5">
                  {/* Status + Time */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={clsx(
                      'text-sm font-semibold px-3 py-1 rounded-full',
                      selectedPost.status === 'published' ? 'bg-green-100 text-green-700' :
                      selectedPost.status === 'failed' ? 'bg-red-100 text-red-700' :
                      selectedPost.status === 'partial' ? 'bg-orange-100 text-orange-700' :
                      'bg-yellow-100 text-yellow-700'
                    )}>
                      {selectedPost.status}
                    </span>
                    <span className="text-sm text-gray-500 flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {format(parseISO(selectedPost.scheduled_time), 'HH:mm · MMM d, yyyy')}
                    </span>
                  </div>

                  {/* Media Preview */}
                  {(() => {
                    const carouselPaths: string[] = selectedPost.metadata?.carousel_paths?.filter(Boolean) ?? []
                    const videoUrl = selectedPost.video_path || selectedPost.metadata?.video_path
                    const thumbUrl = selectedPost.thumbnail_path || selectedPost.metadata?.thumbnail_path
                    const totalSlides = carouselPaths.length

                    if (totalSlides > 0) {
                      return (
                        <div className="flex flex-col items-center">
                          <div className="relative w-full max-w-[200px]">
                            <div className="rounded-lg overflow-hidden bg-gray-100 aspect-[9/16]">
                              <img
                                key={carouselPaths[detailSlideIndex]}
                                src={carouselPaths[detailSlideIndex]}
                                alt={detailSlideIndex === 0 ? 'Cover' : `Slide ${detailSlideIndex}`}
                                className="w-full h-full object-contain"
                                draggable={false}
                              />
                            </div>
                            {totalSlides > 1 && (
                              <>
                                <button
                                  onClick={() => setDetailSlideIndex(i => Math.max(0, i - 1))}
                                  disabled={detailSlideIndex === 0}
                                  className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/40 hover:bg-black/60 disabled:opacity-20 transition-colors"
                                >
                                  <ChevronLeft className="w-4 h-4 text-white" />
                                </button>
                                <button
                                  onClick={() => setDetailSlideIndex(i => Math.min(totalSlides - 1, i + 1))}
                                  disabled={detailSlideIndex >= totalSlides - 1}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/40 hover:bg-black/60 disabled:opacity-20 transition-colors"
                                >
                                  <ChevronRight className="w-4 h-4 text-white" />
                                </button>
                              </>
                            )}
                          </div>
                          {totalSlides > 1 && (
                            <div className="flex items-center gap-2 mt-2">
                              <div className="flex gap-1">
                                {carouselPaths.map((_, i) => (
                                  <button
                                    key={i}
                                    onClick={() => setDetailSlideIndex(i)}
                                    className={clsx(
                                      'w-1.5 h-1.5 rounded-full transition-all',
                                      i === detailSlideIndex ? 'bg-emerald-500 scale-125' : 'bg-gray-300 hover:bg-gray-400'
                                    )}
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-gray-400">
                                {detailSlideIndex === 0 ? 'Cover' : `Slide ${detailSlideIndex} of ${totalSlides - 1}`}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    }

                    if (videoUrl) {
                      return (
                        <div className="w-full max-w-[200px] mx-auto aspect-[9/16] bg-gray-900 rounded-lg overflow-hidden">
                          <video src={videoUrl} className="w-full h-full object-cover" controls />
                        </div>
                      )
                    }

                    if (thumbUrl) {
                      return (
                        <div className="w-full max-w-[200px] mx-auto aspect-[9/16] bg-gray-100 rounded-lg overflow-hidden">
                          <img src={thumbUrl} alt="Thumbnail" className="w-full h-full object-cover object-top" />
                        </div>
                      )
                    }

                    return null
                  })()}

                  {/* Brand */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Brand</label>
                    <p className="text-sm text-gray-900 mt-0.5">{getBrandName(selectedPost.brand)}</p>
                  </div>

                  {/* Title */}
                  {selectedPost.title && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Title</label>
                      <p className="text-sm text-gray-900 mt-0.5 font-medium">{selectedPost.title}</p>
                    </div>
                  )}

                  {/* Caption */}
                  {selectedPost.caption && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Caption</label>
                      <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{selectedPost.caption}</p>
                    </div>
                  )}

                  {/* Created by */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created by</label>
                    <p className="text-sm mt-0.5">
                      <span className={clsx(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                        selectedPost.created_by === 'user' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                      )}>
                        {selectedPost.created_by === 'user' ? 'Manual upload' : 'Toby (AI)'}
                      </span>
                    </p>
                  </div>

                  {/* Platforms */}
                  {selectedPost.metadata?.platforms && selectedPost.metadata.platforms.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Platforms</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {selectedPost.metadata.platforms.map(p => (
                          <span key={p} className="text-xs px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full font-medium">
                            {getPlatformLabel(p)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Publish Results (per-platform) */}
                  {selectedPost.metadata?.publish_results && Object.keys(selectedPost.metadata.publish_results).length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Publish Results</label>
                      <div className="mt-1 space-y-2">
                        {Object.entries(selectedPost.metadata.publish_results).map(([platform, result]) => (
                          <div key={platform} className={clsx(
                            'flex items-start gap-2 p-3 rounded-lg text-sm',
                            result.success ? 'bg-green-50' : 'bg-red-50'
                          )}>
                            {result.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-gray-900">{getPlatformLabel(platform)}</span>
                              {result.success && result.post_id && (
                                <p className="text-xs text-gray-500 mt-0.5">Post ID: {result.post_id}</p>
                              )}
                              {!result.success && result.error && (
                                <p className="text-xs text-red-600 mt-0.5">{result.error}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Error (top-level) */}
                  {selectedPost.error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <label className="text-xs font-semibold text-red-700 uppercase tracking-wide">Error</label>
                      </div>
                      <p className="text-sm text-red-700">{selectedPost.error}</p>
                    </div>
                  )}

                  {/* Misc metadata */}
                  <div className="text-xs text-gray-400 pt-2 border-t border-gray-100 space-y-0.5">
                    {selectedPost.job_id && <p>Job: {selectedPost.job_id}</p>}
                    {selectedPost.reel_id && <p>Reel: {selectedPost.reel_id}</p>}
                    {selectedPost.published_at && <p>Published: {format(parseISO(selectedPost.published_at), 'HH:mm · MMM d, yyyy')}</p>}
                  </div>
                </div>
              </>
            ) : (
              /* Day List View */
              <>
                <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
                  <h2 className="text-lg font-bold text-gray-900">
                    {format(selectedDay, 'EEEE, MMMM d, yyyy')}
                  </h2>
                  <button onClick={() => setSelectedDay(null)} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
                    <X className="h-5 w-5 text-gray-600" />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                  {getContentForDate(selectedDay).length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No content scheduled for this day.</div>
                  ) : (
                    getContentForDate(selectedDay)
                      .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
                      .map(post => (
                        <button
                          key={post.id}
                          onClick={() => { setDetailSlideIndex(0); setSelectedPost(post) }}
                          className="w-full text-left px-5 py-3 hover:bg-gray-50 transition-colors group"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={clsx(
                                'inline-block w-2 h-2 rounded-full flex-shrink-0',
                                post.status === 'published' ? 'bg-green-500' :
                                post.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                              )} />
                              <span className="font-semibold text-gray-900 text-sm">
                                {format(parseISO(post.scheduled_time), 'HH:mm')}
                              </span>
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                {getBrandName(post.brand)}
                              </span>
                              <span className={clsx(
                                'text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0',
                                post.status === 'published' ? 'bg-green-100 text-green-700' :
                                post.status === 'failed' ? 'bg-red-100 text-red-700' :
                                post.status === 'partial' ? 'bg-orange-100 text-orange-700' :
                                'bg-yellow-100 text-yellow-700'
                              )}>
                                {post.status}
                              </span>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
                          </div>
                          {post.title && (
                            <p className="text-sm text-gray-700 line-clamp-2">{post.title}</p>
                          )}
                          {post.caption && !post.title && (
                            <p className="text-sm text-gray-500 line-clamp-2">{post.caption}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {post.metadata?.platforms && post.metadata.platforms.length > 0 && (
                              <div className="flex gap-1">
                                {post.metadata.platforms.map(p => (
                                  <span key={p} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                    {getPlatformLabel(p)}
                                  </span>
                                ))}
                              </div>
                            )}
                            {post.created_by && (
                              <span className={clsx(
                                'text-[10px] px-1.5 py-0.5 rounded',
                                post.created_by === 'user' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                              )}>
                                {post.created_by === 'user' ? 'Manual' : 'Toby'}
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                  )}
                </div>
                <div className="border-t border-gray-200 px-6 py-3 bg-gray-50 text-sm text-gray-500 text-center">
                  {getContentForDate(selectedDay).length} item{getContentForDate(selectedDay).length !== 1 ? 's' : ''} scheduled
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-2xl w-full bg-white rounded-xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Upload className="h-5 w-5 text-emerald-600" />
                Upload & Schedule Content
              </h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Brand Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Brand <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedBrand}
                  onChange={(e) => {
                    setSelectedBrand(e.target.value)
                    setSelectedPlatforms(['instagram'])
                  }}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors"
                >
                  {brands.map(brand => (
                    <option key={brand.id} value={brand.id}>
                      {brand.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Upload File ({contentType ? contentType.toUpperCase() : 'Video or Image'})
                  <span className="text-red-500"> *</span>
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-emerald-400 transition-colors cursor-pointer bg-gray-50">
                  <input
                    type="file"
                    accept={contentType ? (contentType === 'reel' ? 'video/*' : 'image/*') : 'video/*,image/*'}
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer block">
                    {uploadedFileName ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-emerald-600">✓</span>
                        <span className="text-gray-900 font-medium">{uploadedFileName}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-8 w-8 text-gray-400 mx-auto" />
                        <span className="text-gray-600">Click to upload or drag and drop</span>
                        <span className="text-xs text-gray-500">Video or Images</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Platform Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Platforms <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {currentBrandPlatforms.length > 0 ? (
                    currentBrandPlatforms.map(platform => (
                      <label key={platform.name} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPlatforms.includes(platform.name)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPlatforms([...selectedPlatforms, platform.name])
                            } else {
                              setSelectedPlatforms(selectedPlatforms.filter(p => p !== platform.name))
                            }
                          }}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-gray-900">
                          {getPlatformLabel(platform.name)} ({platform.handle})
                        </span>
                      </label>
                    ))
                  ) : (
                    <div className="flex items-center gap-2 text-yellow-700 bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm">No platforms connected for this brand. Connect platforms in Brands settings.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Schedule Time */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Schedule Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors"
                />
              </div>

              {/* Caption */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Caption <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Enter caption for your content..."
                  rows={3}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors"
                />
              </div>

              {/* Social Media Account (Optional) */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Specific Account (Optional)
                </label>
                <input
                  type="text"
                  value={socialMedia}
                  onChange={(e) => setSocialMedia(e.target.value)}
                  placeholder="Leave empty to use default"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3 bg-gray-50">
              <button
                onClick={() => setShowUploadModal(false)}
                disabled={uploadLoading}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploadLoading || !uploadedFile || !selectedBrand || !caption || !scheduledTime || selectedPlatforms.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {uploadLoading ? 'Uploading...' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export { Calendar as CalendarPage }
