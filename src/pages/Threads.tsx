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
  Loader2,
  Plus,
  Trash2,
  Zap,
  PenLine,
  Link2,
  CalendarClock,
  RefreshCw,
  Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useDynamicBrands, useBrandConnections } from '@/features/brands'
import {
  useGenerateSingle,
  useGenerateChain,
  useGenerateBulk,
  useScheduleThread,
  useAutoScheduleThread,
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
  const scheduleThread = useScheduleThread()
  const autoScheduleThread = useAutoScheduleThread()

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
  const isPublishing = scheduleThread.isPending || autoScheduleThread.isPending

  const selectedBrandInfo = brands.find(b => b.id === selectedBrand)

  // ── Handlers ───────────────────────────────────────────────────────

  const handleAutoSchedule = async (options?: { isChain?: boolean; text?: string; chainParts?: string[] }) => {
    if (!selectedBrand) { toast.error('Select a brand first'); return }

    const isChain = options?.isChain ?? tab === 'chain'
    const text = options?.text ?? (isChain ? (chainParts[0] || '') : postText)
    const parts = options?.chainParts ?? (isChain ? chainParts.filter(p => p.trim()) : undefined)

    if (!text.trim()) { toast.error('Write something first'); return }

    try {
      const result = await autoScheduleThread.mutateAsync({
        brand_id: selectedBrand,
        text,
        is_chain: isChain,
        chain_parts: parts,
      })
      const dt = new Date(result.scheduled_for)
      toast.success(`Scheduled for ${dt.toLocaleDateString()} at ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
      if (isChain) {
        setChainParts(['', ''])
      } else {
        setPostText('')
      }
    } catch (e: any) {
      toast.error(e?.message || 'Auto-schedule failed')
    }
  }

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

  const handleAutoScheduleBulkItem = async (text: string, index: number) => {
    if (!selectedBrand) return
    try {
      const result = await autoScheduleThread.mutateAsync({
        brand_id: selectedBrand,
        text,
        is_chain: false,
      })
      setBulkPosts(prev => prev.filter((_, i) => i !== index))
      const dt = new Date(result.scheduled_for)
      toast.success(`Scheduled for ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
    } catch (e: any) {
      toast.error(e?.message || 'Auto-schedule failed')
    }
  }

  const handleDeleteBulkItem = (index: number) => {
    setBulkPosts(prev => prev.filter((_, i) => i !== index))
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
        <h2 className="text-lg font-bold text-gray-900 mb-1">Connect Threads First</h2>
        <p className="text-sm text-gray-500">
          Go to <span className="text-stone-800 font-semibold">Brands</span> and connect your Threads account to start creating content.
        </p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-6 py-5 space-y-4">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Threads</h1>
        <p className="text-sm text-gray-500 mt-0.5">Create and schedule text posts</p>
      </div>

      {/* Controls bar — brand + mode */}
      <div className="flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 px-3 py-2">
        {/* Brand selector */}
        <div className="flex items-center gap-2">
          {selectedBrandInfo && (
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: selectedBrandInfo.color }} />
          )}
          <select
            value={selectedBrand}
            onChange={e => setSelectedBrand(e.target.value)}
            className="bg-transparent text-sm font-medium text-gray-900 focus:outline-none cursor-pointer pr-1"
          >
            {threadsConnectedBrands.map(b => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </div>

        {/* Mode toggle */}
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
          <button
            onClick={() => setMode('auto')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              mode === 'auto'
                ? 'bg-stone-900 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Zap className="w-3 h-3" />
            Auto
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
              mode === 'manual'
                ? 'bg-stone-900 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <PenLine className="w-3 h-3" />
            Manual
          </button>
        </div>
      </div>

      {/* ── AUTO MODE ─────────────────────────────────────────────── */}
      {mode === 'auto' && (
        <div className="space-y-4">
          {/* Tab: Single vs Chain */}
          <div className="flex gap-1.5">
            {[
              { id: 'single' as const, label: 'Single Post' },
              { id: 'chain' as const, label: 'Thread Chain' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tab === t.id
                    ? 'bg-stone-900 text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'single' && (
            <div className="space-y-3">
              {/* Options card */}
              <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
                <div className="flex flex-wrap gap-2.5">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Topic (optional)</label>
                    <input
                      type="text"
                      value={topicHint}
                      onChange={e => setTopicHint(e.target.value)}
                      placeholder="e.g., morning routines, productivity"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                  </div>
                  <div className="w-40">
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Format</label>
                    <select
                      value={formatType}
                      onChange={e => setFormatType(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
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
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {generateSingle.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                  Generate Post
                </button>
              </div>

              {/* Generated post */}
              {postText && (
                <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2.5 animate-in fade-in duration-300">
                  <div className="relative">
                    <textarea
                      value={postText}
                      onChange={e => setPostText(e.target.value)}
                      rows={5}
                      maxLength={MAX_CHARS}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                    <span className={`absolute bottom-2 right-3 text-[10px] ${
                      postText.length > MAX_CHARS ? 'text-red-500' : 'text-gray-400'
                    }`}>
                      {postText.length}/{MAX_CHARS}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAutoSchedule()}
                      disabled={isPublishing || !postText.trim()}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-medium transition-colors"
                    >
                      {autoScheduleThread.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                      Auto-Schedule
                    </button>
                    <button
                      onClick={() => setShowSchedule(!showSchedule)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors"
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      Schedule
                    </button>
                    <button
                      onClick={handleGenerateSingle}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs transition-colors"
                      title="Regenerate"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPostText('')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-500 hover:text-red-600 text-xs transition-colors ml-auto"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Schedule picker */}
              {showSchedule && (
                <div className="flex items-end gap-2.5 p-3 bg-white rounded-xl border border-gray-200">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Schedule for</label>
                    <input
                      type="datetime-local"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleSchedule}
                    disabled={scheduleThread.isPending || !scheduleTime}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-medium"
                  >
                    {scheduleThread.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                    Confirm
                  </button>
                </div>
              )}

              {/* Bulk generate section */}
              <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Bulk Generate</span>
                </div>
                <div className="flex items-end gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Count</label>
                    <select
                      value={bulkCount}
                      onChange={e => setBulkCount(Number(e.target.value))}
                      className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    >
                      {[2, 3, 4, 5, 6, 8, 10].map(n => (
                        <option key={n} value={n}>{n} posts</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleGenerateBulk}
                    disabled={isLoading || !selectedBrand}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-60 text-gray-700 text-xs font-medium transition-colors"
                  >
                    {generateBulk.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    Generate Batch
                  </button>
                </div>

                {/* Bulk results */}
                {bulkPosts.length > 0 && (
                  <div className="space-y-2">
                    {bulkPosts.map((post, i) => (
                      <div key={i} className="border border-gray-100 rounded-lg p-2.5">
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex-1 min-w-0">
                            <span className="text-[9px] font-medium uppercase tracking-wider text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded-full">
                              {post.format_type}
                            </span>
                            <p className="text-xs text-gray-700 mt-1.5 whitespace-pre-wrap leading-relaxed">{post.text}</p>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            <button
                              onClick={() => handleAutoScheduleBulkItem(post.text, i)}
                              disabled={isPublishing}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-[10px] font-medium"
                            >
                              <Clock className="w-2.5 h-2.5" />
                              Schedule
                            </button>
                            <button
                              onClick={() => handleDeleteBulkItem(i)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-400 hover:text-red-500 text-[10px]"
                              title="Delete"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                        <span className="text-[9px] text-gray-400 mt-1 block">{post.text.length}/{MAX_CHARS}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'chain' && (
            <div className="space-y-3">
              {/* Options card */}
              <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
                <div className="flex flex-wrap gap-2.5">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Thread topic</label>
                    <input
                      type="text"
                      value={chainTopic}
                      onChange={e => setChainTopic(e.target.value)}
                      placeholder="e.g., 7 prompts to replace a mortgage broker"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                  </div>
                  <div className="w-28">
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Parts</label>
                    <select
                      value={chainPartsCount}
                      onChange={e => setChainPartsCount(Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
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
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-800 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {generateChain.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  Generate Thread Chain
                </button>
              </div>

              {/* Chain parts editor */}
              {chainParts.some(p => p.trim()) && (
                <div className="space-y-2.5 animate-in fade-in duration-300">
                  {chainParts.map((part, i) => (
                    <div key={i} className="relative group bg-white rounded-xl border border-gray-200 p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold text-stone-600 tabular-nums">
                          Part {i + 1} of {chainParts.length}
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
                          rows={2}
                          maxLength={MAX_CHARS}
                          placeholder={
                            i === 0 ? 'Hook — grab attention...' :
                            i === chainParts.length - 1 ? 'Summary + CTA...' :
                            'Insight / value...'
                          }
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                        />
                        <span className={`absolute bottom-1.5 right-2.5 text-[10px] ${
                          part.length > MAX_CHARS ? 'text-red-500' : 'text-gray-400'
                        }`}>
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
                      <Plus className="w-3 h-3" />
                      Add part
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAutoSchedule({ isChain: true })}
                      disabled={isPublishing}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-medium transition-colors"
                    >
                      {autoScheduleThread.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                      Auto-Schedule
                    </button>
                    <button
                      onClick={() => { setTab('chain'); setShowSchedule(!showSchedule) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors"
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      Schedule
                    </button>
                    <button
                      onClick={handleGenerateChain}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs transition-colors"
                      title="Regenerate"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setChainParts(['', ''])}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-500 hover:text-red-600 text-xs transition-colors ml-auto"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {showSchedule && (
                    <div className="flex items-end gap-2.5 p-3 bg-white rounded-xl border border-gray-200">
                      <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Schedule for</label>
                        <input
                          type="datetime-local"
                          value={scheduleTime}
                          onChange={e => setScheduleTime(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                        />
                      </div>
                      <button
                        onClick={handleSchedule}
                        disabled={scheduleThread.isPending || !scheduleTime}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-medium"
                      >
                        {scheduleThread.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
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
        <div className="space-y-4">
          {/* Tab: Single vs Chain */}
          <div className="flex gap-1.5">
            {[
              { id: 'single' as const, label: 'Single Post' },
              { id: 'chain' as const, label: 'Thread Chain' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tab === t.id
                    ? 'bg-stone-900 text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'single' && (
            <div className="space-y-3">
              <div className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="relative">
                  <textarea
                    value={postText}
                    onChange={e => setPostText(e.target.value)}
                    rows={6}
                    maxLength={MAX_CHARS}
                    placeholder="Write your Threads post..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm leading-relaxed text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                  />
                  <div className="absolute bottom-2 right-3 flex items-center gap-3">
                    <span className={`text-[10px] ${
                      postText.length > MAX_CHARS ? 'text-red-500' : postText.length > MAX_CHARS * 0.8 ? 'text-amber-500' : 'text-gray-400'
                    }`}>
                      {postText.length}/{MAX_CHARS}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAutoSchedule({ isChain: false, text: postText })}
                  disabled={isPublishing || !postText.trim() || postText.length > MAX_CHARS}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                >
                  {autoScheduleThread.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                  Auto-Schedule
                </button>
                <button
                  onClick={() => setShowSchedule(!showSchedule)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  Schedule
                </button>
                <button
                  onClick={() => setPostText('')}
                  disabled={!postText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-500 hover:text-red-600 disabled:opacity-40 text-xs transition-colors ml-auto"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {showSchedule && (
                <div className="flex items-end gap-2.5 p-3 bg-white rounded-xl border border-gray-200">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Schedule for</label>
                    <input
                      type="datetime-local"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleSchedule}
                    disabled={scheduleThread.isPending || !scheduleTime}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-medium"
                  >
                    {scheduleThread.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                    Confirm
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'chain' && (
            <div className="space-y-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">
                Write each post in the chain — published as connected replies
              </p>

              {chainParts.map((part, i) => (
                <div key={i} className="relative group bg-white rounded-xl border border-gray-200 p-2.5">
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
                        i === 0 ? 'Start with a strong hook...' :
                        i === chainParts.length - 1 ? 'End with a CTA or summary...' :
                        'Continue the thread...'
                      }
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm leading-relaxed text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                    <span className={`absolute bottom-1.5 right-2.5 text-[10px] ${
                      part.length > MAX_CHARS ? 'text-red-500' : 'text-gray-400'
                    }`}>
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
                  <Plus className="w-3.5 h-3.5" />
                  Add another post
                </button>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAutoSchedule({ isChain: true })}
                  disabled={isPublishing || chainParts.filter(p => p.trim()).length < 2}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                >
                  {autoScheduleThread.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
                  Auto-Schedule
                </button>
                <button
                  onClick={() => setShowSchedule(!showSchedule)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium transition-colors"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  Schedule
                </button>
                <button
                  onClick={() => setChainParts(['', ''])}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 text-gray-500 hover:text-red-600 text-xs transition-colors ml-auto"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {showSchedule && (
                <div className="flex items-end gap-2.5 p-3 bg-white rounded-xl border border-gray-200">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Schedule for</label>
                    <input
                      type="datetime-local"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleSchedule}
                    disabled={scheduleThread.isPending || !scheduleTime}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 disabled:opacity-60 text-white text-xs font-medium"
                  >
                    {scheduleThread.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
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
