import { useState, useEffect, useMemo } from 'react'
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

function Calendar() {
  const { brands } = useDynamicBrands()
  const { data: scheduledPosts = [], isLoading: postsLoading } = useScheduledPosts()

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [view, setView] = useState<'month' | 'week'>('month')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
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
      const dateKey = post.scheduled_time.slice(0, 10) // 'yyyy-MM-dd'
      if (!map[dateKey]) map[dateKey] = []
      map[dateKey].push(post)
    }
    return map
  }, [scheduledPosts])

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
                onClick={() => setShowUploadModal(true)}
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
