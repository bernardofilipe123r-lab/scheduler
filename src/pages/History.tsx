import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Search, 
  Filter, 
  Trash2, 
  RefreshCw, 
  ExternalLink,
  Calendar,
  Loader2,
  AlertCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { useJobs, useDeleteJob, useRegenerateJob } from '@/features/jobs'
import { BrandBadge } from '@/features/brands'
import { StatusBadge, FullPageLoader, Modal } from '@/shared/components'
import type { Job, JobStatus, Variant } from '@/shared/types'

export function HistoryPage() {
  const navigate = useNavigate()
  const { data: jobs = [], isLoading, error } = useJobs()
  const deleteJob = useDeleteJob()
  const regenerateJob = useRegenerateJob()
  
  const jobsArray = Array.isArray(jobs) ? jobs : []
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all')
  const [variantFilter, setVariantFilter] = useState<Variant | 'all'>('all')
  
  // Delete confirmation
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [jobToDelete, setJobToDelete] = useState<Job | null>(null)
  
  // Filter jobs
  const filteredJobs = jobsArray.filter(job => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const titleMatch = job.title?.toLowerCase().includes(query)
      const idMatch = job.id.toString().includes(query)
      if (!titleMatch && !idMatch) return false
    }
    
    if (statusFilter !== 'all' && job.status !== statusFilter) return false
    if (variantFilter !== 'all' && job.variant !== variantFilter) return false
    
    return true
  })
  
  // Calculate job progress
  const getProgress = (job: Job) => {
    const total = job.brands?.length || 0
    const completed = Object.values(job.brand_outputs || {})
      .filter(o => o.status === 'completed' || o.status === 'scheduled')
      .length
    return total > 0 ? Math.round((completed / total) * 100) : 0
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
    return <FullPageLoader text="Loading jobs..." />
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
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">History</h1>
          <p className="text-gray-500">{jobs.length} total jobs</p>
        </div>
      </div>
      
      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
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
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as JobStatus | 'all')}
              className="input w-auto"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="generating">Generating</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          
          <select
            value={variantFilter}
            onChange={(e) => setVariantFilter(e.target.value as Variant | 'all')}
            className="input w-auto"
          >
            <option value="all">All Modes</option>
            <option value="light">Light Mode</option>
            <option value="dark">Dark Mode</option>
          </select>
        </div>
      </div>
      
      {/* Jobs List */}
      {filteredJobs.length === 0 ? (
        <div className="card p-12 text-center">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs found</h3>
          <p className="text-gray-500">
            {jobs.length === 0 
              ? 'Create your first reel to get started'
              : 'Try adjusting your filters'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map(job => {
            const progress = getProgress(job)
            const isGenerating = job.status === 'generating' || job.status === 'pending'
            
            return (
              <div
                key={job.id}
                className="card p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/job/${job.id}`)}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-mono text-gray-400">#{job.id}</span>
                      <StatusBadge status={job.status} />
                      <span className={clsx(
                        'text-xs px-2 py-0.5 rounded-full',
                        job.variant === 'dark' 
                          ? 'bg-gray-900 text-white' 
                          : 'bg-gray-100 text-gray-700'
                      )}>
                        {job.variant === 'dark' ? '🌙 Dark' : '☀️ Light'}
                      </span>
                    </div>
                    
                    <h3 className="font-medium text-gray-900 truncate mb-2">
                      {job.title?.split('\n')[0] || 'Untitled'}
                    </h3>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      {job.brands?.map(brand => (
                        <BrandBadge key={brand} brand={brand} size="sm" />
                      ))}
                    </div>
                    
                    <div className="text-xs text-gray-500">
                      Created {format(new Date(job.created_at), 'MMM d, yyyy h:mm a')}
                    </div>
                    
                    {isGenerating && (
                      <div className="mt-3">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-orange-500 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-orange-600 mt-1">
                          {progress}% complete
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
          })}
        </div>
      )}
      
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
