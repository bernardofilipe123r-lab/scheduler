import { useState, useEffect, useCallback, useMemo } from 'react'
import { Save, Loader2, Dna, Sparkles, Film, LayoutGrid, Plus, Trash2, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNicheConfig, useUpdateNicheConfig, useAiUnderstanding, useReelPreview } from '../api/use-niche-config'
import { useBrands } from '../api/use-brands'
import { ConfigStrengthMeter } from './ConfigStrengthMeter'
import { ContentExamplesSection } from './ContentExamplesSection'
import type { NicheConfig } from '../types/niche-config'
import { PostCanvas, DEFAULT_GENERAL_SETTINGS, getBrandConfig } from '@/shared/components/PostCanvas'
import { CarouselTextSlide } from '@/shared/components/CarouselTextSlide'
import { NicheConfigSkeleton } from '@/shared/components'

const CONTENT_BRIEF_PLACEHOLDER = `Viral short-form health content for women 35+ on Instagram and TikTok.

Topics include: foods that fight inflammation vs. foods that secretly cause it, superfoods and their specific benefits (e.g. magnesium for sleep, omega-3 for joints), surprising facts about everyday habits (sleep position, hydration timing, meal order), hormonal health after 35, gut-brain connection, metabolism myths, longevity habits backed by science, skin health from the inside out.

Tone: educational, empowering, calm authority. Avoid: clinical jargon, fear-mongering, salesy language. 60% validating, 40% surprising.

Target audience: U.S. women aged 35+, interested in healthy aging, energy, hormones, and longevity.`

const DEFAULT_CONFIG: NicheConfig = {
  niche_name: '',
  niche_description: '',
  content_brief: '',
  target_audience: '',
  audience_description: '',
  content_tone: [],
  tone_avoid: [],
  topic_categories: [],
  topic_keywords: [],
  topic_avoid: [],
  content_philosophy: '',
  hook_themes: [],
  reel_examples: [],
  post_examples: [],
  image_style_description: '',
  image_palette_keywords: [],
  brand_personality: null,
  brand_focus_areas: [],
  parent_brand_name: '',
  cta_options: [],
  hashtags: [],
  follow_section_text: '',
  save_section_text: '',
  disclaimer_text: '',
}

// Preload fonts needed by Konva canvas components via Google Fonts CSS API
function useFontPreload() {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    // Inject Google Fonts stylesheet (avoids hardcoded woff2 URLs that 404)
    const linkId = 'konva-preview-fonts'
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap'
      document.head.appendChild(link)
    }
    // Wait for all fonts (including Google Fonts) to finish loading
    document.fonts.ready.then(() => {
      setTimeout(() => setLoaded(true), 150)
    })
  }, [])
  return loaded
}

export function NicheConfigForm({ brandId }: { brandId?: string }) {
  const { data, isLoading } = useNicheConfig(brandId)
  const { data: brandsData } = useBrands()
  const updateMutation = useUpdateNicheConfig()
  const aiMutation = useAiUnderstanding()
  const reelPreviewMutation = useReelPreview()
  const fontsReady = useFontPreload()

  const [values, setValues] = useState<NicheConfig>(DEFAULT_CONFIG)
  const [dirty, setDirty] = useState(false)
  const [aiResult, setAiResult] = useState<{
    understanding: string
    example_reel: { title: string; content_lines: string[] } | null
    example_post: { title: string; slides: string[]; doi?: string } | null
  } | null>(null)
  const [reelImages, setReelImages] = useState<{
    thumbnail_base64: string
    content_base64: string
  } | null>(null)

  // Pick a random brand for carousel previews — stable for the whole component lifetime
  const previewBrand = useMemo(() => {
    const available = brandsData?.map(b => b.id) || []
    return available[Math.floor(Math.random() * available.length)] || ''
  }, [brandsData])

  // Effective brand for reel preview API — previewBrand fallback when no brandId selected
  const effectiveBrand = brandId || previewBrand

  // Brand data from DB for the effective brand (handle, display name, color)
  const effectiveBrandData = useMemo(
    () => brandsData?.find(b => b.id === effectiveBrand),
    [brandsData, effectiveBrand]
  )

  useEffect(() => {
    if (data) {
      const brief = data.content_brief || CONTENT_BRIEF_PLACEHOLDER
      setValues({ ...DEFAULT_CONFIG, ...data, content_brief: brief })
      setDirty(!data.content_brief) // dirty if we pre-filled the template
    }
  }, [data])

  // On mount / brandId change: restore persisted AI result from localStorage
  useEffect(() => {
    const storageKey = `ai-understanding-${brandId || 'global'}`
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return
      const parsed = JSON.parse(saved)
      setAiResult(parsed)
      setReelImages(null)
      // Re-render reel images from cached result (fast, no AI call needed)
      if (parsed.example_reel) {
        reelPreviewMutation.mutate(
          {
            brand_id: effectiveBrand,
            title: parsed.example_reel.title,
            content_lines: parsed.example_reel.content_lines,
          },
          { onSuccess: setReelImages },
        )
      }
    } catch {
      localStorage.removeItem(storageKey)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId])

  const update = <K extends keyof NicheConfig>(key: K, value: NicheConfig[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ ...values, brand_id: brandId ?? null })
      toast.success('Content DNA saved')
      setDirty(false)
    } catch {
      toast.error('Failed to save')
    }
  }

  const handleAiUnderstanding = useCallback(async () => {
    setAiResult(null)
    setReelImages(null)
    try {
      // Step 1: AI text generation (~15–30s)
      const result = await aiMutation.mutateAsync(brandId)

      // Step 2: Reel image rendering — wait for both before showing any results
      let preview = null
      if (result.example_reel) {
        try {
          preview = await reelPreviewMutation.mutateAsync({
            brand_id: effectiveBrand,
            title: result.example_reel.title,
            content_lines: result.example_reel.content_lines,
          })
        } catch {
          toast.error('Reel render failed — showing text results only')
        }
      }

      // Set both at once so partial state is never visible to the user
      setAiResult(result)
      setReelImages(preview)

      // Persist so results survive page navigation
      localStorage.setItem(`ai-understanding-${brandId || 'global'}`, JSON.stringify(result))
    } catch {
      toast.error('Failed to generate AI understanding')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, effectiveBrand])

  const handleRegenerate = useCallback(() => {
    localStorage.removeItem(`ai-understanding-${brandId || 'global'}`)
    setAiResult(null)
    setReelImages(null)
    handleAiUnderstanding()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, handleAiUnderstanding])

  if (isLoading) return <NicheConfigSkeleton />

  return (
    <div className="space-y-4 min-w-0">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Dna className="w-5 h-5 text-primary-500" />
              Content DNA
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Define what your AI-generated content is about. These settings control every reel, post, and visual.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={!dirty || updateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
        </div>

        <div className="px-6 py-4">
          <ConfigStrengthMeter config={values} />
        </div>
      </div>

      {/* Section 1: Niche Name */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Niche Name</label>
          <input
            value={values.niche_name}
            onChange={(e) => update('niche_name', e.target.value)}
            placeholder="Health & Wellness"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-xs text-gray-400 mt-1">A short label for your niche (e.g. "Health & Wellness", "Personal Finance")</p>
        </div>
      </div>

      {/* Section 2: Content Brief */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Content Brief</label>
          <textarea
            value={values.content_brief}
            onChange={(e) => update('content_brief', e.target.value)}
            placeholder={CONTENT_BRIEF_PLACEHOLDER}
            rows={10}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            Describe everything the AI needs to know: topics, tone, audience, style, philosophy. This goes directly into every prompt.
          </p>
        </div>
      </div>

      {/* Section 3: Content Examples */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-5">
          <h3 className="font-medium text-gray-900 mb-1">📝 Content Examples</h3>
          <p className="text-xs text-gray-400 mb-4">
            The AI learns directly from your examples. Providing 10+ examples dramatically improves content relevance and quality.
          </p>
          <ContentExamplesSection
            reelExamples={values.reel_examples}
            postExamples={values.post_examples}
            onReelExamplesChange={(v) => update('reel_examples', v)}
            onPostExamplesChange={(v) => update('post_examples', v)}
          />
        </div>
      </div>

      {/* Section 4: CTAs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-5">
          <h3 className="font-medium text-gray-900 mb-1">💬 CTAs & Captions</h3>
          <p className="text-xs text-gray-400 mb-4">
            Define your call-to-action variants with probability weights. The AI randomly picks one based on the weights you assign.
          </p>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">CTA Options ({values.cta_options.length}/10)</label>
                <div className="flex gap-2">
                  {values.cta_options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const equalWeight = Math.floor(100 / values.cta_options.length)
                        const remainder = 100 - equalWeight * values.cta_options.length
                        update('cta_options', values.cta_options.map((opt, i) => ({
                          ...opt,
                          weight: equalWeight + (i === 0 ? remainder : 0),
                        })))
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Auto-distribute
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (values.cta_options.length >= 10) return
                      update('cta_options', [...values.cta_options, { text: '', weight: 0 }])
                    }}
                    disabled={values.cta_options.length >= 10}
                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3 h-3" />
                    Add CTA
                  </button>
                </div>
              </div>

              {values.cta_options.length === 0 && (
                <div className="text-xs text-gray-400 italic py-3 text-center border border-dashed border-gray-200 rounded-lg">
                  No CTAs configured. Add CTA variants that will be randomly selected for your content.
                </div>
              )}

              <div className="space-y-2">
                {values.cta_options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={opt.text}
                      onChange={(e) => {
                        const updated = [...values.cta_options]
                        updated[i] = { ...updated[i], text: e.target.value }
                        update('cta_options', updated)
                      }}
                      placeholder="e.g. If you want to improve your health, follow our page"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={opt.weight}
                        onChange={(e) => {
                          const updated = [...values.cta_options]
                          updated[i] = { ...updated[i], weight: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }
                          update('cta_options', updated)
                        }}
                        className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        update('cta_options', values.cta_options.filter((_, j) => j !== i))
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {values.cta_options.length > 0 && (() => {
                const totalWeight = values.cta_options.reduce((sum, opt) => sum + opt.weight, 0)
                return totalWeight !== 100 ? (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ Weights sum to {totalWeight}% — should be 100%
                  </p>
                ) : (
                  <p className="text-xs text-green-600 mt-1">✓ Weights sum to 100%</p>
                )
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* AI Understanding */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                AI Understanding of Your Brand
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Ask the AI to describe how it interprets your Content DNA configuration
              </p>
            </div>
            <div className="flex items-center gap-2">
              {aiResult && (
                <button
                  onClick={handleRegenerate}
                  disabled={aiMutation.isPending || reelPreviewMutation.isPending}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerate
                </button>
              )}
              <button
                onClick={handleAiUnderstanding}
                disabled={aiMutation.isPending || reelPreviewMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {(aiMutation.isPending || reelPreviewMutation.isPending) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {aiMutation.isPending ? 'Analyzing brand...' : reelPreviewMutation.isPending ? 'Rendering images...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>

        {aiResult && (
          <div className="px-6 py-4 space-y-4 min-w-0">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{aiResult.understanding}</p>
            </div>

            {(aiResult.example_reel || aiResult.example_post) && (
              <div className="space-y-6">
                {/* Reel Preview — real images from ImageGenerator (matches Job Detail layout) */}
                {aiResult.example_reel && (
                  <div className="border border-indigo-100 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600">
                        <Film className="w-3.5 h-3.5" />
                        Example Reel Preview
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {reelImages ? 'Real render (light mode)' : reelPreviewMutation.isPending ? 'Rendering...' : 'Waiting'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
                      {/* Left: Media preview — 2 columns: IG/FB Thumbnail + Content */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* IG/FB Thumbnail */}
                        <div>
                          <p className="text-xs text-gray-500 mb-1 text-center">IG/FB Thumbnail</p>
                          {reelImages ? (
                            <div className="aspect-[9/16] bg-gray-100 rounded-lg overflow-hidden">
                              <img
                                src={`data:image/png;base64,${reelImages.thumbnail_base64}`}
                                alt="Reel thumbnail"
                                className="w-full h-full object-cover object-top"
                              />
                            </div>
                          ) : reelPreviewMutation.isPending ? (
                            <div className="aspect-[9/16] bg-gray-100 rounded-lg flex items-center justify-center">
                              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                            </div>
                          ) : (
                            <div className="aspect-[9/16] bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs">No preview</div>
                          )}
                        </div>

                        {/* Content Slide */}
                        <div>
                          <p className="text-xs text-gray-500 mb-1 text-center">Content Slide</p>
                          {reelImages ? (
                            <div className="aspect-[9/16] bg-gray-100 rounded-lg overflow-hidden">
                              <img
                                src={`data:image/png;base64,${reelImages.content_base64}`}
                                alt="Reel content"
                                className="w-full h-full object-cover object-top"
                              />
                            </div>
                          ) : reelPreviewMutation.isPending ? (
                            <div className="aspect-[9/16] bg-gray-100 rounded-lg flex items-center justify-center">
                              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                            </div>
                          ) : (
                            <div className="aspect-[9/16] bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs">No preview</div>
                          )}
                        </div>
                      </div>

                      {/* Right: Script lines */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-sm font-semibold text-gray-900 mb-2">{aiResult.example_reel.title}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Script Lines</p>
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                          {aiResult.example_reel.content_lines.map((line, i) => (
                            <div key={i} className="text-sm text-gray-700 py-1.5 px-2 bg-white rounded border-l-2 border-gray-300">
                              <span className="font-medium text-gray-500 mr-2">{i + 1}.</span>
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Carousel Post Preview — real Konva components with preloaded fonts */}
                {aiResult.example_post && fontsReady && (
                  <div className="border border-purple-100 rounded-lg p-4 min-w-0 overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-purple-600">
                        <LayoutGrid className="w-3.5 h-3.5" />
                        Example Carousel Post Preview
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        Konva render · {getBrandConfig(effectiveBrand).name || effectiveBrand}
                      </span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {/* Cover slide — uses effectiveBrand (current brand or random fallback) */}
                      <div className="shrink-0 rounded-lg overflow-hidden shadow-md">
                        <PostCanvas
                          key={`cover-${effectiveBrand}-${fontsReady}`}
                          brand={effectiveBrand}
                          title={aiResult.example_post.title}
                          backgroundImage={null}
                          settings={DEFAULT_GENERAL_SETTINGS}
                          scale={0.2}
                        />
                      </div>
                      {/* Text slides — strip "Slide N:" prefix, use same effectiveBrand */}
                      {aiResult.example_post.slides.map((slide, i) => {
                        const cleanSlide = slide.replace(/^Slide\s*\d+\s*:\s*/i, '')
                        return (
                          <div key={i} className="shrink-0 rounded-lg overflow-hidden shadow-md">
                            <CarouselTextSlide
                              key={`slide-${i}-${effectiveBrand}-${fontsReady}`}
                              brand={effectiveBrand}
                              text={cleanSlide}
                              allSlideTexts={aiResult.example_post!.slides.map(s => s.replace(/^Slide\s*\d+\s*:\s*/i, ''))}
                              isLastSlide={i === aiResult.example_post!.slides.length - 1}
                              scale={0.2}
                              brandHandle={effectiveBrandData?.instagram_handle}
                              brandDisplayName={effectiveBrandData?.display_name}
                              brandColor={effectiveBrandData?.colors?.primary}
                            />
                          </div>
                        )
                      })}
                    </div>
                    {aiResult.example_post.doi && (
                      <p className="text-[10px] text-gray-500 mt-2 font-mono">
                        DOI: {aiResult.example_post.doi}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(aiMutation.isPending || (reelPreviewMutation.isPending && !aiResult)) && (
          <div className="px-6 py-10 flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-800">
                {aiMutation.isPending ? 'Analyzing your brand configuration...' : 'Rendering reel images...'}
              </p>
              <p className="text-xs text-gray-400 mt-1">This may take 20–40 seconds</p>
            </div>
          </div>
        )}

        {!aiResult && !aiMutation.isPending && !reelPreviewMutation.isPending && (
          <div className="px-6 py-6 text-center text-sm text-gray-400">
            Click "Generate" to see how the AI interprets your brand configuration
          </div>
        )}
      </div>
    </div>
  )
}
