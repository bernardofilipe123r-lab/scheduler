import { useState, useEffect } from 'react'
import { Save, Loader2, Dna, ChevronDown, ChevronRight, Info, Sparkles, Film, LayoutGrid } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNicheConfig, useUpdateNicheConfig, useAiUnderstanding } from '../api/use-niche-config'
import { ConfigStrengthMeter } from './ConfigStrengthMeter'
import { ContentExamplesSection } from './ContentExamplesSection'
import { TagInput } from './TagInput'
import { ChipSelect } from './ChipSelect'
import type { NicheConfig } from '../types/niche-config'

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
  const [aiResult, setAiResult] = useState<{ understanding: string; example_reel_title: string | null; example_post_title: string | null } | null>(null)

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
        title="Visual Style"
        icon="🖼️"
        hint="Controls the look and feel of AI-generated background images for your reels and posts."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image Style Description</label>
            <textarea
              value={values.image_style_description}
              onChange={(e) => update('image_style_description', e.target.value)}
              placeholder="Soft, minimal, calming wellness aesthetic..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image Palette Keywords</label>
            <TagInput
              tags={values.image_palette_keywords}
              onChange={(tags) => update('image_palette_keywords', tags)}
              placeholder="Add keyword..."
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="CTAs & Hashtags"
        icon="💬"
        hint="Calls-to-action appended to reels and hashtags added to captions for discoverability."
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hashtags</label>
            <TagInput
              tags={values.hashtags}
              onChange={(tags) => update('hashtags', tags)}
              placeholder="#health"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Follow Section Text</label>
            <textarea
              value={values.follow_section_text}
              onChange={(e) => update('follow_section_text', e.target.value)}
              placeholder="research-informed content on..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Save Section Text</label>
            <textarea
              value={values.save_section_text}
              onChange={(e) => update('save_section_text', e.target.value)}
              placeholder="improving their health..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
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

            {(aiResult.example_reel_title || aiResult.example_post_title) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {aiResult.example_reel_title && (
                  <div className="border border-indigo-100 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 mb-1.5">
                      <Film className="w-3.5 h-3.5" />
                      Example Reel Title
                    </div>
                    <p className="text-sm font-medium text-gray-900">{aiResult.example_reel_title}</p>
                  </div>
                )}
                {aiResult.example_post_title && (
                  <div className="border border-purple-100 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-purple-600 mb-1.5">
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Example Post Title
                    </div>
                    <p className="text-sm font-medium text-gray-900">{aiResult.example_post_title}</p>
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
