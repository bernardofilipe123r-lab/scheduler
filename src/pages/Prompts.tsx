/**
 * Prompts Page — Full transparency into the image prompt pipeline.
 *
 * Shows every layer of the prompt system, from AI content generation
 * to the final deAPI call. Users can test-generate sample images
 * from any prompt to see exactly what the system produces.
 */
import { useState, useEffect } from 'react'
import {
  Layers,
  Play,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Palette,
  Cpu,
  AlertTriangle,
  Copy,
  Check,
  Eye,
  Wand2,
  ArrowRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '@/shared/api/client'

// ============================================================
// Types
// ============================================================

interface PromptLayer {
  id: string
  name: string
  description: string
  content: string
  type: 'ai_generation' | 'template' | 'suffix'
}

interface BrandPalette {
  name: string
  primary: string
  accent: string
  color_description: string
}

interface ModelInfo {
  name: string
  dimensions: string
  steps: number
  description: string
}

interface TestResult {
  index: number
  image_data?: string
  error?: string
  generation_time: number
  prompt_used: string
}

interface PromptOverview {
  layers: PromptLayer[]
  brand_palettes: Record<string, BrandPalette>
  models: Record<string, ModelInfo>
  fallback_prompts: Record<string, string>
  pipeline_summary: string
}

interface FinalPromptPreview {
  user_prompt: string
  quality_suffix: string
  final_prompt: string
  total_chars: number
  model: string
  dimensions: string
  steps: number
}

// ============================================================
// Component
// ============================================================

export function PromptsPage() {
  const [overview, setOverview] = useState<PromptOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Layer expansion
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set())

  // Test generation
  const [testPrompt, setTestPrompt] = useState('')
  const [testBrand, setTestBrand] = useState('healthycollege')
  const [generating, setGenerating] = useState(false)
  const [testResults, setTestResults] = useState<TestResult[]>([])

  // Final prompt preview
  const [showFinalPreview, setShowFinalPreview] = useState(false)
  const [finalPreview, setFinalPreview] = useState<FinalPromptPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Clipboard
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ── Fetch overview on mount ──
  useEffect(() => {
    apiClient
      .get<PromptOverview>('/api/prompts/overview')
      .then(setOverview)
      .catch((e) => setError(e.message || 'Failed to load prompt overview'))
      .finally(() => setLoading(false))
  }, [])

  // ── Expand / collapse ──
  const toggleLayer = (id: string) => {
    setExpandedLayers((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const expandAll = () => {
    if (!overview) return
    setExpandedLayers(new Set(overview.layers.map((l) => l.id)))
  }

  const collapseAll = () => setExpandedLayers(new Set())

  // ── Copy to clipboard ──
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // ── Test generate ──
  const handleTestGenerate = async () => {
    if (!testPrompt.trim()) {
      toast.error('Enter a prompt to test')
      return
    }
    setGenerating(true)
    setTestResults([])
    try {
      const data = await apiClient.post<{ results: TestResult[] }>(
        '/api/prompts/test-generate',
        { prompt: testPrompt, brand: testBrand, count: 2 }
      )
      setTestResults(data.results)
      const successes = data.results.filter((r) => r.image_data).length
      if (successes > 0) {
        toast.success(`Generated ${successes} test image${successes > 1 ? 's' : ''}`)
      }
    } catch (e: any) {
      toast.error(e.message || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  // ── Preview final prompt ──
  const handlePreviewFinal = async () => {
    if (!testPrompt.trim()) {
      toast.error('Enter a prompt first')
      return
    }
    setLoadingPreview(true)
    try {
      const data = await apiClient.post<FinalPromptPreview>(
        '/api/prompts/build-final',
        { prompt: testPrompt, brand: testBrand }
      )
      setFinalPreview(data)
      setShowFinalPreview(true)
    } catch (e: any) {
      toast.error(e.message || 'Failed to build preview')
    } finally {
      setLoadingPreview(false)
    }
  }

  // ── Layer type badge color ──
  const layerBadge = (type: string) => {
    switch (type) {
      case 'ai_generation':
        return 'bg-purple-100 text-purple-700'
      case 'template':
        return 'bg-blue-100 text-blue-700'
      case 'suffix':
        return 'bg-amber-100 text-amber-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  // ────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  if (error || !overview) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Failed to load prompts</h2>
        <p className="text-gray-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Layers className="w-7 h-7 text-primary-500" />
          Image Prompt Pipeline
        </h1>
        <p className="mt-1 text-gray-500">
          Full transparency into how image prompts are built and sent to the AI image generator.
        </p>
        <div className="mt-3 p-3 bg-primary-50 rounded-lg border border-primary-100">
          <p className="text-sm text-primary-700 font-medium flex items-center gap-2">
            <ArrowRight className="w-4 h-4 flex-shrink-0" />
            {overview.pipeline_summary}
          </p>
        </div>
      </div>

      {/* ── Prompt Layers ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Prompt Layers</h2>
          <div className="flex gap-2">
            <button onClick={expandAll} className="text-xs text-primary-600 hover:underline">
              Expand all
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={collapseAll} className="text-xs text-primary-600 hover:underline">
              Collapse all
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {overview.layers.map((layer) => {
            const isExpanded = expandedLayers.has(layer.id)
            return (
              <div
                key={layer.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden transition-shadow hover:shadow-sm"
              >
                <button
                  onClick={() => toggleLayer(layer.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{layer.name}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${layerBadge(layer.type)}`}
                      >
                        {layer.type === 'ai_generation'
                          ? 'AI Generation'
                          : layer.type === 'template'
                          ? 'Template'
                          : 'Suffix'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5 truncate">{layer.description}</p>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-4 border-t border-gray-100">
                    <div className="relative mt-3">
                      <pre className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-[400px] overflow-y-auto">
                        {layer.content}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(layer.content, layer.id)}
                        className="absolute top-2 right-2 p-1.5 bg-white rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                        title="Copy to clipboard"
                      >
                        {copiedId === layer.id ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Brand Palettes ── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Palette className="w-5 h-5 text-primary-500" />
          Brand Color Palettes
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(overview.brand_palettes).map(([brand, palette]) => (
            <div key={brand} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-lg shadow-inner"
                  style={{ background: `linear-gradient(135deg, ${palette.primary}, ${palette.accent})` }}
                />
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">{brand}</h3>
                  <p className="text-xs text-gray-500">{palette.name}</p>
                </div>
              </div>
              <div className="flex gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-4 h-4 rounded-full border border-gray-200"
                    style={{ backgroundColor: palette.primary }}
                  />
                  <span className="text-xs text-gray-500 font-mono">{palette.primary}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-4 h-4 rounded-full border border-gray-200"
                    style={{ backgroundColor: palette.accent }}
                  />
                  <span className="text-xs text-gray-500 font-mono">{palette.accent}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{palette.color_description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── AI Models ── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Cpu className="w-5 h-5 text-primary-500" />
          Image Generation Models
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(overview.models).map(([key, model]) => (
            <div key={key} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                  {key}
                </span>
              </div>
              <h3 className="font-semibold text-gray-900 font-mono">{model.name}</h3>
              <div className="mt-2 space-y-1 text-sm text-gray-600">
                <p>
                  <span className="text-gray-400">Dimensions:</span> {model.dimensions}
                </p>
                <p>
                  <span className="text-gray-400">Steps:</span> {model.steps}
                </p>
              </div>
              <p className="mt-2 text-xs text-gray-500">{model.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Fallback Prompts ── */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Fallback Prompts (when AI fails)
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {Object.entries(overview.fallback_prompts).map(([category, prompt]) => (
              <div key={category} className="px-5 py-3 flex items-start gap-3">
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded mt-0.5 whitespace-nowrap">
                  {category}
                </span>
                <p className="text-sm text-gray-700 leading-relaxed">{prompt}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Test Image Generation ── */}
      <section className="border-t border-gray-200 pt-8">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-2">
          <Wand2 className="w-5 h-5 text-primary-500" />
          Test Image Generation
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Enter a prompt and generate 2 test images to see exactly what the AI produces. Uses the
          post model (ZImageTurbo_INT8).
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          {/* Prompt input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image Prompt</label>
            <textarea
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="e.g. Soft cinematic close-up of fresh ginger root on a white countertop in morning sunlight..."
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
              rows={3}
            />
          </div>

          {/* Brand selector + actions */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
              <select
                value={testBrand}
                onChange={(e) => setTestBrand(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {overview &&
                  Object.keys(overview.brand_palettes).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
              </select>
            </div>

            <button
              onClick={handlePreviewFinal}
              disabled={loadingPreview || !testPrompt.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingPreview ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              Preview Final Prompt
            </button>

            <button
              onClick={handleTestGenerate}
              disabled={generating || !testPrompt.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Generate 2 Test Images
                </>
              )}
            </button>
          </div>

          {/* Final prompt preview */}
          {showFinalPreview && finalPreview && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900">
                  Final Prompt Sent to deAPI
                </h3>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{finalPreview.total_chars} chars</span>
                  <span>
                    {finalPreview.model} · {finalPreview.dimensions}
                  </span>
                </div>
              </div>
              <div className="relative">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed max-h-[200px] overflow-y-auto">
                  {finalPreview.final_prompt}
                </pre>
                <button
                  onClick={() => copyToClipboard(finalPreview.final_prompt, 'final')}
                  className="absolute top-0 right-0 p-1.5 bg-white rounded border border-gray-200 hover:bg-gray-50"
                >
                  {copiedId === 'final' ? (
                    <Check className="w-3 h-3 text-green-500" />
                  ) : (
                    <Copy className="w-3 h-3 text-gray-400" />
                  )}
                </button>
              </div>

              {/* Highlight the parts */}
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  Your prompt: {finalPreview.user_prompt.length} chars
                </span>
                <span className="text-gray-400">+</span>
                <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  Quality suffix: {finalPreview.quality_suffix.length} chars
                </span>
                <span className="text-gray-400">=</span>
                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  Total: {finalPreview.total_chars} chars
                </span>
              </div>
            </div>
          )}

          {/* Test results */}
          {testResults.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary-500" />
                Generated Results
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {testResults.map((result) => (
                  <div key={result.index} className="rounded-lg border border-gray-200 overflow-hidden">
                    {result.image_data ? (
                      <>
                        <img
                          src={result.image_data}
                          alt={`Test image ${result.index}`}
                          className="w-full aspect-[4/5] object-cover"
                        />
                        <div className="p-3 bg-gray-50 border-t border-gray-200">
                          <p className="text-xs text-gray-500">
                            Image {result.index} · Generated in {result.generation_time}s
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="p-6 flex flex-col items-center justify-center text-center aspect-[4/5] bg-red-50">
                        <AlertTriangle className="w-8 h-8 text-red-400 mb-2" />
                        <p className="text-sm text-red-600 font-medium">Generation failed</p>
                        <p className="text-xs text-red-400 mt-1">{result.error}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {generating && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin text-primary-500 mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  Generating 2 test images... This takes 20-40 seconds.
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Each image uses the ZImageTurbo model at 1088×1360
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
