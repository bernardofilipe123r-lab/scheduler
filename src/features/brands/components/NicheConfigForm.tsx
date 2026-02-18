import { useState, useEffect, useCallback } from 'react'
import { Save, Loader2, Dna, Sparkles, Film, LayoutGrid, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNicheConfig, useUpdateNicheConfig, useAiUnderstanding, useReelPreview } from '../api/use-niche-config'
import { ConfigStrengthMeter } from './ConfigStrengthMeter'
import { ContentExamplesSection } from './ContentExamplesSection'
import type { NicheConfig } from '../types/niche-config'
import { PostCanvas, DEFAULT_GENERAL_SETTINGS } from '@/shared/components/PostCanvas'
import { CarouselTextSlide } from '@/shared/components/CarouselTextSlide'

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

// Preload fonts needed by Konva canvas components
function useFontPreload() {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const fonts = [
      new FontFace('Anton', "url(https://fonts.gstatic.com/s/anton/v25/1Ptgg87GROyAm3K8-C8.woff2)"),
      new FontFace('Inter', "url(https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjQ.woff2)"),
    ]
    Promise.all(fonts.map(f => f.load().then(face => { document.fonts.add(face); return face }).catch(() => null)))
      .then(() => setLoaded(true))
  }, [])
  return loaded
}

export function NicheConfigForm({ brandId }: { brandId?: string }) {
  const { data, isLoading } = useNicheConfig(brandId)
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

  useEffect(() => {
    if (data) {
      setValues({ ...DEFAULT_CONFIG, ...data })
      setDirty(false)
    }
  }, [data])

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
    try {
      const result = await aiMutation.mutateAsync(brandId)
      setAiResult(result)
      setReelImages(null)

      // After AI generates examples, render actual reel images via ImageGenerator
      if (result.example_reel && brandId) {
        try {
          const preview = await reelPreviewMutation.mutateAsync({
            brand_id: brandId,
            title: result.example_reel.title,
            content_lines: result.example_reel.content_lines,
          })
          setReelImages(preview)
        } catch {
          // Reel preview is non-critical
        }
      }
    } catch {
      toast.error('Failed to generate AI understanding')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId])

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
              {aiMutation.isPending ? 'Generating...' : reelPreviewMutation.isPending ? 'Rendering images...' : 'Generate'}
            </button>
          </div>
        </div>

        {aiResult && (
          <div className="px-6 py-4 space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{aiResult.understanding}</p>
            </div>

            {(aiResult.example_reel || aiResult.example_post) && (
              <div className="space-y-6">
                {/* Reel Preview — real images from ImageGenerator */}
                {aiResult.example_reel && (
                  <div className="border border-indigo-100 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600">
                        <Film className="w-3.5 h-3.5" />
                        Example Reel Preview
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {reelImages ? 'Real render' : 'Preview only'}
                      </span>
                    </div>
                    <div className="flex gap-4">
                      {/* Actual rendered images from ImageGenerator */}
                      <div className="flex gap-3 shrink-0">
                        {reelImages ? (
                          <>
                            <div>
                              <img
                                src={`data:image/png;base64,${reelImages.thumbnail_base64}`}
                                alt="Reel thumbnail"
                                className="w-[140px] rounded-lg shadow-md"
                                style={{ aspectRatio: '9/16' }}
                              />
                              <p className="text-[9px] text-gray-400 text-center mt-1">Thumbnail</p>
                            </div>
                            <div>
                              <img
                                src={`data:image/png;base64,${reelImages.content_base64}`}
                                alt="Reel content"
                                className="w-[140px] rounded-lg shadow-md"
                                style={{ aspectRatio: '9/16' }}
                              />
                              <p className="text-[9px] text-gray-400 text-center mt-1">Content</p>
                            </div>
                          </>
                        ) : reelPreviewMutation.isPending ? (
                          <div className="w-[140px] rounded-lg bg-gray-100 flex items-center justify-center" style={{ aspectRatio: '9/16' }}>
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                          </div>
                        ) : null}
                      </div>

                      {/* Script lines */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 mb-2">{aiResult.example_reel.title}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Script Lines</p>
                        <ol className="space-y-1">
                          {aiResult.example_reel.content_lines.map((line, i) => (
                            <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                              <span className="text-indigo-400 font-medium shrink-0">{i + 1}.</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </div>
                )}

                {/* Carousel Post Preview — real Konva components with preloaded fonts */}
                {aiResult.example_post && fontsReady && (
                  <div className="border border-purple-100 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-purple-600">
                        <LayoutGrid className="w-3.5 h-3.5" />
                        Example Carousel Post Preview
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Konva render</span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {/* Cover slide */}
                      <div className="shrink-0 rounded-lg overflow-hidden shadow-md">
                        <PostCanvas
                          brand={brandId || ''}
                          title={aiResult.example_post.title}
                          backgroundImage={null}
                          settings={DEFAULT_GENERAL_SETTINGS}
                          scale={0.2}
                        />
                      </div>
                      {/* Text slides — strip "Slide N:" prefix from AI output */}
                      {aiResult.example_post.slides.map((slide, i) => {
                        const cleanSlide = slide.replace(/^Slide\s*\d+\s*:\s*/i, '')
                        return (
                          <div key={i} className="shrink-0 rounded-lg overflow-hidden shadow-md">
                            <CarouselTextSlide
                              brand={brandId || ''}
                              text={cleanSlide}
                              allSlideTexts={aiResult.example_post!.slides.map(s => s.replace(/^Slide\s*\d+\s*:\s*/i, ''))}
                              isLastSlide={i === aiResult.example_post!.slides.length - 1}
                              scale={0.2}
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

        {!aiResult && !aiMutation.isPending && (
          <div className="px-6 py-6 text-center text-sm text-gray-400">
            Click "Generate" to see how the AI interprets your brand configuration
          </div>
        )}
      </div>
    </div>
  )
}
