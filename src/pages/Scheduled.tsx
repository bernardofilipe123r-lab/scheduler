import { useState, useMemo } from 'react'
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
  X
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
import { useScheduledPosts, useDeleteScheduled, useRetryFailed, useReschedule, usePublishNow, YouTubeStatusCard } from '@/features/scheduling'
import { BrandBadge, getBrandColor, getBrandLabel, ALL_BRANDS } from '@/features/brands'
import { FullPageLoader, Modal } from '@/shared/components'
import type { ScheduledPost, BrandName, Variant } from '@/shared/types'

// Time slot configuration per brand
// Each brand has 6 slots per day: 3 light and 3 dark
// Pattern: Every 4 hours, alternating L/D/L/D/L/D
// Each brand is offset by 1 hour from the previous one
const BRAND_OFFSETS: Record<BrandName, number> = {
  holisticcollege: 0,
  healthycollege: 1,
  vitalitycollege: 2,
  longevitycollege: 3,
  wellbeingcollege: 4,
}

const BASE_SLOTS: Array<{ hour: number; variant: Variant }> = [
  { hour: 0, variant: 'light' },   // 12 AM
  { hour: 4, variant: 'dark' },    // 4 AM  
  { hour: 8, variant: 'light' },   // 8 AM
  { hour: 12, variant: 'dark' },   // 12 PM
  { hour: 16, variant: 'light' },  // 4 PM
  { hour: 20, variant: 'dark' },   // 8 PM
]

function getBrandSlots(brand: BrandName): Array<{ hour: number; variant: Variant }> {
  const offset = BRAND_OFFSETS[brand] || 0
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

export function ScheduledPage() {
  const navigate = useNavigate()
  const { data: posts = [], isLoading } = useScheduledPosts()
  const deleteScheduled = useDeleteScheduled()
  const retryFailed = useRetryFailed()
  const reschedule = useReschedule()
  const publishNow = usePublishNow()
  
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [statsFilter, setStatsFilter] = useState<'future' | 'all'>('future')
  const [brandFilter, setBrandFilter] = useState<BrandName | null>(null)
  const [selectedDayForMissing, setSelectedDayForMissing] = useState<Date | null>(null)
  
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
      const dateKey = format(parseISO(post.scheduled_time), 'yyyy-MM-dd')
      if (!grouped[dateKey]) {
        grouped[dateKey] = []
      }
      grouped[dateKey].push(post)
    })
    
    return grouped
  }, [posts])
  
  // Analyze slots for a specific brand on a specific day
  const analyzeSlots = useMemo(() => {
    if (!brandFilter) return null
    
    const brandSlots = getBrandSlots(brandFilter)
    const lightSlots = brandSlots.filter(s => s.variant === 'light').map(s => s.hour)
    const darkSlots = brandSlots.filter(s => s.variant === 'dark').map(s => s.hour)
    
    return (day: Date) => {
      const dateKey = format(day, 'yyyy-MM-dd')
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
  }, [brandFilter, postsByDate])
  
  const getPostsForDay = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd')
    return postsByDate[dateKey] || []
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
  
  const openRescheduleModal = (post: ScheduledPost) => {
    // Pre-fill with current scheduled time
    const currentTime = parseISO(post.scheduled_time)
    setRescheduleDate(format(currentTime, 'yyyy-MM-dd'))
    setRescheduleTime(format(currentTime, 'HH:mm'))
    setShowRescheduleModal(true)
  }
  
  const handleReschedule = async () => {
    if (!selectedPost || !rescheduleDate || !rescheduleTime) return
    
    try {
      const newDateTime = new Date(`${rescheduleDate}T${rescheduleTime}`)
      await reschedule.mutateAsync({
        id: selectedPost.id,
        scheduledTime: newDateTime.toISOString()
      })
      toast.success(`Post rescheduled to ${format(newDateTime, 'MMM d, yyyy h:mm a')}`)
      setShowRescheduleModal(false)
      setSelectedPost(null)
    } catch {
      toast.error('Failed to reschedule')
    }
  }
  
  const stats = useMemo(() => {
    const now = new Date()
    const filteredPosts = statsFilter === 'future'
      ? posts.filter(post => parseISO(post.scheduled_time) > now)
      : posts
    
    const byBrand: Record<string, number> = {}
    filteredPosts.forEach(post => {
      byBrand[post.brand] = (byBrand[post.brand] || 0) + 1
    })
    return {
      total: filteredPosts.length,
      byBrand,
    }
  }, [posts, statsFilter])
  
  if (isLoading) {
    return <FullPageLoader text="Loading scheduled posts..." />
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduled</h1>
          <p className="text-gray-500">{stats.total} posts scheduled</p>
        </div>
        
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
      <div className="grid grid-cols-6 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Total</p>
        </div>
        {ALL_BRANDS.map(brand => (
          <div 
            key={brand}
            className="card p-4 text-center"
            style={{ borderLeftColor: getBrandColor(brand), borderLeftWidth: '3px' }}
          >
            <p className="text-2xl font-bold text-gray-900">{stats.byBrand[brand] || 0}</p>
            <p className="text-sm text-gray-500">{getBrandLabel(brand).split(' ')[0]}</p>
          </div>
        ))}
      </div>
      
      {/* YouTube Status */}
      <div className="mt-6">
        <YouTubeStatusCard />
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
              {ALL_BRANDS.map(brand => (
                <button
                  key={brand}
                  onClick={() => setBrandFilter(brandFilter === brand ? null : brand)}
                  className={clsx(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                    brandFilter === brand
                      ? 'ring-2 ring-offset-1'
                      : 'opacity-60 hover:opacity-100'
                  )}
                  style={{ 
                    backgroundColor: `${getBrandColor(brand)}20`,
                    color: getBrandColor(brand),
                    ...(brandFilter === brand && { ringColor: getBrandColor(brand) })
                  }}
                >
                  {getBrandLabel(brand).split(' ')[0]}
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
                        {format(parseISO(post.scheduled_time), 'HH:mm')}
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
                          onClick={() => setSelectedPost(post)}
                          className="p-2 rounded cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ 
                            backgroundColor: `${getBrandColor(post.brand)}15`,
                            borderLeft: `3px solid ${getBrandColor(post.brand)}`
                          }}
                        >
                          <div className="text-xs font-medium" style={{ color: getBrandColor(post.brand) }}>
                            {format(parseISO(post.scheduled_time), 'h:mm a')}
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
            {getPostsForDay(selectedDay).map(post => (
              <div
                key={post.id}
                onClick={() => {
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
                      className="w-16 h-24 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <BrandBadge brand={post.brand} size="sm" />
                      <span className="text-sm text-gray-500">
                        {format(parseISO(post.scheduled_time), 'h:mm a')}
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
                          setSelectedPost(post)
                          setSelectedDayForMissing(null)
                        }}
                        className="p-2 rounded border border-gray-200 hover:bg-gray-50 cursor-pointer flex items-center gap-3"
                      >
                        <span className="text-sm font-medium text-gray-700">
                          {format(parseISO(post.scheduled_time), 'h:mm a')}
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
        onClose={() => setSelectedPost(null)}
        title="Post Details"
        size="lg"
      >
        {selectedPost && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <BrandBadge brand={selectedPost.brand} size="md" />
              <span className="text-gray-500">
                {format(parseISO(selectedPost.scheduled_time), 'MMMM d, yyyy h:mm a')}
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
            
            <div className="grid grid-cols-2 gap-4">
              {selectedPost.thumbnail_path && (
                <div className="aspect-[9/16] bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={selectedPost.thumbnail_path}
                    alt="Thumbnail"
                    className="w-full h-full object-cover"
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
                <p className="text-sm font-medium text-gray-700 mb-3">Publish Details</p>
                <div className="space-y-2">
                  {Object.entries(selectedPost.metadata.publish_results as Record<string, {success: boolean; post_id?: string; account_id?: string; brand_used?: string; error?: string}>).map(([platform, result]) => (
                    <div 
                      key={platform}
                      className={`flex items-center justify-between p-2 rounded ${
                        result.success ? 'bg-green-50' : 'bg-red-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
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
                      <div className="text-xs">
                        {result.success ? (
                          <span className="text-green-600">
                            ✓ Posted (ID: {result.post_id?.slice(-8)}...)
                          </span>
                        ) : (
                          <span className="text-red-600">
                            ✗ {result.error || 'Failed'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Show error message for failed posts */}
            {selectedPost.status === 'failed' && selectedPost.error && !selectedPost.metadata?.publish_results && (
              <div className="bg-red-50 rounded-lg p-4">
                <p className="text-sm font-medium text-red-700 mb-2">Error</p>
                <p className="text-sm text-red-600">{selectedPost.error}</p>
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
                  const jobId = selectedPost.job_id?.includes('_') 
                    ? selectedPost.job_id.split('_')[0]
                    : selectedPost.job_id
                  navigate(`/job/${jobId}`)
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
        )}
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
