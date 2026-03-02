/**
 * Onboarding Page — fullscreen wizard for new users.
 * Step 1: Create first brand (Identity)
 * Step 2: Brand Theme (colors + pixel-accurate preview)
 * Step 3: Connect Platforms (OAuth)
 * Step 4: General Content DNA (with AI import or manual choice)
 * Step 5: Reels Configuration
 * Step 6: Carousel Posts
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Sparkles,
  Palette,
  Upload,
  X,
  Dna,
  PartyPopper,
  Link2,
  Instagram,
  Facebook,
  Youtube,
  ChevronDown,
  ExternalLink,
  Type,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useOnboardingStatus } from '@/features/onboarding/use-onboarding-status'
import { useAuth } from '@/features/auth'
import {
  useBrands,
  useCreateBrand,
  useUpdateBrandCredentials,
  type Brand,
  type CreateBrandInput,
  type BrandColors,
} from '@/features/brands/api/use-brands'
import { apiClient } from '@/shared/api/client'
import {
  getRandomPresets,
  generateModeColors,
  adjustColorBrightness,
} from '@/features/brands/constants'
import { NicheConfigForm, type NicheConfigFormHandle } from '@/features/brands/components/NicheConfigForm'
import { useImportFromInstagram } from '@/features/brands/api/use-niche-config'
import { supabase } from '@/shared/api/supabase'
import { connectYouTube, connectInstagram, connectFacebook, connectThreads, connectTikTok, fetchFacebookPages, selectFacebookPage, fetchBrandConnections, type FacebookPage } from '@/features/brands/api/connections-api'
import vaLogo from '@/assets/icons/va-logo.svg'

/* ── Proportional scale: 1080px canvas → 200px preview ────────── */
const CANVAS_W = 1080
const CANVAS_H = 1920
const PREVIEW_W = 200
const SC = PREVIEW_W / CANVAS_W
const PREVIEW_H = Math.round(CANVAS_H * SC)

const PX = {
  thumbTitleFont: Math.round(80 * SC),
  thumbSideMargin: Math.round(80 * SC),
  thumbLineSpacing: Math.round(20 * SC),
  thumbBrandFont: Math.max(6, Math.round(28 * SC)),
  thumbBrandGap: Math.round(254 * SC),
  barStartY: Math.round(280 * SC),
  barHeight: Math.round(100 * SC),
  hPadding: Math.round(20 * SC),
  barTitleFont: Math.round(56 * SC),
  titleContentGap: Math.round(70 * SC),
  contentSidePad: Math.round(108 * SC),
  contentFont: Math.round(44 * SC),
  contentLineH: Math.round(44 * 1.5 * SC),
  bulletSpacing: Math.round(44 * 0.6 * SC),
  brandFont: Math.max(4, Math.round(15 * SC)),
  brandBottom: Math.round(12 * SC),
}

const DARK_BG =
  'linear-gradient(145deg, #1a3a2a 0%, #0d1f15 25%, #1a2030 50%, #2d1a0a 75%, #1a0a1a 100%)'

const SAMPLE_TITLE = 'SURPRISING TRUTHS ABOUT DETOXIFICATION'
const SAMPLE_CONTENT = [
  'Your liver does an incredible job filtering toxins',
  'Drinking more water supports natural detox',
  'Sleep is the most underrated detox mechanism',
]

function hexToRgba(hex: string, opacity: number): string {
  const h = hex.replace('#', '')
  if (h.length < 6) return `rgba(0,0,0,${opacity})`
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

const STEP_INFO = [
  { num: 1, label: 'Create your first brand', sub: 'A brand is an account associated with one or more social media platforms. Every user needs at least one.' },
  { num: 2, label: 'Brand Theme', sub: 'Choose your brand colors and preview how your content will look.' },
  { num: 3, label: 'Connect your platforms', sub: 'Link your social accounts so we can publish content and optionally import your content style.' },
  { num: 4, label: 'General Content DNA', sub: 'Define your niche, audience, and content style so the AI understands your brand.' },
  { num: 5, label: 'Reels Configuration', sub: 'Set up your reel hooks, examples, and CTA style for short-form video content.' },
  { num: 6, label: 'Carousel Posts', sub: 'Configure your carousel post examples, CTAs, and citation style.' },
]

export function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { onboardingStep, hasBrand } = useOnboardingStatus()
  const { refreshUser } = useAuth()
  const { data: existingBrands, isLoading: brandsLoading } = useBrands()
  const createBrandMutation = useCreateBrand()
  const updateCredentialsMutation = useUpdateBrandCredentials()

  const [step, setStep] = useState<number>(() => {
    // If returning from OAuth redirect, jump straight to step 3 (Connect Platforms)
    const params = new URLSearchParams(window.location.search)
    if (params.has('ig_connected') || params.has('yt_connected') || params.has('ig_error') ||
        params.has('fb_connected') || params.has('fb_error') || params.has('fb_select_page') ||
        params.has('threads_connected') || params.has('threads_error') ||
        params.has('tiktok_connected') || params.has('tiktok_error')) {
      return 3
    }
    return onboardingStep
  })
  const [completing, setCompleting] = useState(false)

  // ── Step 1 state: Brand Identity + Colors ──
  const [displayName, setDisplayName] = useState('')
  const [brandId, setBrandId] = useState('')
  const [shortName, setShortName] = useState('')

  // Sync brandId if user already has a brand (e.g. returning mid-flow or after OAuth).
  // Only auto-advance past step 1 when brands are actually loaded — avoids a
  // race where onboardingStep starts at 1 (brands not yet fetched) then jumps
  // to 3 mid-render, skipping user input.
  useEffect(() => {
    if (!hasBrand || !existingBrands?.length) return
    // Populate brandId from the existing brand so steps 2-6 have it
    if (!brandId) {
      setBrandId(existingBrands[0].id)
      setDisplayName(existingBrands[0].display_name || '')
      setShortName(existingBrands[0].short_name || '')
    }
    // If user already has a brand and somehow landed on step 1, advance to 3
    // (brand creation is done — skip to Connect Platforms)
    if (step === 1) setStep(3)
  }, [hasBrand, existingBrands]) // eslint-disable-line react-hooks/exhaustive-deps
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const colorPresets = useMemo(() => getRandomPresets(12), [])
  const [selectedPreset, setSelectedPreset] = useState<number | null>(0)
  const [primaryColor, setPrimaryColor] = useState('')
  const [accentColor, setAccentColor] = useState('')
  const [colorName, setColorName] = useState('')
  const [useCustomColors, setUseCustomColors] = useState(false)
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light')
  const [previewTitle, setPreviewTitle] = useState(SAMPLE_TITLE)
  const [previewContent, setPreviewContent] = useState(SAMPLE_CONTENT.join('\n'))
  const [savingTheme, setSavingTheme] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Apply first random preset on mount
  useEffect(() => {
    if (colorPresets.length > 0 && !primaryColor) {
      setPrimaryColor(colorPresets[0].primary)
      setAccentColor(colorPresets[0].accent)
      setColorName(colorPresets[0].colorName)
    }
  }, [colorPresets]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 2: Theme preview computations ──
  const MAX_BULLET_POINTS = 6
  const titleLines = useMemo(() => {
    const words = previewTitle.split(/\s+/).filter(Boolean)
    if (words.length <= 2) return [previewTitle]
    const third = Math.ceil(words.length / 3)
    return [
      words.slice(0, third).join(' '),
      words.slice(third, third * 2).join(' '),
      words.slice(third * 2).join(' '),
    ].filter(l => l.trim())
  }, [previewTitle])

  const contentLines = useMemo(() => {
    return previewContent.split('\n').filter(l => l.trim()).slice(0, MAX_BULLET_POINTS)
  }, [previewContent])

  const thumbnailTextColor = previewMode === 'light' ? primaryColor : '#ffffff'
  const contentTitleTextColor = '#ffffff'
  const contentTitleBgColor = primaryColor
  const contentTextColor = previewMode === 'light' ? '#000000' : '#ffffff'
  const brandNameColor = previewMode === 'light' ? primaryColor : '#ffffff'
  const contentStartY = PX.barStartY + titleLines.length * PX.barHeight + PX.titleContentGap

  // ── Step 3 state: Platform Connections (OAuth) ──
  const [igConnected, setIgConnected] = useState(false)
  const [igHandle, setIgHandle] = useState<string | null>(null)
  const [ytConnected, setYtConnected] = useState(false)
  const [ytChannelName, setYtChannelName] = useState<string | null>(null)
  const [fbConnected, setFbConnected] = useState(false)
  const [fbPageName, setFbPageName] = useState<string | null>(null)
  const [connectingIg, setConnectingIg] = useState(false)
  const [connectingYt, setConnectingYt] = useState(false)
  const [connectingFb, setConnectingFb] = useState(false)
  const [connectingThreads, setConnectingThreads] = useState(false)
  const [connectingTikTok, setConnectingTikTok] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [fbPages, setFbPages] = useState<FacebookPage[]>([])
  const [showFbPageSelector, setShowFbPageSelector] = useState(false)
  const [selectingFbPage, setSelectingFbPage] = useState(false)
  const [showManualSection, setShowManualSection] = useState(false)
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [facebookPageId, setFacebookPageId] = useState('')
  const [instagramBusinessAccountId, setInstagramBusinessAccountId] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [ytSectionValid, setYtSectionValid] = useState(false)
  const [threadsConnected, setThreadsConnected] = useState(false)
  const [threadsUsername, setThreadsUsername] = useState<string | null>(null)
  const [tiktokConnected, setTiktokConnected] = useState(false)
  const [tiktokUsername, setTiktokUsername] = useState<string | null>(null)
  const nicheFormRef = useRef<NicheConfigFormHandle>(null)

  // ── Step 4 state: Content DNA method choice (used by AI DNA import) ──
  const [dnaMethod, setDnaMethod] = useState<'ai' | 'manual' | null>(null)
  const [dnaImporting, setDnaImporting] = useState(false)
  const [dnaImported, setDnaImported] = useState(false)
  const importIgMutation = useImportFromInstagram()
  const [nicheNameFilled, setNicheNameFilled] = useState(false)

  // Check connection status when entering step 3 or returning from OAuth
  useEffect(() => {
    if (step !== 3 || !brandId) return
    const params = new URLSearchParams(window.location.search)
    const igSuccess = params.get('ig_connected')
    const ytSuccess = params.get('yt_connected')
    const fbSuccess = params.get('fb_connected')
    const igError = params.get('ig_error')
    const fbError = params.get('fb_error')
    const fbSelectPage = params.get('fb_select_page')
    const threadsSuccess = params.get('threads_connected')
    const threadsError = params.get('threads_error')
    const tiktokSuccess = params.get('tiktok_connected')
    const tiktokError = params.get('tiktok_error')

    // Clean up URL params
    if (igSuccess || ytSuccess || fbSuccess || igError || fbError || fbSelectPage || threadsSuccess || threadsError || tiktokSuccess || tiktokError) {
      const url = new URL(window.location.href)
      url.searchParams.delete('ig_connected')
      url.searchParams.delete('yt_connected')
      url.searchParams.delete('fb_connected')
      url.searchParams.delete('ig_error')
      url.searchParams.delete('fb_error')
      url.searchParams.delete('fb_select_page')
      url.searchParams.delete('threads_connected')
      url.searchParams.delete('threads_error')
      url.searchParams.delete('tiktok_connected')
      url.searchParams.delete('tiktok_error')
      window.history.replaceState({}, '', url.pathname)
    }

    if (igError) {
      setConnectionError(`Instagram connection failed: ${igError}`)
    }
    if (fbError) {
      const errorMessages: Record<string, string> = {
        denied: 'Permission denied',
        expired: 'Session expired — please try again',
        no_pages: 'No Facebook Pages found on your account',
        failed: 'Connection failed — please try again',
      }
      setConnectionError(`Facebook: ${errorMessages[fbError] || fbError}`)
    }
    if (igSuccess) {
      toast.success('Instagram connected!')
    }
    if (ytSuccess) {
      toast.success('YouTube connected!')
    }
    if (fbSuccess) {
      toast.success('Facebook connected!')
    }
    if (threadsSuccess) {
      toast.success('Threads connected!')
    }
    if (tiktokSuccess) {
      toast.success('TikTok connected!')
    }
    if (threadsError) {
      const errorMessages: Record<string, string> = {
        denied: 'Permission denied',
        expired: 'Session expired — please try again',
        failed: 'Connection failed — please try again',
      }
      setConnectionError(`Threads: ${errorMessages[threadsError] || threadsError}`)
    }
    if (tiktokError) {
      const errorMessages: Record<string, string> = {
        denied: 'Permission denied',
        expired: 'Session expired — please try again',
        pkce_error: 'PKCE verification failed — please try again',
        failed: 'Connection failed — please try again',
      }
      setConnectionError(`TikTok: ${errorMessages[tiktokError] || tiktokError}`)
    }

    // Handle Facebook page selection flow (multiple pages found)
    if (fbSelectPage) {
      setShowFbPageSelector(true)
      fetchFacebookPages(fbSelectPage).then((pages) => {
        setFbPages(pages)
      }).catch(() => {
        setConnectionError('Failed to load Facebook pages. Please try connecting again.')
        setShowFbPageSelector(false)
      })
    }

    // Fetch actual connection status
    fetchBrandConnections().then((data) => {
      const brand = data.brands.find(b => b.brand === brandId)
      if (brand) {
        setIgConnected(brand.instagram.connected)
        setIgHandle(brand.instagram.account_name || null)
        setYtConnected(brand.youtube.connected)
        setYtChannelName(brand.youtube.account_name || null)
        setFbConnected(brand.facebook.connected)
        setFbPageName(brand.facebook.account_name || null)
        setThreadsConnected(brand.threads?.connected || false)
        setThreadsUsername(brand.threads?.account_name || null)
        setTiktokConnected(brand.tiktok?.connected || false)
        setTiktokUsername(brand.tiktok?.account_name || null)
      }
    }).catch(() => {
      // Ignore — non-critical
    })
  }, [step, brandId]) // eslint-disable-line react-hooks/exhaustive-deps

  const isStep3Valid =
    metaAccessToken.trim().length > 0 &&
    (facebookPageId.trim().length > 0 || instagramBusinessAccountId.trim().length > 0)

  const handleNameChange = (name: string) => {
    setDisplayName(name)
    setError(null)
    const genId = name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')
    setBrandId(genId)
    const words = name.split(/\s+/).filter(w => w.length > 0)
    let abbrev = ''
    if (words.length === 1) {
      abbrev = words[0].substring(0, 3).toUpperCase()
    } else {
      abbrev = words.map(w => w[0]).join('').substring(0, 4).toUpperCase()
    }
    setShortName(abbrev)
  }

  const applyPreset = (index: number) => {
    const preset = colorPresets[index]
    setSelectedPreset(index)
    setPrimaryColor(preset.primary)
    setAccentColor(preset.accent)
    setColorName(preset.colorName)
    setUseCustomColors(false)
  }

  // Helper to extract error message from Error or ApiError plain objects
  const getErrorMsg = (err: unknown, fallback: string) => {
    if (err instanceof Error) return err.message
    if (err && typeof err === 'object' && 'message' in err) return String((err as { message: string }).message)
    return fallback
  }

  const isStep1Valid =
    displayName.trim().length > 0 &&
    brandId.trim().length >= 3 &&
    /^[a-z0-9]+$/.test(brandId) &&
    shortName.trim().length > 0 &&
    !brandsLoading &&
    !existingBrands?.some(b => b.id === brandId)

  const handleCreateBrand = async () => {
    setError(null)
    if (!displayName.trim()) { setError('Brand name is required'); return }
    if (!brandId.trim() || brandId.length < 3) { setError('Brand ID must be at least 3 characters'); return }
    if (!/^[a-z0-9]+$/.test(brandId)) { setError('Brand ID must be alphanumeric (lowercase)'); return }
    if (existingBrands?.some(b => b.id === brandId)) { setError('A brand with this ID already exists'); return }

    const modeColors = generateModeColors(primaryColor, accentColor)
    const colors: BrandColors = {
      primary: primaryColor,
      accent: accentColor,
      color_name: colorName,
      ...modeColors,
    }

    const input: CreateBrandInput = {
      id: brandId,
      display_name: displayName,
      short_name: shortName,
      posts_per_day: 6,
      colors,
    }

    try {
      await createBrandMutation.mutateAsync(input)
      toast.success('Brand created!')
      setStep(2)
    } catch (err: unknown) {
      const status = err && typeof err === 'object' && 'status' in err ? (err as { status: number }).status : 0
      if (status === 409) {
        // Brand already exists — refresh the list and auto-advance
        await queryClient.invalidateQueries({ queryKey: ['brands'] })
        const refreshed = await queryClient.fetchQuery({ queryKey: ['brands', 'list'], queryFn: () => apiClient.get<{ brands: Brand[]; count: number }>('/api/v2/brands').then(r => r.brands) })
        const match = refreshed?.find((b: Brand) => b.id === brandId)
        if (match) {
          setBrandId(match.id)
          toast.success('Brand already exists — continuing setup.')
          setStep(2)
          return
        }
      }
      setError(getErrorMsg(err, 'Failed to create brand'))
    }
  }

  const handleSaveTheme = async () => {
    setSavingTheme(true)
    setError(null)
    try {
      const modeColors = generateModeColors(primaryColor, accentColor)
      const colors: BrandColors = {
        primary: primaryColor,
        accent: accentColor,
        color_name: colorName,
        ...modeColors,
      }
      // Update brand colors
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v2/brands/${brandId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ colors }),
      })

      // Upload logo if provided
      if (logoFile) {
        try {
          const formData = new FormData()
          formData.append('logo', logoFile)
          formData.append('brand_color', primaryColor)
          formData.append('light_title_color', '#000000')
          formData.append('light_bg_color', adjustColorBrightness(primaryColor, 180))
          formData.append('dark_title_color', '#ffffff')
          formData.append('dark_bg_color', adjustColorBrightness(primaryColor, -40))
          await fetch(`${import.meta.env.VITE_API_URL || ''}/api/brands/${brandId}/theme`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          })
        } catch {
          // Logo upload failed — can be added later
        }
      }

      toast.success('Theme saved!')
      setStep(3)
    } catch (err) {
      setError(getErrorMsg(err, 'Failed to save theme'))
    } finally {
      setSavingTheme(false)
    }
  }

  const handleComplete = async () => {
    setCompleting(true)
    // Dismiss all toasts BEFORE any state change that could unmount this
    // component — lingering toast portals cause removeChild crashes.
    toast.dismiss()
    // Mark onboarding as completed in Supabase user metadata
    await supabase.auth.updateUser({ data: { onboarding_completed: true } })
    // Refresh local auth state so the route guard sees the updated flag
    await refreshUser()
    // Now navigate — the guard already knows onboarding is complete
    navigate('/', { replace: true })
    queryClient.invalidateQueries()
  }

  const handleCompleteWithCredentials = async () => {
    if (!isStep3Valid) {
      setError('Meta Access Token is required, plus at least one of Facebook Page ID or Instagram Business Account ID.')
      return
    }
    setError(null)

    try {
      await updateCredentialsMutation.mutateAsync({
        id: brandId,
        meta_access_token: metaAccessToken.trim(),
        ...(facebookPageId.trim() && { facebook_page_id: facebookPageId.trim() }),
        ...(instagramBusinessAccountId.trim() && { instagram_business_account_id: instagramBusinessAccountId.trim() }),
      })
      // Credentials saved — advance to Content DNA step
      setStep(4)
    } catch (err) {
      setError(getErrorMsg(err, 'Failed to save credentials'))
    }
  }

  const handleConnectInstagram = async () => {
    setConnectingIg(true)
    setConnectionError(null)
    try {
      const authUrl = await connectInstagram(brandId, 'onboarding')
      window.location.href = authUrl
    } catch (err) {
      setConnectingIg(false)
      setConnectionError(getErrorMsg(err, 'Failed to start Instagram connection'))
    }
  }

  const handleConnectYouTube = async () => {
    setConnectingYt(true)
    setConnectionError(null)
    try {
      const authUrl = await connectYouTube(brandId, 'onboarding')
      window.location.href = authUrl
    } catch (err) {
      setConnectingYt(false)
      setConnectionError(getErrorMsg(err, 'Failed to start YouTube connection'))
    }
  }

  const handleConnectFacebook = async () => {
    setConnectingFb(true)
    setConnectionError(null)
    try {
      const authUrl = await connectFacebook(brandId, 'onboarding')
      window.location.href = authUrl
    } catch (err) {
      setConnectingFb(false)
      setConnectionError(getErrorMsg(err, 'Failed to start Facebook connection'))
    }
  }

  const handleConnectThreads = async () => {
    setConnectingThreads(true)
    setConnectionError(null)
    try {
      const authUrl = await connectThreads(brandId, 'onboarding')
      window.location.href = authUrl
    } catch (err) {
      setConnectingThreads(false)
      setConnectionError(getErrorMsg(err, 'Failed to start Threads connection'))
    }
  }

  const handleConnectTikTok = async () => {
    setConnectingTikTok(true)
    setConnectionError(null)
    try {
      const authUrl = await connectTikTok(brandId, 'onboarding')
      window.location.href = authUrl
    } catch (err) {
      setConnectingTikTok(false)
      setConnectionError(getErrorMsg(err, 'Failed to start TikTok connection'))
    }
  }

  const handleSelectFbPage = async (pageId: string) => {
    setSelectingFbPage(true)
    try {
      await selectFacebookPage(brandId, pageId)
      setShowFbPageSelector(false)
      setFbPages([])
      setFbConnected(true)
      toast.success('Facebook page connected!')
      // Refresh connection status
      fetchBrandConnections().then((data) => {
        const b = data.brands.find(br => br.brand === brandId)
        if (b) {
          setFbPageName(b.facebook.account_name || null)
        }
      }).catch(() => {})
    } catch (err) {
      setConnectionError(getErrorMsg(err, 'Failed to select Facebook page'))
    } finally {
      setSelectingFbPage(false)
    }
  }

  // Handle "Create with AI" — scrape IG posts and pre-fill DNA
  const handleDnaMethodAi = async () => {
    if (!brandId) return
    setDnaImporting(true)
    setDnaMethod('ai')
    try {
      const result = await importIgMutation.mutateAsync({ brand_id: brandId })
      // Invalidate the niche config cache so the form picks up the new values
      queryClient.invalidateQueries({ queryKey: ['niche-config'] })
      setDnaImported(true)
      toast.success(`Analysed ${result.posts_analysed} posts — niche & brief imported!`)
    } catch (err: unknown) {
      // AI import failed — fall through to manual with a warning
      const msg = getErrorMsg(err, 'Import failed')
      toast.error(msg === 'Import failed' ? msg : `${msg} — you can fill in the fields manually.`)
      setDnaImported(false)
    } finally {
      setDnaImporting(false)
    }
  }

  const currentStep = STEP_INFO[step - 1]

  // ── Completion screen ──
  if (completing) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 10, stiffness: 100, delay: 0.1 }}
            className="w-20 h-20 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-6"
          >
            <PartyPopper className="w-10 h-10 text-green-500" />
          </motion.div>
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">You're all set!</h1>
          <p className="mt-2 text-[14px] text-gray-400">Redirecting to your dashboard...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#fafafa] flex flex-col">
      {/* ── Sticky header ── */}
      <header className="flex-shrink-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200/60">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1 rounded-lg bg-gray-100 border border-gray-200">
              <img src={vaLogo} alt="Viral App" className="w-7 h-7" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-gray-900 tracking-tight">Let's get you set up</p>
              <p className="text-[12px] text-gray-400">Step {step} of {STEP_INFO.length}</p>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {STEP_INFO.map((_, i) => {
              const s = i + 1
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-all ${
                    s < step ? 'bg-green-500 text-white' :
                    s === step ? 'bg-primary-500 text-white' :
                    'bg-gray-200 text-gray-400'
                  }`}>
                    {s < step ? <Check className="w-3 h-3" /> : s}
                  </div>
                  {s < STEP_INFO.length && (
                    <div className={`w-6 h-0.5 rounded-full transition-colors ${s < step ? 'bg-green-500' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <AnimatePresence mode="wait">
            {/* ═══ Step 1: Brand Creation ═══ */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>

                <div className="max-w-xl mx-auto space-y-6">
                  {/* Error banner */}
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                      <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {/* Brand Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Brand Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g., THE FITNESS COLLEGE"
                      autoFocus
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 focus:outline-none text-[14px]"
                    />
                  </div>

                  {/* Brand ID + Short Name */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Brand ID <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={brandId}
                        onChange={(e) => setBrandId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                        placeholder="fitnesscollege"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 focus:outline-none text-[14px] font-mono"
                      />
                      <p className="text-xs text-gray-400 mt-1">Unique, ≥3 chars, alphanumeric</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Short Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={shortName}
                        onChange={(e) => setShortName(e.target.value.toUpperCase().substring(0, 4))}
                        placeholder="FCO"
                        maxLength={4}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 focus:outline-none text-[14px] font-mono uppercase"
                      />
                      <p className="text-xs text-gray-400 mt-1">Logo fallback (3-4 chars)</p>
                    </div>
                  </div>

                  {/* Live preview card */}
                  {displayName && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                        <span className="text-white font-bold text-lg">{shortName || '?'}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{displayName}</p>
                        <p className="text-xs text-gray-400 font-mono">{brandId || 'brand-id'}</p>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 text-center">
                    You'll configure colors, logo, and preview in the next step.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ═══ Step 2: Brand Theme ═══ */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                    <Palette className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>

                {/* Error banner */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 mb-4 max-w-4xl mx-auto">
                    <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <div className="flex gap-6 max-w-4xl mx-auto">
                  {/* Left: Controls */}
                  <div className="flex-1 space-y-5 min-w-0">
                    {/* Mode toggle */}
                    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => setPreviewMode('light')}
                        className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                          previewMode === 'light' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        ☀️ Light Mode
                      </button>
                      <button
                        onClick={() => setPreviewMode('dark')}
                        className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                          previewMode === 'dark' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        🌙 Dark Mode
                      </button>
                    </div>

                    {/* Preview text editing */}
                    <div className="space-y-3 p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-2 mb-1">
                        <Type className="w-4 h-4 text-gray-500" />
                        <label className="text-sm font-medium text-gray-700">Preview Text</label>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Preview Title</label>
                        <input type="text" value={previewTitle} onChange={(e) => setPreviewTitle(e.target.value.toUpperCase())} className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm uppercase" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Preview Content (one per line)</label>
                        <textarea value={previewContent} onChange={(e) => {
                          const lines = e.target.value.split('\n').filter(l => l.trim())
                          if (lines.length <= MAX_BULLET_POINTS) {
                            setPreviewContent(e.target.value)
                          } else {
                            const kept = e.target.value.split('\n').reduce<string[]>((acc, line) => {
                              const nonEmpty = acc.filter(l => l.trim()).length
                              if (!line.trim() || nonEmpty < MAX_BULLET_POINTS) acc.push(line)
                              return acc
                            }, [])
                            setPreviewContent(kept.join('\n'))
                          }
                        }} rows={3} placeholder="One line per row" className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm resize-none" />
                        <p className="text-[10px] text-gray-400 mt-0.5">One bullet point per line (max {MAX_BULLET_POINTS})</p>
                      </div>
                    </div>

                    {/* Abbreviation */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Abbreviation</label>
                      <input
                        type="text"
                        value={shortName}
                        onChange={(e) => setShortName(e.target.value.toUpperCase().substring(0, 5))}
                        maxLength={5}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 focus:outline-none text-[14px] font-mono uppercase"
                      />
                      <p className="text-xs text-gray-400 mt-1">Short code used on rendered posts & reels (max 5 chars).</p>
                    </div>

                    {/* Logo Upload */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
                      <div className="flex items-center gap-4">
                        {logoPreview ? (
                          <div className="relative">
                            <img src={logoPreview} alt="Logo preview" className="w-16 h-16 object-contain rounded-xl border border-gray-200 bg-white p-1" />
                            <button
                              onClick={() => { setLogoPreview(null); setLogoFile(null) }}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer group">
                            <input type="file" accept="image/*" onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                setLogoFile(file)
                                const reader = new FileReader()
                                reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
                                reader.readAsDataURL(file)
                              }
                            }} className="hidden" />
                            <div className="w-16 h-16 rounded-xl bg-gray-100 flex flex-col items-center justify-center group-hover:bg-gray-200 transition-colors border-2 border-dashed border-gray-300">
                              <Upload className="w-5 h-5 text-gray-400" />
                              <span className="text-[10px] text-gray-400 mt-1">Upload</span>
                            </div>
                          </label>
                        )}
                        <p className="text-xs text-gray-400">Logo is stored for branding but not rendered on reels/thumbnails.</p>
                      </div>
                    </div>

                    {/* Brand Color */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Brand Color</label>
                      <div className="flex items-center gap-3 mb-3">
                        <input type="color" value={primaryColor} onChange={(e) => { setPrimaryColor(e.target.value); setUseCustomColors(true); setSelectedPreset(null) }} className="w-10 h-10 rounded cursor-pointer border-0" />
                        <input type="text" value={primaryColor} onChange={(e) => { setPrimaryColor(e.target.value); setUseCustomColors(true); setSelectedPreset(null) }} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono w-28" />
                      </div>

                      {/* Color Presets */}
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {colorPresets.map((preset, index) => (
                          <button
                            key={preset.name}
                            onClick={() => applyPreset(index)}
                            className={`relative p-2 rounded-xl border-2 transition-all ${
                              selectedPreset === index && !useCustomColors
                                ? 'border-primary-500 ring-2 ring-primary-200'
                                : 'border-gray-100 hover:border-gray-200'
                            }`}
                            title={preset.name}
                          >
                            <div className="flex gap-1 justify-center">
                              <div className="w-5 h-5 rounded-full" style={{ backgroundColor: preset.primary }} />
                              <div className="w-5 h-5 rounded-full" style={{ backgroundColor: preset.accent }} />
                            </div>
                            <p className="text-[10px] text-gray-500 truncate mt-1 text-center">{preset.name}</p>
                            {selectedPreset === index && !useCustomColors && (
                              <Check className="absolute top-0.5 right-0.5 w-3.5 h-3.5 text-primary-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Pixel-Accurate Preview */}
                  <div className="flex-shrink-0">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Thumbnail Preview */}
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Thumbnail</p>
                        <div
                          style={{
                            width: PREVIEW_W, height: PREVIEW_H, position: 'relative', borderRadius: 8,
                            overflow: 'hidden', border: '1px solid #e5e7eb',
                            backgroundColor: previewMode === 'light' ? '#f4f4f4' : undefined,
                            background: previewMode === 'dark' ? DARK_BG : undefined,
                          }}
                        >
                          {previewMode === 'dark' && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />}
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                            <div style={{ paddingLeft: PX.thumbSideMargin, paddingRight: PX.thumbSideMargin, textAlign: 'center', position: 'relative' }}>
                              <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: PX.thumbTitleFont, lineHeight: `${PX.thumbTitleFont + PX.thumbLineSpacing}px`, color: thumbnailTextColor, textTransform: 'uppercase', wordBreak: 'break-word' }}>
                                {previewTitle}
                              </div>
                              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: PX.thumbBrandGap, fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: PX.thumbBrandFont, color: thumbnailTextColor, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                {displayName || 'BRAND NAME'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Content Preview */}
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Content</p>
                        <div
                          style={{
                            width: PREVIEW_W, height: PREVIEW_H, position: 'relative', borderRadius: 8,
                            overflow: 'hidden', border: '1px solid #e5e7eb',
                            backgroundColor: previewMode === 'light' ? '#f4f4f4' : undefined,
                            background: previewMode === 'dark' ? DARK_BG : undefined,
                          }}
                        >
                          {previewMode === 'dark' && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)' }} />}
                          <div style={{ position: 'absolute', top: PX.barStartY, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
                            {titleLines.map((line, i) => (
                              <div key={i} style={{ height: PX.barHeight, paddingLeft: PX.hPadding, paddingRight: PX.hPadding, backgroundColor: hexToRgba(contentTitleBgColor, 200 / 255), display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}>
                                <span style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: PX.barTitleFont, color: contentTitleTextColor, textTransform: 'uppercase', lineHeight: 1 }}>{line}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{ position: 'absolute', top: contentStartY, left: PX.contentSidePad, right: PX.contentSidePad, zIndex: 1 }}>
                            {contentLines.map((line, i) => (
                              <div key={i} style={{ display: 'flex', gap: 3, marginBottom: PX.bulletSpacing, lineHeight: `${PX.contentLineH}px` }}>
                                <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: PX.contentFont, color: contentTextColor, flexShrink: 0 }}>{i + 1}.</span>
                                <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: PX.contentFont, color: contentTextColor }}>{line}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{ position: 'absolute', bottom: PX.brandBottom, left: 0, right: 0, textAlign: 'center', zIndex: 1 }}>
                            <span style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: PX.brandFont, color: brandNameColor, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                              {displayName || 'BRAND NAME'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ═══ Step 3: Connect Platforms (OAuth) ═══ */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                    <Link2 className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>

                <div className="max-w-xl mx-auto space-y-4">
                  {/* Error banner */}
                  {(error || connectionError) && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                      <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error || connectionError}</p>
                    </div>
                  )}

                  {/* ── Instagram Card ── */}
                  <div className={`border rounded-xl p-5 transition-colors ${igConnected ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                          <Instagram className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Instagram</p>
                          {igConnected ? (
                            <p className="text-xs text-green-600 font-medium">{igHandle || 'Connected'}</p>
                          ) : (
                            <p className="text-xs text-gray-400">Connect via Instagram Login</p>
                          )}
                        </div>
                      </div>
                      {igConnected ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                          <Check className="w-3.5 h-3.5" />
                          Connected
                        </div>
                      ) : (
                        <button
                          onClick={handleConnectInstagram}
                          disabled={connectingIg}
                          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {connectingIg ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3.5 h-3.5" />
                          )}
                          Connect
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Facebook Card ── */}
                  <div className={`border rounded-xl p-5 transition-colors ${fbConnected ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                          <Facebook className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Facebook</p>
                          {fbConnected ? (
                            <p className="text-xs text-green-600 font-medium">{fbPageName || 'Connected'}</p>
                          ) : (
                            <p className="text-xs text-gray-400">Connect via Facebook Login</p>
                          )}
                        </div>
                      </div>
                      {fbConnected ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                          <Check className="w-3.5 h-3.5" />
                          Connected
                        </div>
                      ) : (
                        <button
                          onClick={handleConnectFacebook}
                          disabled={connectingFb}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {connectingFb ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3.5 h-3.5" />
                          )}
                          Connect
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Facebook Page Selector (multi-page flow) ── */}
                  {showFbPageSelector && (
                    <div className="border border-blue-200 rounded-xl p-5 bg-blue-50">
                      <p className="text-sm font-semibold text-blue-900 mb-3">Select a Facebook Page</p>
                      <p className="text-xs text-blue-700 mb-3">Choose which page to connect for publishing:</p>
                      {fbPages.length === 0 ? (
                        <div className="flex items-center gap-2 py-3">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          <span className="text-sm text-blue-700">Loading pages...</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {fbPages.map((page) => (
                            <button
                              key={page.id}
                              onClick={() => handleSelectFbPage(page.id)}
                              disabled={selectingFbPage}
                              className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-200 hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 text-left"
                            >
                              {page.picture && (
                                <img src={page.picture} alt="" className="w-8 h-8 rounded-full" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{page.name}</p>
                                {page.category && (
                                  <p className="text-xs text-gray-500">{page.category}</p>
                                )}
                              </div>
                              {page.fan_count != null && (
                                <span className="text-xs text-gray-400">{page.fan_count.toLocaleString()} followers</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => { setShowFbPageSelector(false); setFbPages([]) }}
                        className="mt-3 text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* ── YouTube Card ── */}
                  <div className={`border rounded-xl p-5 transition-colors ${ytConnected ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
                          <Youtube className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">YouTube</p>
                          {ytConnected ? (
                            <p className="text-xs text-green-600 font-medium">{ytChannelName || 'Connected'}</p>
                          ) : (
                            <p className="text-xs text-gray-400">Connect via Google OAuth</p>
                          )}
                        </div>
                      </div>
                      {ytConnected ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                          <Check className="w-3.5 h-3.5" />
                          Connected
                        </div>
                      ) : (
                        <button
                          onClick={handleConnectYouTube}
                          disabled={connectingYt}
                          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          {connectingYt ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3.5 h-3.5" />
                          )}
                          Connect
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Threads Card ── */}
                  <div className={`border rounded-xl p-5 transition-colors ${threadsConnected ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.29 3.276-.866 1.074-2.063 1.678-3.559 1.795-1.12.088-2.198-.154-3.04-.682-1.003-.63-1.607-1.593-1.7-2.716-.154-1.836 1.201-3.454 3.742-3.652.97-.076 1.867-.034 2.687.097-.065-.666-.217-1.195-.463-1.582-.396-.623-1.078-.948-2.022-.966-1.32.012-2.085.437-2.344.696l-1.386-1.57C7.57 6.573 9.003 5.88 11.068 5.862c1.47.013 2.65.497 3.508 1.44.78.857 1.234 2.017 1.35 3.453.478.18.916.404 1.31.675 1.191.818 2.065 2.03 2.52 3.502.628 2.028.478 4.537-1.36 6.336C16.65 22.97 14.59 23.975 12.186 24zm-1.638-7.283c-.078.003-.155.008-.232.015-1.26.098-1.905.701-1.862 1.22.02.233.156.567.589.838.49.308 1.14.446 1.833.388 1.116-.087 2.472-.633 2.716-3.136-.741-.142-1.544-.2-2.41-.2-.216 0-.43.006-.634.017v-.142z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Threads</p>
                          {threadsConnected ? (
                            <p className="text-xs text-green-600 font-medium">{threadsUsername || 'Connected'}</p>
                          ) : (
                            <p className="text-xs text-gray-400">Text + video posts</p>
                          )}
                        </div>
                      </div>
                      {threadsConnected ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                          <Check className="w-3.5 h-3.5" />
                          Connected
                        </div>
                      ) : (
                        <button
                          onClick={handleConnectThreads}
                          disabled={connectingThreads}
                          className="flex items-center gap-1.5 px-4 py-2 bg-black text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
                        >
                          {connectingThreads ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3.5 h-3.5" />
                          )}
                          Connect
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── TikTok Card ── */}
                  <div className={`border rounded-xl p-5 transition-colors ${tiktokConnected ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.79a8.18 8.18 0 0 0 4.76 1.52V6.87a4.84 4.84 0 0 1-1-.18z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">TikTok</p>
                          {tiktokConnected ? (
                            <p className="text-xs text-green-600 font-medium">{tiktokUsername || 'Connected'}</p>
                          ) : (
                            <p className="text-xs text-gray-400">Short-form video</p>
                          )}
                        </div>
                      </div>
                      {tiktokConnected ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium">
                          <Check className="w-3.5 h-3.5" />
                          Connected
                        </div>
                      ) : (
                        <button
                          onClick={handleConnectTikTok}
                          disabled={connectingTikTok}
                          className="flex items-center gap-1.5 px-4 py-2 bg-black text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
                        >
                          {connectingTikTok ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3.5 h-3.5" />
                          )}
                          Connect
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Connection summary */}
                  {(igConnected || ytConnected || fbConnected || threadsConnected || tiktokConnected) && (
                    <p className="text-xs text-green-600 text-center font-medium">
                      {[igConnected && 'Instagram', fbConnected && 'Facebook', ytConnected && 'YouTube', threadsConnected && 'Threads', tiktokConnected && 'TikTok'].filter(Boolean).join(' + ')} connected
                      {(igConnected && fbConnected && ytConnected && threadsConnected && tiktokConnected) ? ' — you\'re all set!' : ' — you can add more later from Settings.'}
                    </p>
                  )}

                  {!igConnected && !ytConnected && !fbConnected && !threadsConnected && !tiktokConnected && (
                    <p className="text-xs text-gray-400 text-center">
                      Connect at least one platform, or skip and do it later from brand settings.
                    </p>
                  )}

                  {/* ── Advanced: Manual Credentials ── */}
                  {!igConnected && !fbConnected && <div className="pt-2">
                    <button
                      onClick={() => setShowManualSection(!showManualSection)}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mx-auto"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showManualSection ? 'rotate-180' : ''}`} />
                      Advanced: Enter credentials manually
                    </button>

                    {showManualSection && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4"
                      >
                        <p className="text-xs text-gray-500">
                          If you have a Meta Business account with a long-lived page token, enter it here instead.
                        </p>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Meta Access Token
                            <span className="text-gray-400 font-normal"> — long-lived page token</span>
                          </label>
                          <input
                            type="text"
                            value={metaAccessToken}
                            onChange={(e) => setMetaAccessToken(e.target.value)}
                            placeholder="EAAx..."
                            className="w-full px-3 py-2 rounded-lg text-sm font-mono border border-gray-300"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Facebook Page ID
                          </label>
                          <input
                            type="text"
                            value={facebookPageId}
                            onChange={(e) => setFacebookPageId(e.target.value)}
                            placeholder="e.g., 421725411022067"
                            className="w-full px-3 py-2 rounded-lg text-sm font-mono border border-gray-300"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Instagram Business Account ID
                          </label>
                          <input
                            type="text"
                            value={instagramBusinessAccountId}
                            onChange={(e) => setInstagramBusinessAccountId(e.target.value)}
                            placeholder="e.g., 17841468847801005"
                            className="w-full px-3 py-2 rounded-lg text-sm font-mono border border-gray-300"
                          />
                        </div>

                        {isStep3Valid && (
                          <button
                            onClick={handleCompleteWithCredentials}
                            disabled={completing || updateCredentialsMutation.isPending}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                          >
                            {(completing || updateCredentialsMutation.isPending) ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4" />
                                Save Credentials & Continue
                              </>
                            )}
                          </button>
                        )}
                      </motion.div>
                    )}
                  </div>}
                </div>
              </motion.div>
            )}

            {/* ═══ Step 4: Content DNA (AI import or Manual) ═══ */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                    <Dna className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>

                {/* Choice screen — AI vs Manual */}
                {!dnaMethod && !dnaImporting && (
                  <div className="max-w-lg mx-auto space-y-4">
                    <p className="text-sm text-gray-500 text-center mb-2">How would you like to set up your Content DNA?</p>

                    {/* AI option */}
                    <button
                      onClick={handleDnaMethodAi}
                      disabled={!igConnected}
                      className={`w-full text-left border rounded-xl p-5 transition-all ${
                        igConnected
                          ? 'border-primary-200 bg-primary-50/50 hover:border-primary-400 hover:shadow-md cursor-pointer'
                          : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Create with AI</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {igConnected
                              ? 'Toby will analyse your recent Instagram posts and pre-fill your niche & content brief. You can edit everything afterwards.'
                              : 'Connect Instagram in the previous step to unlock this option.'}
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* Manual option */}
                    <button
                      onClick={() => setDnaMethod('manual')}
                      className="w-full text-left border border-gray-200 bg-white rounded-xl p-5 hover:border-gray-400 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Type className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Start from scratch</p>
                          <p className="text-xs text-gray-500 mt-0.5">Manually define your niche, content brief, tone and topics.</p>
                        </div>
                      </div>
                    </button>
                  </div>
                )}

                {/* Loading state — AI importing */}
                {dnaImporting && (
                  <div className="max-w-lg mx-auto flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                    </div>
                    <p className="text-sm font-medium text-gray-700">Analysing your Instagram content...</p>
                    <p className="text-xs text-gray-400">This usually takes 10–20 seconds</p>
                  </div>
                )}

                {/* Form — shown after AI finishes or manual is chosen */}
                {dnaMethod && !dnaImporting && (
                  <>
                    {dnaMethod === 'ai' && dnaImported && (
                      <div className="max-w-lg mx-auto mb-4">
                        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                          <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <p className="text-xs text-green-700">AI pre-filled your niche and content brief from Instagram. Review and tweak below.</p>
                        </div>
                      </div>
                    )}
                    <NicheConfigForm ref={nicheFormRef} section="general" onNicheNameChange={(filled) => setNicheNameFilled(filled)} />
                  </>
                )}
              </motion.div>
            )}

            {/* ═══ Step 5: Reels Configuration ═══ */}
            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                    <Dna className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>
                <NicheConfigForm ref={nicheFormRef} section="reels" onGeneratingChange={setAiGenerating} onYtValidChange={setYtSectionValid} ytConnected={ytConnected} />
              </motion.div>
            )}

            {/* ═══ Step 6: Carousel Posts ═══ */}
            {step === 6 && (
              <motion.div
                key="step6"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3 }}
              >
                <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto mb-4">
                    <Dna className="w-7 h-7 text-primary-500" />
                  </div>
                  <h1 className="text-[24px] font-bold text-gray-900 tracking-tight">{currentStep.label}</h1>
                  <p className="mt-1.5 text-[14px] text-gray-400">{currentStep.sub}</p>
                </div>
                <NicheConfigForm ref={nicheFormRef} section="posts" onGeneratingChange={setAiGenerating} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ── Sticky footer ── */}
      <footer className="flex-shrink-0 z-30 bg-white/80 backdrop-blur-md border-t border-gray-200/60">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          {step > 1 && !(step <= 2 && hasBrand) ? (
            <button
              onClick={() => {
                setError(null)
                // Reset DNA method choice when going back from step 4
                if (step === 4) { setDnaMethod(null); setDnaImported(false) }
                setStep(step - 1)
              }}
              disabled={aiGenerating || dnaImporting}
              className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <div />
          )}

          {step === 1 && (
            <button
              onClick={handleCreateBrand}
              disabled={!isStep1Valid || createBrandMutation.isPending}
              className="login-btn flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {createBrandMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}

          {step === 2 && (
            <button
              onClick={handleSaveTheme}
              disabled={savingTheme}
              className="login-btn flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingTheme ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}

          {step >= 3 && step <= 5 && (() => {
            // Step 3: Platform connections — simple continue
            if (step === 3) {
              return (
                <button
                  onClick={() => setStep(4)}
                  className="login-btn flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-medium"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              )
            }
            // Step 4: Content DNA — only show continue once method is chosen and not importing
            if (step === 4) {
              if (!dnaMethod || dnaImporting) return <div />
              return (
                <button
                  onClick={async () => {
                    await nicheFormRef.current?.saveNow()
                    setStep(5)
                  }}
                  disabled={aiGenerating || !nicheNameFilled}
                  className="login-btn flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {aiGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Please wait...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )
            }
            // Step 5: Reels — continue with save
            return (
              <button
                onClick={async () => {
                  await nicheFormRef.current?.saveNow()
                  setStep(6)
                }}
                disabled={aiGenerating || !ytSectionValid}
                className="login-btn flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {aiGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Please wait...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )
          })()}

          {step === 6 && (
            <button
              onClick={async () => {
                await nicheFormRef.current?.saveNow()
                handleComplete()
              }}
              disabled={completing || aiGenerating}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-medium transition-all bg-green-500 hover:bg-green-600 text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {completing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Finishing...
                </>
              ) : aiGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Please wait...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Complete Setup
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
