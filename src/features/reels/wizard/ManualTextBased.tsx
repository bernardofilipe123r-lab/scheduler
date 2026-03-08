import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateJob } from '@/features/jobs'
import { useNicheConfig } from '@/features/brands'
import { useTrendingMusic } from '@/features/brands/api/use-trending-music'
import type { BrandName, Variant } from '@/shared/types'

interface ManualTextBasedProps {
  brands: BrandName[]
  platforms: string[]
  onComplete: () => void
}

export function ManualTextBased({ brands, platforms, onComplete }: ManualTextBasedProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const createJob = useCreateJob()
  const { data: nicheConfig } = useNicheConfig()
  const { data: trendingMusicData } = useTrendingMusic()
  const trendingTracks = trendingMusicData?.tracks ?? []
  const ctaOptions = (nicheConfig?.cta_options ?? []).filter((o: { text: string; weight: number }) => o.text && o.weight > 0)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [variant, setVariant] = useState<Variant>('dark')
  const [aiPrompt, setAiPrompt] = useState('')
  const [imageModel, setImageModel] = useState('ZImageTurbo_INT8')
  const [ctaType, setCtaType] = useState('auto')
  const [musicSource, setMusicSource] = useState('trending_random')
  const [selectedTrack, setSelectedTrack] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { toast.error('Enter a title'); return }
    const contentLines = content.split('\n').filter(l => l.trim())
    if (contentLines.length === 0) { toast.error('Enter at least one content line'); return }

    setIsCreating(true)
    try {
      // Auto-generate image prompt if dark variant and blank
      let finalAiPrompt = variant === 'dark' ? aiPrompt : undefined
      if (variant === 'dark' && !aiPrompt.trim()) {
        try {
          const res = await fetch('/reels/generate-image-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
          })
          if (res.ok) {
            const data = await res.json()
            if (data.image_prompt) finalAiPrompt = data.image_prompt
          }
        } catch { /* fallback: no prompt */ }
      }

      const job = await createJob.mutateAsync({
        title,
        content_lines: contentLines,
        brands,
        variant,
        ai_prompt: finalAiPrompt || undefined,
        cta_type: ctaType === 'auto' ? undefined : ctaType,
        platforms,
        image_model: imageModel,
        fixed_title: true,
        music_source: musicSource,
        music_track_id: musicSource === 'trending_pick' ? selectedTrack || undefined : undefined,
      })

      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      toast.success(
        (t) => (
          <span className="cursor-pointer" onClick={() => { toast.dismiss(t.id); navigate(`/job/${job.id}`) }}>
            Reel generation started! <u>View Job →</u>
          </span>
        ),
        { duration: 6000 }
      )
      onComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start generation')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Title</label>
        <textarea
          value={title}
          onChange={e => setTitle(e.target.value)}
          rows={2}
          placeholder="e.g., Ultimate Rice Guide"
          required
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-none text-sm"
        />
      </div>

      {/* Content Lines */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Content Lines</label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={5}
          placeholder={"Enter one item per line:\nRice — Always rinse before cooking\nGarlic — Crush for maximum flavor"}
          required
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-none font-mono text-sm"
        />
      </div>

      {/* Settings row */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        {/* Variant + Image Model */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Variant</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['light', 'dark'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVariant(v)}
                  className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                    variant === v ? 'border-stone-800 bg-stone-900 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {v === 'light' ? '☀️ Light' : '🌙 Dark'}
                </button>
              ))}
            </div>
          </div>
          <div className={variant === 'light' && !platforms.includes('youtube') ? 'opacity-40 pointer-events-none' : ''}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Image Model</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'ZImageTurbo_INT8', label: '✨ Quality', sub: 'ZImageTurbo' },
                { id: 'Flux1schnell', label: '⚡ Fast', sub: 'Flux Schnell' },
              ].map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setImageModel(m.id)}
                  className={`flex flex-col items-center p-2 rounded-lg border text-[11px] font-medium transition-all ${
                    imageModel === m.id ? 'border-stone-800 bg-stone-900 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>{m.label}</span>
                  <span className={`text-[9px] ${imageModel === m.id ? 'text-stone-300' : 'text-gray-400'}`}>{m.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* AI Prompt (dark only) */}
        {variant === 'dark' && (
          <>
            <div className="border-t border-gray-100" />
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">✨ AI Background Prompt</label>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                rows={2}
                placeholder="Leave blank to auto-generate from title..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-stone-400 focus:border-transparent resize-none text-sm"
              />
            </div>
          </>
        )}

        <div className="border-t border-gray-100" />

        {/* CTA + Music in a row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Call-to-Action</label>
            <select
              value={ctaType}
              onChange={e => setCtaType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
            >
              <option value="auto">🎲 Auto</option>
              {ctaOptions.map((cta: { text: string }, i: number) => (
                <option key={i} value={cta.text}>{cta.text}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">🎵 Music</label>
            <select
              value={musicSource}
              onChange={e => { setMusicSource(e.target.value); setSelectedTrack('') }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
            >
              <option value="none">🔇 No Music</option>
              <option value="trending_random">🎲 Random Trending</option>
              {trendingTracks.length > 0 && <option value="trending_pick">🎵 Pick Track</option>}
            </select>
          </div>
        </div>

        {musicSource === 'trending_pick' && trendingTracks.length > 0 && (
          <select
            value={selectedTrack}
            onChange={e => setSelectedTrack(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm"
          >
            <option value="">Select a track...</option>
            {trendingTracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}{t.author ? ` — ${t.author}` : ''}{t.duration_seconds ? ` (${Math.round(t.duration_seconds)}s)` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Generate */}
      <button
        type="submit"
        disabled={isCreating}
        className="w-full py-3.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors text-sm"
      >
        {isCreating ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
        ) : (
          <>🎬 Generate Reel</>
        )}
      </button>
    </form>
  )
}
