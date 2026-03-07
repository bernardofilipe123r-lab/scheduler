import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, X, Loader2, Sparkles, Brain } from 'lucide-react'
import type { ReelExample, PostExample } from '../types/niche-config'
import { useGeneratePostExample, useGeneratePostExamplesBatch, useGenerateReelExamplesBatch } from '../api/use-niche-config'
import toast from 'react-hot-toast'

const AI_THINKING_MESSAGES = [
  'Our AI is analyzing your content DNA...',
  'Crafting unique reel ideas for your niche...',
  'Generating attention-grabbing titles...',
  'Building punchy content lines...',
  'Almost there — polishing your reels...',
  'DeepSeek is working its magic...',
  'Creating viral-worthy content...',
  'Fine-tuning ideas to match your brand...',
]

interface ContentExamplesSectionProps {
  reelExamples: ReelExample[]
  postExamples: PostExample[]
  onReelExamplesChange: (examples: ReelExample[]) => void
  onPostExamplesChange: (examples: PostExample[]) => void
  showOnly?: 'reels' | 'posts'
  generalFilled?: boolean
  nicheName?: string
  contentBrief?: string
  onBeforeGenerate?: () => Promise<void>
  onGeneratingChange?: (generating: boolean) => void
}

function ReelExampleCard({
  example,
  index,
  onChange,
  onDelete,
}: {
  example: ReelExample
  index: number
  onChange: (updated: ReelExample) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const updateLine = (lineIndex: number, value: string) => {
    const lines = [...example.content_lines]
    lines[lineIndex] = value
    onChange({ ...example, content_lines: lines })
  }

  const addLine = () => {
    onChange({ ...example, content_lines: [...example.content_lines, ''] })
  }

  const removeLine = (lineIndex: number) => {
    onChange({
      ...example,
      content_lines: example.content_lines.filter((_, i) => i !== lineIndex),
    })
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="font-medium text-gray-700">Example {index + 1}</span>
          {!expanded && example.title && (
            <span className="text-gray-400 truncate max-w-[300px]">— {example.title}</span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title (ALL CAPS)</label>
            <input
              value={example.title}
              onChange={(e) => onChange({ ...example, title: e.target.value })}
              placeholder="SIGNS YOUR BODY IS BEGGING FOR MAGNESIUM"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Content Lines ({example.content_lines.length})
            </label>
            <div className="space-y-2">
              {example.content_lines.map((line, li) => (
                <div key={li} className="flex gap-2">
                  <span className="text-xs text-gray-400 pt-2.5 min-w-[20px]">{li + 1}.</span>
                  <input
                    value={line}
                    onChange={(e) => updateLine(li, e.target.value)}
                    placeholder="Content line..."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(li)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addLine}
              disabled={example.content_lines.length >= 15}
              className="mt-2 text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" /> Add line
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PostExampleCard({
  example,
  index,
  onChange,
  onDelete,
  isGenerating,
}: {
  example: PostExample
  index: number
  onChange: (updated: PostExample) => void
  onDelete: () => void
  isGenerating?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const maxSlides = example._maxSlides || 4

  const updateSlide = (slideIndex: number, value: string) => {
    const slides = [...example.slides]
    slides[slideIndex] = value
    onChange({ ...example, slides })
  }

  const addSlide = () => {
    if (example.slides.length >= maxSlides) return
    onChange({ ...example, slides: [...example.slides, ''] })
  }

  const removeSlide = (slideIndex: number) => {
    onChange({
      ...example,
      slides: example.slides.filter((_, i) => i !== slideIndex),
    })
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${isGenerating ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200'}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm">
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
          ) : expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="font-medium text-gray-700">Example {index + 1}</span>
          {isGenerating && <span className="text-xs text-indigo-500">Generating with AI...</span>}
          {!expanded && !isGenerating && example.title && (
            <span className="text-gray-400 truncate max-w-[300px]">— {example.title}</span>
          )}
          <span className="text-xs text-gray-400 ml-2">({maxSlides} slides)</span>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title (ALL CAPS)</label>
            <input
              value={example.title}
              onChange={(e) => onChange({ ...example, title: e.target.value })}
              placeholder="STUDY REVEALS SLEEPING IN A COLD ROOM IMPROVES FAT METABOLISM"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Study Reference <span className="text-red-500">*</span>
            </label>
            <input
              value={example.study_ref || ''}
              onChange={(e) => onChange({ ...example, study_ref: e.target.value })}
              placeholder="Iron absorption study — Cell Metabolism, 2022"
              className={`w-full px-3 py-2 border rounded-lg text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                !example.study_ref?.trim() ? 'border-red-300 bg-red-50/30' : 'border-gray-200'
              }`}
            />
            {!example.study_ref?.trim() && (
              <p className="text-[10px] text-red-500 mt-0.5">A study reference (name, journal/institution, year) is required.</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Slides ({example.slides.length}/{maxSlides})
            </label>
            <div className="space-y-2">
              {example.slides.map((slide, si) => (
                <div key={si} className="flex gap-2">
                  <span className="text-xs text-gray-400 pt-2.5 min-w-[20px]">{si + 1}.</span>
                  <textarea
                    value={slide}
                    onChange={(e) => updateSlide(si, e.target.value)}
                    placeholder="A study published in 'Diabetes' found that sleeping in 19°C environments for one month increased brown fat activity by 42%..."
                    rows={3}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
                  />
                  <button
                    type="button"
                    onClick={() => removeSlide(si)}
                    className="text-gray-400 hover:text-red-500 pt-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            {example.slides.length < maxSlides && (
              <button
                type="button"
                onClick={addSlide}
                className="mt-2 text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add slide
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ReelGenTooltip({ generalFilled, nicheName, contentBrief }: { generalFilled?: boolean; nicheName?: string; contentBrief?: string }) {
  if (!generalFilled) {
    return (
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        Fill in the General section first (niche name + content brief)
      </div>
    )
  }

  const briefPreview = (contentBrief || '').length > 180
    ? contentBrief!.slice(0, 180) + '…'
    : contentBrief || ''

  return (
    <div className="absolute bottom-full left-0 mb-2 w-[380px] bg-gray-900 text-white text-xs rounded-lg p-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
      <p className="font-semibold text-[11px] text-indigo-300 uppercase tracking-wide mb-2">What this does</p>
      <p className="text-gray-300 mb-3 leading-relaxed">
        Sends your Content DNA to DeepSeek AI along with 10 format examples. 
        The AI generates <span className="text-white font-medium">10 unique reel ideas</span> (title + content lines) adapted to your niche. 
        New reels are <span className="text-emerald-300 font-medium">added</span> to your existing examples.
      </p>
      <p className="font-semibold text-[11px] text-indigo-300 uppercase tracking-wide mb-1.5">Prompt context from your General section</p>
      <div className="bg-gray-800 rounded p-2.5 space-y-1 text-[11px] font-mono leading-relaxed">
        {nicheName && <p><span className="text-gray-400">Niche:</span> <span className="text-green-300">{nicheName}</span></p>}
        {briefPreview && <p><span className="text-gray-400">Brief:</span> <span className="text-green-300">{briefPreview}</span></p>}
      </div>
      <p className="text-gray-500 mt-2 text-[10px]">+ 10 H&W format examples · DeepSeek · temp 0.9</p>
    </div>
  )
}

function AiThinkingOverlay() {
  const [msgIndex, setMsgIndex] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(prev => (prev + 1) % AI_THINKING_MESSAGES.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-6 text-center">
      <div className="flex items-center justify-center gap-3 mb-3">
        <div className="relative">
          <Brain className="w-8 h-8 text-indigo-500" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full animate-ping" />
        </div>
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
      <p className="text-sm font-semibold text-indigo-700 mb-1">AI is generating your reels</p>
      <p className="text-xs text-indigo-500 transition-opacity duration-500">{AI_THINKING_MESSAGES[msgIndex]}</p>
      <p className="text-[10px] text-indigo-400 mt-3">Please wait — this usually takes 30-60 seconds. Do not navigate away.</p>
    </div>
  )
}

export function ContentExamplesSection({
  reelExamples,
  postExamples,
  onReelExamplesChange,
  onPostExamplesChange,
  showOnly,
  generalFilled = false,
  nicheName,
  contentBrief,
  onBeforeGenerate,
  onGeneratingChange,
}: ContentExamplesSectionProps) {
  const [newPostSlideCount, setNewPostSlideCount] = useState<3 | 4>(4)
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null)
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [reelBatchGenerating, setReelBatchGenerating] = useState(false)
  const generateMutation = useGeneratePostExample()
  const batchMutation = useGeneratePostExamplesBatch()
  const reelBatchMutation = useGenerateReelExamplesBatch()

  const isAnyGenerating = reelBatchGenerating || batchGenerating
  useEffect(() => {
    onGeneratingChange?.(isAnyGenerating)
  }, [isAnyGenerating]) // eslint-disable-line react-hooks/exhaustive-deps

  const reelLimitReached = reelExamples.length >= 40

  const addReelExample = () => {
    onReelExamplesChange([...reelExamples, { title: '', content_lines: [''] }])
  }

  const addPostExample = async () => {
    if (onBeforeGenerate) await onBeforeGenerate()
    const newIndex = postExamples.length
    const emptySlides = Array.from({ length: newPostSlideCount }, () => '')
    const newExample: PostExample = { title: '', slides: emptySlides, _maxSlides: newPostSlideCount }
    onPostExamplesChange([...postExamples, newExample])

    // Fire DeepSeek generation immediately — pass existing titles so AI never repeats
    const existingTitles = postExamples.map(ex => ex.title).filter(Boolean)
    setGeneratingIndex(newIndex)
    generateMutation.mutate(
      { num_slides: newPostSlideCount, existing_titles: existingTitles },
      {
        onSuccess: (data) => {
          const updated = [...postExamples, newExample]
          updated[newIndex] = {
            title: data.title,
            slides: data.slides.slice(0, newPostSlideCount),
            study_ref: data.study_ref,
            _maxSlides: newPostSlideCount,
          }
          onPostExamplesChange(updated)
          setGeneratingIndex(null)
          toast.success('Post example generated by AI — review and edit as needed')
        },
        onError: () => {
          setGeneratingIndex(null)
          toast.error('AI generation failed — fill in manually')
        },
      },
    )
  }

  const updateReelExample = (index: number, updated: ReelExample) => {
    const examples = [...reelExamples]
    examples[index] = updated
    onReelExamplesChange(examples)
  }

  const deleteReelExample = (index: number) => {
    onReelExamplesChange(reelExamples.filter((_, i) => i !== index))
  }

  const updatePostExample = (index: number, updated: PostExample) => {
    const examples = [...postExamples]
    examples[index] = updated
    onPostExamplesChange(examples)
  }

  const deletePostExample = (index: number) => {
    onPostExamplesChange(postExamples.filter((_, i) => i !== index))
  }

  const generateReelBatch = async () => {
    if (onBeforeGenerate) await onBeforeGenerate()
    setReelBatchGenerating(true)
    reelBatchMutation.mutate(
      { count: 10 },
      {
        onSuccess: (data) => {
          const newReels = data.reels.map(r => ({ title: r.title, content_lines: r.content_lines }))
          onReelExamplesChange([...reelExamples, ...newReels])
          setReelBatchGenerating(false)
          toast.success(`${data.reels.length} reel examples generated — you now have ${reelExamples.length + newReels.length} total`)
        },
        onError: (error: unknown) => {
          const err = error as { message?: string; status?: number; detail?: string }
          console.error('[ReelBatch] Generation failed:', {
            message: err?.message,
            status: err?.status,
            detail: err?.detail,
            raw: error,
          })
          setReelBatchGenerating(false)
          toast.error(`AI reel generation failed: ${err?.message || 'Unknown error'}`)
        },
      },
    )
  }

  const generateBatch = async (count: number) => {
    if (onBeforeGenerate) await onBeforeGenerate()
    const existingTitles = postExamples.map(ex => ex.title).filter(Boolean)
    setBatchGenerating(true)
    batchMutation.mutate(
      { count, num_slides: newPostSlideCount, existing_titles: existingTitles },
      {
        onSuccess: (data) => {
          const newExamples = data.posts.map(p => ({
            title: p.title,
            slides: p.slides.slice(0, newPostSlideCount),
            study_ref: p.study_ref,
            _maxSlides: newPostSlideCount,
          }))
          onPostExamplesChange([...postExamples, ...newExamples])
          setBatchGenerating(false)
          toast.success(`${data.posts.length} post examples generated by AI — review and edit as needed`)
        },
        onError: () => {
          setBatchGenerating(false)
          toast.error('AI batch generation failed — try again or add manually')
        },
      },
    )
  }

  const totalExamples = reelExamples.length + postExamples.length
  const showReels = !showOnly || showOnly === 'reels'
  const showPosts = !showOnly || showOnly === 'posts'

  const relevantCount = showOnly === 'reels' ? reelExamples.length : showOnly === 'posts' ? postExamples.length : totalExamples

  if (relevantCount === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
        <p className="text-gray-500 text-sm mb-1">No examples added yet</p>
        <p className="text-gray-400 text-xs mb-4">
          You need at least <strong className="text-gray-500">10 examples</strong> to continue. Use "Generate 10 reels with AI" for a quick start.
        </p>
        <div className="flex gap-3 justify-center">
          {showReels && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={addReelExample}
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Reel Example
              </button>
              <div className="relative group">
                <button
                  type="button"
                  onClick={generateReelBatch}
                  disabled={reelBatchGenerating || !generalFilled}
                  className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reelBatchGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {reelBatchGenerating ? 'Generating...' : 'Generate 10 reels with AI'}
                </button>
                <ReelGenTooltip generalFilled={generalFilled} nicheName={nicheName} contentBrief={contentBrief} />
              </div>
            </div>
          )}
          {showPosts && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={addPostExample}
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Post Example
              </button>
              <button
                type="button"
                onClick={() => generateBatch(5)}
                disabled={batchGenerating || !generalFilled}
                className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {batchGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {batchGenerating ? 'Generating...' : 'Generate 5 with AI'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Reel Examples */}
      {showReels && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">
              Reel Examples ({reelExamples.length})
              {reelLimitReached && <span className="text-xs text-green-600 ml-2">✓ Great coverage!</span>}
            </h4>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            CTA is automatically added as the final line — don't include it here.
          </p>
          {reelBatchGenerating && <AiThinkingOverlay />}
          <div className="space-y-2">
            {reelExamples.map((ex, i) => (
              <ReelExampleCard
                key={i}
                example={ex}
                index={i}
                onChange={(updated) => updateReelExample(i, updated)}
                onDelete={() => deleteReelExample(i)}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={addReelExample}
              disabled={reelExamples.length >= 50}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Add Reel Example
            </button>
            {!reelLimitReached && (
              <div className="relative group">
                <button
                  type="button"
                  onClick={generateReelBatch}
                  disabled={reelBatchGenerating || !generalFilled}
                  className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reelBatchGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {reelBatchGenerating ? 'Generating...' : `Generate 10 more with AI`}
                </button>
                <ReelGenTooltip generalFilled={generalFilled} nicheName={nicheName} contentBrief={contentBrief} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Post Examples */}
      {showPosts && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">
              Post Examples ({postExamples.length} of 50)
            </h4>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Post examples should reference real studies (name, journal/institution, year). Each slide should contain 2+ educational sentences.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            <p className="text-[11px] text-amber-700">
              <strong>Note:</strong> Don't include a CTA in these slides — the final call-to-action is configured in the <strong>"Carousel CTA"</strong> section below, where you can set weighted CTA templates with <code className="text-[10px] bg-amber-100 px-1 rounded">{'{cta_topic}'}</code> and <code className="text-[10px] bg-amber-100 px-1 rounded">@{'{brandhandle}'}</code> placeholders.
            </p>
          </div>
          <div className="space-y-2">
            {postExamples.map((ex, i) => (
              <PostExampleCard
                key={i}
                example={ex}
                index={i}
                onChange={(updated) => updatePostExample(i, updated)}
                onDelete={() => deletePostExample(i)}
                isGenerating={generatingIndex === i}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Slides per post:</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setNewPostSlideCount(3)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    newPostSlideCount === 3
                      ? 'bg-primary-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  3
                </button>
                <button
                  type="button"
                  onClick={() => setNewPostSlideCount(4)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    newPostSlideCount === 4
                      ? 'bg-primary-500 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  4
                </button>
              </div>
              <span className="text-[10px] text-gray-400">+ cover</span>
            </div>
            <button
              type="button"
              onClick={addPostExample}
              disabled={postExamples.length >= 50 || generateMutation.isPending || batchGenerating}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 disabled:opacity-50"
            >
              {generateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {generateMutation.isPending ? 'Generating...' : 'Add Post Example'}
            </button>
            <button
              type="button"
              onClick={() => generateBatch(5)}
              disabled={postExamples.length >= 46 || batchGenerating || generateMutation.isPending || !generalFilled}
              className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {batchGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {batchGenerating ? 'Generating 5...' : 'Generate 5 with AI'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
