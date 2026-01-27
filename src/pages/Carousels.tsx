import { useState } from 'react'
import { 
  Layers,
  Sparkles,
  Image,
  Type,
  Palette,
  Lightbulb,
  ArrowRight,
  CheckCircle2,
  Wand2,
  LayoutTemplate
} from 'lucide-react'

interface CarouselStep {
  id: number
  title: string
  description: string
  icon: React.ReactNode
  status: 'upcoming' | 'current' | 'completed'
}

export function CarouselsPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  const steps: CarouselStep[] = [
    {
      id: 1,
      title: 'Select Template',
      description: 'Choose a carousel template style that fits your content',
      icon: <LayoutTemplate className="w-6 h-6" />,
      status: 'current'
    },
    {
      id: 2,
      title: 'Generate Ideas',
      description: 'AI generates content ideas relevant to health, fitness, and longevity',
      icon: <Lightbulb className="w-6 h-6" />,
      status: 'upcoming'
    },
    {
      id: 3,
      title: 'Design & Customize',
      description: 'AI creates the full carousel design with your brand colors',
      icon: <Wand2 className="w-6 h-6" />,
      status: 'upcoming'
    },
    {
      id: 4,
      title: 'Publish',
      description: 'Schedule or publish directly to Instagram',
      icon: <ArrowRight className="w-6 h-6" />,
      status: 'upcoming'
    }
  ]

  const templateStyles = [
    {
      id: 'minimal',
      name: 'Minimal Clean',
      description: 'Simple backgrounds with bold typography',
      preview: 'bg-gradient-to-br from-gray-50 to-gray-100',
      features: ['Solid color backgrounds', 'Large headlines', 'Minimal design']
    },
    {
      id: 'gradient',
      name: 'Gradient Flow',
      description: 'Smooth gradients with modern aesthetic',
      preview: 'bg-gradient-to-br from-blue-400 to-purple-500',
      features: ['Gradient backgrounds', 'Overlay text', 'Modern look']
    },
    {
      id: 'nature',
      name: 'Nature Inspired',
      description: 'AI-generated nature backgrounds matching your content',
      preview: 'bg-gradient-to-br from-green-400 to-emerald-600',
      features: ['AI backgrounds', 'Nature themes', 'Wellness vibes']
    },
    {
      id: 'abstract',
      name: 'Abstract Art',
      description: 'AI-generated abstract art backgrounds',
      preview: 'bg-gradient-to-br from-orange-400 to-pink-500',
      features: ['Abstract AI art', 'Unique visuals', 'Eye-catching']
    }
  ]

  const contentIdeas = [
    '🥗 Top 10 foods for gut health',
    '💪 Morning routines for energy',
    '🧘 Stress relief techniques',
    '🌙 Sleep optimization tips',
    '🏃 Simple exercises for longevity',
    '🍵 Anti-inflammatory foods guide',
    '🧠 Brain health boosters',
    '❤️ Heart-healthy habits'
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="w-7 h-7 text-primary-500" />
            Carousel Generator
          </h1>
          <p className="text-gray-500 mt-1">
            Create stunning carousel posts with AI-powered design and content
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
          <Sparkles className="w-5 h-5" />
          <span className="font-medium">Coming Soon</span>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h2>
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  step.status === 'completed' 
                    ? 'bg-green-100 text-green-600' 
                    : step.status === 'current'
                    ? 'bg-primary-100 text-primary-600'
                    : 'bg-gray-100 text-gray-400'
                }`}>
                  {step.status === 'completed' ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : (
                    step.icon
                  )}
                </div>
                <div className="mt-2 text-center max-w-[140px]">
                  <p className={`text-sm font-medium ${
                    step.status === 'current' ? 'text-primary-600' : 'text-gray-700'
                  }`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{step.description}</p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-24 h-0.5 mx-4 ${
                  step.status === 'completed' ? 'bg-green-300' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Template Selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <LayoutTemplate className="w-5 h-5 text-primary-500" />
          Step 1: Select Template Style
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {templateStyles.map((template) => (
            <button
              key={template.id}
              onClick={() => setSelectedTemplate(template.id)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                selectedTemplate === template.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Preview */}
              <div className={`w-full aspect-square rounded-lg ${template.preview} mb-3 flex items-center justify-center`}>
                <div className="w-3/4 space-y-2">
                  <div className="h-3 bg-white/30 rounded" />
                  <div className="h-3 bg-white/30 rounded w-2/3" />
                  <div className="h-2 bg-white/20 rounded w-1/2 mt-4" />
                </div>
              </div>
              
              <h3 className="font-semibold text-gray-900">{template.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{template.description}</p>
              
              <div className="mt-3 flex flex-wrap gap-1">
                {template.features.map((feature, i) => (
                  <span 
                    key={i}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content Ideas Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Content Ideas */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            AI Content Ideas
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Our AI will generate carousel content ideas tailored to your niche:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {contentIdeas.map((idea, i) => (
              <div 
                key={i}
                className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                {idea}
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-500" />
            Planned Features
          </h2>
          <div className="space-y-3">
            {[
              { icon: <Palette className="w-5 h-5" />, title: 'Brand Colors', desc: 'Automatically uses your brand color palette' },
              { icon: <Type className="w-5 h-5" />, title: 'Smart Typography', desc: 'AI selects optimal fonts and sizes' },
              { icon: <Image className="w-5 h-5" />, title: 'AI Backgrounds', desc: 'Generate unique backgrounds for each slide' },
              { icon: <Layers className="w-5 h-5" />, title: 'Multi-Brand', desc: 'Generate for all your brands at once' },
              { icon: <Wand2 className="w-5 h-5" />, title: 'Content Generation', desc: 'AI writes the carousel content for you' },
              { icon: <ArrowRight className="w-5 h-5" />, title: 'Direct Publish', desc: 'Schedule and publish directly to Instagram' },
            ].map((feature, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-primary-500">{feature.icon}</div>
                <div>
                  <p className="font-medium text-gray-900">{feature.title}</p>
                  <p className="text-sm text-gray-500">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl p-6 text-white">
        <h2 className="text-lg font-semibold mb-2">🚀 Development Roadmap</h2>
        <p className="text-primary-100 mb-4">
          This feature is under active development. Here's what's coming:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 rounded-lg p-4">
            <h3 className="font-medium mb-2">Phase 1: Templates</h3>
            <ul className="text-sm text-primary-100 space-y-1">
              <li>• Template system design</li>
              <li>• Background color automation</li>
              <li>• Font/style selection</li>
            </ul>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <h3 className="font-medium mb-2">Phase 2: AI Content</h3>
            <ul className="text-sm text-primary-100 space-y-1">
              <li>• Niche-specific ideas</li>
              <li>• Health & fitness topics</li>
              <li>• Longevity content</li>
            </ul>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <h3 className="font-medium mb-2">Phase 3: Full Automation</h3>
            <ul className="text-sm text-primary-100 space-y-1">
              <li>• AI design generation</li>
              <li>• Multi-brand support</li>
              <li>• Instagram publishing</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
