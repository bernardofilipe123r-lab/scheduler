import { useState, useEffect } from 'react'
import { Save, Loader2, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { useContentPrompts, useUpdateContentPrompts } from '@/features/brands/api/use-prompts'

const FIELDS = [
  {
    key: 'reels_prompt' as const,
    label: 'Reels Prompt',
    placeholder: 'Instructions for AI reel generation: topics, hooks, tone, format rules...',
  },
  {
    key: 'posts_prompt' as const,
    label: 'Posts Prompt',
    placeholder: 'Instructions for AI carousel generation: topics, title styles, slide format, references...',
  },
  {
    key: 'brand_description' as const,
    label: 'Brand Description',
    placeholder: 'Brand identity: target audience, content focus, tone of voice, content philosophy...',
  },
] as const

export function ContentPromptsCard() {
  const { data, isLoading } = useContentPrompts()
  const updateMutation = useUpdateContentPrompts()

  const [values, setValues] = useState({
    reels_prompt: '',
    posts_prompt: '',
    brand_description: '',
  })
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data) {
      setValues({
        reels_prompt: data.reels_prompt || '',
        posts_prompt: data.posts_prompt || '',
        brand_description: data.brand_description || '',
      })
      setDirty(false)
    }
  }, [data])

  const handleChange = (key: keyof typeof values, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync(values)
      toast.success('Prompts saved')
      setDirty(false)
    } catch {
      toast.error('Failed to save prompts')
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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-500" />
            Content Prompts
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            These prompts guide AI content generation for reels and posts
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

      <div className="px-6 py-5 space-y-4">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
            </label>
            <textarea
              rows={3}
              value={values[field.key]}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-y"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
