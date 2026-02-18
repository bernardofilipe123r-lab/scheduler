import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Search, 
  Filter, 
  Trash2, 
  RefreshCw, 
  ExternalLink,
  Calendar,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  CalendarCheck,
  PlayCircle,
  XCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { useJobs, useDeleteJob, useRegenerateJob, useDeleteJobsByStatus, useDeleteJobsByIds } from '@/features/jobs'
import { BrandBadge } from '@/features/brands'
import { StatusBadge, PageLoader, Modal } from '@/shared/components'
import type { Job, Variant, BrandName } from '@/shared/types'

type ViewFilter = 'all' | 'to-schedule' | 'published' | 'scheduled' | 'in-progress' | 'other'

export function HistoryPage() {
  const navigate = useNavigate()
  const { data: jobs = [], isLoading, error } = useJobs()
  const deleteJob = useDeleteJob()
  const regenerateJob = useRegenerateJob()
  const deleteByStatus = useDeleteJobsByStatus()
  const deleteByIds = useDeleteJobsByIds()
  
  const jobsArray = Array.isArray(jobs) ? jobs : []
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all')
  const [variantFilter, setVariantFilter] = useState<Variant | 'all'>('all')
  const [contentTypeFilter, setContentTypeFilter] = useState<'all' | 'reels' | 'posts'>('all')
  
  // Visual-only hidden job IDs (not persisted, not DB deletes)
  const [hiddenJobIds, setHiddenJobIds] = useState<Set<string>>(new Set())
  const [isDeletingSection, setIsDeletingSection] = useState(false)
  
  const hideOlderThan2h = useCallback((jobsList: Job[]) => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const toHide = jobsList
      .filter(j => new Date(j.created_at) < twoHoursAgo)
      .map(j => j.id.toString())
    if (toHide.length === 0) {
      toast('No jobs older than 2 hours', { icon: '📭' })
      return
    }
    setHiddenJobIds(prev => new Set([...prev, ...toHide]))
    toast.success(`Hidden ${toHide.length} old jobs`)
  }, [])
  
  const resetHidden = useCallback(() => {
    setHiddenJobIds(new Set())
  }, [])
  
  // Delete confirmation
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null)
  
  // Categorize jobs based on their scheduling state
  const categorizedJobs = useMemo(() => {
    const toSchedule: Job[] = []    // Completed jobs with brands ready to schedule
    const published: Job[] = []      // Jobs with all brands published
    const scheduled: Job[] = []      // Jobs with all brands scheduled (not yet published)
    const inProgress: Job[] = []     // Generating or pending jobs
    const other: Job[] = []          // Failed, cancelled, etc.
    
    jobsArray.forEach(job => {
      const outputs = Object.values(job.brand_outputs || {})
      const totalBrands = job.brands?.length || 0
      
      // Count different states
      const publishedCount = outputs.filter(o => o.status === 'published').length
      const scheduledCount = outputs.filter(o => o.status === 'scheduled').length
      const completedCount = outputs.filter(o => o.status === 'completed').length
      const pendingOrGenerating = outputs.filter(o => o.status === 'pending' || o.status === 'generating').length
      const scheduledOrPublished = scheduledCount + publishedCount
      
      if (job.status === 'failed' || job.status === 'cancelled') {
        other.push(job)
      } else if (job.status === 'generating' || job.status === 'pending' || pendingOrGenerating > 0) {
        inProgress.push(job)
      } else if (publishedCount === totalBrands && totalBrands > 0) {
        // All brands published
        published.push(job)
      } else if (scheduledOrPublished === totalBrands && totalBrands > 0) {
        // All brands scheduled (some may be published, but not all)
        scheduled.push(job)
      } else if (completedCount > 0 || (scheduledOrPublished > 0 && scheduledOrPublished < totalBrands)) {
        // Has completed brands ready to schedule, or partially scheduled
        toSchedule.push(job)
      } else {
        other.push(job)
      }
    })
    
    return { toSchedule, published, scheduled, inProgress, other }
  }, [jobsArray])
  
  // Get job scheduling info
  const getSchedulingInfo = (job: Job) => {
    const outputs = Object.entries(job.brand_outputs || {}) as [BrandName, { status: string; scheduled_time?: string }][]
    const published = outputs.filter(([, o]) => o.status === 'published')
    const scheduled = outputs.filter(([, o]) => o.status === 'scheduled')
    const readyToSchedule = outputs.filter(([, o]) => o.status === 'completed')
    
    return { published, scheduled, readyToSchedule, total: job.brands?.length || 0 }
  }
  
  // Filter jobs based on view filter and search
  const filteredJobs = useMemo(() => {
    let baseJobs: Job[]
    
    switch (viewFilter) {
      case 'to-schedule':
        baseJobs = categorizedJobs.toSchedule
        break
      case 'published':
        baseJobs = categorizedJobs.published
        break
      case 'scheduled':
        baseJobs = categorizedJobs.scheduled
        break
      case 'in-progress':
        baseJobs = categorizedJobs.inProgress
        break
      case 'other':
        baseJobs = categorizedJobs.other
        break
      default:
        baseJobs = jobsArray
    }
    
    return baseJobs.filter(job => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const titleMatch = job.title?.toLowerCase().includes(query)
        const idMatch = job.id.toString().includes(query)
        if (!titleMatch && !idMatch) return false
      }
      
      if (variantFilter !== 'all' && job.variant !== variantFilter) return false
      
      // Content type filter
      if (contentTypeFilter === 'posts' && job.variant !== 'post') return false
      if (contentTypeFilter === 'reels' && job.variant === 'post') return false
      
      return true
    })
  }, [jobsArray, categorizedJobs, viewFilter, searchQuery, variantFilter, contentTypeFilter])
  
  // Calculate job progress
  const getProgress = (job: Job) => {
    // For actively generating jobs, use the backend's real-time progress
    if (job.status === 'generating' && job.progress_percent != null) {
      return job.progress_percent;
    }
    // For completed/other jobs, calculate from brand completion
    const brands = Object.keys(job.brand_outputs || {});
    if (!brands.length) return 0;
    const done = brands.filter(b => job.brand_outputs[b]?.status === 'completed' || job.brand_outputs[b]?.status === 'scheduled' || job.brand_outputs[b]?.status === 'published').length;
    return Math.round((done / brands.length) * 100);
  }

  // Get descriptive status message for generating jobs
  const getStatusMessage = (job: Job): string | null => {
    if (job.status !== 'generating' && job.status !== 'pending') return null;
    // Check job-level current_step first
    if (job.current_step) return job.current_step;
    // Fall back to brand-level progress_message
    const outputs = Object.values(job.brand_outputs || {});
    const generating = outputs.find(o => o.status === 'generating' && o.progress_message);
    if (generating?.progress_message) return generating.progress_message;
    return job.status === 'pending' ? 'Queued...' : 'Generating...';
  }
  
  // Handle delete
  const handleDelete = async () => {
    if (!jobToDelete) return
    
    try {
      await deleteJob.mutateAsync(jobToDelete.id)
      toast.success('Job deleted')
      setDeleteModalOpen(false)
      setJobToDelete(null)
    } catch {
      toast.error('Failed to delete job')
    }
  }
  
  // Handle regenerate
  const handleRegenerate = async (job: Job) => {
    try {
      await regenerateJob.mutateAsync(job.id)
      toast.success('Regeneration started')
    } catch {
      toast.error('Failed to regenerate')
    }
  }
  
  if (isLoading) {
    return <PageLoader page="jobs" />
  }
  
  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Error loading jobs</h2>
        <p className="text-gray-500">Please try again later</p>
      </div>
    )
  }
  
  const stats = [
    {
      key: 'to-schedule' as ViewFilter,
      label: 'Ready to Schedule',
      count: categorizedJobs.toSchedule.length,
      icon: Clock,
      color: 'bg-amber-500',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
      borderColor: 'border-amber-200',
      description: 'Completed, awaiting scheduling'
    },
    {
      key: 'published' as ViewFilter,
      label: 'Published',
      count: categorizedJobs.published.length,
      icon: CheckCircle2,
      color: 'bg-emerald-500',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700',
      borderColor: 'border-emerald-200',
      description: 'Successfully published'
    },
    {
      key: 'scheduled' as ViewFilter,
      label: 'Scheduled',
      count: categorizedJobs.scheduled.length,
      icon: CalendarCheck,
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      textColor: 'text-green-700',
      borderColor: 'border-green-200',
      description: 'Awaiting publication'
    },
    {
      key: 'in-progress' as ViewFilter,
      label: 'In Progress',
      count: categorizedJobs.inProgress.length,
      icon: PlayCircle,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-200',
      description: 'Currently generating'
    },
    {
      key: 'other' as ViewFilter,
      label: 'Other',
      count: categorizedJobs.other.length,
      icon: XCircle,
      color: 'bg-gray-500',
      bgColor: 'bg-gray-50',
      textColor: 'text-gray-700',
      borderColor: 'border-gray-200',
      description: 'Failed or cancelled'
    },
  ]
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-500">{jobs.length} total jobs</p>
        </div>
      </div>
      
      {/* Status Cards - Visual Workflow */}
      <div className="grid grid-cols-5 gap-4">
        {stats.map(stat => {
          const Icon = stat.icon
          const isActive = viewFilter === stat.key
          
          return (
            <button
              key={stat.key}
              onClick={() => setViewFilter(isActive ? 'all' : stat.key)}
              className={clsx(
                'relative p-4 rounded-xl border-2 transition-all text-left',
                isActive 
                  ? `${stat.bgColor} ${stat.borderColor} ring-2 ring-offset-2`
                  : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm'
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className={clsx(
                    'inline-flex items-center justify-center w-10 h-10 rounded-lg mb-3',
                    isActive ? stat.color : 'bg-gray-100'
                  )}>
                    <Icon className={clsx('w-5 h-5', isActive ? 'text-white' : 'text-gray-500')} />
                  </div>
                  <p className={clsx(
                    'text-2xl font-bold',
                    isActive ? stat.textColor : 'text-gray-900'
                  )}>
                    {stat.count}
                  </p>
                  <p className={clsx(
                    'text-sm font-medium',
                    isActive ? stat.textColor : 'text-gray-700'
                  )}>
                    {stat.label}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stat.description}
                  </p>
                </div>
              </div>
              
              {isActive && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className={clsx('w-5 h-5', stat.textColor)} />
                </div>
              )}
            </button>
          )
        })}
      </div>
      
      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title or ID..."
              className="input pl-10"
            />
          </div>
          
          {/* Content Type Filter */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: 'all' as const, label: 'All', icon: '📋' },
              { key: 'reels' as const, label: 'Reels', icon: '🎬' },
              { key: 'posts' as const, label: 'Posts', icon: '📄' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setContentTypeFilter(opt.key)}
                className={clsx(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
                  contentTypeFilter === opt.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={variantFilter}
              onChange={(e) => setVariantFilter(e.target.value as Variant | 'all')}
              className="input w-auto"
            >
              <option value="all">All Modes</option>
              <option value="light">Light Mode</option>
              <option value="dark">Dark Mode</option>
              <option value="post">Post</option>
            </select>
          </div>
          
          {viewFilter !== 'all' && (
            <button
              onClick={() => setViewFilter('all')}
              className="btn btn-secondary text-sm"
            >
              Clear Filter
            </button>
          )}
        </div>
      </div>
      
      {/* Section Header */}
      {viewFilter !== 'all' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-2 h-8 rounded-full',
              stats.find(s => s.key === viewFilter)?.color || 'bg-gray-400'
            )} />
            <h2 className="text-lg font-semibold text-gray-900">
              {stats.find(s => s.key === viewFilter)?.label || 'Jobs'}
            </h2>
            <span className="text-gray-500">({filteredJobs.length})</span>
          </div>
          {viewFilter === 'to-schedule' && filteredJobs.length > 0 && (
            <button
              onClick={async () => {
                if (!confirm(`Delete all ${filteredJobs.length} ready-to-schedule jobs and their scheduled reels?`)) return
                try {
                  const result = await deleteByStatus.mutateAsync('completed')
                  toast.success(`Deleted ${result.deleted} jobs`)
                } catch {
                  toast.error('Failed to delete jobs')
                }
              }}
              disabled={deleteByStatus.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {deleteByStatus.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete All ({filteredJobs.length})
            </button>
          )}
        </div>
      )}
      
      {/* Jobs List — Separated into Reels and Posts sections */}
      {filteredJobs.length === 0 ? (
        <div className="card p-12 text-center">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs found</h3>
          <p className="text-gray-500">
            {jobs.length === 0 
              ? 'Create your first reel to get started'
              : viewFilter !== 'all'
                ? `No jobs in "${stats.find(s => s.key === viewFilter)?.label}" category`
                : 'Try adjusting your filters'
            }
          </p>
        </div>
      ) : (() => {
        const visibleJobs = filteredJobs.filter(j => !hiddenJobIds.has(j.id.toString()))
        const reelJobs = visibleJobs.filter(j => j.variant !== 'post')
        const postJobs = visibleJobs.filter(j => j.variant === 'post')
        
        const renderJobCard = (job: Job) => {
            const progress = getProgress(job)
            const isGenerating = job.status === 'generating' || job.status === 'pending'
            const schedulingInfo = getSchedulingInfo(job)
            
            const isFullyPublished = schedulingInfo.published.length === schedulingInfo.total && schedulingInfo.total > 0
            const isFullyScheduled = (schedulingInfo.scheduled.length + schedulingInfo.published.length) === schedulingInfo.total && schedulingInfo.total > 0 && !isFullyPublished
            const hasReadyToSchedule = schedulingInfo.readyToSchedule.length > 0
            
            return (
              <div
                key={job.id}
                className={clsx(
                  'card p-4 hover:shadow-md transition-shadow cursor-pointer border-l-4 group',
                  isFullyPublished && 'border-l-emerald-500',
                  isFullyScheduled && !isFullyPublished && 'border-l-green-500',
                  hasReadyToSchedule && !isFullyScheduled && !isFullyPublished && 'border-l-amber-500',
                  isGenerating && 'border-l-blue-500',
                  !isFullyPublished && !isFullyScheduled && !hasReadyToSchedule && !isGenerating && 'border-l-gray-300'
                )}
                onClick={() => navigate(`/job/${job.id}`)}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="text-xs font-mono text-gray-400">#{job.id}</span>
                      <StatusBadge status={job.status} />
                      
                      {isFullyPublished && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          Published
                        </span>
                      )}
                      {isFullyScheduled && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          <CalendarCheck className="w-3 h-3" />
                          All Scheduled
                        </span>
                      )}
                      {hasReadyToSchedule && !isFullyScheduled && !isFullyPublished && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 animate-pulse">
                          <Clock className="w-3 h-3" />
                          {schedulingInfo.readyToSchedule.length} to schedule
                        </span>
                      )}
                      {schedulingInfo.scheduled.length > 0 && schedulingInfo.scheduled.length < schedulingInfo.total && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {schedulingInfo.scheduled.length}/{schedulingInfo.total} scheduled
                        </span>
                      )}
                      
                      <span className={clsx(
                        'text-xs px-2 py-0.5 rounded-full',
                        job.variant === 'dark' 
                          ? 'bg-gray-900 text-white' 
                          : job.variant === 'post'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-gray-100 text-gray-700'
                      )}>
                        {job.variant === 'dark' ? '🌙 Dark' : job.variant === 'post' ? '📄 Post' : '☀️ Light'}
                      </span>
                    </div>
                    
                    <h3 className="font-medium text-gray-900 truncate mb-2">
                      {job.title?.split('\n')[0] || 'Untitled'}
                    </h3>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      {job.brands?.map(brand => {
                        const output = job.brand_outputs?.[brand]
                        const isPublished = output?.status === 'published'
                        const isScheduled = output?.status === 'scheduled'
                        const isReady = output?.status === 'completed'
                        
                        return (
                          <div 
                            key={brand} 
                            className={clsx(
                              'relative',
                              isPublished && 'ring-2 ring-emerald-400 ring-offset-1 rounded-full',
                              isScheduled && !isPublished && 'ring-2 ring-green-400 ring-offset-1 rounded-full',
                              isReady && 'ring-2 ring-amber-400 ring-offset-1 rounded-full'
                            )}
                          >
                            <BrandBadge brand={brand} size="sm" />
                            {isPublished && (
                              <CheckCircle2 
                                className="absolute -top-1 -right-1 w-3 h-3 text-emerald-600 bg-white rounded-full" 
                              />
                            )}
                            {isScheduled && !isPublished && (
                              <CalendarCheck 
                                className="absolute -top-1 -right-1 w-3 h-3 text-green-600 bg-white rounded-full" 
                              />
                            )}
                            {isReady && (
                              <Clock 
                                className="absolute -top-1 -right-1 w-3 h-3 text-amber-600 bg-white rounded-full" 
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                    
                    <div className="text-xs text-gray-500">
                      Created {format(new Date(job.created_at), 'MMM d, yyyy h:mm a')}
                    </div>
                    
                    {isGenerating && (
                      <div className="mt-3">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-blue-600 mt-1">
                          {getStatusMessage(job) || `${progress}% complete`}
                          {progress > 0 && ` — ${progress}%`}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/job/${job.id}`)}
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                      title="View details"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    
                    {job.status === 'completed' || job.status === 'failed' ? (
                      <button
                        onClick={() => handleRegenerate(job)}
                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                        title="Regenerate"
                        disabled={regenerateJob.isPending}
                      >
                        {regenerateJob.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </button>
                    ) : null}
                    
                    <button
                      onClick={() => {
                        setJobToDelete(job)
                        setDeleteModalOpen(true)
                      }}
                      className="p-2 rounded-lg hover:bg-red-50 text-gray-600 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
        }

        // Helper to render a section with header, delete all, and job list
        const renderSection = (label: string, icon: string, sectionJobs: Job[], allSectionJobs: Job[]) => (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-lg">{icon}</span>
              <h3 className="text-base font-semibold text-gray-900">{label}</h3>
              <span className="text-sm text-gray-500">({sectionJobs.length})</span>
              <div className="flex-1" />
              <button
                onClick={() => hideOlderThan2h(allSectionJobs)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              >
                <Clock className="w-3 h-3" />
                Hide &gt;2h Ago
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Delete all ${sectionJobs.length} ${label.toLowerCase()}? This cannot be undone.`)) return
                  setIsDeletingSection(true)
                  try {
                    const jobIds = sectionJobs.map(j => j.id)
                    const result = await deleteByIds.mutateAsync(jobIds)
                    if (result.deleted > 0) {
                      toast.success(`Deleted ${result.deleted} ${label.toLowerCase()}`)
                    } else {
                      toast.error(`Failed to delete ${label.toLowerCase()}`)
                    }
                    if (result.errors?.length > 0) {
                      console.error('Bulk delete errors:', result.errors)
                    }
                  } catch (err) {
                    console.error('Delete all failed:', err)
                    toast.error(`Failed to delete ${label.toLowerCase()}`)
                  } finally {
                    setIsDeletingSection(false)
                  }
                }}
                disabled={isDeletingSection || sectionJobs.length === 0}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
              >
                {isDeletingSection ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Delete All
              </button>
            </div>
            {sectionJobs.map(renderJobCard)}
          </div>
        )
        
        return (
          <div className="space-y-6">
            {/* Hidden count banner */}
            {hiddenJobIds.size > 0 && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-sm text-gray-600">{hiddenJobIds.size} job(s) hidden</span>
                <button
                  onClick={resetHidden}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Show All
                </button>
              </div>
            )}
            
            {/* Show sections based on content type filter */}
            {(contentTypeFilter === 'all' || contentTypeFilter === 'reels') && reelJobs.length > 0 && (
              renderSection('Reels', '🎬', reelJobs, filteredJobs.filter(j => j.variant !== 'post'))
            )}
            
            {(contentTypeFilter === 'all' || contentTypeFilter === 'posts') && postJobs.length > 0 && (
              renderSection('Posts', '📄', postJobs, filteredJobs.filter(j => j.variant === 'post'))
            )}
            
            {visibleJobs.length === 0 && hiddenJobIds.size > 0 && (
              <div className="card p-12 text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-2">All jobs hidden</h3>
                <button onClick={resetHidden} className="btn btn-secondary">Show All</button>
              </div>
            )}
          </div>
        )
      })()}
      
      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false)
          setJobToDelete(null)
        }}
        title="Delete Job"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to delete this job? This action cannot be undone.
          </p>
          {jobToDelete && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900 truncate">
                {jobToDelete.title?.split('\n')[0] || 'Untitled'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Job #{jobToDelete.id}
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setDeleteModalOpen(false)
                setJobToDelete(null)
              }}
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
    </div>
  )
}
