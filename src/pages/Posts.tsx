import { useState, useRef, useCallback, useEffect } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect, Text, Line, Group } from 'react-konva'
import useImage from 'use-image'
import Konva from 'konva'
import { 
  FileImage,
  Sparkles,
  Type,
  Palette,
  Download,
  Loader2,
  Check,
  Wand2,
  Eye,
  Image as ImageIcon,
  Settings2,
  Upload,
  RotateCcw,
  Save
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

// Constants matching the design requirements
const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1350
const PREVIEW_SCALE = 0.4 // Scale for preview display

// Layout constants from requirements (fixed spacing)
const DEFAULT_READ_CAPTION_BOTTOM = 45 // px from bottom
const DEFAULT_TITLE_GAP = 30 // px gap between title bottom and read caption
const DEFAULT_LOGO_GAP = 36 // px gap between logo and title top

// Default general settings (for reset functionality)
const DEFAULT_GENERAL_SETTINGS = {
  fontSize: 70,
  barWidth: 0,
  layout: {
    readCaptionBottom: DEFAULT_READ_CAPTION_BOTTOM,
    titleGap: DEFAULT_TITLE_GAP,
    logoGap: DEFAULT_LOGO_GAP,
    titlePaddingX: 45
  }
}

const STORAGE_KEY = 'posts-general-settings'

// Type for general settings
type GeneralSettings = typeof DEFAULT_GENERAL_SETTINGS

// Brand configurations with colors for AI image prompts
const BRAND_CONFIGS: Record<string, { 
  name: string
  color: string
  colorName: string
  accentColor: string
}> = {
  healthycollege: { 
    name: 'Healthy College', 
    color: '#22c55e',
    colorName: 'vibrant green',
    accentColor: '#16a34a'
  },
  longevitycollege: { 
    name: 'Longevity College', 
    color: '#0ea5e9',
    colorName: 'electric blue',
    accentColor: '#0284c7'
  },
  vitalitycollege: { 
    name: 'Vitality College', 
    color: '#14b8a6',
    colorName: 'teal',
    accentColor: '#0d9488'
  },
  wellbeingcollege: { 
    name: 'Wellbeing College', 
    color: '#eab308',
    colorName: 'golden yellow',
    accentColor: '#ca8a04'
  },
  holisticcollege: { 
    name: 'Holistic College', 
    color: '#f97316',
    colorName: 'coral orange',
    accentColor: '#ea580c'
  },
}

// Layout configuration
interface LayoutConfig {
  readCaptionBottom: number // px from bottom
  titleGap: number // px between title and read caption
  logoGap: number // px between logo and title
  titlePaddingX: number // horizontal padding for title
}

// Title configuration
interface TitleConfig {
  text: string
  fontSize: number
}

// Post state
interface PostState {
  backgroundImage: string | null
  title: TitleConfig
  logoImage: string | null
  layout: LayoutConfig
}

// Background Image Component (non-interactive)
function BackgroundImageLayer({ 
  imageUrl
}: { 
  imageUrl: string
}) {
  const [image] = useImage(imageUrl, 'anonymous')
  
  if (!image) return null
  
  return (
    <Rect
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      fillPatternImage={image}
      fillPatternScaleX={CANVAS_WIDTH / image.width}
      fillPatternScaleY={CANVAS_HEIGHT / image.height}
    />
  )
}

// Gradient Overlay Component
function GradientOverlay() {
  return (
    <Rect
      x={0}
      y={CANVAS_HEIGHT * 0.4}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT * 0.6}
      fillLinearGradientStartPoint={{ x: 0, y: 0 }}
      fillLinearGradientEndPoint={{ x: 0, y: CANVAS_HEIGHT * 0.6 }}
      fillLinearGradientColorStops={[0, 'rgba(0,0,0,0)', 0.3, 'rgba(0,0,0,0.5)', 1, 'rgba(0,0,0,0.95)']}
      listening={false}
    />
  )
}

// Brand abbreviations for logo fallback
const BRAND_ABBREVIATIONS: Record<string, string> = {
  healthycollege: 'HCO',
  holisticcollege: 'HLC',
  longevitycollege: 'LCO',
  vitalitycollege: 'VCO',
  wellbeingcollege: 'WCO'
}

// Logo with lines component (non-draggable, position calculated)
function LogoWithLines({ 
  logoUrl, 
  y,
  barWidth,
  titleWidth,
  brandName
}: { 
  logoUrl: string | null
  y: number
  barWidth: number // 0 = auto (match title width), otherwise fixed width for each bar
  titleWidth: number // Width of the title text for auto mode
  brandName?: string // Brand name for fallback text
}) {
  const [image] = useImage(logoUrl || '', 'anonymous')
  
  // Layout: logo in center with 113px gap, bars on sides
  const logoGapWidth = 113 // px for logo in the middle
  
  const logoWidth = image ? Math.min(image.width, logoGapWidth - 20) : logoGapWidth - 20
  const logoHeight = image ? (logoWidth / image.width) * image.height : 40
  
  // Calculate bar positions based on barWidth setting
  // Auto mode: bars extend to match title width on each side
  // Manual mode: fixed width bars, growing outward from logo gap
  const effectiveBarWidth = barWidth === 0 
    ? (titleWidth / 2) - (logoGapWidth / 2) // Auto: match half of title width minus logo gap
    : barWidth
  
  // Left bar: ends at logo gap, starts further left based on bar width
  const leftLineEnd = (CANVAS_WIDTH / 2) - (logoGapWidth / 2)
  const leftLineStart = leftLineEnd - effectiveBarWidth
  
  // Right bar: starts at logo gap, extends right based on bar width
  const rightLineStart = (CANVAS_WIDTH / 2) + (logoGapWidth / 2)
  const rightLineEnd = rightLineStart + effectiveBarWidth
  
  // Get brand abbreviation for fallback
  const abbreviation = brandName ? (BRAND_ABBREVIATIONS[brandName] || 'LOGO') : 'LOGO'
  
  return (
    <Group x={0} y={y}>
      {/* Left line */}
      <Line
        points={[Math.max(0, leftLineStart), logoHeight / 2, leftLineEnd, logoHeight / 2]}
        stroke="white"
        strokeWidth={2}
      />
      
      {/* Right line */}
      <Line
        points={[rightLineStart, logoHeight / 2, Math.min(CANVAS_WIDTH, rightLineEnd), logoHeight / 2]}
        stroke="white"
        strokeWidth={2}
      />
      
      {/* Logo or brand abbreviation fallback */}
      {image ? (
        <KonvaImage
          image={image}
          width={logoWidth}
          height={logoHeight}
          x={(CANVAS_WIDTH - logoWidth) / 2}
          y={0}
        />
      ) : (
        <Text
          text={abbreviation}
          fontSize={28}
          fontFamily="Inter, sans-serif"
          fontStyle="bold"
          fill="white"
          x={CANVAS_WIDTH / 2 - (abbreviation.length * 8)}
          y={logoHeight / 2 - 14}
        />
      )}
    </Group>
  )
}

// Title component with auto-wrapping (non-draggable)
function TitleLayer({
  config,
  x,
  y,
  paddingX
}: {
  config: TitleConfig
  x: number
  y: number
  paddingX: number
}) {
  // Get the text content
  const textContent = config.text
  const textWidth = CANVAS_WIDTH - paddingX * 2
  
  // Calculate wrapped lines
  const words = textContent.split(' ')
  const lines: string[] = []
  let currentLine = ''
  
  // Simple word wrapping estimation (Konva will do actual wrapping)
  // Anton is a condensed font, so chars are narrower (0.48 factor vs typical 0.55)
  const avgCharWidth = config.fontSize * 0.48
  const maxCharsPerLine = Math.floor(textWidth / avgCharWidth)
  
  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    if (testLine.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  })
  if (currentLine) {
    lines.push(currentLine)
  }
  
  const lineHeight = config.fontSize * 1.1 // Tighter line height
  
  return (
    <Group x={x} y={y}>
      {lines.map((line, i) => {
        const lineY = i * lineHeight
        
        return (
          <Text
            key={i}
            text={line}
            fontSize={config.fontSize}
            fontFamily="Anton"
            fontStyle="normal"
            fill="white"
            width={textWidth}
            align="center"
            y={lineY}
          />
        )
      })}
    </Group>
  )
}

// Helper to calculate title height based on text and font size
function calculateTitleHeight(text: string, fontSize: number, paddingX: number): number {
  const textWidth = CANVAS_WIDTH - paddingX * 2
  // Anton is a condensed font, so chars are narrower (0.48 factor vs typical 0.55)
  const avgCharWidth = fontSize * 0.48
  const maxCharsPerLine = Math.floor(textWidth / avgCharWidth)
  
  const words = text.split(' ')
  let lines = 1
  let currentLine = ''
  
  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    if (testLine.length > maxCharsPerLine && currentLine) {
      lines++
      currentLine = word
    } else {
      currentLine = testLine
    }
  })
  
  // Match the actual lineHeight used in TitleLayer (1.1)
  // Height = (lines - 1) * lineHeight + fontSize for accurate positioning
  const lineHeight = fontSize * 1.1
  return (lines - 1) * lineHeight + fontSize
}

// Read Caption component
function ReadCaption({ y }: { y: number }) {
  return (
    <Text
      text="Read Caption"
      fontSize={24}
      fontFamily="Inter, sans-serif"
      fill="white"
      x={0}
      y={y}
      width={CANVAS_WIDTH}
      align="center"
      opacity={0.9}
    />
  )
}

// Main Posts Page Component
export function PostsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  // Font loading state
  const [fontLoaded, setFontLoaded] = useState(false)
  
  // Preload font on mount
  useEffect(() => {
    document.fonts.load('1em Anton').then(() => {
      setFontLoaded(true)
    })
  }, [])
  
  // Step state: 'generate' | 'finetune'
  const [step, setStep] = useState<'generate' | 'finetune'>('generate')
  
  // Brand selection
  const [selectedBrands, setSelectedBrands] = useState<string[]>(Object.keys(BRAND_CONFIGS))
  const [activeBrand, setActiveBrand] = useState('healthycollege')
  const [previewBrand, setPreviewBrand] = useState('healthycollege') // For step 1 preview
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCreatingJob, setIsCreatingJob] = useState(false)
  
  // Generated content
  const [generatedTitle, setGeneratedTitle] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  
  // GENERAL settings that apply to ALL brands (Step 1) - load from localStorage
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved) as GeneralSettings
      }
    } catch (e) {
      console.error('Failed to load settings from localStorage:', e)
    }
    return DEFAULT_GENERAL_SETTINGS
  })
  
  // Preview title for Step 1 (before generation)
  const [previewTitle, setPreviewTitle] = useState('STUDY REVEALS Vitamin C SUPPLEMENTATION CAN REDUCE STRESS & CORTISOL BY 40%')
  
  
  // Post states for each brand (populated after generation, for Step 2)
  const [postStates, setPostStates] = useState<Record<string, PostState>>(() => {
    const initial: Record<string, PostState> = {}
    Object.keys(BRAND_CONFIGS).forEach(brand => {
      initial[brand] = {
        backgroundImage: null,
        title: {
          text: '',
          fontSize: 70
        },
        logoImage: null,
        layout: {
          readCaptionBottom: DEFAULT_READ_CAPTION_BOTTOM,
          titleGap: DEFAULT_TITLE_GAP,
          logoGap: DEFAULT_LOGO_GAP,
          titlePaddingX: 45
        }
      }
    })
    return initial
  })
  
  // Refs
  const stageRef = useRef<Konva.Stage>(null)
  
  // Get current post state
  const currentPost = postStates[activeBrand]
  const brandConfig = BRAND_CONFIGS[activeBrand]
  
  // Calculate positions based on layout config
  const layout = currentPost.layout
  const titleHeight = calculateTitleHeight(
    currentPost.title.text || 'PLACEHOLDER TEXT', 
    currentPost.title.fontSize, 
    layout.titlePaddingX
  )
  const readCaptionY = CANVAS_HEIGHT - layout.readCaptionBottom - 24
  const titleY = readCaptionY - layout.titleGap - titleHeight
  const logoY = titleY - layout.logoGap - 40
  
  // Update post state helper
  const updatePostState = useCallback((brand: string, updates: Partial<PostState>) => {
    setPostStates(prev => ({
      ...prev,
      [brand]: { ...prev[brand], ...updates }
    }))
  }, [])
  
  // Update title
  const updateTitle = useCallback((updates: Partial<TitleConfig>) => {
    setPostStates(prev => ({
      ...prev,
      [activeBrand]: {
        ...prev[activeBrand],
        title: { ...prev[activeBrand].title, ...updates }
      }
    }))
  }, [activeBrand])
  
  // Update layout (for Step 2 per-brand)
  const updateLayout = useCallback((updates: Partial<LayoutConfig>) => {
    setPostStates(prev => ({
      ...prev,
      [activeBrand]: {
        ...prev[activeBrand],
        layout: { ...prev[activeBrand].layout, ...updates }
      }
    }))
  }, [activeBrand])
  
  // Update general settings (Step 1 - applies to ALL brands)
  const updateGeneralLayout = useCallback((updates: Partial<LayoutConfig>) => {
    setGeneralSettings(prev => ({
      ...prev,
      layout: { ...prev.layout, ...updates }
    }))
  }, [])
  
  // Save settings to localStorage
  const saveSettings = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(generalSettings))
      toast.success('Settings saved!')
    } catch (e) {
      toast.error('Failed to save settings')
    }
  }, [generalSettings])
  
  // Reset to default settings
  const resetToDefault = useCallback(() => {
    setGeneralSettings(DEFAULT_GENERAL_SETTINGS)
    localStorage.removeItem(STORAGE_KEY)
    toast.success('Settings reset to default')
  }, [])
  
  // Toggle brand selection
  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev => {
      if (prev.includes(brand)) {
        if (prev.length === 1) return prev
        const newBrands = prev.filter(b => b !== brand)
        if (activeBrand === brand) {
          setActiveBrand(newBrands[0])
        }
        if (previewBrand === brand) {
          setPreviewBrand(newBrands[0])
        }
        return newBrands
      }
      return [...prev, brand]
    })
  }
  
  // Generate viral post content (Step 1)
  const handleGenerateViralPost = async () => {
    setIsGenerating(true)
    toast.loading('Generating viral post title...', { id: 'generate-post' })
    
    try {
      // Use the new post-specific endpoint that generates statement-based titles
      const response = await fetch('/reels/generate-post-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to generate content')
      }
      
      const data = await response.json()
      
      // Set generated content
      setGeneratedTitle(data.title)
      setPreviewTitle(data.title)
      if (data.image_prompt) {
        setAiPrompt(data.image_prompt)
      }
      
      // Update all selected brands with generated content AND general settings
      // Do NOT modify generalSettings - keep bar width and other settings as-is
      setPostStates(prev => {
        const updated = { ...prev }
        selectedBrands.forEach(brand => {
          updated[brand] = {
            ...updated[brand],
            title: {
              text: data.title,
              fontSize: generalSettings.fontSize
            },
            layout: { ...generalSettings.layout }
          }
        })
        return updated
      })
      
      toast.success(`🎉 Generated: "${data.title.slice(0, 50)}..."`, { id: 'generate-post', duration: 5000 })
      setStep('finetune')
      
    } catch (error) {
      console.error('Generate error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate', { id: 'generate-post' })
    } finally {
      setIsGenerating(false)
    }
  }
  
  // Create post job (Step 2)
  const handleCreatePostJob = async () => {
    if (!generatedTitle.trim()) {
      toast.error('Generate content first')
      return
    }
    
    if (selectedBrands.length === 0) {
      toast.error('Select at least one brand')
      return
    }
    
    setIsCreatingJob(true)
    toast.loading('Creating post job...', { id: 'create-job' })
    
    try {
      // Create job via API (similar to reels)
      const response = await fetch('/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'post',
          title: generatedTitle,
          brands: selectedBrands,
          ai_prompt: aiPrompt,
          post_config: {
            layout: currentPost.layout,
            fontSize: currentPost.title.fontSize
          }
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to create job')
      }
      
      const job = await response.json()
      
      // Invalidate jobs cache
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      
      toast.success(`✅ Post job created! ID: ${job.id?.slice(0, 8)}...`, { id: 'create-job' })
      
      // Reset and go back to generate step
      setStep('generate')
      setGeneratedTitle('')
      setAiPrompt('')
      
      // Navigate to jobs page
      navigate('/jobs')
      
    } catch (error) {
      console.error('Create job error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create job', { id: 'create-job' })
    } finally {
      setIsCreatingJob(false)
    }
  }
  
  // Handle background upload
  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      updatePostState(activeBrand, { backgroundImage: event.target?.result as string })
    }
    reader.readAsDataURL(file)
  }
  
  // Handle logo upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      updatePostState(activeBrand, { logoImage: event.target?.result as string })
    }
    reader.readAsDataURL(file)
  }
  
  // Export single image
  const exportImage = () => {
    if (!stageRef.current) return
    
    const uri = stageRef.current.toDataURL({
      pixelRatio: 1 / PREVIEW_SCALE,
      mimeType: 'image/png'
    })
    
    const link = document.createElement('a')
    link.download = `post-${activeBrand}-${Date.now()}.png`
    link.href = uri
    link.click()
    
    toast.success('Image exported!')
  }
  
  // Generate AI background
  const generateBackground = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Enter a prompt first')
      return
    }
    
    setIsGenerating(true)
    toast.loading('Generating AI background (this may take ~30s)...', { id: 'generate-bg' })
    
    try {
      const response = await fetch('/reels/generate-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          brand: activeBrand
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to generate background')
      }
      
      const data = await response.json()
      
      // Update the background image for current brand
      setPostStates(prev => ({
        ...prev,
        [activeBrand]: {
          ...prev[activeBrand],
          backgroundImage: data.image_data
        }
      }))
      
      toast.success('Background generated!', { id: 'generate-bg' })
    } catch (error) {
      console.error('Generate background error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to generate background', { id: 'generate-bg' })
    } finally {
      setIsGenerating(false)
    }
  }
  
  // STEP 1: Generate Viral Post
  if (step === 'generate') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileImage className="w-7 h-7 text-primary-500" />
            Post Generator
          </h1>
          <p className="text-gray-500 mt-1">
            Create viral image posts for Instagram
          </p>
        </div>
        
        <div className="flex gap-6">
          {/* Left: Canvas Preview */}
          <div className="flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-700">Preview</h3>
                <select
                  value={previewBrand}
                  onChange={(e) => setPreviewBrand(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1"
                >
                  {selectedBrands.map(brand => (
                    <option key={brand} value={brand}>{BRAND_CONFIGS[brand].name}</option>
                  ))}
                </select>
              </div>
              <Stage
                key={`step1-canvas-${fontLoaded}`}
                width={CANVAS_WIDTH * PREVIEW_SCALE}
                height={CANVAS_HEIGHT * PREVIEW_SCALE}
                style={{ 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}
                scaleX={PREVIEW_SCALE}
                scaleY={PREVIEW_SCALE}
              >
                <Layer>
                  {/* Placeholder background */}
                  <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#1a1a2e" />
                  
                  {/* Gradient overlay */}
                  <GradientOverlay />
                  
                  {/* Title preview */}
                  <TitleLayer
                    config={{
                      text: previewTitle,
                      fontSize: generalSettings.fontSize
                    }}
                    x={generalSettings.layout.titlePaddingX}
                    y={CANVAS_HEIGHT - generalSettings.layout.readCaptionBottom - 24 - generalSettings.layout.titleGap - calculateTitleHeight(previewTitle, generalSettings.fontSize, generalSettings.layout.titlePaddingX)}
                    paddingX={generalSettings.layout.titlePaddingX}
                  />
                  
                  {/* Logo - above title */}
                  <LogoWithLines 
                    logoUrl={null}
                    y={CANVAS_HEIGHT - generalSettings.layout.readCaptionBottom - 24 - generalSettings.layout.titleGap - calculateTitleHeight(previewTitle, generalSettings.fontSize, generalSettings.layout.titlePaddingX) - generalSettings.layout.logoGap - 40}
                    barWidth={generalSettings.barWidth}
                    titleWidth={CANVAS_WIDTH - generalSettings.layout.titlePaddingX * 2}
                    brandName={previewBrand}
                  />
                  
                  {/* Read caption */}
                  <ReadCaption y={CANVAS_HEIGHT - generalSettings.layout.readCaptionBottom - 24} />
                </Layer>
              </Stage>
            </div>
          </div>
          
          {/* Right: Controls */}
          <div className="flex-1 space-y-4">
            {/* Brand Selection */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Select Brands</h2>
              <div className="flex flex-wrap gap-2">
                {Object.keys(BRAND_CONFIGS).map(brand => (
                  <button
                    key={brand}
                    onClick={() => toggleBrand(brand)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                      selectedBrands.includes(brand)
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: BRAND_CONFIGS[brand].color }}
                    />
                    <span className={`text-sm font-medium ${selectedBrands.includes(brand) ? 'text-primary-700' : 'text-gray-600'}`}>
                      {BRAND_CONFIGS[brand].name}
                    </span>
                    {selectedBrands.includes(brand) && (
                      <Check className="w-3 h-3 text-primary-500" />
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">{selectedBrands.length} brand(s) selected</p>
            </div>
            
            {/* Generate Button */}
            <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl p-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">Generate Viral Post</h2>
                  <p className="text-primary-100 text-sm">AI will generate title & prompt</p>
                </div>
                <button
                  onClick={handleGenerateViralPost}
                  disabled={isGenerating || selectedBrands.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-primary-600 rounded-lg font-semibold hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  Generate
                </button>
              </div>
            </div>
            
            {/* General Settings */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                General Settings
                <span className="text-xs font-normal text-gray-500">(applies to all brands)</span>
              </h2>
              
              {/* Font Size */}
              <div className="mb-4">
                <label className="text-sm text-gray-600 mb-1 block">Font Size: {generalSettings.fontSize}px</label>
                <input
                  type="range"
                  min={40}
                  max={90}
                  value={generalSettings.fontSize}
                  onChange={(e) => setGeneralSettings(prev => ({ ...prev, fontSize: Number(e.target.value) }))}
                  className="w-full accent-primary-500"
                />
              </div>
              
              {/* Layout Spacing */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-gray-500">Read Caption Bottom: {generalSettings.layout.readCaptionBottom}px</label>
                  <input
                    type="range" min={20} max={80}
                    value={generalSettings.layout.readCaptionBottom}
                    onChange={(e) => updateGeneralLayout({ readCaptionBottom: Number(e.target.value) })}
                    className="w-full accent-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Title Gap: {generalSettings.layout.titleGap}px</label>
                  <input
                    type="range" min={10} max={60}
                    value={generalSettings.layout.titleGap}
                    onChange={(e) => updateGeneralLayout({ titleGap: Number(e.target.value) })}
                    className="w-full accent-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Logo Gap: {generalSettings.layout.logoGap}px</label>
                  <input
                    type="range" min={20} max={60}
                    value={generalSettings.layout.logoGap}
                    onChange={(e) => updateGeneralLayout({ logoGap: Number(e.target.value) })}
                    className="w-full accent-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Title Padding X: {generalSettings.layout.titlePaddingX}px</label>
                  <input
                    type="range" min={0} max={120}
                    value={generalSettings.layout.titlePaddingX}
                    onChange={(e) => updateGeneralLayout({ titlePaddingX: Number(e.target.value) })}
                    className="w-full accent-primary-500"
                  />
                </div>
              </div>
              
              {/* Bar Width */}
              <div className="border-t border-gray-100 pt-4 mb-4">
                <label className="text-xs text-gray-500 mb-1 block">
                  Bar Width: {generalSettings.barWidth === 0 ? 'Auto (match title)' : `${generalSettings.barWidth}px`}
                </label>
                <input
                  type="range" min={0} max={400}
                  value={generalSettings.barWidth}
                  onChange={(e) => setGeneralSettings(prev => ({ ...prev, barWidth: Number(e.target.value) }))}
                  className="w-full accent-primary-500"
                />
              </div>
              
              {/* Save / Reset buttons */}
              <div className="border-t border-gray-100 pt-4 flex gap-2">
                <button
                  onClick={saveSettings}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600"
                >
                  <Save className="w-4 h-4" />
                  Save Settings
                </button>
                <button
                  onClick={resetToDefault}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              </div>
            </div>
            
            {/* Manual Entry */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Or Enter Manually</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Preview Title</label>
                  <textarea
                    value={previewTitle}
                    onChange={(e) => setPreviewTitle(e.target.value)}
                    rows={2}
                    placeholder="Enter preview title..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">AI Image Prompt</label>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    rows={2}
                    placeholder="Describe the background image..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <button
                  onClick={() => {
                    if (previewTitle.trim()) {
                      // Apply general settings to all selected brands
                      setPostStates(prev => {
                        const updated = { ...prev }
                        selectedBrands.forEach(brand => {
                          updated[brand] = {
                            ...updated[brand],
                            title: {
                              text: previewTitle,
                              fontSize: generalSettings.fontSize
                            },
                            layout: { ...generalSettings.layout }
                          }
                        })
                        return updated
                      })
                      setGeneratedTitle(previewTitle)
                      setStep('finetune')
                    } else {
                      toast.error('Enter a title first')
                    }
                  }}
                  className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                >
                  Continue to Fine-tune →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  // STEP 2: Fine-tune and Preview
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileImage className="w-7 h-7 text-primary-500" />
            Fine-tune Post
          </h1>
          <p className="text-gray-500 mt-1">
            Adjust layout and styling, then generate for all brands
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep('generate')}
            className="px-4 py-2 text-gray-600 hover:text-gray-900"
          >
            ← Back
          </button>
          <button
            onClick={exportImage}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Export Preview
          </button>
          <button
            onClick={handleCreatePostJob}
            disabled={isCreatingJob}
            className="flex items-center gap-2 px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            {isCreatingJob ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Generate Posts
          </button>
        </div>
      </div>
      
      {/* Brand tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          {selectedBrands.map(brand => (
            <button
              key={brand}
              onClick={() => setActiveBrand(brand)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                activeBrand === brand
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: BRAND_CONFIGS[brand].color }}
              />
              {BRAND_CONFIGS[brand].name}
            </button>
          ))}
        </div>
      </div>
      
      {/* Main Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Canvas Preview */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Eye className="w-5 h-5 text-gray-500" />
              Preview
              <span 
                className="ml-2 px-2 py-0.5 text-xs rounded-full text-white"
                style={{ backgroundColor: brandConfig.color }}
              >
                {brandConfig.name}
              </span>
            </h2>
            <span className="text-sm text-gray-500">1080 × 1350</span>
          </div>
          
          {/* Canvas Container */}
          <div 
            className="relative mx-auto bg-gray-900 rounded-lg overflow-hidden shadow-2xl"
            style={{ 
              width: CANVAS_WIDTH * PREVIEW_SCALE, 
              height: CANVAS_HEIGHT * PREVIEW_SCALE 
            }}
          >
            <Stage
              key={`step2-canvas-${fontLoaded}`}
              ref={stageRef}
              width={CANVAS_WIDTH * PREVIEW_SCALE}
              height={CANVAS_HEIGHT * PREVIEW_SCALE}
              scaleX={PREVIEW_SCALE}
              scaleY={PREVIEW_SCALE}
            >
              <Layer>
                {/* Background */}
                {currentPost.backgroundImage ? (
                  <BackgroundImageLayer imageUrl={currentPost.backgroundImage} />
                ) : (
                  <Rect
                    x={0}
                    y={0}
                    width={CANVAS_WIDTH}
                    height={CANVAS_HEIGHT}
                    fill="#1a1a2e"
                  />
                )}
                
                {/* Gradient Overlay */}
                <GradientOverlay />
                
                {/* Logo with lines */}
                <LogoWithLines
                  logoUrl={currentPost.logoImage}
                  y={logoY}
                  barWidth={generalSettings.barWidth}
                  titleWidth={CANVAS_WIDTH - layout.titlePaddingX * 2}
                  brandName={activeBrand}
                />
                
                {/* Title */}
                <TitleLayer
                  config={currentPost.title}
                  x={layout.titlePaddingX}
                  y={titleY}
                  paddingX={layout.titlePaddingX}
                />
                
                {/* Read Caption */}
                <ReadCaption y={readCaptionY} />
              </Layer>
            </Stage>
          </div>
        </div>
        
        {/* Right Sidebar - Controls */}
        <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Background Controls */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary-500" />
              Background
            </h3>
            
            <div className="space-y-3">
              <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary-400 hover:bg-primary-50/50 transition-all">
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-600">Upload Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBackgroundUpload}
                  className="hidden"
                />
              </label>
              
              <button
                onClick={generateBackground}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg hover:from-primary-600 hover:to-primary-700 disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
                Generate with AI
              </button>
              
              {aiPrompt && (
                <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                  <strong>Prompt:</strong> {aiPrompt}
                </div>
              )}
            </div>
          </div>
          
          {/* Logo Upload */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Palette className="w-5 h-5 text-primary-500" />
              Brand Logo
            </h3>
            
            <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary-400 hover:bg-primary-50/50 transition-all">
              {currentPost.logoImage ? (
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-gray-600">Logo uploaded</span>
                </div>
              ) : (
                <>
                  <Upload className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-600">Upload Logo</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </label>
          </div>
          
          {/* Title Controls */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Type className="w-5 h-5 text-primary-500" />
              Title
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Title Text</label>
                <textarea
                  value={currentPost.title.text}
                  onChange={(e) => updateTitle({ text: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              
              <div>
                <label className="text-sm text-gray-600 mb-1 block">
                  Font Size: {currentPost.title.fontSize}px
                </label>
                <input
                  type="range"
                  min="30"
                  max="90"
                  value={currentPost.title.fontSize}
                  onChange={(e) => updateTitle({ fontSize: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          </div>
          
          {/* Layout Controls */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary-500" />
              Layout Spacing
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Read Caption from Bottom: {layout.readCaptionBottom}px
                </label>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={layout.readCaptionBottom}
                  onChange={(e) => updateLayout({ readCaptionBottom: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Title to Read Caption Gap: {layout.titleGap}px
                </label>
                <input
                  type="range"
                  min="10"
                  max="80"
                  value={layout.titleGap}
                  onChange={(e) => updateLayout({ titleGap: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Logo to Title Gap: {layout.logoGap}px
                </label>
                <input
                  type="range"
                  min="15"
                  max="80"
                  value={layout.logoGap}
                  onChange={(e) => updateLayout({ logoGap: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  Title Padding X: {layout.titlePaddingX}px
                </label>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={layout.titlePaddingX}
                  onChange={(e) => updateLayout({ titlePaddingX: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
              
              <button
                onClick={() => {
                  updateLayout({
                    readCaptionBottom: DEFAULT_READ_CAPTION_BOTTOM,
                    titleGap: DEFAULT_TITLE_GAP,
                    logoGap: DEFAULT_LOGO_GAP,
                    titlePaddingX: 40
                  })
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
