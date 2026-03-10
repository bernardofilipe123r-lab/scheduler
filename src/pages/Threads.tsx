/**
 * Threads page — wizard-based workflow for creating and scheduling
 * text-only Threads content across multiple brands.
 *
 * 3-step wizard:
 *  1. Select brands (multi-select, same pattern as Reels)
 *  2. Choose mode (Auto / Manual) + posts per brand count
 *  3. Generate / write → review → auto-schedule
 */
import { useState, useMemo } from 'react'
import {
  Check,
  ArrowLeft,
  Zap,
  PenLine,
  Loader2,
  Wand2,
  Clock,
  Trash2,
  Plus,
  CalendarClock,
  RefreshCw,
  Link2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useDynamicBrands, useBrandConnections } from '@/features/brands'
import {
  useGenerateBulk,
  useScheduleThread,
  useAutoScheduleThread,
  useFormatTypes,
} from '@/features/threads'

const MAX_CHARS = 500
const MAX_CHAIN_PARTS = 12

type WizardStep = 'brands' | 'config' | 'generate'

interface GeneratedPost {
  text: string
  format_type: string
  scheduled?: boolean
}

type BrandPosts = Record<string, GeneratedPost[]>

export function ThreadsPage() {
  // ── All hooks BEFORE any early return ──────────────────────────────
  const { brands, isLoading: brandsLoading } = useDynamicBrands()
  const { data: connectionsData } = useBrandConnections()
  const { data: formatTypes } = useFormatTypes()
  const generateBulk = useGenerateBulk()
  const scheduleThread = useScheduleThread()
  const autoScheduleThread = useAutoScheduleThread()

  // Wizard
  const [step, setStep] = useState<WizardStep>('brands')
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [allBrands, setAllBrands] = useState(true)
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [postsPerBrand, setPostsPerBrand] = useState(4)
  const [formatType, setFormatType] = useState<string | null>(null)

  // Auto generation
  const [generatedPosts, setGeneratedPosts] = useState<BrandPosts>({})
  const [generatingBrand, setGeneratingBrand] = useState<string | null>(null)
  const [schedulingAll, setSchedulingAll] = useState(false)
  const [schedulingPost, setSchedulingPost] = useState<string | null>(null)

  // Manual mode
  const [manualBrandIdx, setManualBrandIdx] = useState(0)
  const [manualTab, setManualTab] = useState<'single' | 'chain'>('single')
  const [manualText, setManualText] = useState('')
  const [chainParts, setChainParts] = useState<string[]>(['', ''])
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleTime, setScheduleTime] = useState('')

  // ── Derived ────────────────────────────────────────────────────────
  const threadsConnectedBrands = useMemo(() => {
    if (!connectionsData?.brands) return brands
    const connectedIds = new Set(
      connectionsData.brands
        .filter((b: any) => b.threads?.connected)
        .map((b: any) => b.brand)
    )
    return brands.filter(b => connectedIds.has(b.id))
  }, [brands, connectionsData])

  const effectiveBrands = useMemo(() => {
    if (allBrands) return threadsConnectedBrands
    return threadsConnectedBrands.filter(b => selectedBrands.includes(b.id))
  }, [allBrands, selectedBrands, threadsConnectedBrands])

  const totalPosts = effectiveBrands.length * postsPerBrand

  const remainingPosts = useMemo(() => {
    let n = 0
    for (const posts of Object.values(generatedPosts)) {
      n += posts.filter(p => !p.scheduled).length
    }
    return n
  }, [generatedPosts])

  const currentManualBrand = effectiveBrands[manualBrandIdx] || effectiveBrands[0]

  const isPublishing = scheduleThread.isPending || autoScheduleThread.isPending

  // ── Brand selection ────────────────────────────────────────────────
  const toggleBrand = (id: string) => {
    if (allBrands) {
      setAllBrands(false)
      setSelectedBrands([id])
      return
    }
    setSelectedBrands(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    )
  }

  // ── Auto generate ─────────────────────────────────────────────────
  const handleGenerateAll = async () => {
    const init: BrandPosts = {}
    for (const b of effectiveBrands) init[b.id] = []
    setGeneratedPosts(init)

    for (const brand of effectiveBrands) {
      setGeneratingBrand(brand.id)
      try {
        const result = await generateBulk.mutateAsync({
          brand_id: brand.id,
          count: postsPerBrand,
          format_type: formatType ?? undefined,
        })
        setGeneratedPosts(prev => ({
          ...prev,
          [brand.id]: result.map((p: any) => ({ ...p, scheduled: false })),
        }))
      } catch {
        toast.error('Failed for ' + brand.label)
      }
    }
    setGeneratingBrand(null)
  }

  const handleRegenerateBrand = async (brandId: string) => {
    setGeneratingBrand(brandId)
    try {
      const result = await generateBulk.mutateAsync({
        brand_id: brandId,
        count: postsPerBrand,
        format_type: formatType ?? undefined,
      })
      setGeneratedPosts(prev => ({
        ...prev,
        [brandId]: result.map((p: any) => ({ ...p, scheduled: false })),
      }))
    } catch {
      toast.error('Regeneration failed')
    }
    setGeneratingBrand(null)
  }

  const handleScheduleAll = async () => {
    setSchedulingAll(true)
    let count = 0
    for (const [brandId, posts] of Object.entries(generatedPosts)) {
      for (let i = 0; i < posts.length; i++) {
        if (posts[i].scheduled) continue
        try {
          await autoScheduleThread.mutateAsync({
            brand_id: brandId,
            text: posts[i].text,
            is_chain: false,
          })
          setGeneratedPosts(prev => ({
            ...prev,
            [brandId]: prev[brandId].map((p, j) =>
              j === i ? { ...p, scheduled: true } : p
            ),
          }))
          count++
        } catch {
          /* continue with next */
        }
      }
    }
    setSchedulingAll(false)
    if (count > 0) toast.success(count + ' posts scheduled!')
  }

  const handleSchedulePost = async (brandId: string, index: number) => {
    const key = brandId + '-' + index
    setSchedulingPost(key)
    try {
      const r = await autoScheduleThread.mutateAsync({
        brand_id: brandId,
        text: generatedPosts[brandId][index].text,
        is_chain: false,
      })
      setGeneratedPosts(prev => ({
        ...prev,
        [brandId]: prev[brandId].map((p, i) =>
          i === index ? { ...p, scheduled: true } : p
        ),
      }))
      const dt = new Date(r.scheduled_for)
      toast.success(
        'Scheduled ' +
          dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      )
    } catch (e: any) {
      toast.error(e?.message || 'Failed')
    }
    setSchedulingPost(null)
  }

  const handleDeletePost = (brandId: string, index: number) => {
    setGeneratedPosts(prev => ({
      ...prev,
      [brandId]: prev[brandId].filter((_, i) => i !== index),
    }))
  }

  const handleEditPost = (brandId: string, index: number, text: string) => {
    setGeneratedPosts(prev => ({
      ...prev,
      [brandId]: prev[brandId].map((p, i) =>
        i === index ? { ...p, text } : p
      ),
    }))
  }

  // ── Manual handlers ────────────────────────────────────────────────
  const handleManualAutoSchedule = async () => {
    if (!currentManualBrand) return
    const isChain = manualTab === 'chain'
    const text = isChain ? chainParts[0] || '' : manualText
    const parts = isChain ? chainParts.filter(p => p.trim()) : undefined
    if (!text.trim()) {
      toast.error('Write something first')
      return
    }
    if (isChain && (parts?.length || 0) < 2) {
      toast.error('Need at least 2 parts')
      return
    }
    try {
      const r = await autoScheduleThread.mutateAsync({
        brand_id: currentManualBrand.id,
        text,
        is_chain: isChain,
        chain_parts: parts,
      })
      const dt = new Date(r.scheduled_for)
      toast.success(
        'Scheduled for ' +
          dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      )
      if (isChain) setChainParts(['', ''])
      else setManualText('')
    } catch (e: any) {
      toast.error(e?.message || 'Failed')
    }
  }

  const handleManualSchedule = async () => {
    if (!currentManualBrand || !scheduleTime) return
    const isChain = manualTab === 'chain'
    const text = isChain ? chainParts[0] || '' : manualText
    if (!text.trim()) {
      toast.error('Write something first')
      return
    }
    try {
      await scheduleThread.mutateAsync({
        brand_id: currentManualBrand.id,
        text,
        scheduled_time: new Date(scheduleTime).toISOString(),
        is_chain: isChain,
        chain_parts: isChain ? chainParts.filter(p => p.trim()) : undefined,
      })
      toast.success('Scheduled!')
      setShowSchedule(false)
      setScheduleTime('')
      if (isChain) setChainParts(['', ''])
      else setManualText('')
    } catch (e: any) {
      toast.error(e?.message || 'Failed')
    }
  }

  const addChainPart = () => {
    if (chainParts.length < MAX_CHAIN_PARTS) setChainParts([...chainParts, ''])
  }
  const removeChainPart = (i: number) => {
    if (chainParts.length > 2) setChainParts(chainParts.filter((_, j) => j !== i))
  }
  const updateChainPart = (i: number, t: string) => {
    setChainParts(chainParts.map((p, j) => (j === i ? t : p)))
  }

  // ── Navigation ─────────────────────────────────────────────────────
  const goToConfig = () => {
    if (effectiveBrands.length === 0) {
      toast.error('Select at least one brand')
      return
    }
    setStep('config')
  }

  const goToGenerate = () => {
    setStep('generate')
    if (mode === 'auto') handleGenerateAll()
  }

  const goBack = () => {
    if (step === 'config') setStep('brands')
    else if (step === 'generate') {
      setStep('config')
      setGeneratedPosts({})
      setGeneratingBrand(null)
    }
  }

  const startOver = () => {
    setStep('brands')
    setGeneratedPosts({})
    setGeneratingBrand(null)
    setManualText('')
    setChainParts(['', ''])
    setShowSchedule(false)
    setFormatType(null)
  }

  // ── Early returns (after all hooks) ────────────────────────────────
  if (brandsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (threadsConnectedBrands.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
          <Link2 className="w-6 h-6 text-gray-400" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">
          Connect Threads First
        </h2>
        <p className="text-sm text-gray-500">
          Go to{' '}
          <span className="text-stone-800 font-semibold">Brands</span> and
          connect your Threads account.
        </p>
      </div>
    )
  }

  const stepList: WizardStep[] = ['brands', 'config', 'generate']
  const stepIdx = stepList.indexOf(step)

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div
      className={`mx-auto py-6 ${
        step === 'generate' ? 'max-w-4xl px-6' : 'max-w-2xl'
      }`}
    >
      {/* Progress header (steps 1 & 2 only) */}
      {step !== 'generate' && (
        <div className="flex items-center justify-between mb-8">
          {step !== 'brands' ? (
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-1.5">
            {stepList.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i <= stepIdx ? 'bg-stone-800' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 1: BRANDS
          ═══════════════════════════════════════════════════════════════ */}
      {step === 'brands' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Which brands?</h1>
            <p className="text-sm text-gray-500 mt-1">
              Select brands to create Threads content for
            </p>
          </div>

          {/* All Brands toggle */}
          <button
            onClick={() => {
              setAllBrands(a => !a)
              if (!allBrands) setSelectedBrands([])
            }}
            className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border-2 transition-all ${
              allBrands
                ? 'border-stone-800 bg-stone-50 shadow-sm'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  allBrands ? 'bg-stone-800' : 'bg-gray-100'
                }`}
              >
                <Check
                  className={`w-4 h-4 ${
                    allBrands ? 'text-white' : 'text-gray-400'
                  }`}
                />
              </div>
              <div className="text-left">
                <span className="text-sm font-semibold text-gray-900">
                  All Brands
                </span>
                <p className="text-xs text-gray-500">
                  {threadsConnectedBrands.length} brand(s) with Threads
                </p>
              </div>
            </div>
            {allBrands && (
              <span className="text-xs font-semibold bg-stone-200 text-stone-700 px-2.5 py-1 rounded-full">
                {threadsConnectedBrands.length} selected
              </span>
            )}
          </button>

          {/* Individual brand cards */}
          <div className="grid grid-cols-2 gap-2">
            {threadsConnectedBrands.map(brand => {
              const active = allBrands || selectedBrands.includes(brand.id)
              return (
                <button
                  key={brand.id}
                  onClick={() => toggleBrand(brand.id)}
                  style={active ? { borderColor: brand.color } : undefined}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                    active
                      ? 'shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div
                    style={{
                      backgroundColor: active ? brand.color : 'transparent',
                      border: active ? 'none' : '2px solid ' + brand.color,
                    }}
                    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                  >
                    {active && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span
                    className={`text-sm font-medium truncate ${
                      active ? 'text-gray-900' : 'text-gray-600'
                    }`}
                  >
                    {brand.label}
                  </span>
                </button>
              )
            })}
          </div>

          {!allBrands && selectedBrands.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-stone-600 bg-stone-100 px-3 py-1.5 rounded-full">
                {selectedBrands.length} brand(s) selected
              </span>
            </div>
          )}

          <button
            onClick={goToConfig}
            disabled={effectiveBrands.length === 0}
            className="w-full py-3 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Continue
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 2: CONFIG
          ═══════════════════════════════════════════════════════════════ */}
      {step === 'config' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              How do you want to create?
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {effectiveBrands.length} brand(s) selected
            </p>
          </div>

          {/* Mode selection */}
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                {
                  id: 'auto' as const,
                  Icon: Zap,
                  label: '100% Automatic',
                  sub: 'AI generates everything',
                },
                {
                  id: 'manual' as const,
                  Icon: PenLine,
                  label: 'Manual',
                  sub: 'Write your own posts',
                },
              ] as const
            ).map(opt => (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all ${
                  mode === opt.id
                    ? 'border-stone-800 bg-stone-50 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    mode === opt.id ? 'bg-stone-800' : 'bg-gray-100'
                  }`}
                >
                  <opt.Icon
                    className={`w-5 h-5 ${
                      mode === opt.id ? 'text-white' : 'text-gray-400'
                    }`}
                  />
                </div>
                <div className="text-center">
                  <span className="text-sm font-semibold text-gray-900 block">
                    {opt.label}
                  </span>
                  <span className="text-xs text-gray-500">{opt.sub}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Posts per brand (auto only) */}
          {mode === 'auto' && (
            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-gray-900">
                      Posts per brand
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {totalPosts} total across {effectiveBrands.length} brand(s)
                    </p>
                  </div>
                  <select
                    value={postsPerBrand}
                    onChange={e => setPostsPerBrand(Number(e.target.value))}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-stone-400"
                  >
                    {[2, 3, 4, 5, 6, 8, 10].map(n => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Format type picker */}
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <div>
                  <span className="text-sm font-semibold text-gray-900">Format type</span>
                  <p className="text-xs text-gray-500 mt-0.5">Choose a style or let Toby mix them</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFormatType(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      formatType === null
                        ? 'bg-stone-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Mix (All Formats)
                  </button>
                  {(formatTypes ?? []).map(ft => (
                    <button
                      key={ft.id}
                      onClick={() => setFormatType(formatType === ft.id ? null : ft.id)}
                      title={ft.description}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        formatType === ft.id
                          ? 'bg-stone-900 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {ft.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <button
            onClick={goToGenerate}
            className="w-full py-3 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {mode === 'auto' ? (
              <>
                <Wand2 className="w-4 h-4" />
                Generate {totalPosts} Posts
              </>
            ) : (
              'Start Writing'
            )}
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 3: AUTO GENERATE
          ═══════════════════════════════════════════════════════════════ */}
      {step === 'generate' && mode === 'auto' && (
        <div className="space-y-5 animate-in fade-in duration-300">
          {/* Header bar */}
          <div className="flex items-center justify-between">
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-xs text-gray-500">
              {Object.values(generatedPosts).flat().length} posts &middot;{' '}
              {effectiveBrands.length} brands
            </span>
          </div>

          {/* Brand sections */}
          {effectiveBrands.map(brand => {
            const posts = generatedPosts[brand.id] || []
            const isGenerating = generatingBrand === brand.id

            return (
              <div key={brand.id} className="space-y-2">
                {/* Brand header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ background: brand.color }}
                    />
                    <span className="text-sm font-semibold text-gray-900">
                      {brand.label}
                    </span>
                    {isGenerating && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                    )}
                    {!isGenerating && posts.length > 0 && (
                      <span className="text-[10px] text-gray-400">
                        {posts.filter(p => p.scheduled).length}/{posts.length}{' '}
                        scheduled
                      </span>
                    )}
                  </div>
                  {!isGenerating && posts.length > 0 && (
                    <button
                      onClick={() => handleRegenerateBrand(brand.id)}
                      className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" /> Regenerate
                    </button>
                  )}
                </div>

                {/* Generating placeholder */}
                {isGenerating && posts.length === 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 p-6 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-400">
                      Generating...
                    </span>
                  </div>
                )}

                {/* Post cards */}
                {posts.map((post, i) => (
                  <div
                    key={i}
                    className={`bg-white rounded-xl border p-3 space-y-2 ${
                      post.scheduled
                        ? 'border-green-200 bg-green-50/30'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-[9px] font-medium uppercase tracking-wider text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-full shrink-0 mt-0.5">
                        {post.format_type}
                      </span>
                      {post.scheduled && (
                        <span className="text-[9px] font-medium text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full shrink-0 mt-0.5">
                          Scheduled
                        </span>
                      )}
                    </div>

                    {post.scheduled ? (
                      <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
                        {post.text}
                      </p>
                    ) : (
                      <textarea
                        value={post.text}
                        onChange={e =>
                          handleEditPost(brand.id, i, e.target.value)
                        }
                        rows={3}
                        maxLength={MAX_CHARS}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs text-gray-800 leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                      />
                    )}

                    {!post.scheduled && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleSchedulePost(brand.id, i)}
                          disabled={schedulingPost === brand.id + '-' + i}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-[10px] font-medium transition-colors"
                        >
                          {schedulingPost === brand.id + '-' + i ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          ) : (
                            <Clock className="w-2.5 h-2.5" />
                          )}
                          Schedule
                        </button>
                        <button
                          onClick={() => handleDeletePost(brand.id, i)}
                          className="flex items-center px-2 py-1 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-400 hover:text-red-500 text-[10px] transition-colors ml-auto"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          })}

          {/* Bottom actions */}
          {!generatingBrand && remainingPosts > 0 && (
            <div className="space-y-2 pt-2">
              <button
                onClick={handleScheduleAll}
                disabled={schedulingAll}
                className="w-full py-3 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
              >
                {schedulingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
                Schedule All ({remainingPosts} remaining)
              </button>
              <div className="text-center">
                <button
                  onClick={startOver}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Start Over
                </button>
              </div>
            </div>
          )}

          {!generatingBrand &&
            remainingPosts === 0 &&
            Object.values(generatedPosts).flat().length > 0 && (
              <div className="text-center py-4 space-y-2">
                <p className="text-sm font-medium text-green-600">
                  All posts scheduled!
                </p>
                <button
                  onClick={startOver}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Create More
                </button>
              </div>
            )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          STEP 3: MANUAL
          ═══════════════════════════════════════════════════════════════ */}
      {step === 'generate' && mode === 'manual' && (
        <div className="space-y-5 animate-in fade-in duration-300">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </div>

          {/* Brand pills (multi-brand only) */}
          {effectiveBrands.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {effectiveBrands.map((brand, i) => (
                <button
                  key={brand.id}
                  onClick={() => {
                    setManualBrandIdx(i)
                    setManualText('')
                    setChainParts(['', ''])
                    setShowSchedule(false)
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    manualBrandIdx === i
                      ? 'bg-stone-900 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: brand.color }}
                  />
                  {brand.label}
                </button>
              ))}
            </div>
          )}

          {/* Current brand indicator */}
          {currentManualBrand && (
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: currentManualBrand.color }}
              />
              <span className="text-sm font-semibold text-gray-900">
                {currentManualBrand.label}
              </span>
            </div>
          )}

          {/* Single / Chain toggle */}
          <div className="flex gap-1.5">
            {(
              [
                { id: 'single' as const, label: 'Single Post' },
                { id: 'chain' as const, label: 'Thread Chain' },
              ] as const
            ).map(t => (
              <button
                key={t.id}
                onClick={() => setManualTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  manualTab === t.id
                    ? 'bg-stone-900 text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Single post editor ── */}
          {manualTab === 'single' && (
            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="relative">
                  <textarea
                    value={manualText}
                    onChange={e => setManualText(e.target.value)}
                    rows={5}
                    maxLength={MAX_CHARS}
                    placeholder="Write your Threads post..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm leading-relaxed text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                  />
                  <span
                    className={`absolute bottom-2 right-3 text-[10px] ${
                      manualText.length > MAX_CHARS
                        ? 'text-red-500'
                        : manualText.length > MAX_CHARS * 0.8
                          ? 'text-amber-500'
                          : 'text-gray-400'
                    }`}
                  >
                    {manualText.length}/{MAX_CHARS}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleManualAutoSchedule}
                  disabled={isPublishing || !manualText.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-medium transition-colors"
                >
                  {autoScheduleThread.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Clock className="w-3.5 h-3.5" />
                  )}
                  Auto-Schedule
                </button>
                <button
                  onClick={() => setShowSchedule(!showSchedule)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors"
                >
                  <CalendarClock className="w-3.5 h-3.5" /> Schedule
                </button>
                <button
                  onClick={() => setManualText('')}
                  disabled={!manualText.trim()}
                  className="flex items-center px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-500 hover:text-red-600 disabled:opacity-40 text-xs transition-colors ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {showSchedule && (
                <div className="flex items-end gap-2.5 p-3 bg-white rounded-xl border border-gray-200">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Schedule for
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleManualSchedule}
                    disabled={scheduleThread.isPending || !scheduleTime}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-medium"
                  >
                    {scheduleThread.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CalendarClock className="w-3.5 h-3.5" />
                    )}
                    Confirm
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Chain editor ── */}
          {manualTab === 'chain' && (
            <div className="space-y-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                Write each post in the chain — published as connected replies
              </p>

              {chainParts.map((part, i) => (
                <div
                  key={i}
                  className="relative group bg-white rounded-xl border border-gray-200 p-2.5"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-stone-600 tabular-nums">
                      {i + 1}/{chainParts.length}
                    </span>
                    {chainParts.length > 2 && (
                      <button
                        onClick={() => removeChainPart(i)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <textarea
                      value={part}
                      onChange={e => updateChainPart(i, e.target.value)}
                      rows={3}
                      maxLength={MAX_CHARS}
                      placeholder={
                        i === 0
                          ? 'Start with a strong hook...'
                          : i === chainParts.length - 1
                            ? 'End with a CTA...'
                            : 'Continue the thread...'
                      }
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm leading-relaxed text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                    <span
                      className={`absolute bottom-1.5 right-2.5 text-[10px] ${
                        part.length > MAX_CHARS
                          ? 'text-red-500'
                          : 'text-gray-400'
                      }`}
                    >
                      {part.length}/{MAX_CHARS}
                    </span>
                  </div>
                </div>
              ))}

              {chainParts.length < MAX_CHAIN_PARTS && (
                <button
                  onClick={addChainPart}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-stone-800 transition-colors py-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add another post
                </button>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleManualAutoSchedule}
                  disabled={
                    isPublishing ||
                    chainParts.filter(p => p.trim()).length < 2
                  }
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-medium transition-colors"
                >
                  {autoScheduleThread.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Clock className="w-3.5 h-3.5" />
                  )}
                  Auto-Schedule
                </button>
                <button
                  onClick={() => setShowSchedule(!showSchedule)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors"
                >
                  <CalendarClock className="w-3.5 h-3.5" /> Schedule
                </button>
                <button
                  onClick={() => setChainParts(['', ''])}
                  className="flex items-center px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-500 hover:text-red-600 text-xs transition-colors ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {showSchedule && (
                <div className="flex items-end gap-2.5 p-3 bg-white rounded-xl border border-gray-200">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      Schedule for
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleManualSchedule}
                    disabled={scheduleThread.isPending || !scheduleTime}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-medium"
                  >
                    {scheduleThread.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CalendarClock className="w-3.5 h-3.5" />
                    )}
                    Confirm
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
