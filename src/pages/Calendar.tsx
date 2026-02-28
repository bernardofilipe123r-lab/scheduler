import { useState, useEffect } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Upload,
  X,
  AlertCircle,
  Loader2,
  Calendar as CalendarIcon,
  Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, parseISO, addDays } from 'date-fns'
import { clsx } from 'clsx'
import { apiClient } from '@/shared/api/client'
import { useDynamicBrands } from '@/features/brands'

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

interface ManualScheduledContent {
  schedule_id: string
  caption: string
  brand_id: string
  platforms: string[]
  scheduled_time: string
  status: 'scheduled' | 'published' | 'failed'
  content_type: 'reel' | 'carousel'
  file_url: string
  social_media?: string
}

function Calendar() {
  const { brands } = useDynamicBrands()

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [view, setView] = useState<'month' | 'week'>('month')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [scheduled, setScheduled] = useState<ManualScheduledContent[]>([])
  const [loading, setLoading] = useState(true)
  const [brandPlatforms, setBrandPlatforms] = useState<BrandPlatforms[]>([])

  // Upload form state
  const [selectedBrand, setSelectedBrand] = useState<string>(brands[0]?.id || '')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['instagram'])
  const [caption, setCaption] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [contentType, setContentType] = useState<'reel' | 'carousel' | null>(null)
  const [scheduledTime, setScheduledTime] = useState<string>('')
  const [socialMedia, setSocialMedia] = useState('')

  // Load scheduled content and connected platforms
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        
        // Fetch scheduled content
        const schedRes = await apiClient.get('/reels/manual')
        setScheduled((schedRes as any).data?.schedules || [])

        // Fetch connected platforms
        const platRes = await apiClient.get('/reels/manual/connected-platforms')
        setBrandPlatforms((platRes as any).data || [])
      } catch (error: any) {
        console.error('Failed to load calendar data:', error)
        toast.error('Failed to load calendar data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
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

      // Refresh scheduled content
      const schedRes = await apiClient.get('/reels/manual')
      setScheduled((schedRes as any).data?.schedules || [])
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to schedule content')
    } finally {
      setUploadLoading(false)
    }
  }

  // Get scheduled content for a specific date
  const getContentForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return scheduled.filter(s => s.scheduled_time.startsWith(dateStr))
  }

  // Get pending badge count
  const getPendingCount = () => {
    return scheduled.filter(s => s.status === 'scheduled').length
  }

  // Format platform name for display
  const getPlatformLabel = (platform: string) => {
    return platform.charAt(0).toUpperCase() + platform.slice(1)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-4" />
          <p className="text-white">Loading calendar...</p>
        </div>
      </div>
    )
  }

  const currentBrandPlatforms = brandPlatforms.find(bp => bp.brand_id === selectedBrand)?.platforms || []

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-lg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarIcon className="h-8 w-8 text-emerald-500" />
              <div>
                <h1 className="text-2xl font-bold text-white">Calendar</h1>
                <p className="text-sm text-zinc-400">
                  {getPendingCount()} scheduled, {scheduled.filter(s => s.status === 'published').length} published
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              <Plus className="h-5 w-5" />
              Add Content
            </button>
          </div>
        </div>
      </div>

      {/* Calendar View Controls */}
      <div className="border-b border-zinc-800 bg-zinc-900/30">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-zinc-400" />
              </button>
              <h2 className="text-lg font-semibold text-white min-w-[200px]">
                {format(currentMonth, 'MMMM yyyy')}
              </h2>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-zinc-400" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setView('month')}
                className={clsx(
                  'px-3 py-2 rounded-lg transition-colors',
                  view === 'month'
                    ? 'bg-emerald-600 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800'
                )}
              >
                Month
              </button>
              <button
                onClick={() => setView('week')}
                className={clsx(
                  'px-3 py-2 rounded-lg transition-colors',
                  view === 'week'
                    ? 'bg-emerald-600 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800'
                )}
              >
                Week
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Calendar */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-sm font-semibold text-zinc-400 py-2">
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
                onClick={() => setShowUploadModal(true)}
                className={clsx(
                  'min-h-32 rounded-lg border-2 p-2 cursor-pointer transition-colors',
                  isCurrentDay
                    ? 'border-emerald-500 bg-emerald-950/20'
                    : 'border-zinc-700 hover:border-zinc-600',
                  !isCurrentMonth && 'bg-zinc-900/30 opacity-50'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={clsx(
                    'text-sm font-semibold',
                    isCurrentDay ? 'text-emerald-400' : 'text-zinc-300'
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
                      key={content.schedule_id}
                      className="flex items-center gap-1 p-1 bg-zinc-800 rounded truncate hover:bg-zinc-700 transition-colors"
                    >
                      <span className={clsx(
                        'inline-block w-1.5 h-1.5 rounded-full',
                        content.status === 'published' ? 'bg-green-500' : 'bg-yellow-500'
                      )} />
                      <span className="truncate text-zinc-300">
                        {format(parseISO(content.scheduled_time), 'HH:mm')} - {content.brand_id}
                      </span>
                    </div>
                  ))}
                  {dayContent.length > 3 && (
                    <p className="text-zinc-500">+{dayContent.length - 3} more</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-2xl w-full bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between bg-zinc-800/50">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Upload className="h-5 w-5 text-emerald-500" />
                Upload & Schedule Content
              </h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-zinc-400" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Brand Selection */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Brand <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedBrand}
                  onChange={(e) => {
                    setSelectedBrand(e.target.value)
                    setSelectedPlatforms(['instagram'])
                  }}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-emerald-500 transition-colors"
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
                <label className="block text-sm font-semibold text-white mb-2">
                  Upload File ({contentType ? contentType.toUpperCase() : 'Video or Image'})
                  <span className="text-red-500"> *</span>
                </label>
                <div className="border-2 border-dashed border-zinc-700 rounded-lg p-4 text-center hover:border-zinc-600 transition-colors cursor-pointer">
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
                        <span className="text-emerald-400">✓</span>
                        <span className="text-white">{uploadedFileName}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-8 w-8 text-zinc-500 mx-auto" />
                        <span className="text-zinc-400">Click to upload or drag and drop</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Platform Selection */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
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
                          className="w-4 h-4 rounded bg-zinc-700 border-zinc-600 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-white">
                          {getPlatformLabel(platform.name)} ({platform.handle})
                        </span>
                      </label>
                    ))
                  ) : (
                    <div className="flex items-center gap-2 text-yellow-500 bg-yellow-950/30 p-2 rounded-lg">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm">No platforms connected for this brand. Connect platforms in Brands settings.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Schedule Time */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Schedule Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Caption */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Caption <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Enter caption for your content..."
                  rows={3}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Social Media Account (Optional) */}
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Specific Account (Optional)
                </label>
                <input
                  type="text"
                  value={socialMedia}
                  onChange={(e) => setSocialMedia(e.target.value)}
                  placeholder="Leave empty to use default"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-800 px-6 py-4 flex items-center justify-end gap-3 bg-zinc-800/50">
              <button
                onClick={() => setShowUploadModal(false)}
                disabled={uploadLoading}
                className="px-4 py-2 text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
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
