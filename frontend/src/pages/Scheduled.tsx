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
  Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useScheduledPosts, useDeleteScheduled } from '@/api/reels'
import BrandBadge, { getBrandColor, getBrandLabel } from '@/components/BrandBadge'
import { FullPageLoader } from '@/components/LoadingSpinner'
import Modal from '@/components/Modal'
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
import type { BrandName } from '@/types'

interface ScheduledPost {
  id: string
  brand: BrandName
  job_id: string
  reel_id: string
  title: string
  scheduled_time: string
  thumbnail_path?: string
  video_path?: string
  caption?: string
  status: string
}

function Scheduled() {
  const navigate = useNavigate()
  const { data: posts = [], isLoading } = useScheduledPosts()
  const deleteScheduled = useDeleteScheduled()
  
  // View state
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  
  // Selected day modal
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  
  // Get days for calendar (month view)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const calendarStart = startOfWeek(monthStart)
    const calendarEnd = endOfWeek(monthEnd)
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  }, [currentDate])
  
  // Get days for week view
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate)
    const weekEnd = endOfWeek(currentDate)
    return eachDayOfInterval({ start: weekStart, end: weekEnd })
  }, [currentDate])
  
  // Group posts by date
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
  
  // Get posts for a specific day
  const getPostsForDay = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd')
    return postsByDate[dateKey] || []
  }
  
  // Navigation
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
  
  // Handle delete
  const handleDelete = async (post: ScheduledPost) => {
    try {
      await deleteScheduled.mutateAsync(post.id)
      toast.success('Post unscheduled')
      setSelectedPost(null)
    } catch {
      toast.error('Failed to unschedule')
    }
  }
  
  // Stats
  const stats = useMemo(() => {
    const byBrand: Record<string, number> = {}
    posts.forEach(post => {
      byBrand[post.brand] = (byBrand[post.brand] || 0) + 1
    })
    return {
      total: posts.length,
      byBrand,
    }
  }, [posts])
  
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
        
        {/* View Toggle */}
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
      <div className="grid grid-cols-5 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Total</p>
        </div>
        {(['gymcollege', 'healthycollege', 'vitalitycollege', 'longevitycollege'] as BrandName[]).map(brand => (
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
            <button
              onClick={goPrev}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goNext}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-semibold text-gray-900 ml-2">
              {viewMode === 'month' 
                ? format(currentDate, 'MMMM yyyy')
                : `Week of ${format(startOfWeek(currentDate), 'MMM d')} - ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`
              }
            </h2>
          </div>
          
          <button
            onClick={goToToday}
            className="btn btn-secondary"
          >
            <CalendarIcon className="w-4 h-4" />
            Today
          </button>
        </div>
        
        {/* Month View - Calendar Grid */}
        {viewMode === 'month' && (
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
            {/* Day headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div
                key={day}
                className="bg-gray-50 p-2 text-center text-sm font-medium text-gray-500"
              >
                {day}
              </div>
            ))}
            
            {/* Days */}
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
                  
                  {/* Post indicators */}
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
                  
                  {/* Posts for this day */}
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
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 whitespace-pre-line">
              {selectedPost.title}
            </h3>
            
            {/* Media */}
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
                <div className="aspect-[9/16] bg-gray-900 rounded-lg overflow-hidden relative group">
                  <video
                    src={selectedPost.video_path}
                    className="w-full h-full object-cover"
                    controls
                  />
                </div>
              )}
            </div>
            
            {/* Caption */}
            {selectedPost.caption && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Caption</p>
                <p className="text-sm text-gray-600 whitespace-pre-line">
                  {selectedPost.caption}
                </p>
              </div>
            )}
            
            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => {
                  // Extract job_id from reel_id (format: GEN-123456_brand or just GEN-123456)
                  const jobId = selectedPost.job_id?.includes('_') 
                    ? selectedPost.job_id.split('_')[0]
                    : selectedPost.job_id
                  navigate(`/jobs/${jobId}`)
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
    </div>
  )
}

export default Scheduled
