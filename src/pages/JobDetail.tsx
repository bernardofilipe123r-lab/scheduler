import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  ArrowLeft,
  RefreshCw,
  Trash2,
  Download,
  Calendar,
  Edit2,
  Copy,
  Play,
  Loader2,
  AlertCircle,
  Check,
  Clock,
  CalendarClock
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { 
  useJob, 
  useDeleteJob, 
  useRegenerateJob, 
  useRegenerateBrand,
  useUpdateJob,
  useJobNextSlots,
  useUpdateBrandStatus
} from '@/features/jobs'
import { useAutoScheduleReel } from '@/features/scheduling'
import { BrandBadge, getBrandLabel, getBrandColor } from '@/features/brands'
import { StatusBadge, FullPageLoader, Modal } from '@/shared/components'
import type { BrandName, BrandOutput } from '@/shared/types'

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const id = jobId || ''
  
  const { data: job, isLoading, error, refetch } = useJob(id)
  const { data: nextSlots } = useJobNextSlots(id)
  const deleteJob = useDeleteJob()
  const regenerateJob = useRegenerateJob()
  const regenerateBrand = useRegenerateBrand()
  const updateJob = useUpdateJob()
  const updateBrandStatus = useUpdateBrandStatus()
  const autoSchedule = useAutoScheduleReel()
  
  // Modal states
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [editTitleModalOpen, setEditTitleModalOpen] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [customScheduleModalOpen, setCustomScheduleModalOpen] = useState(false)
  const [customScheduleDate, setCustomScheduleDate] = useState('')
  const [customScheduleTime, setCustomScheduleTime] = useState('')
  
  // Loading states
  const [schedulingBrand, setSchedulingBrand] = useState<BrandName | null>(null)
  const [schedulingAll, setSchedulingAll] = useState(false)
  const [schedulingCustom, setSchedulingCustom] = useState(false)
  
  const isGenerating = job?.status === 'generating' || job?.status === 'pending'
  
  const allScheduled = job ? Object.entries(job.brand_outputs || {})
    .filter(([_, output]) => output.status === 'completed' || output.status === 'scheduled')
    .every(([_, output]) => output.status === 'scheduled') : false
  
  const handleDelete = async () => {
    try {
      await deleteJob.mutateAsync(id)
      toast.success('Job deleted')
      navigate('/history')
    } catch {
      toast.error('Failed to delete job')
    }
  }
  
  const handleRegenerateAll = async () => {
    try {
      await regenerateJob.mutateAsync(id)
      toast.success('Regeneration started')
      refetch()
    } catch {
      toast.error('Failed to regenerate')
    }
  }
  
  const handleRegenerateBrand = async (brand: BrandName) => {
    try {
      await regenerateBrand.mutateAsync({ id, brand })
      toast.success(`Regenerating ${getBrandLabel(brand)}`)
      refetch()
    } catch {
      toast.error('Failed to regenerate')
    }
  }
  
  const openEditTitleModal = () => {
    setEditedTitle(job?.title || '')
    setEditTitleModalOpen(true)
  }
  
  const handleSaveTitle = async () => {
    if (!editedTitle.trim()) {
      toast.error('Title cannot be empty')
      return
    }
    
    try {
      await updateJob.mutateAsync({ id, data: { title: editedTitle } })
      setEditTitleModalOpen(false)
      toast.success('Title updated')
      await regenerateJob.mutateAsync(id)
      toast.success('Regenerating with new title')
      refetch()
    } catch {
      toast.error('Failed to update title')
    }
  }
  
  const handleScheduleBrand = async (brand: BrandName, output: BrandOutput) => {
    if (!output.reel_id || !job) {
      toast.error('No reel to schedule')
      return
    }
    
    const caption = output.caption || `${job.title}\n\nGenerated content for ${brand}`
    
    setSchedulingBrand(brand)
    try {
      await autoSchedule.mutateAsync({
        brand,
        reel_id: output.reel_id,
        variant: job.variant,
        caption: caption,
        video_path: output.video_path,
        thumbnail_path: output.thumbnail_path,
      })
      
      await updateBrandStatus.mutateAsync({
        id,
        brand,
        status: 'scheduled',
      })
      
      toast.success(`${getBrandLabel(brand)} scheduled!`)
      refetch()
    } catch {
      toast.error('Failed to schedule')
    } finally {
      setSchedulingBrand(null)
    }
  }
  
  const handleScheduleAll = async () => {
    if (!job) return
    
    const completedBrands = Object.entries(job.brand_outputs || {})
      .filter(([_, output]) => output.status === 'completed')
      .map(([brand]) => brand as BrandName)
    
    if (completedBrands.length === 0) {
      toast.error('No completed brands to schedule')
      return
    }
    
    setSchedulingAll(true)
    let scheduled = 0
    let failed = 0
    
    for (const brand of completedBrands) {
      const output = job.brand_outputs[brand]
      if (output?.reel_id) {
        try {
          const caption = output.caption || `${job.title}\n\nGenerated content for ${brand}`
          
          await autoSchedule.mutateAsync({
            brand,
            reel_id: output.reel_id,
            variant: job.variant,
            caption: caption,
            video_path: output.video_path,
            thumbnail_path: output.thumbnail_path,
          })
          await updateBrandStatus.mutateAsync({
            id,
            brand,
            status: 'scheduled',
          })
          scheduled++
        } catch (error) {
          console.error(`Failed to schedule ${brand}:`, error)
          failed++
        }
      }
    }
    
    setSchedulingAll(false)
    
    if (scheduled > 0) {
      const message = failed > 0 
        ? `✅ ${scheduled} brand${scheduled !== 1 ? 's' : ''} scheduled! ${failed} failed.`
        : `🎉 All ${scheduled} brand${scheduled !== 1 ? 's' : ''} scheduled successfully!`
      
      toast.success(message, { duration: 4000 })
      
      setTimeout(() => {
        navigate('/scheduled')
      }, 1500)
    } else if (failed > 0) {
      toast.error('Failed to schedule brands')
    }
  }
  
  const openCustomScheduleModal = () => {
    // Set default to tomorrow at 10:00
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setCustomScheduleDate(tomorrow.toISOString().split('T')[0])
    setCustomScheduleTime('10:00')
    setCustomScheduleModalOpen(true)
  }
  
  const handleCustomScheduleAll = async () => {
    if (!job || !customScheduleDate || !customScheduleTime) {
      toast.error('Please select a date and time')
      return
    }
    
    const completedBrands = Object.entries(job.brand_outputs || {})
      .filter(([_, output]) => output.status === 'completed')
      .map(([brand]) => brand as BrandName)
    
    if (completedBrands.length === 0) {
      toast.error('No completed brands to schedule')
      return
    }
    
    setSchedulingCustom(true)
    let scheduled = 0
    let failed = 0
    
    // Parse base datetime
    const baseDateTime = new Date(`${customScheduleDate}T${customScheduleTime}`)
    
    for (let i = 0; i < completedBrands.length; i++) {
      const brand = completedBrands[i]
      const output = job.brand_outputs[brand]
      if (output?.reel_id) {
        try {
          const caption = output.caption || `${job.title}\n\nGenerated content for ${brand}`
          
          // Stagger brands by 1 hour each
          const scheduledTime = new Date(baseDateTime)
          scheduledTime.setHours(scheduledTime.getHours() + i)
          
          await autoSchedule.mutateAsync({
            brand,
            reel_id: output.reel_id,
            variant: job.variant,
            caption: caption,
            video_path: output.video_path,
            thumbnail_path: output.thumbnail_path,
            scheduled_time: scheduledTime.toISOString(),
          })
          await updateBrandStatus.mutateAsync({
            id,
            brand,
            status: 'scheduled',
          })
          scheduled++
        } catch (error) {
          console.error(`Failed to schedule ${brand}:`, error)
          failed++
        }
      }
    }
    
    setSchedulingCustom(false)
    setCustomScheduleModalOpen(false)
    
    if (scheduled > 0) {
      const message = failed > 0 
        ? `✅ ${scheduled} brand${scheduled !== 1 ? 's' : ''} scheduled for ${customScheduleDate}! ${failed} failed.`
        : `🎉 All ${scheduled} brand${scheduled !== 1 ? 's' : ''} scheduled for ${customScheduleDate}!`
      
      toast.success(message, { duration: 4000 })
      
      setTimeout(() => {
        navigate('/scheduled')
      }, 1500)
    } else if (failed > 0) {
      toast.error('Failed to schedule brands')
    }
  }
  
  const handleDownload = (_brand: BrandName, output: BrandOutput) => {
    if (output.video_path) {
      const link = document.createElement('a')
      link.href = output.video_path
      link.download = `${_brand}_${output.reel_id || 'reel'}.mp4`
      link.click()
    }
  }
  
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied!`)
  }
  
  if (isLoading) {
    return <FullPageLoader text="Loading job..." />
  }
  
  if (error || !job) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Job not found</h2>
        <button onClick={() => navigate('/history')} className="btn btn-primary mt-4">
          Back to History
        </button>
      </div>
    )
  }
  
  const completedCount = Object.values(job.brand_outputs || {})
    .filter(o => o.status === 'completed').length
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/history')}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-mono text-gray-400">#{job.id}</span>
              <StatusBadge status={job.status} size="md" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 whitespace-pre-line">
              {job.title}
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              Created {format(new Date(job.created_at), 'MMMM d, yyyy h:mm a')}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={openEditTitleModal}
            disabled={isGenerating || allScheduled}
            className="btn btn-secondary"
            title={allScheduled ? "Cannot edit - brands are scheduled" : ""}
          >
            <Edit2 className="w-4 h-4" />
            Edit Title
          </button>
          
          {!isGenerating && (
            <button
              onClick={handleRegenerateAll}
              disabled={regenerateJob.isPending || allScheduled}
              className="btn btn-secondary"
              title={allScheduled ? "Cannot regenerate - brands are scheduled" : ""}
            >
              {regenerateJob.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Regenerate All
            </button>
          )}
          
          <button
            onClick={() => setDeleteModalOpen(true)}
            disabled={isGenerating}
            className="btn btn-danger"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
      
      {/* Quick Schedule Section */}
      {completedCount > 0 && (
        <div className="card p-4 bg-gradient-to-r from-purple-50 to-blue-50 border-purple-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-purple-600" />
              <div>
                <span className="font-semibold text-gray-900">Quick Schedule</span>
                <span className="text-gray-500 ml-2">
                  {completedCount} brand{completedCount !== 1 ? 's' : ''} ready
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleScheduleAll}
                disabled={schedulingAll || schedulingCustom || isGenerating || allScheduled}
                className="btn btn-primary"
                title={allScheduled ? "All brands already scheduled" : "Schedule to next available slots"}
              >
                {schedulingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : allScheduled ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Calendar className="w-4 h-4" />
                )}
                {allScheduled ? 'All Scheduled' : 'Schedule All'}
              </button>
              
              {!allScheduled && (
                <button
                  onClick={openCustomScheduleModal}
                  disabled={schedulingAll || schedulingCustom || isGenerating}
                  className="btn btn-secondary"
                  title="Pick a custom date and time"
                >
                  <CalendarClock className="w-4 h-4" />
                  Custom
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Brand Sections */}
      <div className="grid gap-6">
        {job.brands?.map(brand => {
          const output = job.brand_outputs?.[brand] || { status: 'pending' }
          const isCompleted = output.status === 'completed'
          const isScheduled = output.status === 'scheduled'
          const isFailed = output.status === 'failed'
          const isBrandGenerating = output.status === 'generating' || output.status === 'pending'
          const slot = nextSlots?.[brand]
          
          return (
            <div
              key={brand}
              className="card overflow-hidden"
              style={{ borderTopColor: getBrandColor(brand), borderTopWidth: '4px' }}
            >
              {/* Brand Header */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BrandBadge brand={brand} size="md" />
                  <StatusBadge status={output.status} />
                </div>
                
                {slot && !isScheduled && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="w-4 h-4" />
                    <span>Next slot: {slot.formatted}</span>
                  </div>
                )}
              </div>
              
              {/* Content */}
              <div className="p-4">
                {isBrandGenerating ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
                    <p className="text-gray-700 font-medium mb-2">
                      {output.progress_message || `Generating ${getBrandLabel(brand)}...`}
                    </p>
                    {typeof output.progress_percent === 'number' && (
                      <div className="w-full max-w-xs">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Progress</span>
                          <span>{output.progress_percent}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-orange-500 transition-all duration-500 ease-out"
                            style={{ width: `${output.progress_percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : isFailed ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
                    <p className="text-gray-600 mb-4">{output.error || 'Generation failed'}</p>
                    <button
                      onClick={() => handleRegenerateBrand(brand)}
                      disabled={regenerateBrand.isPending}
                      className="btn btn-primary"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Retry
                    </button>
                  </div>
                ) : (isCompleted || isScheduled) ? (
                  <div className="space-y-4">
                    {/* Media Preview */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Thumbnail */}
                      {output.thumbnail_path ? (
                        <div className="aspect-[9/16] bg-gray-100 rounded-lg overflow-hidden">
                          <img
                            src={output.thumbnail_path}
                            alt={`${brand} thumbnail`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="aspect-[9/16] bg-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-400 p-4">
                          <AlertCircle className="w-12 h-12 mb-2" />
                          <p className="text-sm text-center">No thumbnail</p>
                        </div>
                      )}
                      
                      {/* Video */}
                      {output.video_path ? (
                        <div className="aspect-[9/16] bg-black rounded-lg overflow-hidden">
                          <video
                            key={output.video_path}
                            src={output.video_path}
                            className="w-full h-full"
                            style={{ objectFit: 'contain' }}
                            controls
                            playsInline
                            preload="auto"
                            controlsList="nodownload"
                          >
                            <source src={output.video_path} type="video/mp4" />
                            Your browser does not support the video tag.
                          </video>
                        </div>
                      ) : (
                        <div className="aspect-[9/16] bg-gray-900 rounded-lg flex flex-col items-center justify-center text-gray-400 p-4">
                          <Play className="w-12 h-12 mb-2" />
                          <p className="text-sm text-center">No video</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Caption */}
                    {output.caption && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">Caption</span>
                          <button
                            onClick={() => copyToClipboard(output.caption!, 'Caption')}
                            className="p-1.5 rounded hover:bg-gray-200"
                          >
                            <Copy className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                        <p className="text-sm text-gray-600 whitespace-pre-line line-clamp-4">
                          {output.caption}
                        </p>
                      </div>
                    )}
                    
                    {/* Scheduled Info */}
                    {isScheduled && output.scheduled_time && (
                      <div className="bg-purple-50 rounded-lg p-4 flex items-center gap-3">
                        <Check className="w-5 h-5 text-purple-600" />
                        <div>
                          <p className="font-medium text-purple-900">Scheduled</p>
                          <p className="text-sm text-purple-700">
                            {format(new Date(output.scheduled_time), 'MMMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownload(brand, output)}
                        className="btn btn-secondary flex-1"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                      
                      {isCompleted && (
                        <>
                          <button
                            onClick={() => handleScheduleBrand(brand, output)}
                            disabled={schedulingBrand === brand || isGenerating}
                            className="btn btn-success flex-1"
                          >
                            {schedulingBrand === brand ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Calendar className="w-4 h-4" />
                            )}
                            Schedule
                          </button>
                          
                          <button
                            onClick={() => handleRegenerateBrand(brand)}
                            disabled={regenerateBrand.isPending || isGenerating}
                            className="btn btn-secondary"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      
                      {isScheduled && (
                        <>
                          <button
                            onClick={() => copyToClipboard(output.caption || '', 'Caption')}
                            className="btn btn-secondary flex-1"
                          >
                            <Copy className="w-4 h-4" />
                            Copy Caption
                          </button>
                          <button
                            onClick={() => copyToClipboard(job.title || '', 'Title')}
                            className="btn btn-secondary flex-1"
                          >
                            <Copy className="w-4 h-4" />
                            Copy Title
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Waiting to generate...
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Delete Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Job"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to delete this job? This will also delete all generated media.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteModalOpen(false)}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteJob.isPending}
              className="btn btn-danger flex-1"
            >
              {deleteJob.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Delete'
              )}
            </button>
          </div>
        </div>
      </Modal>
      
      {/* Edit Title Modal */}
      <Modal
        isOpen={editTitleModalOpen}
        onClose={() => setEditTitleModalOpen(false)}
        title="Edit Title"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Title
            </label>
            <textarea
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              rows={4}
              className="input resize-none"
              placeholder="Enter new title..."
            />
          </div>
          <p className="text-sm text-gray-500">
            Changing the title will regenerate all brand images with the new text.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setEditTitleModalOpen(false)}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveTitle}
              disabled={updateJob.isPending || !editedTitle.trim()}
              className="btn btn-primary flex-1"
            >
              {updateJob.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Save & Regenerate'
              )}
            </button>
          </div>
        </div>
      </Modal>
      
      {/* Custom Schedule Modal */}
      <Modal
        isOpen={customScheduleModalOpen}
        onClose={() => setCustomScheduleModalOpen(false)}
        title="Custom Schedule"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Choose a date and time to schedule all {completedCount} brand{completedCount !== 1 ? 's' : ''}.
            Brands will be staggered by 1 hour each.
          </p>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date
              </label>
              <input
                type="date"
                value={customScheduleDate}
                onChange={(e) => setCustomScheduleDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Time
              </label>
              <input
                type="time"
                value={customScheduleTime}
                onChange={(e) => setCustomScheduleTime(e.target.value)}
                className="input"
              />
            </div>
          </div>
          
          {customScheduleDate && customScheduleTime && completedCount > 0 && (
            <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600">
              <p className="font-medium mb-1">Schedule Preview:</p>
              <ul className="space-y-1">
                {Object.entries(job?.brand_outputs || {})
                  .filter(([_, output]) => output.status === 'completed')
                  .map(([brand], index) => {
                    const baseTime = new Date(`${customScheduleDate}T${customScheduleTime}`)
                    baseTime.setHours(baseTime.getHours() + index)
                    return (
                      <li key={brand} className="flex items-center gap-2">
                        <span className="capitalize">{brand.replace('college', ' College')}</span>
                        <span className="text-gray-400">→</span>
                        <span>{format(baseTime, 'MMM d, h:mm a')}</span>
                      </li>
                    )
                  })}
              </ul>
            </div>
          )}
          
          <div className="flex gap-3">
            <button
              onClick={() => setCustomScheduleModalOpen(false)}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleCustomScheduleAll}
              disabled={schedulingCustom || !customScheduleDate || !customScheduleTime}
              className="btn btn-primary flex-1"
            >
              {schedulingCustom ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CalendarClock className="w-4 h-4" />
                  Schedule All
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
