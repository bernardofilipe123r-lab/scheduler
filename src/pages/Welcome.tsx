/**
 * Welcome / Landing Page — viraltoby.com/welcome
 * Complete redesign v3 — dark hero, particles, word rotation, premium SaaS landing.
 * Font: Plus Jakarta Sans.
 * "7 days on us" CTA.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import {
  ArrowRight, ChevronDown, Sparkles, X, Menu,
  Brain, Send, Play,
  CheckCircle2, Film,
  Calendar, TrendingUp, Star,
  Check, Zap, BarChart3, Users,
  Clock, Search, Gauge, Repeat,
  MousePointerClick, Wand2, Palette,
  Home, Bot, Layers, Settings,
  Shield, Crown, Gift,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { PlatformIcon } from '@/shared/components/PlatformIcon'
import { Marquee } from '@/shared/components/magicui/Marquee'
import { Safari } from '@/shared/components/magicui/Safari'
import { NumberTicker } from '@/shared/components/magicui/NumberTicker'
import { WordRotate } from '@/shared/components/magicui/WordRotate'
import { Particles } from '@/shared/components/magicui/Particles'
import { BackgroundBeams } from '@/shared/components/aceternity/BackgroundBeams'
import vaLogo from '@/assets/icons/va-logo.svg'

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"

/* ═══ Utility: Reveal on scroll ═══ */
function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null)
  const v = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={v ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ═══ FAQ Item ═══ */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-5 sm:py-6 text-left group">
        <span className="text-[15px] sm:text-[17px] font-semibold text-white pr-8 group-hover:text-blue-400 transition-colors">{q}</span>
        <ChevronDown className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180 text-blue-400' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
            <p className="pb-6 text-[14px] sm:text-[15px] text-gray-400 leading-[1.7]">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ═══ Mini area chart ═══ */
function MiniAreaChart({ data, color = '#3B82F6', height = 80 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data)
  const w = 300
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - (v / max) * (height - 8)}`).join(' ')
  const area = `0,${height} ${pts} ${w},${height}`
  const id = `grad-${color.replace('#', '')}-${Math.random().toString(36).slice(2, 5)}`
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ═══ Phone frame component ═══ */
function PhoneFrame({ children, className = '', tilt }: { children: React.ReactNode; className?: string; tilt?: 'left' | 'right' | 'none' }) {
  const tiltStyle = tilt === 'left'
    ? { transform: 'perspective(1200px) rotateY(8deg) rotateX(2deg)', transformStyle: 'preserve-3d' as const }
    : tilt === 'right'
    ? { transform: 'perspective(1200px) rotateY(-8deg) rotateX(2deg)', transformStyle: 'preserve-3d' as const }
    : {}
  return (
    <div className={`relative ${className}`} style={tiltStyle}>
      <div className="w-[260px] sm:w-[300px] rounded-[2.5rem] border-[6px] border-gray-800 bg-gray-900 shadow-2xl overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-gray-800 rounded-b-2xl z-20" />
        <div className="bg-white overflow-hidden">
          {children}
        </div>
      </div>
      {tilt && tilt !== 'none' && (
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-[80%] h-8 bg-black/20 blur-xl rounded-full" />
      )}
    </div>
  )
}

/* ═══ Animated gradient text ═══ */
function GradientText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`bg-gradient-to-r from-[#6C5CE7] via-[#00D2FF] to-[#6C5CE7] bg-[length:200%_auto] bg-clip-text text-transparent animate-[gradient-shift_3s_ease-in-out_infinite] ${className}`}>
      {children}
    </span>
  )
}

/* ═══ Section divider ═══ */
function SectionLabel({ children, color = 'text-blue-400' }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-4">
      <div className="h-px w-8 bg-gradient-to-r from-transparent to-blue-500/50" />
      <span className={`text-[12px] font-bold uppercase tracking-[0.2em] ${color}`}>{children}</span>
      <div className="h-px w-8 bg-gradient-to-l from-transparent to-blue-500/50" />
    </div>
  )
}


/* ═══ Data ═══ */
const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', color: 'text-pink-500' },
  { id: 'youtube', name: 'YouTube', color: 'text-red-500' },
  { id: 'tiktok', name: 'TikTok', color: 'text-gray-100' },
  { id: 'facebook', name: 'Facebook', color: 'text-blue-500' },
  { id: 'threads', name: 'Threads', color: 'text-gray-100' },
  { id: 'bluesky', name: 'Bluesky', color: 'text-sky-400' },
]

const TIMELINE_STEPS = [
  { icon: Search, title: 'Scout', desc: 'Finds trending topics in your niche using real-time data', color: 'bg-cyan-500', glow: 'shadow-cyan-500/30' },
  { icon: Wand2, title: 'Create', desc: 'Generates scroll-stopping reels & carousels in your brand style', color: 'bg-blue-500', glow: 'shadow-blue-500/30' },
  { icon: Gauge, title: 'Score', desc: 'Quality-checks every piece across 5 dimensions. Only 80+ gets published', color: 'bg-violet-500', glow: 'shadow-violet-500/30' },
  { icon: Calendar, title: 'Schedule', desc: 'Picks optimal posting times based on your audience behavior', color: 'bg-emerald-500', glow: 'shadow-emerald-500/30' },
  { icon: Send, title: 'Publish', desc: 'Posts across all 6 platforms — after you review and approve content in your Pipeline. Nothing goes live without your sign-off.', color: 'bg-pink-500', glow: 'shadow-pink-500/30' },
  { icon: Brain, title: 'Learn', desc: 'Analyzes what worked, updates strategy, gets smarter every cycle', color: 'bg-amber-500', glow: 'shadow-amber-500/30' },
]

const COMPARISON = [
  { label: 'Monthly cost', old: '$2,000 — $5,000+', toby: 'From $49/brand' },
  { label: 'Content per month', old: '15 — 30 pieces', toby: 'Unlimited' },
  { label: 'Platforms', old: '2 — 3', toby: 'All 6' },
  { label: 'Brand voice', old: 'Hit or miss', toby: 'DNA-driven' },
  { label: 'Turnaround', old: '24 — 48 hours', toby: 'Minutes' },
  { label: 'Learns from results', old: 'No', toby: 'Every day' },
  { label: 'Setup time', old: 'Weeks', toby: '5 minutes' },
]

const TESTIMONIALS_ROW_1 = [
  { quote: 'Toby went from publishing generic content to understanding exactly what my audience wants. My engagement rate tripled in 6 weeks.', name: 'Sarah K.', title: 'Fitness Coach', metric: '3.2x engagement', gradient: 'from-pink-500 to-rose-600' },
  { quote: 'I was spending 4 hours a day on content. Now Toby handles everything and the quality is actually better than what I was making manually.', name: 'Marcus D.', title: 'Health Brand Owner', metric: '4hrs/day saved', gradient: 'from-blue-500 to-indigo-600' },
  { quote: 'The learning engine is insane. After 2 weeks, Toby figured out that curiosity hooks with dark visuals perform 4x better for my niche.', name: 'Elena R.', title: 'Wellness Creator', metric: '4x hook perf', gradient: 'from-violet-500 to-purple-600' },
]

const TESTIMONIALS_ROW_2 = [
  { quote: 'We connected 3 brands and let Toby run. Within a month, all three were growing faster than when we had a dedicated social media manager.', name: 'James T.', title: 'Agency Owner', metric: '3 brands scaled', gradient: 'from-emerald-500 to-teal-600' },
  { quote: 'The scheduling alone would cost me $36/month on Buffer for my 6 accounts. ViralToby does that plus creates all the content. No brainer.', name: 'Priya M.', title: 'Multi-Brand Manager', metric: '$216/yr saved', gradient: 'from-amber-500 to-orange-600' },
  { quote: 'Best part? I barely touch it anymore. Toby finds topics, renders branded reels, schedules them. My DMs blow up with "how do you post so much?"', name: 'Alex C.', title: 'Lifestyle Influencer', metric: '10x output', gradient: 'from-cyan-500 to-blue-600' },
]

const FAQS = [
  { q: 'What can I create with ViralToby?', a: 'Branded Reels (Instagram, Facebook, TikTok, YouTube Shorts), Carousel posts, and Threads. You define the format, choose your brand colors, set the content style — ViralToby renders everything with professional typography and visuals.' },
  { q: 'What exactly does Toby do?', a: 'Toby is your AI content engine. He researches trends, generates content ideas, creates reels and carousels, and scores every piece for quality. Content lands in your Pipeline for human review — you approve, edit, or reject before anything goes live. Once approved, Toby handles scheduling and publishing across all 6 platforms.' },
  { q: 'How does Toby learn and get smarter?', a: 'Toby uses Thompson Sampling — a multi-armed bandit algorithm — to test different hooks, visual styles, and topics. Every piece he publishes teaches him more about what works for YOUR specific niche. He gets measurably better every week.' },
  { q: 'Do I need to approve content before it goes live?', a: 'Yes — always. Toby generates and quality-scores content, but nothing is ever published automatically. Every piece goes to your Pipeline for human review first. You approve, edit, reschedule, or reject it before anything goes live. ViralToby never posts to any platform without your explicit sign-off.' },
  { q: 'Which platforms are supported?', a: 'Instagram (Reels & Carousels), Facebook (Reels & Carousels), YouTube Shorts, TikTok, Threads, and Bluesky. Connect any combination per brand.' },
  { q: 'Can I manage multiple brands?', a: 'Yes. Each brand gets its own Content DNA, connected platforms, color scheme, posting schedule, and its own learning engine. Toby learns independently for each brand.' },
  { q: 'How is this different from Buffer or Hootsuite?', a: 'Those tools are calendars — you still create everything yourself. ViralToby creates the content, scores it, schedules it, publishes it, and learns from the results. It\'s an entire content team, not a posting tool.' },
  { q: 'What happens after the 7-day trial?', a: 'After your 7-day free trial, you can choose a plan that fits your needs. No credit card required to start. You can explore the platform, connect your brands, and see Toby in action before committing to a paid plan.' },
]

const GROWTH_DATA = [120, 145, 138, 190, 220, 195, 280, 310, 290, 380, 420, 395, 510, 580, 620, 590, 700, 780, 820, 860, 920, 980, 1050, 1120, 1200, 1350, 1420, 1580, 1700, 1850]


/* ═══════════════════════════════════════ PAGE ═══════════════════════════════ */

export function WelcomePage() {
  const { isAuthenticated } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 150])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => {
    document.documentElement.style.backgroundColor = '#0a0a0f'
    document.body.style.background = '#0a0a0f'
    return () => { document.documentElement.style.backgroundColor = ''; document.body.style.background = '' }
  }, [])

  const scrollTo = useCallback((id: string) => {
    setMobileOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const ctaLink = isAuthenticated ? '/' : '/login'
  const ctaLabel = isAuthenticated ? 'Go to Dashboard' : '7 Days on Us'

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden" style={{ fontFamily: FONT }}>

      {/* ══════════ NAV ══════════ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-[#0a0a0f]/80 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.05)]' : ''}`}>
        <div className="max-w-[1320px] mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between h-16 sm:h-[72px]">
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5 group">
              <img src={vaLogo} alt="ViralToby" className="w-[30px] h-[30px] rounded-lg transition-transform group-hover:scale-105" />
              <span className="text-[16px] font-bold text-white tracking-tight">ViralToby</span>
            </button>
            <div className="hidden md:flex items-center gap-1">
              {[{ id: 'features', l: 'Features' }, { id: 'how-it-works', l: 'How It Works' }, { id: 'pricing', l: 'Pricing' }, { id: 'faq', l: 'FAQ' }].map(n => (
                <button key={n.id} onClick={() => scrollTo(n.id)} className="text-[14px] text-gray-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-all">{n.l}</button>
              ))}
            </div>
            <div className="hidden md:flex items-center gap-3">
              {isAuthenticated ? (
                <Link to="/" className="bg-white hover:bg-gray-100 text-gray-900 text-[14px] font-semibold px-5 py-2.5 rounded-xl transition-all">Dashboard</Link>
              ) : (
                <>
                  <Link to="/login" className="text-[14px] font-medium text-gray-400 hover:text-white px-4 py-2 transition-colors">Sign In</Link>
                  <Link to="/login" className="inline-flex items-center gap-1.5 bg-gradient-to-r from-[#6C5CE7] to-[#4834D4] hover:from-[#7C6CF7] hover:to-[#5844E4] text-white text-[14px] font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-[#6C5CE7]/25 transition-all hover:-translate-y-0.5">
                    <Gift className="w-3.5 h-3.5" /> 7 Days Free
                  </Link>
                </>
              )}
            </div>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-gray-400">{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          </div>
        </div>
        <AnimatePresence>
          {mobileOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="md:hidden bg-[#0a0a0f]/95 backdrop-blur-2xl border-t border-white/5 shadow-2xl overflow-hidden">
              <div className="px-5 py-4 space-y-1">
                {[{ id: 'features', l: 'Features' }, { id: 'how-it-works', l: 'How It Works' }, { id: 'pricing', l: 'Pricing' }, { id: 'faq', l: 'FAQ' }].map(n => (
                  <button key={n.id} onClick={() => scrollTo(n.id)} className="block w-full text-left px-3 py-2.5 text-[14px] text-gray-400 hover:bg-white/5 rounded-lg">{n.l}</button>
                ))}
                <div className="pt-3 flex flex-col gap-2">
                  <Link to="/login" className="text-center py-2.5 text-[14px] border border-white/10 rounded-xl text-gray-300">Sign In</Link>
                  <Link to="/login" className="text-center py-2.5 text-[14px] font-semibold text-white bg-gradient-to-r from-[#6C5CE7] to-[#4834D4] rounded-xl">7 Days Free</Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>


      {/* ══════════ HERO — DARK ══════════ */}
      <section ref={heroRef} className="relative min-h-screen flex items-center justify-center pt-20 pb-12 sm:pb-16 px-5 sm:px-8 overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#0f0f1e] to-[#0a0a0f]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(108,92,231,0.15),transparent)]" />
        <Particles className="opacity-60" quantity={60} color="#6C5CE7" size={1.2} speed={0.2} />

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative flex flex-col items-center text-center max-w-5xl mx-auto z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="w-full">

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-[#6C5CE7]/30 bg-[#6C5CE7]/10 backdrop-blur-sm mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6C5CE7] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#6C5CE7]" />
              </span>
              <span className="text-[13px] font-semibold text-[#a78bfa]">AI-powered social media autopilot</span>
            </motion.div>

            {/* Headline */}
            <h1 className="text-[32px] sm:text-[44px] md:text-[56px] lg:text-[66px] font-extrabold tracking-[-0.04em] leading-[1.02]">
              <motion.span
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="block text-white"
              >
                Your Social Media.
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="block mt-1 sm:mt-2"
              >
                <GradientText>On Autopilot.</GradientText>
              </motion.span>
            </h1>

            {/* Subheadline with word rotation */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="mt-6 sm:mt-8 text-[15px] sm:text-[17px] md:text-[19px] text-gray-400 leading-relaxed max-w-[820px] mx-auto"
            >
              <span className="block">
                AI that{' '}
                <WordRotate
                  words={['creates', 'schedules', 'publishes', 'learns']}
                  className="text-white font-semibold"
                  duration={2200}
                />{' '}
                — across 6 platforms,
              </span>
              <span className="block mt-1">
                so you don't have to.
              </span>
            </motion.div>

            {/* Platform icons row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.0 }}
              className="mt-6 flex items-center justify-center gap-3 sm:gap-4"
            >
              {PLATFORMS.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.0 + i * 0.08, type: 'spring', stiffness: 300, damping: 20 }}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center hover:bg-white/10 hover:border-white/15 transition-all hover:-translate-y-0.5 group"
                >
                  <PlatformIcon platform={p.id} className={`w-5 h-5 ${p.color} group-hover:scale-110 transition-transform`} />
                </motion.div>
              ))}
            </motion.div>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.2 }}
              className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
            >
              <Link to={ctaLink} className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#6C5CE7] to-[#00D2FF] rounded-2xl blur-lg opacity-40 group-hover:opacity-70 transition-opacity" />
                <div className="relative overflow-hidden bg-gradient-to-r from-[#6C5CE7] to-[#4834D4] hover:from-[#7C6CF7] hover:to-[#5844E4] text-white text-[16px] sm:text-[17px] font-bold px-8 py-4 sm:px-10 sm:py-4.5 rounded-xl shadow-2xl shadow-[#6C5CE7]/30 transition-all hover:-translate-y-0.5 min-w-[220px] sm:min-w-[240px] flex items-center justify-center gap-2.5">
                  <Gift className="w-5 h-5" />
                  {ctaLabel}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
              <button
                onClick={() => scrollTo('how-it-works')}
                className="inline-flex items-center justify-center gap-2 text-gray-300 text-[15px] sm:text-[17px] font-semibold px-6 py-3.5 sm:px-8 sm:py-4 rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm hover:border-white/20 hover:bg-white/[0.06] transition-all hover:-translate-y-0.5 min-w-[220px] sm:min-w-[240px]"
              >
                <Play className="w-4 h-4" /> See How It Works
              </button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.3 }}
              className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-gray-600"
            >
              <Shield className="w-3 h-3" />
              Human review required before any content is published
            </motion.p>

            {/* Social proof with NumberTicker */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.5 }}
              className="mt-10 sm:mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-8"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <div className="text-[16px] sm:text-[18px] font-bold text-white tabular-nums"><NumberTicker value={2917} delay={1.5} suffix="+" /></div>
                  <div className="text-[11px] text-gray-500">creators</div>
                </div>
              </div>
              <div className="w-px h-8 bg-white/10 hidden sm:block" />
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <Film className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <div className="text-[16px] sm:text-[18px] font-bold text-white tabular-nums"><NumberTicker value={847} delay={1.7} suffix="K+" /></div>
                  <div className="text-[11px] text-gray-500">reels created</div>
                </div>
              </div>
              <div className="w-px h-8 bg-white/10 hidden sm:block" />
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Star className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="text-[16px] sm:text-[18px] font-bold text-white tabular-nums"><NumberTicker value={4.8} delay={1.9} decimalPlaces={1} /></div>
                  <div className="text-[11px] text-gray-500">avg rating</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        >
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-1.5"
          >
            <motion.div className="w-1 h-2 bg-white/40 rounded-full" />
          </motion.div>
        </motion.div>
      </section>


      {/* ══════════ DASHBOARD PREVIEW ══════════ */}
      <section className="relative pb-16 sm:pb-24 px-5 sm:px-8 -mt-4">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-transparent to-[#0a0a0f]" />
        <Reveal>
          <div className="relative max-w-[1200px] mx-auto">
            <div className="relative rounded-2xl overflow-hidden">
              {/* Glow behind browser */}
              <div className="absolute -inset-4 bg-gradient-to-r from-[#6C5CE7]/20 via-[#00D2FF]/10 to-[#6C5CE7]/20 blur-3xl rounded-3xl" />
              <Safari url="viraltoby.com" className="relative shadow-[0_25px_100px_-15px_rgba(108,92,231,0.25)] border-white/10">
                {/* Real app layout: dark sidebar + light content */}
                <div className="flex min-h-[420px] sm:min-h-[500px]">
                  {/* Sidebar */}
                  <div className="hidden sm:flex w-[180px] bg-gradient-to-b from-neutral-950 via-stone-900 to-stone-800 flex-col p-3 flex-shrink-0">
                    <div className="flex items-center gap-2 px-2 py-2 mb-4">
                      <img src={vaLogo} alt="" className="w-6 h-6 rounded-md" />
                      <span className="text-[11px] font-bold text-stone-100">ViralToby</span>
                    </div>
                    <div className="space-y-0.5">
                      {[
                        { icon: Home, label: 'Home', active: true },
                        { icon: Sparkles, label: 'Creation', active: false },
                        { icon: Layers, label: 'Jobs', active: false },
                        { icon: Calendar, label: 'Calendar', active: false },
                        { icon: BarChart3, label: 'Analytics', active: false },
                        { icon: Bot, label: 'Toby', active: false },
                      ].map(n => (
                        <div key={n.label} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] ${n.active ? 'bg-white/10 text-white font-medium' : 'text-stone-400'}`}>
                          <n.icon className="w-3.5 h-3.5" />
                          <span>{n.label}</span>
                          {n.label === 'Jobs' && <span className="ml-auto text-[8px] bg-orange-500 text-white px-1 py-0.5 rounded-full font-bold">3</span>}
                        </div>
                      ))}
                    </div>
                    <div className="flex-1" />
                    <div className="border-t border-white/10 pt-2 mt-2 space-y-0.5">
                      <div className="flex items-center gap-2 px-2.5 py-2 text-[11px] text-stone-400"><Settings className="w-3.5 h-3.5" /> Brands</div>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-2 mt-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-[8px] font-bold text-white">U</div>
                      <span className="text-[10px] text-stone-300">User Name</span>
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 bg-gray-50 p-3 sm:p-4 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100 mb-2">
                      <div className="relative"><div className="w-2 h-2 rounded-full bg-emerald-500" /><div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping" /></div>
                      <span className="text-[10px] text-emerald-700 font-medium">Toby is running</span>
                      <div className="flex-1" />
                      <span className="text-[8px] text-emerald-500 bg-emerald-100 px-1.5 py-0.5 rounded-full font-medium hidden sm:inline">Phase: Learning</span>
                    </div>

                    <div className="mb-2">
                      <h2 className="text-[13px] sm:text-[15px] font-bold text-gray-900">Good morning, User</h2>
                      <p className="text-[9px] text-gray-400">7 brands · 138K followers · 50 scheduled</p>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-2">
                      {[
                        { label: 'FOLLOWERS (30D)', value: '+64.5K', change: '138K total' },
                        { label: 'VIEWS (7D)', value: '2.3M', change: 'all brands' },
                        { label: 'LIKES (7D)', value: '16.2K', change: 'all brands' },
                        { label: 'JOBS CREATED', value: '918', change: '+47 this week' },
                        { label: 'SCHEDULED', value: '50', sub: 'queued' },
                        { label: 'ENG. RATE', value: '0.56%', sub: 'likes/views' },
                      ].map(s => (
                        <div key={s.label} className="bg-white rounded-lg p-2 border border-gray-100 shadow-sm">
                          <span className="text-[7px] font-semibold text-gray-400 uppercase tracking-wider block">{s.label}</span>
                          <div className="text-[14px] sm:text-[16px] font-bold text-gray-900 tabular-nums leading-tight">{s.value}</div>
                          {'change' in s && s.change && (
                            <div className="flex items-center gap-0.5">
                              <TrendingUp className="w-2 h-2 text-emerald-500" />
                              <span className="text-[8px] font-semibold text-emerald-500">{s.change}</span>
                            </div>
                          )}
                          {'sub' in s && s.sub && <span className="text-[8px] text-gray-400">{s.sub}</span>}
                        </div>
                      ))}
                    </div>

                    <div className="grid sm:grid-cols-[1fr_1fr] gap-1.5 mb-2">
                      <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-semibold text-gray-700">Growth Trend</span>
                          <div className="flex gap-2">
                            {['7D', '30D', '90D'].map(p => (
                              <span key={p} className={`text-[7px] px-1.5 py-0.5 rounded ${p === '30D' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-400'}`}>{p}</span>
                            ))}
                          </div>
                        </div>
                        <MiniAreaChart data={GROWTH_DATA} color="#8B5CF6" height={55} />
                      </div>
                      <div className="hidden sm:block bg-white rounded-lg border border-gray-100 shadow-sm p-2.5">
                        <span className="text-[10px] font-semibold text-gray-700 block mb-1.5">By Platform (7D views)</span>
                        <div className="space-y-1">
                          {[
                            { platform: 'instagram', reach: '2.3M', followers: '136.7K', color: '#E1306C', pct: '100%' },
                            { platform: 'youtube', reach: '63.2K', followers: '1.3K', color: '#FF0000', pct: '3%' },
                            { platform: 'facebook', reach: '0', followers: '2', color: '#1877F2', pct: '0%' },
                          ].map(p => (
                            <div key={p.platform} className="flex items-center gap-1.5">
                              <PlatformIcon platform={p.platform} className="w-3 h-3 text-gray-500" />
                              <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ background: p.color, width: p.pct }} />
                              </div>
                              <span className="text-[7px] text-gray-500 w-7 text-right">{p.reach}</span>
                              <span className="text-[7px] text-gray-400 w-8 text-right">{p.followers}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-[180px_1fr_160px] gap-1.5">
                      <div className="hidden sm:block bg-white rounded-lg border border-gray-100 shadow-sm p-2.5">
                        <span className="text-[8px] font-semibold text-gray-400 uppercase tracking-wider">Brands (7)</span>
                        <div className="mt-1.5 space-y-1">
                          {[
                            { name: 'Longevity College', color: '#3498DB', followers: '99.9K' },
                            { name: 'Healthy College', color: '#2ECC71', followers: '21K' },
                            { name: 'Harmony College', color: '#e99c2f', followers: '632' },
                            { name: 'Pure College', color: '#00b4cc', followers: '1.9K' },
                            { name: 'Wellbeing College', color: '#F39C12', followers: '5.7K' },
                            { name: 'Holistic College', color: '#9B59B6', followers: '3.8K' },
                            { name: 'Vitality College', color: '#E74C3C', followers: '3.7K' },
                          ].map(b => (
                            <div key={b.name} className="flex items-center gap-1.5">
                              <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[5px] font-bold text-white flex-shrink-0" style={{ background: b.color }}>{b.name[0]}</div>
                              <div className="flex-1 min-w-0"><div className="text-[7px] font-semibold text-gray-700 truncate">{b.name}</div></div>
                              <span className="text-[6px] text-gray-400">{b.followers}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-2.5">
                        <span className="text-[10px] font-semibold text-gray-700 block mb-1.5">Toby Activity</span>
                        <div className="space-y-1">
                          {[
                            { action: 'Published reel to Instagram', brand: 'Longevity', time: '2m ago', status: 'success' },
                            { action: 'Scored content: 92/100 — approved', brand: 'Healthy', time: '5m ago', status: 'success' },
                            { action: 'Generated 3 carousel slides', brand: 'Pure', time: '8m ago', status: 'success' },
                            { action: 'Found trending: "cold plunge"', brand: 'Holistic', time: '12m ago', status: 'info' },
                            { action: 'Scheduled 4 posts across platforms', brand: 'Wellbeing', time: '15m ago', status: 'success' },
                            { action: 'Learning: dark visuals +3.2x eng', brand: 'Vitality', time: '20m ago', status: 'info' },
                          ].map((a, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <div className={`w-1 h-1 rounded-full mt-1 flex-shrink-0 ${a.status === 'success' ? 'bg-emerald-400' : 'bg-blue-400'}`} />
                              <div className="flex-1 min-w-0">
                                <span className="text-[8px] text-gray-600 block truncate">{a.action}</span>
                                <span className="text-[7px] text-gray-300">{a.brand} · {a.time}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="hidden sm:block bg-white rounded-lg border border-gray-100 shadow-sm p-2.5">
                        <span className="text-[8px] font-semibold text-gray-400 uppercase tracking-wider">Top Content</span>
                        <div className="mt-1.5 space-y-1.5">
                          {[
                            { title: '9 Signs Your Body Is...', views: '799K', img: '/images/reels/longevity/DVtUxxoFLH7.jpg' },
                            { title: 'Habits Destroying...', views: '313K', img: '/images/reels/longevity/DVtiu8cE8so.jpg' },
                            { title: 'Healthy Secrets...', views: '312K', img: '/images/reels/healthy/DVthlqkEuO6.jpg' },
                          ].map((c, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <img src={c.img} alt="" className="w-7 h-9 rounded object-cover" />
                              <div className="flex-1 min-w-0">
                                <div className="text-[8px] font-semibold text-gray-700 truncate">{c.title}</div>
                                <div className="text-[7px] text-gray-400">{c.views} views</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Safari>
            </div>
          </div>
        </Reveal>
      </section>


      {/* ══════════ PLATFORM MARQUEE ══════════ */}
      <section className="py-12 sm:py-16 overflow-hidden border-y border-white/[0.04]">
        <Reveal>
          <p className="text-center text-[12px] text-gray-500 uppercase tracking-[0.2em] font-medium mb-6">Publish everywhere, simultaneously</p>
          <Marquee pauseOnHover speed={30} className="[--gap:1.5rem]">
            {PLATFORMS.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-6 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] transition-all">
                <PlatformIcon platform={p.id} className={`w-6 h-6 ${p.color}`} />
                <span className="text-[15px] font-semibold text-gray-300">{p.name}</span>
              </div>
            ))}
          </Marquee>
        </Reveal>
      </section>


      {/* ══════════ 3 PILLARS — Feature Cards ══════════ */}
      <section id="features" className="py-20 sm:py-28 px-5 sm:px-8 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(108,92,231,0.06),transparent)]" />
        <div className="max-w-[1200px] mx-auto relative">
          <Reveal>
            <div className="text-center mb-14 sm:mb-18">
              <SectionLabel>Everything you need</SectionLabel>
              <h2 className="text-[26px] sm:text-[38px] font-extrabold tracking-tight text-white mt-3">Three pillars. One platform.</h2>
              <p className="mt-4 text-[16px] sm:text-[18px] text-gray-400 max-w-3xl mx-auto">Whether you want full control or full autopilot — ViralToby adapts to how you work.</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            {/* Pillar 1: Create */}
            <Reveal delay={0.1}>
              <div className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm h-full hover:border-white/[0.15] hover:bg-white/[0.04] transition-all duration-500 hover:-translate-y-1">
                <div className="p-6 sm:p-8">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-5 shadow-lg shadow-blue-500/25">
                    <MousePointerClick className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-[20px] font-bold text-white mb-2">Create in Seconds</h3>
                  <p className="text-[14px] text-gray-400 leading-relaxed mb-6">One click for autopilot. Or choose your topic, format, and style for full creative control.</p>

                  <div className="bg-white/[0.04] rounded-xl p-4 space-y-3 border border-white/[0.06]">
                    {[
                      { step: '1', label: 'Content Type', value: 'Reels & Shorts', active: true },
                      { step: '2', label: 'Brand', value: 'The Healthy College', active: true },
                      { step: '3', label: 'Topic', value: 'Auto-detect trending', active: false },
                    ].map((s, i) => (
                      <motion.div
                        key={s.step}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 + i * 0.15 }}
                        className={`flex items-center gap-3 p-2.5 rounded-lg ${s.active ? 'bg-white/[0.06] border border-blue-500/20' : 'bg-white/[0.02]'}`}
                      >
                        <span className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${s.active ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-500'}`}>{s.step}</span>
                        <div className="flex-1">
                          <span className="text-[11px] text-gray-500 block">{s.label}</span>
                          <span className={`text-[12px] font-semibold ${s.active ? 'text-gray-200' : 'text-gray-500'}`}>{s.value}</span>
                        </div>
                        {s.active && <Check className="w-4 h-4 text-blue-400" />}
                      </motion.div>
                    ))}
                    <div className="pt-1">
                      <div className="w-full py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-center text-[12px] font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-violet-600/25">
                        <Sparkles className="w-3 h-3" /> Generate Content
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Pillar 2: Schedule */}
            <Reveal delay={0.2}>
              <div className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm h-full hover:border-white/[0.15] hover:bg-white/[0.04] transition-all duration-500 hover:-translate-y-1">
                <div className="p-6 sm:p-8">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/25">
                    <Calendar className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-[20px] font-bold text-white mb-2">Schedule & Publish</h3>
                  <p className="text-[14px] text-gray-400 leading-relaxed mb-6">Smart scheduling across 6 platforms. Buffer charges $6/account — we include it free.</p>

                  <div className="bg-white/[0.04] rounded-xl p-4 border border-white/[0.06]">
                    <div className="text-[11px] font-semibold text-gray-400 mb-3">March 2026</div>
                    <div className="grid grid-cols-7 gap-1">
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                        <div key={i} className="text-[9px] text-gray-500 text-center font-medium pb-1">{d}</div>
                      ))}
                      {Array.from({ length: 28 }, (_, i) => {
                        const hasContent = [2, 4, 5, 8, 10, 11, 14, 16, 18, 19, 22, 24, 25, 27].includes(i)
                        const platforms = i % 3 === 0 ? ['instagram', 'tiktok'] : i % 3 === 1 ? ['youtube', 'facebook'] : ['threads']
                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.5 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 + i * 0.02 }}
                            className={`aspect-square rounded-md flex flex-col items-center justify-center gap-0.5 ${hasContent ? 'bg-white/[0.06] border border-white/[0.08]' : ''}`}
                          >
                            <span className="text-[9px] text-gray-500">{i + 1}</span>
                            {hasContent && (
                              <div className="flex gap-0.5">
                                {platforms.map(p => (
                                  <div key={p} className={`w-1 h-1 rounded-full ${p === 'instagram' ? 'bg-pink-400' : p === 'tiktok' ? 'bg-gray-300' : p === 'youtube' ? 'bg-red-400' : p === 'facebook' ? 'bg-blue-400' : 'bg-gray-400'}`} />
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )
                      })}
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-gray-500">
                      <Clock className="w-3 h-3" />
                      <span>Smart timing per platform</span>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Pillar 3: Toby */}
            <Reveal delay={0.3}>
              <div className="group rounded-2xl border border-[#6C5CE7]/20 bg-[#6C5CE7]/[0.04] backdrop-blur-sm h-full hover:border-[#6C5CE7]/30 hover:bg-[#6C5CE7]/[0.06] transition-all duration-500 hover:-translate-y-1">
                <div className="p-6 sm:p-8">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-5 shadow-lg shadow-violet-500/25">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-[20px] font-bold text-white mb-2">Toby Learns Your Brand</h3>
                  <p className="text-[14px] text-gray-400 leading-relaxed mb-6">An AI agent that runs the entire creation cycle — you review and approve every piece before it publishes.</p>

                  <div className="bg-white/[0.04] rounded-xl p-4 space-y-3 border border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-gray-400">Toby Score</span>
                      <span className="text-[11px] text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full font-medium">Improving</span>
                    </div>
                    {[
                      { label: 'Hook Strategy', value: 'Curiosity', pct: 94, color: '#3B82F6' },
                      { label: 'Visual Style', value: 'Dark Cinematic', pct: 87, color: '#8B5CF6' },
                      { label: 'Post Timing', value: '7:30 AM', pct: 91, color: '#10B981' },
                    ].map((l, i) => (
                      <motion.div
                        key={l.label}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.4 + i * 0.1 }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-gray-500">{l.label}</span>
                          <span className="text-[10px] font-bold text-gray-300">{l.value}</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: l.color }}
                            initial={{ width: 0 }}
                            whileInView={{ width: `${l.pct}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 1, delay: 0.5 + i * 0.1, ease: 'easeOut' }}
                          />
                        </div>
                      </motion.div>
                    ))}
                    <div className="flex items-center gap-2 bg-violet-500/10 rounded-lg px-3 py-2 mt-2 border border-violet-500/10">
                      <Sparkles className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                      <span className="text-[10px] text-violet-300 font-medium">Curiosity hooks convert 3.2x better</span>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ CASE STUDIES ══════════ */}
      <section className="py-20 sm:py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#0d0d1a] to-[#0a0a0f]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_50%,rgba(108,92,231,0.05),transparent)]" />

        <div className="relative">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
            <Reveal>
              <div className="text-center mb-14 sm:mb-18">
                <SectionLabel color="text-emerald-400">Real Results</SectionLabel>
                <h2 className="text-[26px] sm:text-[38px] font-extrabold text-white tracking-tight mt-3">Creators growing on autopilot.</h2>
              </div>
            </Reveal>
          </div>

          {/* Horizontal scrollable case studies */}
          <div className="relative">
            <div className="flex gap-0 overflow-x-auto pb-6 snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>

              {/* Case Study 1: @thelongevitycollege */}
              <Reveal delay={0.1}>
                <div className="snap-center w-[100vw] flex-shrink-0 px-5 sm:px-8"><div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm p-6 sm:p-8 max-w-[1000px] mx-auto">
                  <div className="flex flex-col sm:flex-row gap-8 items-center">
                    <PhoneFrame className="flex-shrink-0" tilt="left">
                      <div className="flex flex-col" style={{ height: '480px' }}>
                        <div className="p-3 flex items-center gap-2.5 border-b border-gray-100 pt-7 flex-shrink-0">
                          <img src="/images/case-study/longevity-college.jpg" alt="The Longevity College" className="w-12 h-12 rounded-full object-cover border-2 border-gray-100" />
                          <div>
                            <div className="text-[12px] font-bold text-gray-900">thelongevitycollege</div>
                            <div className="text-[10px] text-gray-400">Health & Longevity</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 py-3 px-2 text-center border-b border-gray-100 flex-shrink-0">
                          <div><div className="text-[14px] font-extrabold text-gray-900">847</div><div className="text-[9px] text-gray-400">Posts</div></div>
                          <div><div className="text-[14px] font-extrabold text-gray-900">100K</div><div className="text-[9px] text-gray-400">Followers</div></div>
                          <div><div className="text-[14px] font-extrabold text-gray-900">1.2K</div><div className="text-[9px] text-gray-400">Following</div></div>
                        </div>
                        <div className="flex-1 overflow-hidden bg-gray-100">
                          <div className="grid grid-cols-3 gap-[1px]" style={{ animation: 'phone-scroll-slow 20s linear infinite' }}>
                            {[...['DVtiu8cE8so', 'DVtUxxoFLH7', 'DVtHNqnGTbZ', 'DVsrzoykSio', 'DVsQfL0CQB_', 'DVr02IFEw1E', 'DVrZSOFCj3E', 'DVq9sGIjaMr', 'DVqv-tzFCyn'], ...['DVtiu8cE8so', 'DVtUxxoFLH7', 'DVtHNqnGTbZ', 'DVsrzoykSio', 'DVsQfL0CQB_', 'DVr02IFEw1E', 'DVrZSOFCj3E', 'DVq9sGIjaMr', 'DVqv-tzFCyn']].map((code, i) => (
                              <div key={i} className="aspect-square overflow-hidden">
                                <img src={`/images/reels/longevity/${code}.jpg`} alt="" className="w-full h-full object-cover" loading="lazy" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </PhoneFrame>
                    <div className="flex-1 text-center sm:text-left">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
                        <Crown className="w-3 h-3 text-emerald-400" />
                        <span className="text-[11px] font-semibold text-emerald-400">Full Autopilot · Hero Story</span>
                      </div>
                      <h3 className="text-[28px] sm:text-[34px] font-extrabold text-white leading-tight">
                        0 → 100K<br />
                        <span className="text-emerald-400">in 2 months</span>
                      </h3>
                      <p className="mt-3 text-[14px] text-gray-400 leading-relaxed">
                        <strong className="text-white">@thelongevitycollege</strong> connected their brand, set their Content DNA, and let Toby run. Zero manual content creation.
                      </p>
                      <div className="mt-6 flex items-start gap-6">
                        <div className="text-center sm:text-left">
                          <div className="text-[26px] sm:text-[30px] font-extrabold text-white">100K</div>
                          <div className="text-[11px] text-gray-500">Followers</div>
                        </div>
                        <div className="text-center sm:text-left">
                          <div className="text-[26px] sm:text-[30px] font-extrabold text-white">847</div>
                          <div className="text-[11px] text-gray-500">Reels</div>
                        </div>
                        <div className="text-center sm:text-left">
                          <div className="text-[26px] sm:text-[30px] font-extrabold text-white">0hrs</div>
                          <div className="text-[11px] text-gray-500">Manual work</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div></div>
              </Reveal>

              {/* Case Study 2: @thegymcollege */}
              <Reveal delay={0.2}>
                <div className="snap-center w-[100vw] flex-shrink-0 px-5 sm:px-8"><div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm p-6 sm:p-8 max-w-[1000px] mx-auto">
                  <div className="flex flex-col sm:flex-row gap-8 items-center">
                    <PhoneFrame className="flex-shrink-0" tilt="right">
                      <div className="flex flex-col" style={{ height: '480px' }}>
                        <div className="p-3 flex items-center gap-2.5 border-b border-gray-100 pt-7 flex-shrink-0">
                          <img src="/images/case-study/gym-college.jpg" alt="The Gym College" className="w-12 h-12 rounded-full object-cover border-2 border-gray-100" />
                          <div>
                            <div className="text-[12px] font-bold text-gray-900">thegymcollege</div>
                            <div className="text-[10px] text-gray-400">Fitness & Training</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 py-3 px-2 text-center border-b border-gray-100 flex-shrink-0">
                          <div><div className="text-[14px] font-extrabold text-gray-900">1.2K</div><div className="text-[9px] text-gray-400">Posts</div></div>
                          <div><div className="text-[14px] font-extrabold text-gray-900">450K</div><div className="text-[9px] text-gray-400">Followers</div></div>
                          <div><div className="text-[14px] font-extrabold text-gray-900">986</div><div className="text-[9px] text-gray-400">Following</div></div>
                        </div>
                        <div className="flex-1 overflow-hidden bg-gray-100">
                          <div className="grid grid-cols-3 gap-[1px]" style={{ animation: 'phone-scroll-med 15s linear infinite' }}>
                            {[...['DVtAeyPmbAC', 'DVskyXTCafC', 'DVsJYp1DB_c', 'DVrt8DDDRrr', 'DVrWzhyiPpP', 'DVq2-vtClK0', 'DVqb_rfGUJ7', 'DVp_6RdkkU-', 'DVpkdHbj4Md'], ...['DVtAeyPmbAC', 'DVskyXTCafC', 'DVsJYp1DB_c', 'DVrt8DDDRrr', 'DVrWzhyiPpP', 'DVq2-vtClK0', 'DVqb_rfGUJ7', 'DVp_6RdkkU-', 'DVpkdHbj4Md']].map((code, i) => (
                              <div key={i} className="aspect-square overflow-hidden">
                                <img src={`/images/reels/gym/${code}.jpg`} alt="" className="w-full h-full object-cover" loading="lazy" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </PhoneFrame>
                    <div className="flex-1 text-center sm:text-left">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4">
                        <TrendingUp className="w-3 h-3 text-blue-400" />
                        <span className="text-[11px] font-semibold text-blue-400">Scaling Fast</span>
                      </div>
                      <h3 className="text-[28px] sm:text-[34px] font-extrabold text-white leading-tight">
                        300K → 450K<br />
                        <span className="text-blue-400">in 3 months</span>
                      </h3>
                      <p className="mt-3 text-[14px] text-gray-400 leading-relaxed">
                        <strong className="text-white">@thegymcollege</strong> was already big. Toby scaled them further — 150K new followers with AI-optimized content.
                      </p>
                      <div className="mt-6 flex items-start gap-6">
                        <div className="text-center sm:text-left"><div className="text-[26px] sm:text-[30px] font-extrabold text-white">+150K</div><div className="text-[11px] text-gray-500">Followers</div></div>
                        <div className="text-center sm:text-left"><div className="text-[26px] sm:text-[30px] font-extrabold text-white">1.2K</div><div className="text-[11px] text-gray-500">Reels</div></div>
                        <div className="text-center sm:text-left"><div className="text-[26px] sm:text-[30px] font-extrabold text-white">3mo</div><div className="text-[11px] text-gray-500">Timeline</div></div>
                      </div>
                    </div>
                  </div>
                </div></div>
              </Reveal>

              {/* Case Study 3: @thehealthycollege */}
              <Reveal delay={0.3}>
                <div className="snap-center w-[100vw] flex-shrink-0 px-5 sm:px-8"><div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm p-6 sm:p-8 max-w-[1000px] mx-auto">
                  <div className="flex flex-col sm:flex-row gap-8 items-center">
                    <PhoneFrame className="flex-shrink-0" tilt="left">
                      <div className="flex flex-col" style={{ height: '480px' }}>
                        <div className="p-3 flex items-center gap-2.5 border-b border-gray-100 pt-7 flex-shrink-0">
                          <img src="/images/case-study/healthy-college.jpg" alt="The Healthy College" className="w-12 h-12 rounded-full object-cover border-2 border-gray-100" />
                          <div>
                            <div className="text-[12px] font-bold text-gray-900">thehealthycollege</div>
                            <div className="text-[10px] text-gray-400">Health & Wellness</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 py-3 px-2 text-center border-b border-gray-100 flex-shrink-0">
                          <div><div className="text-[14px] font-extrabold text-gray-900">296</div><div className="text-[9px] text-gray-400">Posts</div></div>
                          <div><div className="text-[14px] font-extrabold text-gray-900">21K</div><div className="text-[9px] text-gray-400">Followers</div></div>
                          <div><div className="text-[14px] font-extrabold text-gray-900">842</div><div className="text-[9px] text-gray-400">Following</div></div>
                        </div>
                        <div className="flex-1 overflow-hidden bg-gray-100">
                          <div className="grid grid-cols-3 gap-[1px]" style={{ animation: 'phone-scroll-fast 12s linear infinite' }}>
                            {[...['DVthlqkEuO6', 'DVtbt80iLOm', 'DVtOGg9FD2j', 'DVtAjiQk35m', 'DVsk2sQiX0f', 'DVsJh68lcS4', 'DVrt3LmDdhc', 'DVrW-5-DH_Y', 'DVq2vUXEUZ5'], ...['DVthlqkEuO6', 'DVtbt80iLOm', 'DVtOGg9FD2j', 'DVtAjiQk35m', 'DVsk2sQiX0f', 'DVsJh68lcS4', 'DVrt3LmDdhc', 'DVrW-5-DH_Y', 'DVq2vUXEUZ5']].map((code, i) => (
                              <div key={i} className="aspect-square overflow-hidden">
                                <img src={`/images/reels/healthy/${code}.jpg`} alt="" className="w-full h-full object-cover" loading="lazy" />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </PhoneFrame>
                    <div className="flex-1 text-center sm:text-left">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span className="text-[11px] font-semibold text-amber-400">Just Started</span>
                      </div>
                      <h3 className="text-[28px] sm:text-[34px] font-extrabold text-white leading-tight">
                        0 → 20K<br />
                        <span className="text-amber-400">in 2 weeks</span>
                      </h3>
                      <p className="mt-3 text-[14px] text-gray-400 leading-relaxed">
                        <strong className="text-white">@thehealthycollege</strong> launched 2 weeks ago. Connected to Toby on day one — already at 20K and accelerating.
                      </p>
                      <div className="mt-6 flex items-start gap-6">
                        <div className="text-center sm:text-left"><div className="text-[26px] sm:text-[30px] font-extrabold text-white">20K</div><div className="text-[11px] text-gray-500">Followers</div></div>
                        <div className="text-center sm:text-left"><div className="text-[26px] sm:text-[30px] font-extrabold text-white">296</div><div className="text-[11px] text-gray-500">Reels</div></div>
                        <div className="text-center sm:text-left"><div className="text-[26px] sm:text-[30px] font-extrabold text-white">2wk</div><div className="text-[11px] text-gray-500">Timeline</div></div>
                      </div>
                    </div>
                  </div>
                </div></div>
              </Reveal>
            </div>
            <div className="flex items-center justify-center gap-2 mt-2">
              <div className="flex gap-1.5">
                <div className="w-6 h-1.5 rounded-full bg-white/30" />
                <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
                <div className="w-1.5 h-1.5 rounded-full bg-white/15" />
              </div>
              <span className="text-[11px] text-gray-600 ml-2">Scroll to see more</span>
            </div>
          </div>

          <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
            <Reveal delay={0.4}>
              <div className="text-center mt-10">
                <Link to={ctaLink} className="inline-flex items-center gap-2 bg-white/[0.06] border border-white/10 text-white font-semibold text-[15px] px-6 py-3 rounded-xl hover:bg-white/10 transition-all hover:-translate-y-0.5">
                  Start your growth story <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ HOW TOBY WORKS — 6-step grid ══════════ */}
      <section id="how-it-works" className="py-20 sm:py-28 px-5 sm:px-8 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(108,92,231,0.08),transparent)]" />
        <div className="max-w-[1200px] mx-auto relative">
          <Reveal>
            <div className="text-center mb-14 sm:mb-18">
              <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] mb-6">
                <Bot className="w-5 h-5 text-violet-400" />
                <span className="text-[16px] sm:text-[18px] font-bold text-violet-300">Meet Toby — Your AI Agent</span>
              </div>
              <h2 className="text-[26px] sm:text-[38px] font-extrabold tracking-tight text-white">Six steps. Fully autonomous.</h2>
              <p className="mt-4 text-[15px] sm:text-[16px] text-gray-400 max-w-2xl mx-auto">Toby runs this cycle every 5 minutes — finding, creating, scoring, and scheduling. You review and approve content before it publishes.</p>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {TIMELINE_STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.08}>
                <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6 hover:border-white/[0.15] hover:bg-white/[0.04] transition-all duration-500 hover:-translate-y-1">
                  <span className="absolute top-4 right-4 text-[52px] font-extrabold text-white/[0.03] leading-none select-none">{i + 1}</span>

                  <div className={`w-11 h-11 rounded-xl ${step.color} flex items-center justify-center mb-4 shadow-lg ${step.glow} relative z-10`}>
                    <step.icon className="w-5 h-5 text-white" />
                  </div>

                  <h3 className="text-[18px] font-bold text-white mb-1.5 relative z-10">{step.title}</h3>
                  <p className="text-[13px] text-gray-400 leading-relaxed mb-4 relative z-10">{step.desc}</p>

                  {/* Mini visual per step */}
                  {i === 0 && (
                    <div className="bg-white/[0.04] rounded-lg p-3 space-y-1.5 border border-white/[0.06]">
                      {['Cortisol regulation — +340%', 'Morning sunlight — +280%', 'Gut microbiome — +195%'].map((t, j) => (
                        <div key={j} className="flex items-center gap-2 text-[10px]">
                          <TrendingUp className={`w-3 h-3 ${j === 0 ? 'text-emerald-400' : 'text-blue-400'}`} />
                          <span className="text-gray-400 flex-1">{t}</span>
                          <span className="text-[9px] text-emerald-400 font-semibold">Rising</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {i === 1 && (
                    <div className="flex gap-2">
                      {['DVtiu8cE8so', 'DVtUxxoFLH7', 'DVtHNqnGTbZ'].map(code => (
                        <div key={code} className="flex-1 aspect-[9/16] rounded-lg overflow-hidden shadow-md">
                          <img src={`/images/reels/longevity/${code}.jpg`} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                  {i === 2 && (
                    <div className="bg-white/[0.04] rounded-lg p-3 space-y-1.5 border border-white/[0.06]">
                      {[
                        { dim: 'Structure', score: 96 },
                        { dim: 'Pattern Match', score: 92 },
                        { dim: 'Novelty', score: 88 },
                        { dim: 'Emotional Hook', score: 94 },
                        { dim: 'Plausibility', score: 90 },
                      ].map(d => (
                        <div key={d.dim} className="flex items-center gap-2">
                          <span className="text-[9px] text-gray-500 w-20">{d.dim}</span>
                          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500 rounded-full" style={{ width: `${d.score}%` }} />
                          </div>
                          <span className="text-[9px] font-bold text-gray-400 w-5 text-right">{d.score}</span>
                        </div>
                      ))}
                      <div className="flex items-center gap-1.5 pt-1">
                        <Shield className="w-3 h-3 text-emerald-400" />
                        <span className="text-[9px] font-semibold text-emerald-400">Overall: 92/100 — Published</span>
                      </div>
                    </div>
                  )}
                  {i === 3 && (
                    <div className="bg-white/[0.04] rounded-lg p-3 space-y-1.5 border border-white/[0.06]">
                      {[
                        { time: '7:30 AM', platform: 'instagram', title: '5 morning habits', status: 'Optimal' },
                        { time: '12:00 PM', platform: 'tiktok', title: 'Cortisol routine', status: 'Peak' },
                        { time: '5:30 PM', platform: 'youtube', title: 'Cold plunge guide', status: 'Good' },
                      ].map(s => (
                        <div key={s.time} className="flex items-center gap-2 py-1">
                          <span className="text-[9px] text-gray-500 w-12">{s.time}</span>
                          <PlatformIcon platform={s.platform} className="w-3 h-3 text-gray-500" />
                          <span className="text-[10px] text-gray-400 flex-1 truncate">{s.title}</span>
                          <span className="text-[8px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{s.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {i === 4 && (
                    <div className="bg-white/[0.04] rounded-lg p-3 space-y-1.5 border border-white/[0.06]">
                      {[
                        { platform: 'instagram', status: 'Published', time: '2m ago' },
                        { platform: 'tiktok', status: 'Published', time: '2m ago' },
                        { platform: 'youtube', status: 'Published', time: '3m ago' },
                        { platform: 'facebook', status: 'Queued', time: 'in 5m' },
                      ].map(p => (
                        <div key={p.platform} className="flex items-center gap-2">
                          <PlatformIcon platform={p.platform} className="w-3.5 h-3.5 text-gray-500" />
                          <span className="text-[10px] text-gray-400 flex-1 capitalize">{p.platform}</span>
                          <span className={`text-[9px] font-semibold ${p.status === 'Published' ? 'text-emerald-400' : 'text-amber-400'}`}>{p.status}</span>
                          <span className="text-[8px] text-gray-600">{p.time}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {i === 5 && (
                    <div className="bg-white/[0.04] rounded-lg p-3 space-y-1.5 border border-white/[0.06]">
                      {[
                        { signal: 'Curiosity hooks → 94% open rate', type: 'positive' },
                        { signal: 'Dark visuals → 3.2x engagement', type: 'positive' },
                        { signal: 'List format underperforms → deprioritized', type: 'negative' },
                      ].map((s, j) => (
                        <div key={j} className="flex items-center gap-2 text-[10px]">
                          <div className={`w-1 h-4 rounded-full ${s.type === 'positive' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          <span className="text-gray-400">{s.signal}</span>
                        </div>
                      ))}
                      <div className="flex items-center gap-1.5 pt-1 text-[9px] text-amber-400">
                        <Brain className="w-3 h-3" />
                        <span className="font-medium">Strategy updated — next cycle improved</span>
                      </div>
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.6}>
            <div className="flex items-center justify-center gap-3 mt-10 text-gray-500">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-blue-500/30" />
              <Repeat className="w-5 h-5 text-blue-400" />
              <span className="text-[15px]">Then it loops — getting smarter every cycle</span>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-blue-500/30" />
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════ YOUR ENTIRE TEAM — COST REPLACEMENT ══════════ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#0d0d18] to-[#0a0a0f]" />
        <div className="max-w-[1200px] mx-auto relative">
          <Reveal>
            <div className="text-center mb-14 sm:mb-18">
              <SectionLabel color="text-pink-400">Why ViralToby</SectionLabel>
              <h2 className="text-[26px] sm:text-[38px] font-extrabold tracking-tight text-white mt-3">Your entire content team — in one AI.</h2>
              <p className="mt-4 text-[16px] sm:text-[18px] text-gray-400 max-w-4xl mx-auto">Professional content rendered in seconds — with your brand colors, typography, and voice. No designers, no copywriters, no scheduling tools.</p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { role: 'Trend Researcher', desc: 'Finds viral topics using real-time data', icon: Search, color: 'from-cyan-500 to-blue-600', price: '$800/mo' },
              { role: 'Copywriter', desc: 'Writes hooks and scripts in your voice', icon: Wand2, color: 'from-violet-500 to-purple-600', price: '$1,200/mo' },
              { role: 'Designer', desc: 'Creates branded reels and carousels', icon: Palette, color: 'from-pink-500 to-rose-600', price: '$1,500/mo' },
              { role: 'Social Manager', desc: 'Schedules across all 6 platforms', icon: Calendar, color: 'from-emerald-500 to-teal-600', price: '$600/mo' },
              { role: 'Data Analyst', desc: 'Tracks & optimizes strategy daily', icon: BarChart3, color: 'from-amber-500 to-orange-600', price: '$900/mo' },
            ].map((t, i) => (
              <Reveal key={t.role} delay={i * 0.08}>
                <div className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 hover:border-white/[0.15] hover:bg-white/[0.04] transition-all duration-500 hover:-translate-y-1 h-full">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center mb-3 shadow-lg`}>
                    <t.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-[15px] font-bold text-white mb-1">{t.role}</h3>
                  <p className="text-[13px] text-gray-500 leading-relaxed mb-3">{t.desc}</p>
                  <div className="text-[12px] text-gray-600 line-through">{t.price}</div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.5}>
            <div className="text-center mt-10">
              <div className="inline-flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-white/[0.04] border border-white/10">
                <span className="text-[14px] text-gray-500 line-through">$5,000+/mo for a team</span>
                <ArrowRight className="w-4 h-4 text-gray-600" />
                <span className="text-[16px] font-bold"><GradientText>From $49/brand with Toby</GradientText></span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════ PRICING COMPARISON ══════════ */}
      <section id="pricing" className="py-20 sm:py-28 px-5 sm:px-8 relative">
        <div className="max-w-[900px] mx-auto relative">
          <Reveal>
            <div className="text-center mb-14 sm:mb-18">
              <SectionLabel>Pricing</SectionLabel>
              <h2 className="text-[26px] sm:text-[38px] font-extrabold tracking-tight text-white mt-3">The old way vs. The Toby way</h2>
              <p className="mt-4 text-[16px] text-gray-400">Replace your agency, VA, and scheduling tool — for a fraction of the cost.</p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden backdrop-blur-sm">
              <div className="grid grid-cols-3 border-b border-white/[0.06]">
                <div className="p-4 sm:p-5" />
                <div className="p-4 sm:p-5 text-center border-l border-white/[0.06]">
                  <span className="text-[13px] font-semibold text-gray-500">Agency / VA</span>
                </div>
                <div className="p-4 sm:p-5 text-center border-l border-white/[0.06] bg-[#6C5CE7]/[0.06]">
                  <span className="text-[13px] font-bold text-[#6C5CE7]">ViralToby</span>
                </div>
              </div>
              {COMPARISON.map((row, i) => (
                <div key={row.label} className={`grid grid-cols-3 ${i < COMPARISON.length - 1 ? 'border-b border-white/[0.04]' : ''}`}>
                  <div className="p-3 sm:p-4 text-[13px] sm:text-[14px] font-medium text-gray-300">{row.label}</div>
                  <div className="p-3 sm:p-4 text-center border-l border-white/[0.04] text-[13px] text-gray-500">{row.old}</div>
                  <div className="p-3 sm:p-4 text-center border-l border-white/[0.04] bg-[#6C5CE7]/[0.03] text-[13px] font-semibold text-[#a78bfa] flex items-center justify-center gap-1.5">
                    <Check className="w-4 h-4 text-[#6C5CE7] flex-shrink-0" />
                    {row.toby}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="text-center mt-10">
              <Link to={ctaLink} className="inline-flex items-center gap-2.5 bg-gradient-to-r from-[#6C5CE7] to-[#4834D4] hover:from-[#7C6CF7] hover:to-[#5844E4] text-white text-[16px] font-semibold px-8 py-3.5 rounded-xl shadow-lg shadow-[#6C5CE7]/25 transition-all hover:-translate-y-0.5">
                <Gift className="w-4 h-4" /> {ctaLabel} <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="mt-3 text-[13px] text-gray-500">No credit card required</p>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════ TESTIMONIALS — Infinite Marquee (2 rows, opposite directions) ══════════ */}
      <section className="py-20 sm:py-28 overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#0d0d18] to-[#0a0a0f]" />
        <div className="relative">
          <Reveal>
            <div className="text-center mb-12 px-5 sm:px-8">
              <SectionLabel color="text-violet-400">Testimonials</SectionLabel>
              <h2 className="text-[26px] sm:text-[36px] font-extrabold tracking-tight text-white mt-3">Loved by creators worldwide</h2>
            </div>
          </Reveal>

          {/* Row 1 — left */}
          <div className="mb-4">
            <Marquee speed={35} className="[--gap:1rem]">
              {TESTIMONIALS_ROW_1.map((t) => (
                <div key={t.name} className="w-[380px] sm:w-[420px] flex-shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-sm">
                  <div className="flex gap-0.5 mb-4">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-[14px] text-gray-300 leading-relaxed mb-5">&ldquo;{t.quote}&rdquo;</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white font-bold text-[14px] shadow-lg`}>
                        {t.name[0]}
                      </div>
                      <div>
                        <div className="text-[14px] font-semibold text-white">{t.name}</div>
                        <div className="text-[12px] text-gray-500">{t.title}</div>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-[#a78bfa] bg-[#6C5CE7]/10 px-2.5 py-1 rounded-full border border-[#6C5CE7]/20">{t.metric}</span>
                  </div>
                </div>
              ))}
            </Marquee>
          </div>

          {/* Row 2 — right */}
          <Marquee speed={35} reverse className="[--gap:1rem]">
            {TESTIMONIALS_ROW_2.map((t) => (
              <div key={t.name} className="w-[380px] sm:w-[420px] flex-shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-sm">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-[14px] text-gray-300 leading-relaxed mb-5">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white font-bold text-[14px] shadow-lg`}>
                      {t.name[0]}
                    </div>
                    <div>
                      <div className="text-[14px] font-semibold text-white">{t.name}</div>
                      <div className="text-[12px] text-gray-500">{t.title}</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-[#a78bfa] bg-[#6C5CE7]/10 px-2.5 py-1 rounded-full border border-[#6C5CE7]/20">{t.metric}</span>
                </div>
              </div>
            ))}
          </Marquee>
        </div>
      </section>


      {/* ══════════ FAQ ══════════ */}
      <section id="faq" className="py-20 sm:py-28 px-5 sm:px-8 relative">
        <div className="max-w-[700px] mx-auto relative">
          <Reveal>
            <div className="text-center mb-12 sm:mb-14">
              <h2 className="text-[26px] sm:text-[36px] font-extrabold tracking-tight text-white">Frequently asked questions</h2>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8 backdrop-blur-sm">
              {FAQS.map(f => (
                <FaqItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════ FINAL CTA ══════════ */}
      <section className="relative py-24 sm:py-32 px-5 sm:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#10102a] to-[#0a0a0f]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(108,92,231,0.12),transparent)]" />
        <BackgroundBeams />

        <div className="relative text-center max-w-2xl mx-auto z-10">
          <Reveal>
            <h2 className="text-[28px] sm:text-[42px] font-extrabold text-white tracking-tight leading-tight">
              Ready to put your social<br />media on <GradientText>autopilot?</GradientText>
            </h2>
            <p className="mt-5 text-[16px] sm:text-[18px] text-gray-400">
              Join <strong className="text-white">2,917+</strong> creators who let Toby handle their content.
            </p>
            <p className="mt-1 text-[16px] sm:text-[18px] text-gray-400">
              Start free — <strong className="text-[#a78bfa]">7 days on us</strong>. No credit card required.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to={ctaLink} className="relative group">
                <div className="absolute -inset-1.5 bg-gradient-to-r from-[#6C5CE7] to-[#00D2FF] rounded-2xl blur-xl opacity-40 group-hover:opacity-70 transition-opacity" />
                <div className="relative overflow-hidden bg-gradient-to-r from-[#6C5CE7] to-[#4834D4] text-white text-[16px] sm:text-[17px] font-bold px-10 py-4 sm:px-12 sm:py-4.5 rounded-xl shadow-2xl shadow-[#6C5CE7]/30 transition-all hover:-translate-y-0.5 flex items-center gap-3">
                  <Gift className="w-5 h-5" />
                  {ctaLabel}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-5 sm:gap-6 text-[13px] text-gray-500">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Free to start</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Cancel anytime</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 6 platforms</span>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════ FOOTER ══════════ */}
      <footer className="border-t border-white/[0.06] py-12 sm:py-16 px-5 sm:px-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-8">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <img src={vaLogo} alt="ViralToby" className="w-7 h-7 rounded-lg" />
                <span className="text-[16px] font-bold text-white">ViralToby</span>
              </div>
              <p className="text-[13px] text-gray-500 max-w-xs">AI-powered social media autopilot. Create, schedule, publish, and learn — across 6 platforms.</p>
            </div>
            <div className="flex gap-12">
              <div>
                <h4 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Product</h4>
                <div className="space-y-2">
                  <button onClick={() => scrollTo('features')} className="block text-[13px] text-gray-500 hover:text-white transition-colors">Features</button>
                  <button onClick={() => scrollTo('pricing')} className="block text-[13px] text-gray-500 hover:text-white transition-colors">Pricing</button>
                  <button onClick={() => scrollTo('faq')} className="block text-[13px] text-gray-500 hover:text-white transition-colors">FAQ</button>
                </div>
              </div>
              <div>
                <h4 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Legal</h4>
                <div className="space-y-2">
                  <Link to="/privacy-policy" className="block text-[13px] text-gray-500 hover:text-white transition-colors">Privacy Policy</Link>
                  <Link to="/terms" className="block text-[13px] text-gray-500 hover:text-white transition-colors">Terms of Service</Link>
                  <Link to="/data-deletion" className="block text-[13px] text-gray-500 hover:text-white transition-colors">Data Deletion</Link>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-10 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[12px] text-gray-600">&copy; 2026 ViralToby. All rights reserved.</span>
            <div className="flex items-center gap-4">
              {PLATFORMS.slice(0, 4).map(p => (
                <PlatformIcon key={p.id} platform={p.id} className="w-4 h-4 text-gray-600 hover:text-gray-400 transition-colors" />
              ))}
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}

export default WelcomePage
