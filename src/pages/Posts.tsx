import { useState, useRef, useCallback } from 'react'
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
  Plus,
  Edit3,
  Copy
} from 'lucide-react'
import toast from 'react-hot-toast'

// Constants matching the design requirements
const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1350
const PREVIEW_SCALE = 0.4 // Scale for preview display

// Layout constants from requirements (fixed spacing)
const DEFAULT_READ_CAPTION_BOTTOM = 45 // px from bottom
const DEFAULT_TITLE_GAP = 30 // px gap between title bottom and read caption
const DEFAULT_LOGO_GAP = 36 // px gap between logo and title top

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
  highlightedText: string
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

// Logo with lines component (non-draggable, position calculated)
function LogoWithLines({ 
  logoUrl, 
  y
}: { 
  logoUrl: string | null
  y: number
}) {
  const [image] = useImage(logoUrl || '', 'anonymous')
  
  // Layout: 100px from left edge, 113px middle gap for logo, 100px from right edge
  const edgePadding = 100 // px from each edge
  const logoGapWidth = 113 // px for logo in the middle
  
  // Calculate line positions
  const leftLineStart = edgePadding
  const leftLineEnd = (CANVAS_WIDTH / 2) - (logoGapWidth / 2)
  const rightLineStart = (CANVAS_WIDTH / 2) + (logoGapWidth / 2)
  const rightLineEnd = CANVAS_WIDTH - edgePadding
  
  const logoWidth = image ? Math.min(image.width, logoGapWidth - 20) : logoGapWidth - 20
  const logoHeight = image ? (logoWidth / image.width) * image.height : 40
  
  return (
    <Group x={0} y={y}>
      {/* Left line */}
      <Line
        points={[leftLineStart, logoHeight / 2, leftLineEnd, logoHeight / 2]}
        stroke="white"
        strokeWidth={2}
      />
      
      {/* Right line */}
      <Line
        points={[rightLineStart, logoHeight / 2, rightLineEnd, logoHeight / 2]}
        stroke="white"
        strokeWidth={2}
      />
      
      {/* Logo or placeholder text */}
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
          text="LOGO"
          fontSize={28}
          fontFamily="Inter, sans-serif"
          fontStyle="bold"
          fill="white"
          x={CANVAS_WIDTH / 2 - 30}
          y={logoHeight / 2 - 14}
        />
      )}
    </Group>
  )
}

// Title component with highlight support and auto-wrapping (non-draggable)
function TitleLayer({
  config,
  highlightColor,
  x,
  y,
  paddingX
}: {
  config: TitleConfig
  highlightColor: string
  x: number
  y: number
  paddingX: number
}) {
  // Get the text content
  const textContent = config.text
  const highlightPhrase = config.highlightedText.trim().toUpperCase()
  const textWidth = CANVAS_WIDTH - paddingX * 2
  
  // Calculate wrapped lines for highlight detection
  const words = textContent.split(' ')
  const lines: string[] = []
  let currentLine = ''
  
  // Simple word wrapping estimation (Konva will do actual wrapping)
  const avgCharWidth = config.fontSize * 0.55 // Approximate for Anton
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
  
  const lineHeight = config.fontSize * 1.3
  
  return (
    <Group x={x} y={y}>
      {lines.map((line, i) => {
        const isHighlighted = line.toUpperCase().includes(highlightPhrase) || 
          highlightPhrase.includes(line.toUpperCase().trim())
        const lineY = i * lineHeight
        
        return (
          <Group key={i} y={lineY}>
            {/* Background for highlighted text */}
            {isHighlighted && (
              <Rect
                x={-10}
                y={0}
                width={textWidth + 20}
                height={lineHeight}
                fill={highlightColor}
              />
            )}
            {/* Text */}
            <Text
              text={line}
              fontSize={config.fontSize}
              fontFamily="Anton"
              fontStyle="normal"
              fill={isHighlighted ? 'black' : 'white'}
              width={textWidth}
              align="center"
            />
          </Group>
        )
      })}
    </Group>
  )
}

// Helper to calculate title height based on text and font size
function calculateTitleHeight(text: string, fontSize: number, paddingX: number): number {
  const textWidth = CANVAS_WIDTH - paddingX * 2
  const avgCharWidth = fontSize * 0.55
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
  
  return lines * fontSize * 1.3
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

// Mode type for workflow
type EditorMode = 'create' | 'edit'

// Main Posts Page Component
export function PostsPage() {
  // State
  const [editorMode, setEditorMode] = useState<EditorMode>('create')
  const [selectedBrands, setSelectedBrands] = useState<string[]>(['healthycollege'])
  const [activeBrand, setActiveBrand] = useState('healthycollege')
  const [isGenerating, setIsGenerating] = useState(false)
  
  // Post states for each brand
  const [postStates, setPostStates] = useState<Record<string, PostState>>(() => {
    const initial: Record<string, PostState> = {}
    Object.keys(BRAND_CONFIGS).forEach(brand => {
      initial[brand] = {
        backgroundImage: null,
        title: {
          text: 'STUDY REVEALS Vitamin C SUPPLEMENTATION CAN REDUCE STRESS & CORTISOL BY 40%',
          highlightedText: 'STRESS & CORTISOL BY 40%',
          fontSize: 58
        },
        logoImage: null,
        layout: {
          readCaptionBottom: DEFAULT_READ_CAPTION_BOTTOM,
          titleGap: DEFAULT_TITLE_GAP,
          logoGap: DEFAULT_LOGO_GAP,
          titlePaddingX: 40
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
    currentPost.title.text, 
    currentPost.title.fontSize, 
    layout.titlePaddingX
  )
  const readCaptionY = CANVAS_HEIGHT - layout.readCaptionBottom - 24 // 24 is approximate text height
  const titleY = readCaptionY - layout.titleGap - titleHeight
  const logoY = titleY - layout.logoGap - 40 // 40 is approximate logo height
  
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
  
  // Update layout
  const updateLayout = useCallback((updates: Partial<LayoutConfig>) => {
    setPostStates(prev => ({
      ...prev,
      [activeBrand]: {
        ...prev[activeBrand],
        layout: { ...prev[activeBrand].layout, ...updates }
      }
    }))
  }, [activeBrand])
  
  // Handle brand toggle
  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev => {
      if (prev.includes(brand)) {
        if (prev.length === 1) return prev // Keep at least one
        const newBrands = prev.filter(b => b !== brand)
        if (activeBrand === brand) {
          setActiveBrand(newBrands[0])
        }
        return newBrands
      }
      return [...prev, brand]
    })
  }
  
  // Generate AI background
  const generateBackground = async () => {
    setIsGenerating(true)
    toast.loading('Generating AI background...', { id: 'generate-bg' })
    
    try {
      // TODO: Call actual DEAPI endpoint with prompt like:
      // `Futuristic vitamin capsule filled with glowing particles, 
      //  ${brandConfig.colorName} color scheme, floating water droplets, 
      //  bokeh effect, dark moody background, cinematic lighting, 8k quality, no text`
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // For demo, use a gradient placeholder
      toast.success('Background generated!', { id: 'generate-bg' })
      
      // Update all selected brands with their color-matched backgrounds
      // In production, generate unique backgrounds for each brand
      
    } catch (error) {
      toast.error('Failed to generate background', { id: 'generate-bg' })
    } finally {
      setIsGenerating(false)
    }
  }
  
  // Export canvas as image
  const exportImage = () => {
    if (!stageRef.current) return
    
    const uri = stageRef.current.toDataURL({ pixelRatio: 1 })
    const link = document.createElement('a')
    link.download = `${activeBrand}_post.png`
    link.href = uri
    link.click()
    toast.success('Image downloaded!')
  }
  
  // Handle background image upload
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
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileImage className="w-7 h-7 text-primary-500" />
            Post Editor
          </h1>
          <p className="text-gray-500 mt-1">
            Create stunning image posts with AI-powered design
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mode Selector */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setEditorMode('create')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                editorMode === 'create'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Plus className="w-4 h-4" />
              Create
            </button>
            <button
              onClick={() => setEditorMode('edit')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                editorMode === 'edit'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              Edit Brand
            </button>
            <button
              onClick={() => {
                toast('Copy from brand feature coming soon!', { icon: '📋' })
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 transition-all"
            >
              <Copy className="w-4 h-4" />
              Copy
            </button>
          </div>
          <button
            onClick={exportImage}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={generateBackground}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            Generate Background
          </button>
        </div>
      </div>
      
      {/* Brand Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium text-gray-700">Select Brands</span>
          <span className="text-sm text-gray-500">{selectedBrands.length} selected</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.keys(BRAND_CONFIGS).map(brand => (
            <button
              key={brand}
              onClick={() => toggleBrand(brand)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                selectedBrands.includes(brand)
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div 
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: BRAND_CONFIGS[brand].color }}
              />
              <span className={`text-sm ${selectedBrands.includes(brand) ? 'text-primary-700' : 'text-gray-600'}`}>
                {BRAND_CONFIGS[brand].name}
              </span>
              {selectedBrands.includes(brand) && (
                <Check className="w-4 h-4 text-primary-500" />
              )}
            </button>
          ))}
        </div>
        
        {/* Brand tabs for editing */}
        {selectedBrands.length > 1 && (
          <div className="flex gap-1 mt-4 pt-4 border-t border-gray-100">
            {selectedBrands.map(brand => (
              <button
                key={brand}
                onClick={() => setActiveBrand(brand)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeBrand === brand
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {BRAND_CONFIGS[brand].name}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Main Editor Area */}
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
              ref={stageRef}
              width={CANVAS_WIDTH * PREVIEW_SCALE}
              height={CANVAS_HEIGHT * PREVIEW_SCALE}
              scaleX={PREVIEW_SCALE}
              scaleY={PREVIEW_SCALE}
            >
              <Layer>
                {/* Background */}
                {currentPost.backgroundImage ? (
                  <BackgroundImageLayer
                    imageUrl={currentPost.backgroundImage}
                  />
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
                />
                
                {/* Title */}
                <TitleLayer
                  config={currentPost.title}
                  highlightColor={brandConfig.color}
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
        <div className="space-y-4">
          {/* Background Controls */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary-500" />
              Background
            </h3>
            
            <div className="space-y-3">
              {/* Upload Button */}
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
              
              {/* Generate with AI */}
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
              
              <p className="text-xs text-gray-500">
                AI will generate a {brandConfig.colorName} themed background for {brandConfig.name}
              </p>
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
                  <span className="text-sm text-gray-600">Upload Logo (e.g., LCO)</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
            </label>
            <p className="text-xs text-gray-500 mt-2">
              Upload the abbreviated logo that appears between the lines
            </p>
          </div>
          
          {/* Title Controls */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Type className="w-5 h-5 text-primary-500" />
              Title
            </h3>
            
            <div className="space-y-3">
              {/* Title Text */}
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Title Text</label>
                <textarea
                  value={currentPost.title.text}
                  onChange={(e) => updateTitle({ text: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Enter title..."
                />
              </div>
              
              {/* Highlighted Text */}
              <div>
                <label className="text-sm text-gray-600 mb-1 block">
                  Highlighted Text
                  <span className="text-xs text-gray-400 ml-1">(colored background)</span>
                </label>
                <input
                  type="text"
                  value={currentPost.title.highlightedText}
                  onChange={(e) => updateTitle({ highlightedText: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Text to highlight..."
                />
              </div>
              
              {/* Font Size */}
              <div>
                <label className="text-sm text-gray-600 mb-1 block">
                  Font Size: {currentPost.title.fontSize}px
                </label>
                <input
                  type="range"
                  min="30"
                  max="80"
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
            
            <div className="space-y-4">
              {/* Read Caption Bottom */}
              <div>
                <label className="text-sm text-gray-600 mb-1 block">
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
              
              {/* Title Gap */}
              <div>
                <label className="text-sm text-gray-600 mb-1 block">
                  Gap: Title to Read Caption: {layout.titleGap}px
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
              
              {/* Logo Gap */}
              <div>
                <label className="text-sm text-gray-600 mb-1 block">
                  Gap: Logo to Title: {layout.logoGap}px
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
              
              {/* Title Horizontal Padding */}
              <div>
                <label className="text-sm text-gray-600 mb-1 block">
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
              
              {/* Reset to Defaults */}
              <button
                onClick={() => {
                  updateLayout({
                    readCaptionBottom: DEFAULT_READ_CAPTION_BOTTOM,
                    titleGap: DEFAULT_TITLE_GAP,
                    logoGap: DEFAULT_LOGO_GAP,
                    titlePaddingX: 40
                  })
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm text-gray-600"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
          
          {/* Export */}
          {/* Export */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <button
              onClick={exportImage}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm"
            >
              <Download className="w-4 h-4" />
              Download Image
            </button>
          </div>
        </div>
      </div>
      
      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-900 mb-2">💡 How to use the Post Editor</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>1. <strong>Select brands</strong> - Choose which brands to generate posts for</li>
          <li>2. <strong>Upload or generate background</strong> - Use AI to create brand-colored backgrounds</li>
          <li>3. <strong>Upload logo</strong> - Add your brand logo (appears between the lines)</li>
          <li>4. <strong>Edit title</strong> - Modify the title text and choose which part to highlight</li>
          <li>5. <strong>Adjust spacing</strong> - Use the Layout Spacing controls to fine-tune positioning</li>
          <li>6. <strong>Export</strong> - Download the final image for each brand</li>
        </ul>
      </div>
    </div>
  )
}
