import { useState, useMemo, useCallback } from 'react'
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
  ShieldCheck,
  Trash2,
  Image as ImageIcon,
  Video,
  FileText,
  AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, parseISO, addDays } from 'date-fns'
import { clsx } from 'clsx'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'
import { useDynamicBrands, useBrandConnections } from '@/features/brands'
import { useScheduledPosts, schedulingKeys, useDeleteScheduled } from '@/features/scheduling'
import { useAuth } from '@/features/auth'
import type { ScheduledPost } from '@/shared/types'

type CreatorFilter = 'all' | 'user' | 'toby'
type ContentTypeFilter = 'all' | 'reels' | 'posts'
type StatusFilter = 'all' | 'scheduled' | 'published' | 'partial' | 'failed'

function Calendar() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const adminUserId = currentUser?.isSuperAdmin ? searchParams.get('user_id') : null
  const adminUserName = currentUser?.isSuperAdmin ? searchParams.get('user_name') : null
  const isAdminView = !!adminUserId

  const queryClient = useQueryClient()
  const deleteScheduled = useDeleteScheduled()
  const { brands } = useDynamicBrands()
  const { data: ownScheduledPosts = [], isLoading: ownPostsLoading } = useScheduledPosts()
  const { data: connectionsData } = useBrandConnections()

  // Admin view: fetch target user's scheduled posts
  const { data: adminScheduledPosts = [], isLoading: adminPostsLoading } = useQuery<ScheduledPost[]>({
    queryKey: ['admin-user-scheduled', adminUserId],
    queryFn: async () => {
      const res = await apiClient.get<{ schedules: Array<any> }>(`/api/admin/users/${adminUserId}/scheduled`)
      return res.schedules.map((s: any) => ({
        id: s.schedule_id,
        brand: (s.metadata?.brand || s.brand) as string,
        job_id: s.metadata?.job_id || s.reel_id?.split('_').slice(0, -1).join('_') || s.reel_id,
        reel_id: s.reel_id,
        title: s.metadata?.title || s.caption?.split('\n')[0]?.slice(0, 80) || 'Scheduled Post',
        scheduled_time: s.scheduled_time,
        caption: s.caption,
        status: s.status as ScheduledPost['status'],
        error: s.publish_error,
        published_at: s.published_at,
        thumbnail_path: s.metadata?.thumbnail_path,
        video_path: s.metadata?.video_path,
        metadata: s.metadata,
        created_by: (s.created_by || 'user') as 'user' | 'toby',
      }))
    },
    enabled: isAdminView,
    refetchInterval: 300_000,
    staleTime: 120_000,
  })

  const scheduledPosts = isAdminView ? adminScheduledPosts : ownScheduledPosts
  const postsLoading = isAdminView ? adminPostsLoading : ownPostsLoading

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [view, setView] = useState<'month' | 'week'>('month')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
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
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [caption, setCaption] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [contentType, setContentType] = useState<'reel' | 'carousel' | 'text' | null>(null)
  const [scheduledTime, setScheduledTime] = useState<string>('')
  const [mediaDimensionWarning, setMediaDimensionWarning] = useState<string | null>(null)

  // Platform dimension specs
  const PLATFORM_DIMENSIONS: Record<string, { label: string; specs: { w: number; h: number; ratio: string }[] }> = {
    instagram: { label: 'Instagram Reels', specs: [{ w: 1080, h: 1920, ratio: '9:16' }] },
    instagram_carousel: { label: 'Instagram Carousel', specs: [{ w: 1080, h: 1350, ratio: '4:5' }] },
    tiktok: { label: 'TikTok', specs: [{ w: 1080, h: 1920, ratio: '9:16' }] },
    tiktok_carousel: { label: 'TikTok Carousel', specs: [
      { w: 1080, h: 1920, ratio: '9:16' },
      { w: 1080, h: 1350, ratio: '4:5' },
      { w: 1080, h: 1080, ratio: '1:1' },
    ]},
    youtube: { label: 'YouTube Shorts', specs: [{ w: 1080, h: 1920, ratio: '9:16' }] },
    facebook: { label: 'Facebook Reels', specs: [{ w: 1080, h: 1920, ratio: '9:16' }] },
  }

  // Check media dimensions against selected platform specs
  const checkMediaDimensions = useCallback((file: File, platforms: string[], isCarousel: boolean) => {
    const isVideo = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'flv'].includes(
      file.name.split('.').pop()?.toLowerCase() || ''
    )
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(
      file.name.split('.').pop()?.toLowerCase() || ''
    )

    if (isImage) {
      const img = new window.Image()
      img.onload = () => {
        const warnings: string[] = []
        for (const platform of platforms) {
          if (platform === 'threads') continue // threads is text-only
          const key = isCarousel ? `${platform}_carousel` : platform
          const spec = PLATFORM_DIMENSIONS[key] || PLATFORM_DIMENSIONS[platform]
          if (!spec) continue
          const matchesAny = spec.specs.some(s => img.width === s.w && img.height === s.h)
          if (!matchesAny) {
            const expected = spec.specs.map(s => `${s.w}x${s.h} (${s.ratio})`).join(' or ')
            warnings.push(`${spec.label}: expected ${expected}, got ${img.width}x${img.height}`)
          }
        }
        setMediaDimensionWarning(warnings.length > 0 ? warnings.join('\n') : null)
        URL.revokeObjectURL(img.src)
      }
      img.src = URL.createObjectURL(file)
    } else if (isVideo) {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        const warnings: string[] = []
        for (const platform of platforms) {
          if (platform === 'threads') continue
          const spec = PLATFORM_DIMENSIONS[platform]
          if (!spec) continue
          const matchesAny = spec.specs.some(s => video.videoWidth === s.w && video.videoHeight === s.h)
          if (!matchesAny) {
            const expected = spec.specs.map(s => `${s.w}x${s.h} (${s.ratio})`).join(' or ')
            warnings.push(`${spec.label}: expected ${expected}, got ${video.videoWidth}x${video.videoHeight}`)
          }
        }
        setMediaDimensionWarning(warnings.length > 0 ? warnings.join('\n') : null)
        URL.revokeObjectURL(video.src)
      }
      video.src = URL.createObjectURL(file)
    }
  }, [])

  // Auto-detect content type when file is selected
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadedFile(file)
    setUploadedFileName(file.name)
    setMediaDimensionWarning(null)

    // Detect content type from extension
    const ext = file.name.split('.').pop()?.toLowerCase()
    const videoExts = ['mp4', 'mov', 'avi', 'webm', 'mkv', 'flv']
    const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']

    if (videoExts.includes(ext!)) {
      setContentType('reel')
    } else if (imageExts.includes(ext!)) {
      setContentType('carousel')
    }

    // Check dimensions against selected platforms
    if (selectedPlatforms.length > 0) {
      checkMediaDimensions(file, selectedPlatforms, imageExts.includes(ext!))
    }
  }

  // Is this a text-only post (only Threads selected, no file)?
  const isTextOnly = selectedPlatforms.length > 0 && selectedPlatforms.every(p => p === 'threads')

  const handleUpload = async () => {
    if (effectiveBrands.length === 0 || !caption || !scheduledTime || selectedPlatforms.length === 0) {
      toast.error('Please fill in all required fields')
      return
    }
    // File required unless text-only (Threads)
    if (!isTextOnly && !uploadedFile) {
      toast.error('Please upload a file (image or video)')
      return
    }

    try {
      setUploadLoading(true)

      const errors: string[] = []
      let succeeded = 0

      for (const brandId of effectiveBrands) {
        try {
          const formData = new FormData()
          formData.append('brand_id', brandId)
          formData.append('caption', caption)
          formData.append('platforms', JSON.stringify(selectedPlatforms))
          formData.append('scheduled_time', scheduledTime)
          if (uploadedFile) {
            formData.append('file', uploadedFile)
          }

          await apiClient.post('/reels/manual/upload-and-schedule', formData)
          succeeded++
        } catch (error: any) {
          const brandName = getBrandName(brandId)
          errors.push(`${brandName}: ${error.response?.data?.detail || 'Failed'}`)
        }
      }

      if (succeeded > 0) {
        const label = isTextOnly ? 'Text post' : contentType === 'reel' ? 'Reel' : 'Post'
        const brandWord = succeeded === 1 ? 'brand' : 'brands'
        toast.success(`${label} scheduled for ${succeeded} ${brandWord}!`)
      }
      if (errors.length > 0) {
        toast.error(`Failed for: ${errors.join('; ')}`)
      }

      // Reset form
      setUploadedFile(null)
      setUploadedFileName('')
      setCaption('')
      setContentType(null)
      setScheduledTime('')
      setMediaDimensionWarning(null)
      setSelectedPlatforms([])
      setSelectedBrands([])
      setShowUploadModal(false)

      // Refresh calendar data
      queryClient.invalidateQueries({ queryKey: schedulingKeys.scheduled() })
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

  // All available platforms across all brands
  const allAvailablePlatforms = useMemo(() => {
    if (!connectionsData?.brands) return []
    const platformMap: Record<string, { brandCount: number; brandIds: string[] }> = {}
    const platformOrder = ['instagram', 'tiktok', 'youtube', 'facebook', 'threads']
    for (const brand of connectionsData.brands) {
      for (const pName of platformOrder) {
        const conn = brand[pName as keyof typeof brand] as { connected?: boolean } | undefined
        if (conn && typeof conn === 'object' && 'connected' in conn && conn.connected) {
          if (!platformMap[pName]) platformMap[pName] = { brandCount: 0, brandIds: [] }
          platformMap[pName].brandCount++
          platformMap[pName].brandIds.push(brand.brand)
        }
      }
    }
    return platformOrder
      .filter(p => platformMap[p])
      .map(p => ({ name: p, ...platformMap[p]! }))
  }, [connectionsData])

  // Brands that have ALL selected platforms connected
  const eligibleBrands = useMemo(() => {
    if (selectedPlatforms.length === 0 || !connectionsData?.brands) return brands
    return brands.filter(brand => {
      const brandConn = connectionsData.brands.find(b => b.brand === brand.id)
      if (!brandConn) return false
      return selectedPlatforms.every(pName => {
        const conn = brandConn[pName as keyof typeof brandConn] as { connected?: boolean } | undefined
        return conn && typeof conn === 'object' && 'connected' in conn && conn.connected
      })
    })
  }, [brands, selectedPlatforms, connectionsData])

  // Effective brands: intersection of user picks + eligible brands
  const effectiveBrands = useMemo(() => {
    if (eligibleBrands.length === 0) return []
    // If user hasn't explicitly picked any, auto-select all eligible
    if (selectedBrands.length === 0) return eligibleBrands.map(b => b.id)
    // Otherwise keep only the ones that are still eligible
    const eligible = new Set(eligibleBrands.map(b => b.id))
    return selectedBrands.filter(id => eligible.has(id))
  }, [eligibleBrands, selectedBrands])

  // Platform toggle handler
  const handlePlatformToggle = useCallback((platform: string) => {
    setSelectedPlatforms(prev => {
      const next = prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
      // Re-check dimensions if file already uploaded
      if (uploadedFile && next.length > 0) {
        const ext = uploadedFile.name.split('.').pop()?.toLowerCase() || ''
        const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)
        checkMediaDimensions(uploadedFile, next, isImg)
      } else {
        setMediaDimensionWarning(null)
      }
      return next
    })
  }, [uploadedFile, checkMediaDimensions])

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin viewing banner */}
      {isAdminView && (
        <div className="bg-purple-50 border-b border-purple-200">
          <div className="max-w-7xl mx-auto px-4 py-2.5 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-purple-700">
              <ShieldCheck className="w-4 h-4" />
              <span className="font-medium">Admin View</span>
              <span className="text-purple-500">—</span>
              <span>Viewing calendar for <strong>{adminUserName || adminUserId}</strong></span>
            </div>
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Admin
            </button>
          </div>
        </div>
      )}

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
            {!isAdminView && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-sm"
              >
                <Plus className="h-5 w-5" />
                Add Content
              </button>
            )}
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

                    const isPost = selectedPost.metadata?.variant === 'post'

                    if (totalSlides > 0) {
                      return (
                        <div className="flex flex-col items-center">
                          <div className={clsx('relative w-full', isPost ? 'max-w-[220px]' : 'max-w-[180px]')}>
                            <div className={clsx('rounded-lg overflow-hidden bg-gray-100', isPost ? 'aspect-[4/5]' : 'aspect-[9/16]')}>
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

                  {/* Delete button — only for scheduled (not yet published) */}
                  {selectedPost.status === 'scheduled' && (
                    <button
                      onClick={() => {
                        if (!confirm('Are you sure you want to delete this scheduled post?')) return
                        deleteScheduled.mutate(selectedPost.id, {
                          onSuccess: () => {
                            toast.success('Scheduled post deleted')
                            setSelectedPost(null)
                          },
                          onError: () => toast.error('Failed to delete scheduled post'),
                        })
                      }}
                      disabled={deleteScheduled.isPending}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      {deleteScheduled.isPending ? 'Deleting...' : 'Delete Scheduled Post'}
                    </button>
                  )}
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

      {/* Upload Modal — Buffer-inspired Composer */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-2xl w-full bg-white rounded-xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-emerald-600" />
                  Create Post
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">Schedule content across your platforms</p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Step 1: Platform Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Platforms <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-3">Select where you want to publish. Brands will be filtered to match.</p>
                <div className="flex flex-wrap gap-2">
                  {allAvailablePlatforms.map(platform => {
                    const selected = selectedPlatforms.includes(platform.name)
                    const platformColors: Record<string, string> = {
                      instagram: 'bg-gradient-to-r from-purple-500 to-pink-500',
                      tiktok: 'bg-black',
                      youtube: 'bg-red-600',
                      facebook: 'bg-blue-600',
                      threads: 'bg-gray-900',
                    }
                    return (
                      <button
                        key={platform.name}
                        onClick={() => handlePlatformToggle(platform.name)}
                        className={clsx(
                          'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border-2',
                          selected
                            ? `${platformColors[platform.name]} text-white border-transparent shadow-md`
                            : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                        )}
                      >
                        {platform.name === 'instagram' && (
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                        )}
                        {platform.name === 'tiktok' && (
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48v-7.1a8.16 8.16 0 005.58 2.18v-3.45a4.85 4.85 0 01-3.59-1.62z"/></svg>
                        )}
                        {platform.name === 'youtube' && (
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                        )}
                        {platform.name === 'facebook' && (
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        )}
                        {platform.name === 'threads' && (
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.773.779c-1.005-3.575-3.473-5.51-6.97-5.46-2.819.043-4.678 1.181-5.598 2.362-1.076 1.38-1.636 3.48-1.666 6.246v.503c.046 4.96 2.267 8.12 7.246 8.169 2.477-.024 4.218-.854 5.32-2.54.73-1.118.94-2.431.583-3.69-.308-1.103-1.018-1.927-1.993-2.31-.3 1.6-.876 2.945-1.759 3.98-1.186 1.392-2.87 2.13-5.016 2.196-1.936-.053-3.508-.682-4.675-1.87-1.136-1.155-1.737-2.695-1.787-4.581.06-2.184.86-3.95 2.377-5.25 1.373-1.177 3.22-1.789 5.492-1.822 2.358.033 4.245.63 5.605 1.775l-1.87 2.098c-.877-.748-2.22-1.156-3.735-1.138-2.888.043-4.535 1.482-4.623 4.045.034 1.093.351 1.976.943 2.625.615.674 1.572 1.033 2.845 1.066 1.278-.034 2.23-.414 2.834-1.129.438-.52.762-1.237.953-2.126-1.088-.082-2.07-.44-2.67-1.118-.706-.798-1.047-1.92-1.012-3.331l.003-.073v-.008c.076-2.5 1.394-4.385 3.621-5.178.595-.212 1.254-.333 1.963-.364l.197-.004c2.13 0 3.764.818 4.862 2.43.836 1.228 1.194 2.759 1.062 4.553-.186 2.52-1.274 4.453-3.233 5.75-1.71 1.132-3.887 1.728-6.47 1.773z"/></svg>
                        )}
                        <span className="capitalize">{platform.name}</span>
                        <span className={clsx(
                          'text-xs px-1.5 py-0.5 rounded-full',
                          selected ? 'bg-white/20' : 'bg-gray-100'
                        )}>
                          {platform.brandCount} brand{platform.brandCount !== 1 ? 's' : ''}
                        </span>
                      </button>
                    )
                  })}
                  {allAvailablePlatforms.length === 0 && (
                    <div className="flex items-center gap-2 text-yellow-700 bg-yellow-50 border border-yellow-200 p-3 rounded-lg w-full">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm">No platforms connected. Go to Brands to connect your social accounts.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Brand Selection — multi-select, filtered by platform */}
              {selectedPlatforms.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Brand <span className="text-red-500">*</span>
                    {eligibleBrands.length > 0 && (
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        ({effectiveBrands.length} of {eligibleBrands.length} selected)
                      </span>
                    )}
                  </label>
                  {eligibleBrands.length === 0 ? (
                    <div className="flex items-center gap-2 text-yellow-700 bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm">No brand has all selected platforms connected.</span>
                    </div>
                  ) : (
                    <div>
                      {/* Select all / Deselect all toggle */}
                      {eligibleBrands.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const allSelected = eligibleBrands.every(b => effectiveBrands.includes(b.id))
                            setSelectedBrands(allSelected ? [] : eligibleBrands.map(b => b.id))
                          }}
                          className="text-xs text-emerald-600 hover:text-emerald-700 font-medium mb-2"
                        >
                          {eligibleBrands.every(b => effectiveBrands.includes(b.id)) ? 'Deselect all' : 'Select all'}
                        </button>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {eligibleBrands.map(brand => {
                          const isSelected = effectiveBrands.includes(brand.id)
                          return (
                            <button
                              key={brand.id}
                              onClick={() => {
                                setSelectedBrands(prev => {
                                  // If user hasn't explicitly chosen yet, start from the current effective set
                                  const base = prev.length === 0 ? eligibleBrands.map(b => b.id) : prev
                                  return isSelected
                                    ? base.filter(id => id !== brand.id)
                                    : [...base, brand.id]
                                })
                              }}
                              className={clsx(
                                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border-2',
                                isSelected
                                  ? 'border-emerald-500 bg-emerald-50 text-gray-900 shadow-sm'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                              )}
                            >
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: brand.color }} />
                              {brand.label}
                              {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Caption */}
              {selectedPlatforms.length > 0 && eligibleBrands.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Caption <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder={isTextOnly ? 'Write your Threads post...' : 'Write your caption...'}
                    rows={4}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors resize-none"
                  />
                  {isTextOnly && (
                    <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <span className="text-xs text-blue-700">Threads posts are text-only. No media upload needed.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Media Upload (skip for text-only) */}
              {selectedPlatforms.length > 0 && eligibleBrands.length > 0 && !isTextOnly && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Media <span className="text-red-500">*</span>
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-emerald-400 transition-colors cursor-pointer bg-gray-50">
                    <input
                      type="file"
                      accept="video/*,image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer block">
                      {uploadedFileName ? (
                        <div className="flex items-center justify-center gap-2">
                          {contentType === 'reel' ? (
                            <Video className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-emerald-600" />
                          )}
                          <span className="text-gray-900 font-medium">{uploadedFileName}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setUploadedFile(null)
                              setUploadedFileName('')
                              setContentType(null)
                              setMediaDimensionWarning(null)
                            }}
                            className="p-0.5 hover:bg-gray-200 rounded"
                          >
                            <X className="h-4 w-4 text-gray-500" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="h-8 w-8 text-gray-400 mx-auto" />
                          <span className="text-gray-600">Click to upload or drag and drop</span>
                          <span className="text-xs text-gray-500">Video (MP4, MOV) or Image (JPG, PNG, WebP)</span>
                        </div>
                      )}
                    </label>
                  </div>

                  {/* Dimension Warning */}
                  {mediaDimensionWarning && (
                    <div className="mt-2 flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-300 rounded-lg">
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-800 space-y-0.5">
                        <p className="font-semibold">Media dimensions don't match platform requirements:</p>
                        {mediaDimensionWarning.split('\n').map((line, i) => (
                          <p key={i}>{line}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dimension guidelines */}
                  {!uploadedFile && (
                    <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                      {selectedPlatforms.some(p => ['instagram', 'tiktok', 'youtube', 'facebook'].includes(p)) && (
                        <p>Reels/Shorts: <span className="font-medium text-gray-700">1080 x 1920</span> (9:16)</p>
                      )}
                      {selectedPlatforms.includes('instagram') && (
                        <p>IG Carousel: <span className="font-medium text-gray-700">1080 x 1350</span> (4:5)</p>
                      )}
                      {selectedPlatforms.includes('tiktok') && (
                        <p>TikTok Carousel: <span className="font-medium text-gray-700">1080x1920</span>, 1080x1350, or 1080x1080</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 5: Schedule Time */}
              {selectedPlatforms.length > 0 && eligibleBrands.length > 0 && (
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
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
              <div className="text-xs text-gray-500 max-w-[60%] truncate">
                {selectedPlatforms.length > 0 && (
                  <span>{selectedPlatforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')}</span>
                )}
                {effectiveBrands.length > 0 && selectedPlatforms.length > 0 && (
                  <span> · {effectiveBrands.length === 1
                    ? getBrandName(effectiveBrands[0])
                    : `${effectiveBrands.length} brands`
                  }</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowUploadModal(false)}
                  disabled={uploadLoading}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={
                    uploadLoading ||
                    selectedPlatforms.length === 0 ||
                    effectiveBrands.length === 0 ||
                    !caption ||
                    !scheduledTime ||
                    (!isTextOnly && !uploadedFile)
                  }
                  className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {uploadLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {uploadLoading
                    ? 'Scheduling...'
                    : effectiveBrands.length > 1
                      ? `Schedule for ${effectiveBrands.length} Brands`
                      : 'Schedule Post'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export { Calendar as CalendarPage }
