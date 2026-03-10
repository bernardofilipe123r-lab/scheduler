/**
 * Threads page — create and publish text-only content for Threads.
 *
 * Two modes:
 *  1. Auto: AI generates content, user reviews and publishes
 *  2. Manual: User writes posts directly (Threadify-style)
 *
 * Supports single posts and multi-post thread chains.
 */
import { useState, useEffect, useMemo } from 'react'
import {
  Wand2,
  Send,
  Loader2,
  Plus,
  Trash2,
  ChevronDown,
  Zap,
  PenLine,
  Link2,
  CalendarClock,
  RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useDynamicBrands, useBrandConnections } from '@/features/brands'
import {
  useGenerateSingle,
  useGenerateChain,
  useGenerateBulk,
  usePublishSingle,
  usePublishChain,
  useScheduleThread,
  useFormatTypes,
} from '@/features/threads'

const MAX_CHARS = 500
const MAX_CHAIN_PARTS = 12

export function ThreadsPage() {
  const { brands, isLoading: brandsLoading } = useDynamicBrands()
  const { data: connectionsData } = useBrandConnections()
  const { data: formatTypes } = useFormatTypes()

  const generateSingle = useGenerateSingle()
  const generateChain = useGenerateChain()
  const generateBulk = useGenerateBulk()
  const publishSingle = usePublishSingle()
  const publishChain = usePublishChain()
  const scheduleThread = useScheduleThread()

  // ── State ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [tab, setTab] = useState<'single' | 'chain'>('single')
  const [selectedBrand, setSelectedBrand] = useState('')
  const [formatType, setFormatType] = useState('')
  const [topicHint, setTopicHint] = useState('')

  // Single post state
  const [postText, setPostText] = useState('')

  // Chain state
  const [chainParts, setChainParts] = useState<string[]>(['', ''])
  const [chainTopic, setChainTopic] = useState('')
  const [chainPartsCount, setChainPartsCount] = useState(6)

  // Bulk state
  const [bulkCount, setBulkCount] = useState(4)
  const [bulkPosts, setBulkPosts] = useState<Array<{ text: string; format_type: string }>>([])

  // Schedule state
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleTime, setScheduleTime] = useState('')

  // Brands that have Threads connected
  const threadsConnectedBrands = useMemo(() => {
    if (!connectionsData?.brands) return brands
    const connectedIds = new Set(
      connectionsData.brands
        .filter(b => b.threads?.connected)
        .map(b => b.brand)
    )
    return brands.filter(b => connectedIds.has(b.id))
  }, [brands, connectionsData])

  // Select first connected brand
  useEffect(() => {
    if (!selectedBrand && threadsConnectedBrands.length > 0) {
      setSelectedBrand(threadsConnectedBrands[0].id)
    }
  }, [threadsConnectedBrands, selectedBrand])

  const isLoading = generateSingle.isPending || generateChain.isPending || generateBulk.isPending
  const isPublishing = publishSingle.isPending || publishChain.isPending || scheduleThread.isPending

  const selectedBrandInfo = brands.find(b => b.id === selectedBrand)

  // ── Handlers ───────────────────────────────────────────────────────

  const handleGenerateSingle = async () => {
    if (!selectedBrand) { toast.error('Select a brand first'); return }
    try {
      const result = await generateSingle.mutateAsync({
        brand_id: selectedBrand,
        format_type: formatType || undefined,
        topic_hint: topicHint || undefined,
      })
      setPostText(result.text)
      toast.success('Post generated!')
    } catch {
      toast.error('Failed to generate post')
    }
  }

  const handleGenerateChain = async () => {
    if (!selectedBrand) { toast.error('Select a brand first'); return }
    try {
      const result = await generateChain.mutateAsync({
        brand_id: selectedBrand,
        num_parts: chainPartsCount,
        topic_hint: chainTopic || topicHint || undefined,
      })
      setChainParts(result.parts)
      toast.success(`Thread chain generated (${result.parts.length} parts)!`)
    } catch {
      toast.error('Failed to generate thread chain')
    }
  }

  const handleGenerateBulk = async () => {
    if (!selectedBrand) { toast.error('Select a brand first'); return }
    try {
      const result = await generateBulk.mutateAsync({
        brand_id: selectedBrand,
        count: bulkCount,
      })
      setBulkPosts(result)
      toast.success(`${result.length} posts generated!`)
    } catch {
      toast.error('Failed to generate posts')
    }
  }

  const handlePublishSingle = async () => {
    if (!selectedBrand) { toast.error('Select a brand'); return }
    if (!postText.trim()) { toast.error('Write something first'); return }
    if (postText.length > MAX_CHARS) { toast.error(`Post exceeds ${MAX_CHARS} chars`); return }
    try {
      await publishSingle.mutateAsync({ brand_id: selectedBrand, text: postText })
      toast.success('Published to Threads!')
      setPostText('')
    } catch (e: any) {
      toast.error(e?.message || 'Publish failed')
    }
  }

  const handlePublishChain = async () => {
    if (!selectedBrand) { toast.error('Select a brand'); return }
    const validParts = chainParts.filter(p => p.trim())
    if (validParts.length < 2) { toast.error('Need at least 2 parts'); return }
    const tooLong = validParts.findIndex(p => p.length > MAX_CHARS)
    if (tooLong >= 0) { toast.error(`Part ${tooLong + 1} exceeds ${MAX_CHARS} chars`); return }
    try {
      await publishChain.mutateAsync({ brand_id: selectedBrand, parts: validParts })
      toast.success(`Thread chain published (${validParts.length} posts)!`)
      setChainParts(['', ''])
    } catch (e: any) {
      toast.error(e?.message || 'Chain publish failed')
    }
  }

  const handleSchedule = async () => {
    if (!selectedBrand) { toast.error('Select a brand'); return }
    if (!scheduleTime) { toast.error('Pick a time'); return }

    const isChain = tab === 'chain'
    const text = isChain ? (chainParts[0] || '') : postText
    if (!text.trim()) { toast.error('Write something first'); return }

    try {
      await scheduleThread.mutateAsync({
        brand_id: selectedBrand,
        text,
        scheduled_time: new Date(scheduleTime).toISOString(),
        is_chain: isChain,
        chain_parts: isChain ? chainParts.filter(p => p.trim()) : undefined,
      })
      toast.success('Scheduled for Threads!')
      setShowSchedule(false)
      setScheduleTime('')
    } catch (e: any) {
      toast.error(e?.message || 'Schedule failed')
    }
  }

  const handlePublishBulkItem = async (text: string, index: number) => {
    if (!selectedBrand) return
    try {
      await publishSingle.mutateAsync({ brand_id: selectedBrand, text })
      setBulkPosts(prev => prev.filter((_, i) => i !== index))
      toast.success('Published!')
    } catch {
      toast.error('Publish failed')
    }
  }

  // Chain part helpers
  const addChainPart = () => {
    if (chainParts.length < MAX_CHAIN_PARTS) setChainParts([...chainParts, ''])
  }
  const removeChainPart = (index: number) => {
    if (chainParts.length > 2) setChainParts(chainParts.filter((_, i) => i !== index))
  }
  const updateChainPart = (index: number, text: string) => {
    setChainParts(chainParts.map((p, i) => i === index ? text : p))
  }

  // ── Loading state ──────────────────────────────────────────────────
  if (brandsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  if (threadsConnectedBrands.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-800 flex items-center justify-center">
          <Link2 className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-100 mb-2">Connect Threads First</h2>
        <p className="text-zinc-400 mb-6">
          Go to <span className="text-teal-400 font-medium">Brands</span> and connect your Threads account to start creating content.
        </p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Threads</h1>
        <p className="text-sm text-zinc-400 mt-1">Create text-only posts and thread chains for Threads</p>
      </div>

      {/* Mode toggle + Brand selector row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Mode toggle */}
        <div className="inline-flex rounded-lg bg-zinc-800/60 p-1">
          <button
            onClick={() => setMode('auto')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === 'auto' ? 'bg-teal-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
            Auto
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === 'manual' ? 'bg-teal-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <PenLine className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
            Manual
          </button>
        </div>

        {/* Brand selector */}
        <div className="relative">
          <select
            value={selectedBrand}
            onChange={e => setSelectedBrand(e.target.value)}
            className="appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 pr-8 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {threadsConnectedBrands.map(b => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
        </div>

        {selectedBrandInfo && (
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: selectedBrandInfo.color }} />
            <span className="text-xs text-zinc-500">{selectedBrandInfo.label}</span>
          </div>
        )}
      </div>

      {/* ── AUTO MODE ─────────────────────────────────────────────── */}
      {mode === 'auto' && (
        <div className="space-y-5">
          {/* Tab: Single vs Chain vs Bulk */}
          <div className="flex gap-2">
            {[
              { id: 'single' as const, label: 'Single Post' },
              { id: 'chain' as const, label: 'Thread Chain' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'single' && (
            <div className="space-y-4">
              {/* Options row */}
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-zinc-500 mb-1">Topic (optional)</label>
                  <input
                    type="text"
                    value={topicHint}
                    onChange={e => setTopicHint(e.target.value)}
                    placeholder="e.g., morning routines, productivity"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div className="w-48">
                  <label className="block text-xs text-zinc-500 mb-1">Format type</label>
                  <select
                    value={formatType}
                    onChange={e => setFormatType(e.target.value)}
                    className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="">Random</option>
                    {formatTypes?.map(ft => (
                      <option key={ft.id} value={ft.id}>{ft.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerateSingle}
                disabled={isLoading || !selectedBrand}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {generateSingle.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                Generate Post
              </button>

              {/* Generated post */}
              {postText && (
                <div className="space-y-3">
                  <div className="relative">
                    <textarea
                      value={postText}
                      onChange={e => setPostText(e.target.value)}
                      rows={6}
                      maxLength={MAX_CHARS}
                      className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <span className={`absolute bottom-3 right-3 text-xs ${
                      postText.length > MAX_CHARS ? 'text-red-400' : 'text-zinc-500'
                    }`}>
                      {postText.length}/{MAX_CHARS}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handlePublishSingle}
                      disabled={isPublishing || !postText.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                    >
                      {publishSingle.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Publish Now
                    </button>
                    <button
                      onClick={() => setShowSchedule(!showSchedule)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium transition-colors"
                    >
                      <CalendarClock className="w-4 h-4" />
                      Schedule
                    </button>
                    <button
                      onClick={handleGenerateSingle}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Regenerate
                    </button>
                  </div>
                </div>
              )}

              {/* Schedule picker */}
              {showSchedule && (
                <div className="flex items-end gap-3 p-4 bg-zinc-800/60 rounded-xl border border-zinc-700">
                  <div className="flex-1">
                    <label className="block text-xs text-zinc-500 mb-1">Schedule for</label>
                    <input
                      type="datetime-local"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <button
                    onClick={handleSchedule}
                    disabled={scheduleThread.isPending || !scheduleTime}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium"
                  >
                    {scheduleThread.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                    Confirm
                  </button>
                </div>
              )}

              {/* Bulk generate section */}
              <div className="pt-4 border-t border-zinc-800">
                <h3 className="text-sm font-medium text-zinc-300 mb-3">Bulk Generate</h3>
                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Count</label>
                    <select
                      value={bulkCount}
                      onChange={e => setBulkCount(Number(e.target.value))}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      {[2, 3, 4, 5, 6, 8, 10].map(n => (
                        <option key={n} value={n}>{n} posts</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleGenerateBulk}
                    disabled={isLoading || !selectedBrand}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 text-sm font-medium transition-colors"
                  >
                    {generateBulk.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Generate Batch
                  </button>
                </div>

                {/* Bulk results */}
                {bulkPosts.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {bulkPosts.map((post, i) => (
                      <div key={i} className="bg-zinc-800/60 border border-zinc-700 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] uppercase tracking-wider text-teal-400 font-medium">
                              {post.format_type}
                            </span>
                            <p className="text-sm text-zinc-200 mt-1 whitespace-pre-wrap">{post.text}</p>
                          </div>
                          <button
                            onClick={() => handlePublishBulkItem(post.text, i)}
                            disabled={isPublishing}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-medium"
                          >
                            <Send className="w-3 h-3" />
                            Publish
                          </button>
                        </div>
                        <span className="text-[10px] text-zinc-500 mt-2 block">{post.text.length}/{MAX_CHARS} chars</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'chain' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-zinc-500 mb-1">Thread topic</label>
                  <input
                    type="text"
                    value={chainTopic}
                    onChange={e => setChainTopic(e.target.value)}
                    placeholder="e.g., 7 prompts to replace a mortgage broker"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-xs text-zinc-500 mb-1">Parts</label>
                  <select
                    value={chainPartsCount}
                    onChange={e => setChainPartsCount(Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
                      <option key={n} value={n}>{n} parts</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleGenerateChain}
                disabled={isLoading || !selectedBrand}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {generateChain.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Generate Thread Chain
              </button>

              {/* Chain parts editor */}
              {chainParts.some(p => p.trim()) && (
                <div className="space-y-3">
                  {chainParts.map((part, i) => (
                    <div key={i} className="relative group">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-teal-400 font-medium">
                          Part {i + 1}/{chainParts.length}
                        </span>
                        {chainParts.length > 2 && (
                          <button
                            onClick={() => removeChainPart(i)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3 text-zinc-500 hover:text-red-400" />
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
                            i === 0 ? 'Hook — grab attention...' :
                            i === chainParts.length - 1 ? 'Summary + CTA...' :
                            'Insight / value...'
                          }
                          className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
                        />
                        <span className={`absolute bottom-2 right-3 text-xs ${
                          part.length > MAX_CHARS ? 'text-red-400' : 'text-zinc-500'
                        }`}>
                          {part.length}/{MAX_CHARS}
                        </span>
                      </div>
                    </div>
                  ))}

                  {chainParts.length < MAX_CHAIN_PARTS && (
                    <button
                      onClick={addChainPart}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-teal-400 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add part
                    </button>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handlePublishChain}
                      disabled={isPublishing}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                    >
                      {publishChain.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Publish Chain
                    </button>
                    <button
                      onClick={() => { setTab('chain'); setShowSchedule(!showSchedule) }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-medium transition-colors"
                    >
                      <CalendarClock className="w-4 h-4" />
                      Schedule
                    </button>
                    <button
                      onClick={handleGenerateChain}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Regenerate
                    </button>
                  </div>

                  {showSchedule && (
                    <div className="flex items-end gap-3 p-4 bg-zinc-800/60 rounded-xl border border-zinc-700">
                      <div className="flex-1">
                        <label className="block text-xs text-zinc-500 mb-1">Schedule for</label>
                        <input
                          type="datetime-local"
                          value={scheduleTime}
                          onChange={e => setScheduleTime(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        />
                      </div>
                      <button
                        onClick={handleSchedule}
                        disabled={scheduleThread.isPending || !scheduleTime}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium"
                      >
                        {scheduleThread.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                        Confirm
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MANUAL MODE ───────────────────────────────────────────── */}
      {mode === 'manual' && (
        <div className="space-y-5">
          {/* Tab: Single vs Chain */}
          <div className="flex gap-2">
            {[
              { id: 'single' as const, label: 'Single Post' },
              { id: 'chain' as const, label: 'Thread Chain' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'single' && (
            <div className="space-y-4">
              {/* Clean text input area — Claude web vibe */}
              <div className="relative">
                <textarea
                  value={postText}
                  onChange={e => setPostText(e.target.value)}
                  rows={8}
                  maxLength={MAX_CHARS}
                  placeholder="Write your Threads post..."
                  className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-2xl px-5 py-4 text-[15px] leading-relaxed text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 transition-all"
                />
                <div className="absolute bottom-3 right-4 flex items-center gap-3">
                  <span className={`text-xs ${
                    postText.length > MAX_CHARS ? 'text-red-400' : postText.length > MAX_CHARS * 0.8 ? 'text-amber-400' : 'text-zinc-500'
                  }`}>
                    {postText.length}/{MAX_CHARS}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handlePublishSingle}
                  disabled={isPublishing || !postText.trim() || postText.length > MAX_CHARS}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  {publishSingle.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Post to Threads
                </button>
                <button
                  onClick={() => setShowSchedule(!showSchedule)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
                >
                  <CalendarClock className="w-4 h-4" />
                  Schedule
                </button>
              </div>

              {showSchedule && (
                <div className="flex items-end gap-3 p-4 bg-zinc-800/60 rounded-xl border border-zinc-700">
                  <div className="flex-1">
                    <label className="block text-xs text-zinc-500 mb-1">Schedule for</label>
                    <input
                      type="datetime-local"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <button
                    onClick={handleSchedule}
                    disabled={scheduleThread.isPending || !scheduleTime}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium"
                  >
                    {scheduleThread.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                    Confirm
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'chain' && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-500">
                Write each post in the chain below. Posts will be published as connected replies.
              </p>

              {chainParts.map((part, i) => (
                <div key={i} className="relative group">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-teal-400 font-medium tabular-nums">
                      {i + 1}/{chainParts.length}
                    </span>
                    {chainParts.length > 2 && (
                      <button
                        onClick={() => removeChainPart(i)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3 text-zinc-500 hover:text-red-400" />
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <textarea
                      value={part}
                      onChange={e => updateChainPart(i, e.target.value)}
                      rows={4}
                      maxLength={MAX_CHARS}
                      placeholder={
                        i === 0 ? 'Start with a strong hook...' :
                        i === chainParts.length - 1 ? 'End with a CTA or summary...' :
                        'Continue the thread...'
                      }
                      className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 transition-all"
                    />
                    <span className={`absolute bottom-2.5 right-4 text-xs ${
                      part.length > MAX_CHARS ? 'text-red-400' : 'text-zinc-500'
                    }`}>
                      {part.length}/{MAX_CHARS}
                    </span>
                  </div>
                </div>
              ))}

              {chainParts.length < MAX_CHAIN_PARTS && (
                <button
                  onClick={addChainPart}
                  className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-teal-400 transition-colors py-2"
                >
                  <Plus className="w-4 h-4" />
                  Add another post
                </button>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handlePublishChain}
                  disabled={isPublishing || chainParts.filter(p => p.trim()).length < 2}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  {publishChain.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Post Thread
                </button>
                <button
                  onClick={() => setShowSchedule(!showSchedule)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
                >
                  <CalendarClock className="w-4 h-4" />
                  Schedule
                </button>
              </div>

              {showSchedule && (
                <div className="flex items-end gap-3 p-4 bg-zinc-800/60 rounded-xl border border-zinc-700">
                  <div className="flex-1">
                    <label className="block text-xs text-zinc-500 mb-1">Schedule for</label>
                    <input
                      type="datetime-local"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <button
                    onClick={handleSchedule}
                    disabled={scheduleThread.isPending || !scheduleTime}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium"
                  >
                    {scheduleThread.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
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
