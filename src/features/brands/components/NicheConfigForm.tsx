import { useState, useEffect } from 'react'
import { Save, Loader2, Dna, ChevronDown, ChevronRight, Info, Sparkles, Film, LayoutGrid, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNicheConfig, useUpdateNicheConfig, useAiUnderstanding } from '../api/use-niche-config'
import { ConfigStrengthMeter } from './ConfigStrengthMeter'
import { ContentExamplesSection } from './ContentExamplesSection'
import { TagInput } from './TagInput'
import { ChipSelect } from './ChipSelect'
import type { NicheConfig } from '../types/niche-config'
import { PostCanvas, DEFAULT_GENERAL_SETTINGS } from '@/shared/components/PostCanvas'
import { CarouselTextSlide } from '@/shared/components/CarouselTextSlide'

const TONE_OPTIONS = [
  'calm', 'authoritative', 'educational', 'empowering', 'casual',
  'energetic', 'scientific', 'friendly', 'confident', 'direct',
  'warm', 'inspirational', 'professional', 'conversational',
]

const TONE_AVOID_OPTIONS = [
  'clinical', 'salesy', 'aggressive', 'academic', 'poetic',
  'overly creative', 'robotic', 'preachy', 'condescending',
]

const NICHE_SUGGESTIONS = [
  'Health & Wellness',
  'Personal Finance',
  'Technology & AI',
  'Fitness & Training',
  'Cooking & Nutrition',
  'Parenting & Family',
  'Mental Health',
  'Business & Entrepreneurship',
  'Education & Learning',
  'Beauty & Skincare',
]

const DEFAULT_CONFIG: NicheConfig = {
  niche_name: '',
  niche_description: '',
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

interface CollapsibleSectionProps {
  title: string
  icon: string
  hint: string
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleSection({ title, icon, hint, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="font-medium text-gray-900">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100">
          <div className="flex items-start gap-1.5 mb-4 text-xs text-gray-400">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{hint}</span>
          </div>
          {children}
        </div>
      )}
    </div>
  )
}

export function NicheConfigForm({ brandId }: { brandId?: string }) {
  const { data, isLoading } = useNicheConfig(brandId)
  const updateMutation = useUpdateNicheConfig()
  const aiMutation = useAiUnderstanding()

  const [values, setValues] = useState<NicheConfig>(DEFAULT_CONFIG)
  const [dirty, setDirty] = useState(false)
  const [aiResult, setAiResult] = useState<{
    understanding: string
    example_reel: { title: string; content_lines: string[] } | null
    example_post: { title: string; slides: string[]; doi?: string } | null
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

  const handleAiUnderstanding = async () => {
    try {
      const result = await aiMutation.mutateAsync(brandId)
      setAiResult(result)
    } catch {
      toast.error('Failed to generate AI understanding')
    }
  }

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

      {/* Sections */}
      <CollapsibleSection
        title="Niche & Audience"
        icon="📍"
        hint="These define your content's core identity — who you're creating for and what your brand is about."
        defaultOpen
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Niche Name</label>
            <div className="relative">
              <input
                value={values.niche_name}
                onChange={(e) => update('niche_name', e.target.value)}
                list="niche-suggestions"
                placeholder="Health & Wellness"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <datalist id="niche-suggestions">
                {NICHE_SUGGESTIONS.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Niche Description</label>
            <textarea
              value={values.niche_description}
              onChange={(e) => update('niche_description', e.target.value)}
              placeholder="viral short-form health content"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
            <input
              value={values.target_audience}
              onChange={(e) => update('target_audience', e.target.value)}
              placeholder="U.S. women aged 35+"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Audience Description</label>
            <textarea
              value={values.audience_description}
              onChange={(e) => update('audience_description', e.target.value)}
              placeholder="Women 35+ interested in healthy aging, energy, hormones, and longevity"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parent Brand Name</label>
            <input
              value={values.parent_brand_name}
              onChange={(e) => update('parent_brand_name', e.target.value)}
              placeholder="InLight"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Topics & Categories"
        icon="📂"
        hint="What subjects your reels and posts cover. Add topics relevant to your niche."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Topic Categories</label>
            <TagInput
              tags={values.topic_categories}
              onChange={(tags) => update('topic_categories', tags)}
              placeholder="Add topic..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Keywords to Emphasize</label>
            <TagInput
              tags={values.topic_keywords}
              onChange={(tags) => update('topic_keywords', tags)}
              placeholder="Add keyword..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Topics to Avoid</label>
            <TagInput
              tags={values.topic_avoid}
              onChange={(tags) => update('topic_avoid', tags)}
              placeholder="Add topic to avoid..."
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Tone & Style"
        icon="🎨"
        hint="The voice and personality of your content. Select tones that match how you want your brand to sound."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Content Tone</label>
            <ChipSelect
              options={TONE_OPTIONS}
              selected={values.content_tone}
              onChange={(v) => update('content_tone', v)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tone to Avoid</label>
            <ChipSelect
              options={TONE_AVOID_OPTIONS}
              selected={values.tone_avoid}
              onChange={(v) => update('tone_avoid', v)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content Philosophy</label>
            <textarea
              value={values.content_philosophy}
              onChange={(e) => update('content_philosophy', e.target.value)}
              placeholder="60% validating, 40% surprising..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Content Examples"
        icon="📝"
        hint="The AI learns directly from your examples. Providing 10+ examples dramatically improves content relevance and quality."
      >
        <ContentExamplesSection
          reelExamples={values.reel_examples}
          postExamples={values.post_examples}
          onReelExamplesChange={(v) => update('reel_examples', v)}
          onPostExamplesChange={(v) => update('post_examples', v)}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="CTAs & Captions"
        icon="💬"
        hint="Define your call-to-action variants with probability weights. The AI randomly picks one based on the weights you assign. Weights should sum to 100%."
      >
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hashtags</label>
            <TagInput
              tags={values.hashtags}
              onChange={(tags) => update('hashtags', tags)}
              placeholder="#health"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Disclaimer Text</label>
            <textarea
              value={values.disclaimer_text}
              onChange={(e) => update('disclaimer_text', e.target.value)}
              placeholder="This content is intended for educational..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* AI Understandings */}
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
              disabled={aiMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {aiMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {aiMutation.isPending ? 'Generating...' : 'Generate'}
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
                {/* Reel Preview */}
                {aiResult.example_reel && (
                  <div className="border border-indigo-100 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600">
                        <Film className="w-3.5 h-3.5" />
                        Example Reel Preview
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Preview only</span>
                    </div>
                    <div className="flex gap-4">
                      {/* Thumbnail + Content mockups */}
                      <div className="flex gap-3 shrink-0">
                        {/* Thumbnail mockup */}
                        <div>
                          <div className="w-[140px] rounded-lg overflow-hidden shadow-md" style={{ aspectRatio: '9/16' }}>
                            <div className="w-full h-full bg-[#1a1a2e] flex flex-col items-center justify-center relative p-3">
                              <div className="flex items-center gap-2 mb-3 opacity-70">
                                <div className="w-6 h-px bg-white" />
                                <span className="text-[8px] text-white font-bold tracking-wider">
                                  {brandId ? brandId.replace(/college$/i, '').charAt(0).toUpperCase() + 'CO' : 'HCO'}
                                </span>
                                <div className="w-6 h-px bg-white" />
                              </div>
                              <p className="text-[10px] text-white font-bold text-center leading-tight uppercase px-1">
                                {aiResult.example_reel.title}
                              </p>
                              <span className="absolute bottom-3 text-[7px] text-white/60">Swipe →</span>
                            </div>
                          </div>
                          <p className="text-[9px] text-gray-400 text-center mt-1">Thumbnail</p>
                        </div>

                        {/* Content mockup */}
                        <div>
                          <div className="w-[140px] rounded-lg overflow-hidden shadow-md" style={{ aspectRatio: '9/16' }}>
                            <div className="w-full h-full bg-[#1a1a2e] flex flex-col p-2.5 relative">
                              <div className="bg-indigo-600/80 rounded px-1.5 py-1 mb-2">
                                <p className="text-[7px] text-white font-bold leading-tight uppercase">
                                  {aiResult.example_reel.title}
                                </p>
                              </div>
                              <div className="flex-1 space-y-1 overflow-hidden">
                                {aiResult.example_reel.content_lines.slice(0, 7).map((line, i) => (
                                  <div key={i} className="flex gap-1">
                                    <span className="text-[6px] text-indigo-400 font-bold shrink-0">{i + 1}.</span>
                                    <span className="text-[6px] text-white/80 leading-tight line-clamp-2">{line}</span>
                                  </div>
                                ))}
                              </div>
                              <p className="text-[6px] text-white/40 text-center mt-1">
                                {brandId ? brandId.replace(/college$/i, ' College').replace(/^\w/, (c: string) => c.toUpperCase()) : 'Brand'}
                              </p>
                            </div>
                          </div>
                          <p className="text-[9px] text-gray-400 text-center mt-1">Content</p>
                        </div>
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

                {/* Carousel Post Preview */}
                {aiResult.example_post && (
                  <div className="border border-purple-100 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-purple-600">
                        <LayoutGrid className="w-3.5 h-3.5" />
                        Example Carousel Post Preview
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Preview only</span>
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
                      {/* Text slides */}
                      {aiResult.example_post.slides.map((slide, i) => (
                        <div key={i} className="shrink-0 rounded-lg overflow-hidden shadow-md">
                          <CarouselTextSlide
                            brand={brandId || ''}
                            text={slide}
                            allSlideTexts={aiResult.example_post!.slides}
                            isLastSlide={i === aiResult.example_post!.slides.length - 1}
                            scale={0.2}
                          />
                        </div>
                      ))}
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
