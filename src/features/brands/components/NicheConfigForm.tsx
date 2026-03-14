import { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { Save, Loader2, Dna, Sparkles, Film, LayoutGrid, Plus, Trash2, RefreshCw, ChevronDown, Check, Instagram, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNicheConfig, useUpdateNicheConfig, useAiUnderstanding, useReelPreview, useSuggestYtTitles, useImportFromInstagram } from '../api/use-niche-config'
import { useContentDNAProfile, useUpdateContentDNA } from '@/features/content-dna'
import { useBrands } from '../api/use-brands'
import { apiClient } from '@/shared/api/client'
import { getConfigStrength } from '../types/niche-config'
import { ContentExamplesSection } from './ContentExamplesSection'
import type { NicheConfig } from '../types/niche-config'
import { PostCanvas, DEFAULT_GENERAL_SETTINGS, getBrandConfig } from '@/shared/components/PostCanvas'
import { CarouselTextSlide } from '@/shared/components/CarouselTextSlide'
import { NicheConfigSkeleton } from '@/shared/components'

const CONTENT_BRIEF_PLACEHOLDER = `Example for Health & Wellness (@thelongevitycollege):

Viral short-form health content for women 35+ on Instagram and TikTok.

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
  cta_options: [
    { text: 'Follow for more content that actually matters', weight: 34 },
    { text: 'Save this for later — you\'ll thank yourself', weight: 33 },
    { text: 'Share this with someone who needs to see it', weight: 33 },
  ],
  carousel_cta_options: [
    { text: 'Follow @{brandhandle} to learn more about {cta_topic}', weight: 34 },
    { text: 'If you want to learn more about {cta_topic}, follow our page!', weight: 33 },
    { text: 'If you want to learn more about {cta_topic}, follow @{brandhandle}!', weight: 33 },
  ],
  hashtags: [],
  carousel_cta_topic: '',
  follow_section_text: '',
  save_section_text: '',
  disclaimer_text: '',
  citation_style: 'none',
  citation_source_types: [],
  yt_title_examples: [],
  yt_title_bad_examples: [],
  carousel_cover_overlay_opacity: 55,
  carousel_content_overlay_opacity: 85,
}

function inferGeneralFieldsFromBrief(contentBrief: string): { topicCategories: string[]; targetAudience: string } {
  const brief = contentBrief || ''

  const targetMatch = brief.match(/(?:target\s+audience|audience)\s*:\s*([^\n]+)/i)
  const targetAudience = targetMatch?.[1]?.trim() || ''

  const topicMatch =
    brief.match(/(?:daily\s+topics\s+include|topics\s+include|topic\s+categories)\s*:\s*([^\n]+)/i) ||
    brief.match(/(?:daily\s+topics|topics)\s*:\s*([^\n]+)/i)

  const rawTopics = topicMatch?.[1] || ''
  const topicCategories = Array.from(
    new Set(
      rawTopics
        .replace(/\([^)]*\)/g, ' ')
        .split(/,|;|\||\//)
        .map((s) => s.trim())
        .map((s) => s.replace(/^[-\d.\s]+/, '').replace(/\s+/g, ' '))
        .filter((s) => s.length >= 3)
        .slice(0, 15),
    ),
  )

  return { topicCategories, targetAudience }
}

function resolveReelCtaTopic(values: NicheConfig): string {
  const explicitTopic = values.carousel_cta_topic?.trim()
  if (explicitTopic) return explicitTopic

  const keywordTopic = values.topic_keywords?.find((k) => k?.trim())?.trim()
  if (keywordTopic) return keywordTopic

  const firstNicheWord = values.niche_name?.trim().split(/\s+/)[0]?.toLowerCase()
  if (firstNicheWord) return firstNicheWord

  return 'this topic'
}

function buildSanitizedConfigPayload(values: NicheConfig): NicheConfig {
  const topic = resolveReelCtaTopic(values)
  const sanitizedCtas = (values.cta_options || []).map((opt) => ({
    ...opt,
    text: (opt.text || '').replace(/\{cta_topic\}/g, topic),
  }))

  return {
    ...values,
    cta_options: sanitizedCtas,
  }
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

export interface NicheConfigFormProps {
  /** When set, only render this single section (no save bar, no strength meter, no AI block). */
  section?: 'general' | 'reels' | 'posts'
  /** Called when AI generation starts/stops — parent can block navigation. */
  onGeneratingChange?: (generating: boolean) => void
  /** Called when YouTube Title Style section validity changes (has titles OR skipped). */
  onYtValidChange?: (valid: boolean) => void
  /** Whether the user has YouTube connected — hides YT section during onboarding when false. */
  ytConnected?: boolean
  /** Called when niche_name field changes — reports whether it has content. */
  onNicheNameChange?: (filled: boolean) => void
  /** When set, load/save from the Content DNA profile API instead of legacy NicheConfig. */
  dnaId?: string
}

export interface NicheConfigFormHandle {
  /** Flush any pending auto-save immediately. Safe to call even if nothing is dirty. */
  saveNow: () => Promise<void>
}

export const NicheConfigForm = forwardRef<NicheConfigFormHandle, NicheConfigFormProps>(function NicheConfigForm({ section, onGeneratingChange, onYtValidChange, ytConnected, onNicheNameChange, dnaId } = {}, ref) {
  // Legacy NicheConfig hooks (used when no dnaId)
  const nicheQuery = useNicheConfig()
  // Content DNA hooks (used when dnaId is provided)
  const dnaQuery = useContentDNAProfile(dnaId)
  const updateDnaMutation = useUpdateContentDNA()

  // Pick source based on whether we're editing a DNA profile or legacy config
  const data = dnaId ? (dnaQuery.data?.profile as unknown as typeof nicheQuery.data) : nicheQuery.data
  const isLoading = dnaId ? dnaQuery.isLoading : nicheQuery.isLoading

  const { data: brandsData } = useBrands()
  const legacyUpdateMutation = useUpdateNicheConfig()
  const updateMutation = dnaId
    ? { mutateAsync: async (payload: Record<string, unknown>) => { await updateDnaMutation.mutateAsync({ dnaId, data: payload }); return payload }, isPending: updateDnaMutation.isPending }
    : legacyUpdateMutation
  const aiMutation = useAiUnderstanding()
  const reelPreviewMutation = useReelPreview()
  const ytSuggestMutation = useSuggestYtTitles()
  const importIgMutation = useImportFromInstagram()
  const fontsReady = useFontPreload()

  const [values, setValues] = useState<NicheConfig>(DEFAULT_CONFIG)
  const [dirty, setDirty] = useState(false)
  const [aiResult, setAiResult] = useState<{
    understanding: string
    example_reel: { title: string; content_lines: string[] } | null
    example_post: { title: string; slides: string[]; study_ref?: string } | null
  } | null>(null)
  const [reelImages, setReelImages] = useState<{
    thumbnail_base64: string
    content_base64: string
  } | null>(null)
  const [skipYt, setSkipYt] = useState(false)
  const [importAttempts, setImportAttempts] = useState(0)
  const [importCooldownUntil, setImportCooldownUntil] = useState<number>(0)

  // Report niche_name state to parent (e.g. Onboarding step 4 validation)
  useEffect(() => {
    if (onNicheNameChange) onNicheNameChange(Boolean(values.niche_name?.trim()))
  }, [values.niche_name, onNicheNameChange])

  // Auto-skip YouTube section during onboarding when YT is not connected
  useEffect(() => {
    if (section === 'reels' && ytConnected === false) setSkipYt(true)
  }, [section, ytConnected])

  // Report reels step validity to parent (YT titles valid AND enough reel examples)
  useEffect(() => {
    if (section !== 'reels' || !onYtValidChange) return
    const ytHidden = section === 'reels' && ytConnected === false
    const hasGoodTitles = (values.yt_title_examples || []).some(t => t.trim().length > 0)
    const hasEnoughReels = values.reel_examples.length >= 10
    onYtValidChange((ytHidden || skipYt || hasGoodTitles) && hasEnoughReels)
  }, [skipYt, values.yt_title_examples, values.reel_examples.length, section, onYtValidChange, ytConnected])

  // Pick a random brand for carousel previews — stable for the whole component lifetime
  const previewBrand = useMemo(() => {
    const available = brandsData?.map(b => b.id) || []
    return available[Math.floor(Math.random() * available.length)] || ''
  }, [brandsData])

  // Effective brand for reel preview API
  const effectiveBrand = previewBrand

  // Brand data from DB for the effective brand (handle, display name, color)
  const effectiveBrandData = useMemo(
    () => brandsData?.find(b => b.id === effectiveBrand),
    [brandsData, effectiveBrand]
  )

  // Fetch brand logo URL from theme endpoint
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!effectiveBrand) { setBrandLogoUrl(null); return }
    apiClient.get<{ theme?: { logo?: string } }>(`/api/brands/${effectiveBrand}/theme`)
      .then(data => {
        const logo = data.theme?.logo
        if (logo) {
          setBrandLogoUrl(logo.startsWith('http') ? logo : `/brand-logos/${logo}`)
        } else {
          setBrandLogoUrl(null)
        }
      })
      .catch(() => setBrandLogoUrl(null))
  }, [effectiveBrand])

  useEffect(() => {
    if (data) {
      const merged = { ...DEFAULT_CONFIG, ...data }
      // Keep defaults for carousel_cta_options when the API returns empty or all-blank entries
      const ctaOpts = data.carousel_cta_options
      if (!ctaOpts || ctaOpts.length === 0 || ctaOpts.every((o: { text?: string }) => !o.text?.trim())) {
        merged.carousel_cta_options = DEFAULT_CONFIG.carousel_cta_options
      }
      // Keep defaults for reel cta_options when the API returns empty or all-blank entries
      const reelCtaOpts = data.cta_options
      if (!reelCtaOpts || reelCtaOpts.length === 0 || reelCtaOpts.every((o: { text?: string }) => !o.text?.trim())) {
        merged.cta_options = DEFAULT_CONFIG.cta_options
      }
      setValues(merged)
      setDirty(false)
    }
  }, [data])

  // On mount: restore persisted AI result from localStorage
  useEffect(() => {
    const storageKey = 'ai-understanding-global'
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
  }, [])

  const update = <K extends keyof NicheConfig>(key: K, value: NicheConfig[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  // Onboarding only asks for niche_name + content_brief in General.
  // Derive Topic Categories / Target Audience from the brief when missing,
  // so Toby preflight does not fail after a completed onboarding flow.
  useEffect(() => {
    const brief = values.content_brief?.trim()
    if (!brief) return

    const needsTopics = (values.topic_categories?.length ?? 0) === 0
    const needsAudience = !values.target_audience?.trim()
    if (!needsTopics && !needsAudience) return

    const inferred = inferGeneralFieldsFromBrief(brief)
    const canFillTopics = needsTopics && inferred.topicCategories.length > 0
    const canFillAudience = needsAudience && Boolean(inferred.targetAudience)
    if (!canFillTopics && !canFillAudience) return

    const next = { ...values }
    let changed = false

    if (canFillTopics) {
      next.topic_categories = inferred.topicCategories
      // Also seed topic keywords if empty to keep the config coherent.
      if ((values.topic_keywords?.length ?? 0) === 0) {
        next.topic_keywords = inferred.topicCategories
      }
      changed = true
    }

    if (canFillAudience) {
      next.target_audience = inferred.targetAudience
      changed = true
    }

    if (changed) {
      setValues(next)
      setDirty(true)
    }
  }, [values])

  // Keep a ref to latest values for flushSave (used by onboarding saveNow)
  const valuesRef = useRef(values)
  valuesRef.current = values

  const generalFilled = Boolean(values.niche_name?.trim() && values.content_brief?.trim())

  // Section completion checks
  const generalComplete = Boolean(
    values.niche_name?.trim() && values.content_brief?.trim()
  )
  const reelsComplete = Boolean(
    values.reel_examples.length >= 5 &&
    values.cta_options.some(o => o.text?.trim()) &&
    values.yt_title_examples?.length
  )
  const postsComplete = Boolean(
    values.post_examples.length >= 1 &&
    values.carousel_cta_options.some(o => o.text?.trim()) &&
    values.citation_style && values.citation_style !== 'none'
  )
  const aiComplete = Boolean(aiResult)

  // Find first brand with Instagram connected (for "Import from Instagram" feature)
  const igBrand = useMemo(
    () => brandsData?.find(b => b.has_instagram),
    [brandsData],
  )

  const handleImportFromInstagram = useCallback(async () => {
    if (!igBrand) return
    // Cooldown check: disable after 2 failed attempts for 1 hour
    if (importCooldownUntil > Date.now()) {
      const minsLeft = Math.ceil((importCooldownUntil - Date.now()) / 60_000)
      toast.error(`Import is on cooldown. Try again in ${minsLeft} minute${minsLeft === 1 ? '' : 's'}.`)
      return
    }
    try {
      const result = await importIgMutation.mutateAsync({ brand_id: igBrand.id })
      if (result.niche_name || result.content_brief) {
        setValues(prev => ({
          ...prev,
          ...(result.niche_name ? { niche_name: result.niche_name } : {}),
          ...(result.content_brief ? { content_brief: result.content_brief } : {}),
        }))
        setDirty(true)
      }
      setImportAttempts(0)
      toast.success(`Analysed ${result.posts_analysed} posts — review the fields below, then click Save.`)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Import failed'
      const newAttempts = importAttempts + 1
      setImportAttempts(newAttempts)
      if (newAttempts >= 2) {
        setImportCooldownUntil(Date.now() + 60 * 60 * 1000)
        toast.error(`${msg}. Import disabled for 1 hour to avoid API rate limits.`)
      } else {
        toast.error(msg === 'Import failed' ? msg : `${msg} — you can fill in the fields manually.`)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [igBrand, importAttempts, importCooldownUntil])

  const handleSave = async () => {
    try {
      const payload = buildSanitizedConfigPayload(values)
      await updateMutation.mutateAsync(payload)
      setValues(payload)
      toast.success('Content DNA saved')
      setDirty(false)
    } catch {
      toast.error('Failed to save')
    }
  }

  // Save immediately (used before AI generation and by onboarding saveNow)
  const flushSave = useCallback(async () => {
    if (dirty) {
      const payload = buildSanitizedConfigPayload(valuesRef.current)
      await updateMutation.mutateAsync(payload)
      setValues(payload)
      setDirty(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  // Expose saveNow so parent (e.g. Onboarding) can flush before unmounting this form
  useImperativeHandle(ref, () => ({ saveNow: flushSave }), [flushSave])

  const handleAiUnderstanding = useCallback(async () => {
    // Flush unsaved changes before AI reads from DB
    await flushSave()
    setAiResult(null)
    setReelImages(null)
    const storageKey = 'ai-understanding-global'
    try {
      // Step 1: AI text generation (~15–30s)
      const result = await aiMutation.mutateAsync()

      // Persist immediately so results survive if user navigates away during reel render
      localStorage.setItem(storageKey, JSON.stringify(result))
      setAiResult(result)

      // Step 2: Reel image rendering (non-blocking — result already visible)
      if (result.example_reel) {
        try {
          const preview = await reelPreviewMutation.mutateAsync({
            brand_id: effectiveBrand,
            title: result.example_reel.title,
            content_lines: result.example_reel.content_lines,
          })
          setReelImages(preview)
        } catch {
          toast.error('Reel render failed — showing text results only')
        }
      }
    } catch {
      toast.error('Failed to generate AI understanding')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBrand])

  const handleRegenerate = useCallback(() => {
    localStorage.removeItem('ai-understanding-global')
    setAiResult(null)
    setReelImages(null)
    handleAiUnderstanding()
  }, [handleAiUnderstanding])

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ general: false, reels: false, posts: false, ai: false })
  const toggleSection = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  const [dnaTab, setDnaTab] = useState<'general' | 'reels' | 'posts'>('general')

  if (isLoading) return <NicheConfigSkeleton />

  const showAll = !section
  const showGeneral = section ? section === 'general' : dnaTab === 'general'
  const showReels = section ? section === 'reels' : dnaTab === 'reels'
  const showPosts = section ? section === 'posts' : dnaTab === 'posts'

  return (
    <div className="space-y-4 min-w-0">
      {/* Sticky Save Bar + Config Strength + Sub-tabs — only in full mode */}
      {showAll && <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Dna className="w-5 h-5 text-primary-500" />
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Content DNA</h2>
              <p className="text-xs text-gray-500">These settings control every reel, post, and visual.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(() => {
              const strength = getConfigStrength(values)
              return (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  strength === 'basic' ? 'bg-red-100 text-red-700' :
                  strength === 'good' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {strength}
                </span>
              )
            })()}
            <button
              onClick={handleSave}
              disabled={!dirty || updateMutation.isPending}
              className="flex items-center gap-2 px-5 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save
            </button>
          </div>
        </div>
        <div className="px-6 border-t border-gray-100">
          <nav className="flex gap-1">
            {([
              { key: 'general' as const, label: '🧬 General', complete: generalComplete },
              { key: 'reels' as const, label: '🎬 Reels', complete: reelsComplete },
              { key: 'posts' as const, label: '📱 Carousel', complete: postsComplete },
            ]).map(({ key, label, complete }) => (
              <button
                key={key}
                onClick={() => setDnaTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  dnaTab === key
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {label}
                {complete && <Check className="w-3 h-3 text-emerald-500" />}
              </button>
            ))}
          </nav>
        </div>
      </div>}

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 1: GENERAL
         ═══════════════════════════════════════════════════════════════════ */}
      {showGeneral && <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 space-y-5">
          {/* Import from Instagram */}
          {igBrand && (
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Instagram className="w-4 h-4 text-purple-600" />
                  <div>
                    <p className="text-sm font-medium text-purple-900">Import from Instagram</p>
                    <p className="text-xs text-purple-600">Auto-fill your niche and content brief by analysing your recent posts.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleImportFromInstagram}
                  disabled={importIgMutation.isPending || importCooldownUntil > Date.now()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium transition-colors"
                >
                  {importIgMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Analysing…
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Import
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Niche Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Niche Name</label>
            <input
              value={values.niche_name}
              onChange={(e) => update('niche_name', e.target.value)}
              placeholder="Example: Health & Wellness"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-400 mt-1">A short label for your niche (e.g. "Health & Wellness", "Personal Finance")</p>
          </div>

          {/* Content Brief */}
          <div>
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
      </div>}

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 2: REELS
         ═══════════════════════════════════════════════════════════════════ */}
      {showReels && <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-5 space-y-6">
          {!generalFilled && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-center">
              <p className="text-sm text-amber-700 font-medium">Fill in the General section first</p>
              <p className="text-xs text-amber-600 mt-0.5">Add your niche name and content brief to unlock AI-powered reel generation.</p>
            </div>
          )}
          {/* Reel Examples */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1">📝 Reel Examples ({values.reel_examples.length}/10 minimum)</h4>
            <p className="text-xs text-gray-400 mb-3">
              You need at least <strong className="text-gray-600">10 reel examples</strong> to continue. The AI learns directly from your examples — more examples means better content.
            </p>
            {values.reel_examples.length < 10 && values.reel_examples.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                <p className="text-xs text-amber-700">
                  <strong>{10 - values.reel_examples.length} more</strong> reel example{10 - values.reel_examples.length === 1 ? '' : 's'} needed to continue. Use "Generate 10 reels with AI" for a quick start.
                </p>
              </div>
            )}
            <ContentExamplesSection
              reelExamples={values.reel_examples}
              postExamples={values.post_examples}
              onReelExamplesChange={(v) => update('reel_examples', v)}
              onPostExamplesChange={(v) => update('post_examples', v)}
              showOnly="reels"
              generalFilled={generalFilled}
              nicheName={values.niche_name}
              contentBrief={values.content_brief}
              onBeforeGenerate={flushSave}
              onGeneratingChange={onGeneratingChange}
            />
          </div>

          {/* Reel CTAs */}
          <div className="border-t border-gray-100 pt-5">
            <h4 className="text-sm font-medium text-gray-700 mb-1">💬 Reel CTAs & Captions</h4>
            <p className="text-xs text-gray-400 mb-4">
              These CTAs are used for <strong>reels only</strong>. The AI randomly picks one based on the weights you assign. Carousel post CTAs are configured separately in the Carousel Posts section.
              Placeholders like <code className="text-xs bg-gray-100 px-1 rounded">{'{cta_topic}'}</code> are auto-resolved on save based on your niche/topic keywords.
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

          {/* YouTube Title Style — hidden during onboarding when YT not connected */}
          {!(section === 'reels' && ytConnected === false) && (
          <div className="border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-medium text-gray-700">🎬 YouTube Title Style</h4>
              {!skipYt && (
                <button
                  type="button"
                  onClick={async () => {
                    await flushSave()
                    ytSuggestMutation.mutate(undefined, {
                      onSuccess: (data) => {
                        if (data.good_titles?.length) {
                          update('yt_title_examples', data.good_titles)
                        }
                        if (data.bad_titles?.length) {
                          update('yt_title_bad_examples', data.bad_titles)
                        }
                        toast.success('AI suggestions applied — review and edit as needed')
                      },
                      onError: () => toast.error('Failed to generate suggestions'),
                    })
                  }}
                  disabled={ytSuggestMutation.isPending || !generalFilled}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {ytSuggestMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  {ytSuggestMutation.isPending ? 'Suggesting...' : 'Suggest with AI'}
                </button>
              )}
            </div>

            {/* Skip YT checkbox — only shown during onboarding (section mode) */}
            {section === 'reels' && (
              <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={skipYt}
                  onChange={(e) => setSkipYt(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-500">I don't want YouTube for now</span>
              </label>
            )}

            {!skipYt && (
              <>
                <p className="text-xs text-gray-400 mb-4">
                  Provide example titles to teach the AI your preferred YouTube title patterns. Use "Suggest with AI" to get recommendations based on your Content DNA.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Good Title Examples</label>
                    <textarea
                      value={(values.yt_title_examples || []).join('\n')}
                      onChange={(e) => update('yt_title_examples', e.target.value.split('\n').filter(Boolean))}
                      placeholder={"One title per line, e.g.:\nThe Sleep Trick That Changed Everything\nWhat Really Happens When You Fast 16 Hours"}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">Titles the AI should emulate. One per line.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bad Title Examples (avoid these)</label>
                    <textarea
                      value={(values.yt_title_bad_examples || []).join('\n')}
                      onChange={(e) => update('yt_title_bad_examples', e.target.value.split('\n').filter(Boolean))}
                      placeholder={"One title per line, e.g.:\nYOU WON'T BELIEVE THIS HACK!!!\n10 FOODS YOU MUST EAT NOW"}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">Anti-patterns the AI should avoid. One per line.</p>
                  </div>
                </div>
              </>
            )}
          </div>
          )}
        </div>
      </div>}

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 3: CAROUSEL POSTS
         ═══════════════════════════════════════════════════════════════════ */}
      {showPosts && <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 space-y-6">
          {!generalFilled && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-center">
              <p className="text-sm text-amber-700 font-medium">Fill in the General section first</p>
              <p className="text-xs text-amber-600 mt-0.5">Add your niche name and content brief to unlock AI-powered post generation.</p>
            </div>
          )}
          {/* Post Examples */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1">📝 Post Examples</h4>
            <p className="text-xs text-gray-400 mb-3">
              The AI learns directly from your examples. Providing 10+ examples dramatically improves content relevance and quality.
            </p>
            <ContentExamplesSection
              reelExamples={values.reel_examples}
              postExamples={values.post_examples}
              onReelExamplesChange={(v) => update('reel_examples', v)}
              onPostExamplesChange={(v) => update('post_examples', v)}
              showOnly="posts"
              generalFilled={generalFilled}
              onBeforeGenerate={flushSave}
              onGeneratingChange={onGeneratingChange}
            />
          </div>

          {/* Citation Style */}
          <div className="border-t border-gray-100 pt-5">
            <h4 className="text-sm font-medium text-gray-700 mb-3">📚 Citation Style</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Citation Style</label>
              <select
                value={values.citation_style}
                onChange={(e) => update('citation_style', e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="none">None — no source citations</option>
                <option value="doi">Academic — study name, institution & year</option>
                <option value="url">URL — web source links</option>
                <option value="named">Named — mention source by name</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">How (or whether) the AI should cite sources in carousel posts.</p>
            </div>
          </div>

          {/* Carousel CTA */}
          <div className="border-t border-gray-100 pt-5">
            <h4 className="text-sm font-medium text-gray-700 mb-3">🌑 Dark Overlay Opacity</h4>
            <p className="text-xs text-gray-400 mb-4">
              Controls the dark overlay strength on carousel slides (dark mode only). Higher values = darker background, better text readability.
            </p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cover Slide</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={values.carousel_cover_overlay_opacity}
                    onChange={(e) => update('carousel_cover_overlay_opacity', parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-stone-800"
                  />
                  <span className="text-sm font-medium text-gray-700 w-10 text-right">{values.carousel_cover_overlay_opacity}%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Applied to the cover/thumbnail slide</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content Slides</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={values.carousel_content_overlay_opacity}
                    onChange={(e) => update('carousel_content_overlay_opacity', parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-stone-800"
                  />
                  <span className="text-sm font-medium text-gray-700 w-10 text-right">{values.carousel_content_overlay_opacity}%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Applied to text/content slides</p>
              </div>
            </div>
          </div>

          {/* Carousel CTA */}
          <div className="border-t border-gray-100 pt-5">
            <h4 className="text-sm font-medium text-gray-700 mb-1">💬 Carousel CTA</h4>
            <p className="text-xs text-gray-400 mb-4">
              These CTAs appear on the <strong>last slide</strong> of carousel posts. The AI randomly picks one based on weights. <code className="text-xs bg-gray-100 px-1 rounded">{'{cta_topic}'}</code> is auto-filled from your niche/keywords. <code className="text-xs bg-gray-100 px-1 rounded">@{'{brandhandle}'}</code> uses your brand's Instagram handle.
            </p>

            {/* CTA Options (weighted) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">CTA Options ({values.carousel_cta_options.length}/10)</label>
                <div className="flex gap-2">
                  {values.carousel_cta_options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const equalWeight = Math.floor(100 / values.carousel_cta_options.length)
                        const remainder = 100 - equalWeight * values.carousel_cta_options.length
                        update('carousel_cta_options', values.carousel_cta_options.map((opt, i) => ({
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
                      if (values.carousel_cta_options.length >= 10) return
                      update('carousel_cta_options', [...values.carousel_cta_options, { text: '', weight: 0 }])
                    }}
                    disabled={values.carousel_cta_options.length >= 10}
                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3 h-3" />
                    Add CTA
                  </button>
                </div>
              </div>



              <div className="space-y-2">
                {values.carousel_cta_options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={opt.text}
                      onChange={(e) => {
                        const updated = [...values.carousel_cta_options]
                        updated[i] = { ...updated[i], text: e.target.value }
                        update('carousel_cta_options', updated)
                      }}
                      placeholder="e.g. Follow @{brandhandle} to learn more about {cta_topic}"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={opt.weight}
                        onChange={(e) => {
                          const updated = [...values.carousel_cta_options]
                          updated[i] = { ...updated[i], weight: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }
                          update('carousel_cta_options', updated)
                        }}
                        className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        update('carousel_cta_options', values.carousel_cta_options.filter((_, j) => j !== i))
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {values.carousel_cta_options.length > 0 && (() => {
                const totalWeight = values.carousel_cta_options.reduce((sum, opt) => sum + opt.weight, 0)
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
      </div>}

      {/* ═══════════════════════════════════════════════════════════════════
          BLOCK 4: AI UNDERSTANDING — only in full mode
         ═══════════════════════════════════════════════════════════════════ */}
      {showAll && <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button type="button" onClick={() => toggleSection('ai')} className={`w-full px-6 py-4 border-b border-gray-200 cursor-pointer transition-colors ${aiComplete ? 'bg-gradient-to-r from-emerald-50 to-green-50 hover:from-emerald-100 hover:to-green-100' : 'bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100'}`}>
          <div className="flex items-center justify-between">
            <div className="text-left">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles className={`w-4 h-4 ${aiComplete ? 'text-emerald-500' : 'text-indigo-500'}`} />
                AI Understanding of Your Brand
                {aiComplete && <Check className="w-3.5 h-3.5 text-emerald-500" />}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Ask the AI to describe how it interprets your Content DNA configuration
              </p>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${collapsed.ai ? '-rotate-90' : ''}`} />
          </div>
        </button>

        {!collapsed.ai && <>
        <div className="px-6 py-3 flex items-center justify-end gap-2 border-b border-gray-100">
          {aiResult && (
            <button
              onClick={handleRegenerate}
              disabled={aiMutation.isPending || reelPreviewMutation.isPending || !generalFilled}
              className="flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate
            </button>
          )}
          <button
            onClick={handleAiUnderstanding}
            disabled={aiMutation.isPending || reelPreviewMutation.isPending || !generalFilled}
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

        {aiResult && (
          <div className="px-6 py-4 space-y-4 min-w-0">
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
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {reelImages ? 'Real render (light mode)' : reelPreviewMutation.isPending ? 'Rendering...' : 'Waiting'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
                      <div className="grid grid-cols-2 gap-3">
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

                {/* Carousel Post Preview */}
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
                      <div className="shrink-0 rounded-lg overflow-hidden shadow-md">
                        <PostCanvas
                          key={`cover-${effectiveBrand}-${fontsReady}`}
                          brand={effectiveBrand}
                          title={aiResult.example_post.title}
                          backgroundImage={null}
                          settings={DEFAULT_GENERAL_SETTINGS}
                          scale={0.2}
                          logoUrl={brandLogoUrl}
                        />
                      </div>
                      {aiResult.example_post.slides.map((slide, i) => {
                        let cleanSlide = slide.replace(/^Slide\s*\d+\s*:\s*/i, '')
                        if (i === aiResult.example_post!.slides.length - 1) {
                          cleanSlide = cleanSlide.replace(
                            /([.!?])\s*((?:For more|Follow @|If you care|Want more)\S*.*)/i,
                            (_m, punct, cta) => `${punct}\n\n${cta}`
                          )
                        }
                        return (
                          <div key={i} className="shrink-0 rounded-lg overflow-hidden shadow-md">
                            <CarouselTextSlide
                              key={`slide-${i}-${effectiveBrand}-${fontsReady}`}
                              brand={effectiveBrand}
                              text={cleanSlide}
                              allSlideTexts={aiResult.example_post!.slides.map(s => s.replace(/^Slide\s*\d+\s*:\s*/i, ''))}
                              isLastSlide={i === aiResult.example_post!.slides.length - 1}
                              scale={0.2}
                              logoUrl={brandLogoUrl}
                              brandHandle={effectiveBrandData?.instagram_handle}
                              brandDisplayName={effectiveBrandData?.display_name}
                              brandColor={effectiveBrandData?.colors?.primary}
                            />
                          </div>
                        )
                      })}
                    </div>
                    {aiResult.example_post.study_ref && (
                      <p className="text-[10px] text-gray-500 mt-2 font-mono">
                        Study: {aiResult.example_post.study_ref}
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
        </>}
      </div>}
    </div>
  )
})
