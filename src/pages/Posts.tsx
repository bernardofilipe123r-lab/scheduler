import { useState, useRef, useCallback, useEffect } from 'react'
import { Stage, Layer, Image as KonvaImage, Rect, Text, Line, Group, Transformer } from 'react-konva'
import useImage from 'use-image'
import Konva from 'konva'
import { 
  FileImage,
  Sparkles,
  Type,
  Palette,
  Download,
  RefreshCw,
  Eye,
  Loader2,
  Check,
  Wand2,
  Move,
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

// Layout constants from requirements
const READ_CAPTION_BOTTOM = 45 // px from bottom
const TITLE_ABOVE_READ_CAPTION = 30 // px above read caption

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

// Title configuration
interface TitleConfig {
  text: string
  highlightedText: string
  fontSize: number
  x: number
  y: number
}

// Post state
interface PostState {
  backgroundImage: string | null
  title: TitleConfig
  logoImage: string | null
  selectedElement: string | null
}

// Background Image Component with drag support
function BackgroundImageLayer({ 
  imageUrl, 
  onSelect
}: { 
  imageUrl: string
  onSelect: () => void
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
      onClick={onSelect}
      onTap={onSelect}
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

// Logo with lines component
function LogoWithLines({ 
  logoUrl, 
  y, 
  onDragEnd
}: { 
  logoUrl: string | null
  y: number
  onDragEnd: (newY: number) => void
}) {
  const [image] = useImage(logoUrl || '', 'anonymous')
  
  // Layout: 100px from left edge, 113px middle gap for logo, 100px from right edge
  const edgePadding = 100 // px from each edge
  const logoGap = 113 // px for logo in the middle
  
  // Calculate line positions
  const leftLineStart = edgePadding
  const leftLineEnd = (CANVAS_WIDTH / 2) - (logoGap / 2)
  const rightLineStart = (CANVAS_WIDTH / 2) + (logoGap / 2)
  const rightLineEnd = CANVAS_WIDTH - edgePadding
  
  const logoWidth = image ? Math.min(image.width, logoGap - 20) : logoGap - 20
  const logoHeight = image ? (logoWidth / image.width) * image.height : 40
  
  return (
    <Group
      x={0}
      y={y}
      draggable
      onDragEnd={(e) => onDragEnd(e.target.y())}
    >
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

// Title component with highlight support and auto-wrapping
function TitleLayer({
  config,
  highlightColor,
  onDragEnd,
  onSelect,
  isSelected,
  transformerRef
}: {
  config: TitleConfig
  highlightColor: string
  onDragEnd: (x: number, y: number) => void
  onSelect: () => void
  isSelected: boolean
  transformerRef: React.RefObject<Konva.Transformer>
}) {
  const groupRef = useRef<Konva.Group>(null)
  
  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current])
      transformerRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected, transformerRef])
  
  // Get the text content
  const textContent = config.text
  const highlightPhrase = config.highlightedText.trim().toUpperCase()
  const textWidth = CANVAS_WIDTH - config.x * 2
  
  // Calculate wrapped lines for highlight detection
  const words = textContent.split(' ')
  const lines: string[] = []
  let currentLine = ''
  
  // Simple word wrapping estimation (Konva will do actual wrapping)
  const avgCharWidth = config.fontSize * 0.5 // Approximate for Anton
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
    <Group
      ref={groupRef}
      x={config.x}
      y={config.y}
      draggable
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      onClick={onSelect}
      onTap={onSelect}
    >
      {lines.map((line, i) => {
        const isHighlighted = line.toUpperCase().includes(highlightPhrase) || 
          highlightPhrase.includes(line.toUpperCase().trim())
        const y = i * lineHeight
        
        return (
          <Group key={i} y={y}>
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
              fontFamily="Anton, sans-serif"
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
          fontSize: 58,
          x: 40,
          y: CANVAS_HEIGHT - READ_CAPTION_BOTTOM - TITLE_ABOVE_READ_CAPTION - 200
        },
        logoImage: null,
        selectedElement: null
      }
    })
    return initial
  })
  
  // Logo positions
  const [logoY, setLogoY] = useState(CANVAS_HEIGHT - READ_CAPTION_BOTTOM - TITLE_ABOVE_READ_CAPTION - 250)
  
  // Refs
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  
  // Get current post state
  const currentPost = postStates[activeBrand]
  const brandConfig = BRAND_CONFIGS[activeBrand]
  
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
  
  // Deselect when clicking on stage background
  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target === e.target.getStage()) {
      updatePostState(activeBrand, { selectedElement: null })
    }
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
              onClick={handleStageClick}
            >
              <Layer>
                {/* Background */}
                {currentPost.backgroundImage ? (
                  <BackgroundImageLayer
                    imageUrl={currentPost.backgroundImage}
                    onSelect={() => updatePostState(activeBrand, { selectedElement: 'background' })}
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
                  onDragEnd={setLogoY}
                />
                
                {/* Title */}
                <TitleLayer
                  config={currentPost.title}
                  highlightColor={brandConfig.color}
                  onDragEnd={(x, y) => updateTitle({ x, y })}
                  onSelect={() => updatePostState(activeBrand, { selectedElement: 'title' })}
                  isSelected={currentPost.selectedElement === 'title'}
                  transformerRef={transformerRef}
                />
                
                {/* Read Caption */}
                <ReadCaption y={CANVAS_HEIGHT - READ_CAPTION_BOTTOM - 24} />
                
                {/* Transformer for selected elements */}
                <Transformer
                  ref={transformerRef}
                  boundBoxFunc={(oldBox, newBox) => {
                    // Limit resize
                    if (newBox.width < 50 || newBox.height < 50) {
                      return oldBox
                    }
                    return newBox
                  }}
                />
              </Layer>
            </Stage>
          </div>
          
          {/* Drag hint - outside canvas */}
          <div className="text-center mt-2">
            <span className="text-xs text-gray-500">
              <Move className="w-3 h-3 inline mr-1" />
              Drag elements to reposition
            </span>
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
          
          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary-500" />
              Quick Actions
            </h3>
            
            <div className="space-y-2">
              <button
                onClick={() => {
                  // Reset to default positions
                  updateTitle({
                    x: 40,
                    y: CANVAS_HEIGHT - READ_CAPTION_BOTTOM - TITLE_ABOVE_READ_CAPTION - 200
                  })
                  setLogoY(CANVAS_HEIGHT - READ_CAPTION_BOTTOM - TITLE_ABOVE_READ_CAPTION - 250)
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Reset Positions
              </button>
              
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
      </div>
      
      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-900 mb-2">💡 How to use the Post Editor</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>1. <strong>Select brands</strong> - Choose which brands to generate posts for</li>
          <li>2. <strong>Upload or generate background</strong> - Use AI to create brand-colored backgrounds</li>
          <li>3. <strong>Upload logo</strong> - Add your brand logo (appears between the lines)</li>
          <li>4. <strong>Edit title</strong> - Modify the title text and choose which part to highlight</li>
          <li>5. <strong>Drag to reposition</strong> - Move elements directly on the canvas</li>
          <li>6. <strong>Export</strong> - Download the final image for each brand</li>
        </ul>
      </div>
    </div>
  )
}
