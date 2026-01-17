import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Beaker, Loader2, CheckCircle2, XCircle, Play, Calendar, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { BrandBadge } from '@/features/brands'
import { Modal } from '@/shared/components'
import type { BrandName } from '@/shared/types'

interface TestResult {
  success: boolean
  job_id: string
  brand: string
  variant: string
  message: string
  title: string
  content_lines: string[]
  caption: string
  video_path?: string
  thumbnail_path?: string
}

export function TestPage() {
  const navigate = useNavigate()
  const [activeTest, setActiveTest] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [scheduleModal, setScheduleModal] = useState<{ open: boolean; result: TestResult | null }>({ open: false, result: null })

  const testBrand = useMutation({
    mutationFn: async ({ brand, variant }: { brand: BrandName; variant: 'light' | 'dark' }) => {
      const response = await fetch('/api/test/brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, variant })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Test failed')
      }
      
      return response.json() as Promise<TestResult>
    },
    onSuccess: (data, variables) => {
      const key = `${variables.brand}-${variables.variant}`
      setTestResults(prev => ({ ...prev, [key]: data }))
      setActiveTest(null)
      toast.success(`✅ ${variables.brand} ${variables.variant} test completed!`)
    },
    onError: (error: Error) => {
      setActiveTest(null)
      toast.error(`❌ Test failed: ${error.message}`)
    }
  })

  const deleteReel = useMutation({
    mutationFn: async (reelId: string) => {
      const response = await fetch(`/api/test/reel/${reelId}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Delete failed')
      }
      
      return response.json()
    },
    onSuccess: (_, reelId) => {
      // Remove from results
      setTestResults(prev => {
        const newResults = { ...prev }
        for (const key in newResults) {
          if (newResults[key].job_id === reelId) {
            delete newResults[key]
          }
        }
        return newResults
      })
      toast.success('🗑️ Test reel deleted')
    },
    onError: (error: Error) => {
      toast.error(`❌ Delete failed: ${error.message}`)
    }
  })

  const scheduleReel = useMutation({
    mutationFn: async (result: TestResult) => {
      const scheduleTime = new Date(Date.now() + 60000) // 1 minute from now
      
      const response = await fetch('/api/jobs/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'test@system',
          reel_id: result.job_id,
          scheduled_time: scheduleTime.toISOString(),
          caption: result.caption,
          platforms: ['instagram', 'facebook'],
          video_path: result.video_path,
          thumbnail_path: result.thumbnail_path,
          user_name: 'Test User',
          brand: result.brand,
          variant: result.variant
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Scheduling failed')
      }
      
      return response.json()
    },
    onSuccess: () => {
      setScheduleModal({ open: false, result: null })
      toast.success('✅ Test reel scheduled!')
      navigate('/scheduled')
    },
    onError: (error: Error) => {
      toast.error(`❌ Scheduling failed: ${error.message}`)
    }
  })

  const handleTest = (brand: BrandName, variant: 'light' | 'dark') => {
    const key = `${brand}-${variant}`
    setActiveTest(key)
    testBrand.mutate({ brand, variant })
  }

  const brands: BrandName[] = ['healthycollege', 'vitalitycollege', 'longevitycollege']
  const variants: ('light' | 'dark')[] = ['light', 'dark']

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Beaker className="w-8 h-8 text-purple-600" />
          <h1 className="text-3xl font-bold text-gray-900">Brand Connection Tests</h1>
        </div>
        <p className="text-gray-600">
          Test each brand's configuration by generating a sample reel and scheduling it for immediate publication.
        </p>
      </div>

        {/* Test Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {brands.map(brand => (
            <div key={brand} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <BrandBadge brand={brand} />
                <span className="text-sm text-gray-500">
                  {brand.replace('college', ' College')}
                </span>
              </div>

              <div className="space-y-3">
                {variants.map(variant => {
                  const testKey = `${brand}-${variant}`
                  const isActive = activeTest === testKey
                  const result = testResults[testKey]

                  return (
                    <div key={variant} className="flex items-center gap-3">
                      <button
                        onClick={() => handleTest(brand, variant)}
                        disabled={testBrand.isPending}
                        className={`flex-1 flex items-center justify-between px-4 py-3 rounded-lg font-medium transition-all ${
                          isActive
                            ? 'bg-purple-50 border-2 border-purple-200 text-purple-700'
                            : result?.success
                            ? 'bg-green-50 border-2 border-green-200 text-green-700 hover:bg-green-100'
                            : result && !result.success
                            ? 'bg-red-50 border-2 border-red-200 text-red-700 hover:bg-red-100'
                            : 'bg-gray-50 border-2 border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {isActive ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : result?.success ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : result && !result.success ? (
                            <XCircle className="w-4 h-4" />
                          ) : (
                            <Beaker className="w-4 h-4" />
                          )}
                          Test {variant === 'light' ? '☀️ Light' : '🌙 Dark'}
                        </span>
                        {isActive && (
                          <span className="text-xs">Generating...</span>
                        )}
                      </button>

                      {/* Action Buttons for Completed Tests */}
                      {result?.success && (
                        <div className="flex gap-2">
                          {result.video_path && (
                            <button
                              onClick={() => {
                                const video = document.createElement('video')
                                video.src = result.video_path!
                                video.controls = true
                                video.style.maxWidth = '90vw'
                                video.style.maxHeight = '90vh'
                                
                                const modal = document.createElement('div')
                                modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:9999;'
                                modal.onclick = () => modal.remove()
                                modal.appendChild(video)
                                document.body.appendChild(modal)
                                video.play()
                              }}
                              className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                              title="Preview video"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setScheduleModal({ open: true, result })}
                            className="p-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors"
                            title="Review and schedule"
                          >
                            <Calendar className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Delete this test reel?')) {
                                deleteReel.mutate(result.job_id)
                              }
                            }}
                            disabled={deleteReel.isPending}
                            className="p-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete test reel"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Test Results Summary */}
              {Object.values(testResults).some(r => r.brand === brand) && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    {variants.map(variant => {
                      const result = testResults[`${brand}-${variant}`]
                      if (result?.success) {
                        return (
                          <span key={variant} className="block text-green-600 mb-1">
                            ✓ {variant}: Generated {result.job_id.slice(0, 12)}
                          </span>
                        )
                      }
                      return null
                    })}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="font-semibold text-blue-900 mb-2">How it works</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Each test generates a real reel with AI viral content (same as Auto-Generate)</li>
            <li>• Review the generated content, caption, and video before scheduling</li>
            <li>• Click the calendar icon to open the scheduling modal and confirm publication</li>
            <li>• Use this to verify brand credentials and generation quality before production use</li>
            <li>• Delete test reels you don't want to keep</li>
          </ul>
        </div>

      {/* Schedule Confirmation Modal */}
      {scheduleModal.open && scheduleModal.result && (
        <Modal
          isOpen={scheduleModal.open}
          onClose={() => setScheduleModal({ open: false, result: null })}
          title="Schedule Test Reel"
        >
          <div className="space-y-4">
            <div>
              <BrandBadge brand={scheduleModal.result.brand as BrandName} />
              <span className="ml-2 text-sm text-gray-600">
                {scheduleModal.result.variant === 'light' ? '☀️ Light' : '🌙 Dark'} Mode
              </span>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-1">Title</h4>
              <p className="text-gray-700">{scheduleModal.result.title}</p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-1">Content</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                {scheduleModal.result.content_lines.map((line, idx) => (
                  <li key={idx}>• {line}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-gray-900 mb-1">Caption</h4>
              <p className="text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto border border-gray-200 rounded p-2">
                {scheduleModal.result.caption}
              </p>
            </div>

            {scheduleModal.result.video_path && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Video Preview</h4>
                <video
                  src={scheduleModal.result.video_path}
                  controls
                  className="w-full max-h-96 rounded-lg bg-black"
                />
              </div>
            )}

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                ⚠️ This will schedule the reel for publication in 1 minute on both Instagram and Facebook.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setScheduleModal({ open: false, result: null })}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => scheduleReel.mutate(scheduleModal.result!)}
                disabled={scheduleReel.isPending}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {scheduleReel.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4" />
                    Confirm & Schedule
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
