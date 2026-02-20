import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, X, Loader2 } from 'lucide-react'
import type { ReelExample, PostExample } from '../types/niche-config'
import { useGeneratePostExample } from '../api/use-niche-config'
import toast from 'react-hot-toast'

interface ContentExamplesSectionProps {
  reelExamples: ReelExample[]
  postExamples: PostExample[]
  onReelExamplesChange: (examples: ReelExample[]) => void
  onPostExamplesChange: (examples: PostExample[]) => void
  brandId?: string
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
            <input
              value={example.doi || ''}
              onChange={(e) => onChange({ ...example, doi: e.target.value })}
              placeholder="DOI: 10.2337/db14-0513"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
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

export function ContentExamplesSection({
  reelExamples,
  postExamples,
  onReelExamplesChange,
  onPostExamplesChange,
  brandId,
}: ContentExamplesSectionProps) {
  const [newPostSlideCount, setNewPostSlideCount] = useState<3 | 4>(4)
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null)
  const generateMutation = useGeneratePostExample()

  const addReelExample = () => {
    onReelExamplesChange([...reelExamples, { title: '', content_lines: [''] }])
  }

  const addPostExample = () => {
    const newIndex = postExamples.length
    const emptySlides = Array.from({ length: newPostSlideCount }, () => '')
    const newExample: PostExample = { title: '', slides: emptySlides, _maxSlides: newPostSlideCount }
    onPostExamplesChange([...postExamples, newExample])

    // Fire DeepSeek generation immediately
    setGeneratingIndex(newIndex)
    generateMutation.mutate(
      { brand_id: brandId, num_slides: newPostSlideCount },
      {
        onSuccess: (data) => {
          const updated = [...postExamples, newExample]
          updated[newIndex] = {
            title: data.title,
            slides: data.slides.slice(0, newPostSlideCount),
            doi: data.doi,
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

  const totalExamples = reelExamples.length + postExamples.length

  if (totalExamples === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
        <p className="text-gray-500 text-sm mb-1">No examples added yet</p>
        <p className="text-gray-400 text-xs mb-4">
          Examples are the most powerful way to guide the AI. Add 5-10 examples to dramatically improve quality.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={addReelExample}
            className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add Reel Example
          </button>
          <button
            type="button"
            onClick={addPostExample}
            className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add Post Example
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Reel Examples */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">
            Reel Examples ({reelExamples.length} of 20)
          </h4>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          CTA is automatically added as the final line — don't include it here.
        </p>
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
        <button
          type="button"
          onClick={addReelExample}
          disabled={reelExamples.length >= 20}
          className="mt-2 text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Add Reel Example
        </button>
      </div>

      {/* Post Examples */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">
            Post Examples ({postExamples.length} of 20)
          </h4>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Post examples should reference real studies with DOI citations in the caption. Each slide should contain 2+ educational sentences.
        </p>
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
            disabled={postExamples.length >= 20 || generateMutation.isPending}
            className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 disabled:opacity-50"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {generateMutation.isPending ? 'Generating...' : 'Add Post Example'}
          </button>
        </div>
      </div>
    </div>
  )
}
