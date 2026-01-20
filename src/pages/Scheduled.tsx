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
  Send
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
import { useScheduledPosts, useDeleteScheduled, useRetryFailed, useReschedule, usePublishNow } from '@/features/scheduling'
import { BrandBadge, getBrandColor, getBrandLabel, ALL_BRANDS } from '@/features/brands'
import { FullPageLoader, Modal } from '@/shared/components'
import type { ScheduledPost } from '@/shared/types'

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
              
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => dayPosts.length > 0 && setSelectedDay(day)}
                  className={clsx(
                    'bg-white p-2 min-h-[100px] cursor-pointer transition-colors',
                    !isCurrentMonth && 'bg-gray-50',
                    dayPosts.length > 0 && 'hover:bg-gray-50'
                  )}
                >
                  <div className={clsx(
                    'text-sm font-medium mb-1',
                    isCurrentDay && 'w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center',
                    !isCurrentMonth && 'text-gray-400'
                  )}>
                    {format(day, 'd')}
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
