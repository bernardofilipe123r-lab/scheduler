import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Play, Palette } from 'lucide-react'
import { CreateVideoWizard } from '@/features/reels/wizard'
import { DesignEditorTab } from '@/features/reels/DesignEditorTab'

type ReelsView = 'landing' | 'create' | 'design'

export function ReelsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const viewParam = searchParams.get('view') as ReelsView | null
  const [view, setView] = useState<ReelsView>(
    viewParam === 'create' || viewParam === 'design' ? viewParam : 'landing'
  )

  const navigate = (v: ReelsView) => {
    setView(v)
    if (v === 'landing') setSearchParams({})
    else setSearchParams({ view: v })
  }

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      {/* ─── Landing ─── */}
      {view === 'landing' && (
        <div className="flex flex-col items-center justify-center py-16 animate-in fade-in duration-300">
          <div className="text-center mb-10">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Reels Studio</h1>
            <p className="text-sm text-gray-500 mt-1.5">Create viral content for your brands</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
            {/* Create a Video */}
            <button
              onClick={() => navigate('create')}
              className="group relative flex flex-col items-center gap-3 px-6 py-10 rounded-2xl border-2 border-gray-200 bg-white hover:border-stone-400 hover:shadow-lg transition-all"
            >
              <div className="w-14 h-14 rounded-2xl bg-stone-900 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Play className="w-6 h-6 text-white ml-0.5" />
              </div>
              <div className="text-center">
                <span className="text-sm font-bold text-gray-900">Create a Video</span>
                <p className="text-xs text-gray-500 mt-1">Start the creation wizard</p>
              </div>
            </button>

            {/* Design Editor */}
            <button
              onClick={() => navigate('design')}
              className="group relative flex flex-col items-center gap-3 px-6 py-10 rounded-2xl border-2 border-gray-200 bg-white hover:border-stone-400 hover:shadow-lg transition-all"
            >
              <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Palette className="w-6 h-6 text-stone-700" />
              </div>
              <div className="text-center">
                <span className="text-sm font-bold text-gray-900">Design Editor</span>
                <p className="text-xs text-gray-500 mt-1">Customize how videos look</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ─── Create Video Wizard ─── */}
      {view === 'create' && (
        <div className="py-6 animate-in fade-in duration-300">
          <CreateVideoWizard onBack={() => navigate('landing')} />
        </div>
      )}

      {/* ─── Design Editor ─── */}
      {view === 'design' && (
        <div className="animate-in fade-in duration-300">
          <DesignEditorTab onBack={() => navigate('landing')} />
        </div>
      )}
    </div>
  )
}
