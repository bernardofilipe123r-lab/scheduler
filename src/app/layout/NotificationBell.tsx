import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, X, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useJobs } from '@/features/jobs'

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()
  const { data: jobs = [] } = useJobs()
  
  const jobsArray = Array.isArray(jobs) ? jobs : []
  
  const activeJobs = jobsArray.filter(
    job => job.status === 'generating' || job.status === 'pending'
  )
  
  const hasActiveJobs = activeJobs.length > 0
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'relative p-2 rounded-lg transition-colors',
          isOpen ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-100'
        )}
      >
        <Bell className="w-5 h-5" />
        {hasActiveJobs && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
        )}
      </button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Active Jobs</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {activeJobs.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active jobs</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {activeJobs.map(job => {
                    const totalBrands = job.brands?.length || 0
                    const completedBrands = Object.values(job.brand_outputs || {})
                      .filter(o => o.status === 'completed' || o.status === 'scheduled' || o.status === 'published')
                      .length
                    // Use real-time progress_percent from backend, fall back to brand count
                    const progress = (job.status === 'generating' && job.progress_percent != null)
                      ? job.progress_percent
                      : totalBrands > 0
                        ? Math.round((completedBrands / totalBrands) * 100)
                        : 0
                    // Descriptive status message
                    const statusMsg = job.current_step
                      || Object.values(job.brand_outputs || {}).find((o: any) => o.status === 'generating' && o.progress_message)?.progress_message
                      || (job.status === 'pending' ? 'Queued...' : 'Generating...')
                    
                    return (
                      <button
                        key={job.id}
                        onClick={() => {
                          navigate(`/job/${job.id}`)
                          setIsOpen(false)
                        }}
                        className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-1">
                            <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {job.title?.split('\n')[0] || 'Generating...'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {statusMsg} — {progress}%
                            </p>
                            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-orange-500 rounded-full transition-all duration-500"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
