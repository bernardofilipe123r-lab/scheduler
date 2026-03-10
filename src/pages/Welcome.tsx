/**
 * Welcome / Landing Page — viraltoby.com/welcome
 * Complete redesign — premium SaaS landing page.
 * Font: Plus Jakarta Sans. White theme with blue/violet accents.
 *
 * 3 PILLARS:
 * 1) Create content in seconds — one click or full control
 * 2) Schedule & auto-publish across 6 platforms
 * 3) Toby — AI agent that creates, publishes, and LEARNS
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import {
  ArrowRight, ChevronDown, Sparkles, X, Menu,
  Brain, Send, Play,
  CheckCircle2, Target, Film,
  Calendar, TrendingUp, Star,
  Check, Zap, BarChart3, Users,
  Clock, Search, Gauge, Repeat,
  MousePointerClick, Wand2, Palette,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { PlatformIcon } from '@/shared/components/PlatformIcon'
import { ShimmerButton } from '@/shared/components/magicui/ShimmerButton'
import { DotPattern } from '@/shared/components/magicui/DotPattern'
import { Marquee } from '@/shared/components/magicui/Marquee'
import { Safari } from '@/shared/components/magicui/Safari'
import { TextGenerateEffect } from '@/shared/components/magicui/TextGenerateEffect'
import { SpotlightCard } from '@/shared/components/aceternity/SpotlightCard'
import { BackgroundBeams } from '@/shared/components/aceternity/BackgroundBeams'
import { InfiniteMovingCards } from '@/shared/components/aceternity/InfiniteMovingCards'
import { GradientMesh } from '@/shared/components/aceternity/GradientMesh'
import vaLogo from '@/assets/icons/va-logo.svg'

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"

/* ═══ Utility: Reveal on scroll ═══ */
function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null)
  const v = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={v ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
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
    <div className="border-b border-gray-100 last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-5 sm:py-6 text-left group">
        <span className="text-[15px] sm:text-[17px] font-semibold text-gray-900 pr-8 group-hover:text-blue-600 transition-colors">{q}</span>
        <ChevronDown className={`w-5 h-5 text-gray-300 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
            <p className="pb-6 text-[14px] sm:text-[15px] text-gray-500 leading-[1.7]">{a}</p>
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
  const id = `grad-${color.replace('#', '')}`
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

/* ═══ Data ═══ */
const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', color: 'text-pink-600' },
  { id: 'youtube', name: 'YouTube', color: 'text-red-600' },
  { id: 'tiktok', name: 'TikTok', color: 'text-gray-900' },
  { id: 'facebook', name: 'Facebook', color: 'text-blue-600' },
  { id: 'threads', name: 'Threads', color: 'text-gray-900' },
  { id: 'bluesky', name: 'Bluesky', color: 'text-sky-500' },
]

const TIMELINE_STEPS = [
  { icon: Search, title: 'Scout', desc: 'Finds trending topics in your niche using real-time data', color: 'bg-cyan-500', lightBg: 'bg-cyan-50', textColor: 'text-cyan-600' },
  { icon: Wand2, title: 'Create', desc: 'Generates scroll-stopping reels & carousels in your brand style', color: 'bg-blue-500', lightBg: 'bg-blue-50', textColor: 'text-blue-600' },
  { icon: Gauge, title: 'Score', desc: 'Quality-checks every piece across 5 dimensions. Only 80+ gets published', color: 'bg-violet-500', lightBg: 'bg-violet-50', textColor: 'text-violet-600' },
  { icon: Calendar, title: 'Schedule', desc: 'Picks optimal posting times based on your audience behavior', color: 'bg-emerald-500', lightBg: 'bg-emerald-50', textColor: 'text-emerald-600' },
  { icon: Send, title: 'Publish', desc: 'Posts across all 6 platforms simultaneously', color: 'bg-pink-500', lightBg: 'bg-pink-50', textColor: 'text-pink-600' },
  { icon: Brain, title: 'Learn', desc: 'Analyzes what worked, updates strategy, gets smarter every cycle', color: 'bg-amber-500', lightBg: 'bg-amber-50', textColor: 'text-amber-600' },
]

const COMPARISON = [
  { label: 'Monthly cost', old: '$2,000 — $5,000+', toby: 'From $29/mo' },
  { label: 'Content per month', old: '15 — 30 pieces', toby: 'Unlimited' },
  { label: 'Platforms', old: '2 — 3', toby: 'All 6' },
  { label: 'Brand voice', old: 'Hit or miss', toby: 'DNA-driven' },
  { label: 'Turnaround', old: '24 — 48 hours', toby: 'Minutes' },
  { label: 'Learns from results', old: 'No', toby: 'Every day' },
  { label: 'Setup time', old: 'Weeks', toby: '5 minutes' },
]

const TESTIMONIALS = [
  { quote: 'Toby went from publishing generic content to understanding exactly what my audience wants. My engagement rate tripled in 6 weeks.', name: 'Sarah K.', title: 'Fitness Coach', metric: '3.2x engagement' },
  { quote: 'I was spending 4 hours a day on content. Now Toby handles everything and the quality is actually better than what I was making manually.', name: 'Marcus D.', title: 'Health Brand Owner', metric: '4hrs/day saved' },
  { quote: 'The learning engine is insane. After 2 weeks, Toby figured out that curiosity hooks with dark visuals perform 4x better for my niche.', name: 'Elena R.', title: 'Wellness Creator', metric: '4x hook perf' },
  { quote: 'We connected 3 brands and let Toby run. Within a month, all three were growing faster than when we had a dedicated social media manager.', name: 'James T.', title: 'Agency Owner', metric: '3 brands scaled' },
]

const FAQS = [
  { q: 'What can I create with ViralToby?', a: 'Branded Reels (Instagram, Facebook, TikTok, YouTube Shorts), Carousel posts, and Threads. You define the format, choose your brand colors, set the content style — ViralToby renders everything with professional typography and visuals.' },
  { q: 'What exactly does Toby do?', a: 'Toby is your autonomous AI agent. He researches trends in your niche, generates content ideas, creates reels and carousels, scores them for quality, schedules them, and publishes across all 6 platforms. He runs 24/7 — you don\'t need to lift a finger.' },
  { q: 'How does Toby learn and get smarter?', a: 'Toby uses Thompson Sampling — a multi-armed bandit algorithm — to test different hooks, visual styles, and topics. Every piece he publishes teaches him more about what works for YOUR specific niche. He gets measurably better every week.' },
  { q: 'Do I need to approve content before it goes live?', a: 'You\'re always in control. Content is quality-scored across 5 dimensions before it reaches your calendar. You can review, edit, reschedule, or regenerate anything. Or let Toby run fully autonomous — your choice.' },
  { q: 'Which platforms are supported?', a: 'Instagram (Reels & Carousels), Facebook (Reels & Carousels), YouTube Shorts, TikTok, Threads, and Bluesky. Connect any combination per brand.' },
  { q: 'Can I manage multiple brands?', a: 'Yes. Each brand gets its own Content DNA, connected platforms, color scheme, posting schedule, and its own learning engine. Toby learns independently for each brand.' },
  { q: 'How is this different from Buffer or Hootsuite?', a: 'Those tools are calendars — you still create everything yourself. ViralToby creates the content, scores it, schedules it, publishes it, and learns from the results. It\'s an entire content team, not a posting tool.' },
  { q: 'Is there a free trial?', a: 'Yes — start free, no credit card required. You can explore the platform, connect your brands, and see Toby in action before committing.' },
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
    document.documentElement.style.backgroundColor = '#ffffff'
    document.body.style.background = '#ffffff'
    return () => { document.documentElement.style.backgroundColor = ''; document.body.style.background = '' }
  }, [])

  const scrollTo = useCallback((id: string) => {
    setMobileOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const ctaLink = isAuthenticated ? '/' : '/login'
  const ctaLabel = isAuthenticated ? 'Go to Dashboard' : 'Start Free'

  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden" style={{ fontFamily: FONT }}>

      {/* ══════════ NAV ══════════ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-xl shadow-[0_1px_0_0_rgba(0,0,0,0.05)]' : ''}`}>
        <div className="max-w-[1320px] mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between h-16">
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5 group">
              <img src={vaLogo} alt="ViralToby" className="w-[30px] h-[30px] rounded-lg transition-transform group-hover:scale-105" />
              <span className="text-[16px] font-bold text-gray-900 tracking-tight">ViralToby</span>
            </button>
            <div className="hidden md:flex items-center gap-1">
              {[{ id: 'features', l: 'Features' }, { id: 'how-it-works', l: 'How It Works' }, { id: 'pricing', l: 'Pricing' }, { id: 'faq', l: 'FAQ' }].map(n => (
                <button key={n.id} onClick={() => scrollTo(n.id)} className="text-[14px] text-gray-500 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">{n.l}</button>
              ))}
            </div>
            <div className="hidden md:flex items-center gap-3">
              {isAuthenticated ? (
                <Link to="/" className="bg-blue-600 hover:bg-blue-700 text-white text-[14px] font-semibold px-5 py-2.5 rounded-xl transition-all">Dashboard</Link>
              ) : (
                <>
                  <Link to="/login" className="text-[14px] font-medium text-gray-500 hover:text-gray-900 px-4 py-2 transition-colors">Sign In</Link>
                  <Link to="/login" className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-[14px] font-semibold px-5 py-2.5 rounded-xl shadow-sm shadow-blue-600/25 transition-all hover:-translate-y-0.5">
                    <span className="absolute inset-0 overflow-hidden rounded-xl"><span className="absolute inset-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent" style={{ animation: 'shimmer-btn 2s infinite' }} /></span>
                    <span className="relative">Get Started</span>
                  </Link>
                </>
              )}
            </div>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-gray-500">{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          </div>
        </div>
        <AnimatePresence>
          {mobileOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="md:hidden bg-white/95 backdrop-blur-xl border-t border-gray-100 shadow-lg overflow-hidden">
              <div className="px-5 py-4 space-y-1">
                {[{ id: 'features', l: 'Features' }, { id: 'how-it-works', l: 'How It Works' }, { id: 'pricing', l: 'Pricing' }, { id: 'faq', l: 'FAQ' }].map(n => (
                  <button key={n.id} onClick={() => scrollTo(n.id)} className="block w-full text-left px-3 py-2.5 text-[14px] text-gray-600 hover:bg-gray-50 rounded-lg">{n.l}</button>
                ))}
                <div className="pt-3 flex flex-col gap-2">
                  <Link to="/login" className="text-center py-2.5 text-[14px] border border-gray-200 rounded-xl">Sign In</Link>
                  <Link to="/login" className="text-center py-2.5 text-[14px] font-semibold text-white bg-blue-600 rounded-xl">Get Started</Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>


      {/* ══════════ HERO ══════════ */}
      <section ref={heroRef} className="relative pt-28 sm:pt-36 pb-8 sm:pb-12 px-5 sm:px-8 overflow-hidden">
        {/* Animated gradient mesh background */}
        <GradientMesh />
        <DotPattern className="opacity-40" />

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative flex flex-col items-center text-center max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="w-full">

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-100 bg-blue-50/80 backdrop-blur-sm mb-6 sm:mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              <span className="text-[13px] font-medium text-blue-700">AI-powered social media autopilot</span>
            </motion.div>

            {/* Headline */}
            <h1 className="text-[38px] sm:text-[52px] md:text-[64px] lg:text-[76px] font-extrabold tracking-[-0.04em] text-gray-900 leading-[1.05]">
              <TextGenerateEffect words="Your Social Media." className="block" />
              <span className="block mt-1 sm:mt-2">
                <TextGenerateEffect
                  words="On Autopilot."
                  delay={0.4}
                  className="bg-gradient-to-r from-blue-600 via-violet-600 to-indigo-600 bg-clip-text text-transparent"
                />
              </span>
            </h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="mt-6 sm:mt-8 text-[16px] sm:text-[19px] md:text-[21px] text-gray-500 leading-relaxed max-w-[640px] mx-auto"
            >
              AI that creates, schedules, publishes, and <em className="text-gray-700 font-medium not-italic">learns</em> — across{' '}
              <span className="inline-flex items-center gap-1"><PlatformIcon platform="instagram" className="w-4 h-4 sm:w-5 sm:h-5 text-pink-500" /></span>{' '}
              <span className="inline-flex items-center gap-1"><PlatformIcon platform="tiktok" className="w-4 h-4 sm:w-5 sm:h-5" /></span>{' '}
              <span className="inline-flex items-center gap-1"><PlatformIcon platform="youtube" className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" /></span>{' '}
              <span className="inline-flex items-center gap-1"><PlatformIcon platform="facebook" className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" /></span>{' '}
              <span className="inline-flex items-center gap-1"><PlatformIcon platform="threads" className="w-4 h-4 sm:w-5 sm:h-5" /></span>{' '}
              <span className="inline-flex items-center gap-1"><PlatformIcon platform="bluesky" className="w-4 h-4 sm:w-5 sm:h-5 text-sky-500" /></span>
              {' '}so you don't have to.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.0 }}
              className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
            >
              <Link to={ctaLink}>
                <ShimmerButton className="text-[15px] sm:text-[17px] min-w-[200px] sm:min-w-[220px]">
                  {ctaLabel} <ArrowRight className="w-4 h-4" />
                </ShimmerButton>
              </Link>
              <button
                onClick={() => scrollTo('how-it-works')}
                className="inline-flex items-center justify-center gap-2 text-gray-700 text-[15px] sm:text-[17px] font-semibold px-6 py-3 sm:px-8 sm:py-3.5 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm hover:border-blue-200 hover:bg-white hover:shadow-lg transition-all hover:-translate-y-0.5 min-w-[200px] sm:min-w-[220px]"
              >
                <Play className="w-4 h-4" /> See How It Works
              </button>
            </motion.div>

            {/* Social proof */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.3 }}
              className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-6 text-[13px] text-gray-400"
            >
              <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-blue-400" /> <strong className="text-gray-600">2,917+</strong> creators</span>
              <span className="hidden sm:inline text-gray-200">|</span>
              <span className="flex items-center gap-1.5"><Film className="w-4 h-4 text-violet-400" /> <strong className="text-gray-600">847K+</strong> reels created</span>
              <span className="hidden sm:inline text-gray-200">|</span>
              <span className="flex items-center gap-1.5"><Star className="w-4 h-4 text-amber-400" /> <strong className="text-gray-600">4.8</strong> rating</span>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>


      {/* ══════════ HERO MOCKUP — Dashboard in Safari ══════════ */}
      <section className="pb-16 sm:pb-24 px-5 sm:px-8">
        <Reveal>
          <div className="max-w-[1100px] mx-auto">
            <Safari url="viraltoby.com/dashboard" className="shadow-[0_25px_100px_-15px_rgba(59,130,246,0.15)]">
              {/* Dashboard mockup content */}
              <div className="bg-gradient-to-b from-gray-50/80 to-white p-3 sm:p-5">
                {/* Agent status */}
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100 mb-3">
                  <div className="relative"><div className="w-2 h-2 rounded-full bg-emerald-500" /><div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping" /></div>
                  <span className="text-[12px] text-emerald-700 font-medium">Toby is running</span>
                  <div className="flex-1" />
                  <span className="text-[10px] text-emerald-500 bg-emerald-100 px-2 py-0.5 rounded-full font-medium hidden sm:inline">Phase: Learning</span>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3">
                  {[
                    { label: 'Total Views', value: '2.4M', change: '+24%', color: '#3B82F6' },
                    { label: 'Engagement', value: '6.8%', change: '+1.2%', color: '#10B981' },
                    { label: 'Published', value: '347', change: '+52', color: '#8B5CF6' },
                    { label: 'Followers', value: '45.2K', change: '+3.1K', color: '#F59E0B' },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-xl p-3 border border-gray-100 relative overflow-hidden">
                      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: s.color }} />
                      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{s.label}</div>
                      <div className="text-[18px] sm:text-[22px] font-extrabold leading-none" style={{ color: s.color }}>{s.value}</div>
                      <div className="flex items-center gap-1 mt-1">
                        <TrendingUp className="w-2.5 h-2.5 text-emerald-500" />
                        <span className="text-[10px] font-semibold text-emerald-500">{s.change}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Chart */}
                <div className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-semibold text-gray-700">Growth Trend</span>
                    <span className="text-[10px] text-gray-300">Last 30 days</span>
                  </div>
                  <MiniAreaChart data={GROWTH_DATA} color="#3B82F6" height={80} />
                </div>
              </div>
            </Safari>
          </div>
        </Reveal>
      </section>


      {/* ══════════ PLATFORM MARQUEE ══════════ */}
      <section className="pb-16 sm:pb-20 overflow-hidden">
        <Reveal>
          <p className="text-center text-[13px] text-gray-400 uppercase tracking-widest font-medium mb-6">Publish everywhere, simultaneously</p>
          <Marquee pauseOnHover speed={30} className="[--gap:2rem]">
            {PLATFORMS.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-6 py-3 rounded-xl border border-gray-100 bg-white shadow-sm">
                <PlatformIcon platform={p.id} className={`w-6 h-6 ${p.color}`} />
                <span className="text-[15px] font-semibold text-gray-700">{p.name}</span>
              </div>
            ))}
          </Marquee>
        </Reveal>
      </section>


      {/* ══════════ 3 PILLARS — Feature Cards ══════════ */}
      <section id="features" className="py-16 sm:py-24 px-5 sm:px-8">
        <div className="max-w-[1200px] mx-auto">
          <Reveal>
            <div className="text-center mb-12 sm:mb-16">
              <p className="text-[13px] font-semibold text-blue-600 uppercase tracking-widest mb-3">Everything you need</p>
              <h2 className="text-[32px] sm:text-[44px] font-extrabold tracking-tight text-gray-900">Three pillars. One platform.</h2>
              <p className="mt-4 text-[16px] sm:text-[18px] text-gray-500 max-w-2xl mx-auto">Whether you want full control or full autopilot — ViralToby adapts to how you work.</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
            {/* Pillar 1: Create */}
            <Reveal delay={0.1}>
              <SpotlightCard className="rounded-2xl border border-gray-200 bg-white h-full">
                <div className="p-6 sm:p-8">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-5 shadow-lg shadow-blue-500/20">
                    <MousePointerClick className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-[20px] font-bold text-gray-900 mb-2">Create in Seconds</h3>
                  <p className="text-[14px] text-gray-500 leading-relaxed mb-6">One click for autopilot. Or choose your topic, format, and style for full creative control.</p>

                  {/* Mini creation wizard mockup */}
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
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
                        className={`flex items-center gap-3 p-2.5 rounded-lg ${s.active ? 'bg-white border border-blue-100 shadow-sm' : 'bg-gray-100/50'}`}
                      >
                        <span className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${s.active ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400'}`}>{s.step}</span>
                        <div className="flex-1">
                          <span className="text-[11px] text-gray-400 block">{s.label}</span>
                          <span className={`text-[12px] font-semibold ${s.active ? 'text-gray-700' : 'text-gray-400'}`}>{s.value}</span>
                        </div>
                        {s.active && <Check className="w-4 h-4 text-blue-500" />}
                      </motion.div>
                    ))}
                    <div className="pt-1">
                      <div className="w-full py-2 rounded-lg bg-blue-500 text-white text-center text-[12px] font-semibold">Generate Content</div>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </Reveal>

            {/* Pillar 2: Schedule */}
            <Reveal delay={0.2}>
              <SpotlightCard className="rounded-2xl border border-gray-200 bg-white h-full">
                <div className="p-6 sm:p-8">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/20">
                    <Calendar className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-[20px] font-bold text-gray-900 mb-2">Schedule & Publish</h3>
                  <p className="text-[14px] text-gray-500 leading-relaxed mb-6">Smart scheduling across 6 platforms. Buffer charges $6/account — we include it free.</p>

                  {/* Mini calendar mockup */}
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-[11px] font-semibold text-gray-500 mb-3">March 2026</div>
                    <div className="grid grid-cols-7 gap-1">
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                        <div key={i} className="text-[9px] text-gray-400 text-center font-medium pb-1">{d}</div>
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
                            className={`aspect-square rounded-md flex flex-col items-center justify-center gap-0.5 ${hasContent ? 'bg-white border border-gray-100 shadow-sm' : ''}`}
                          >
                            <span className="text-[9px] text-gray-400">{i + 1}</span>
                            {hasContent && (
                              <div className="flex gap-0.5">
                                {platforms.map(p => (
                                  <div key={p} className={`w-1 h-1 rounded-full ${p === 'instagram' ? 'bg-pink-400' : p === 'tiktok' ? 'bg-gray-700' : p === 'youtube' ? 'bg-red-400' : p === 'facebook' ? 'bg-blue-400' : 'bg-gray-400'}`} />
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )
                      })}
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>Smart timing optimizes for each platform</span>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </Reveal>

            {/* Pillar 3: Toby */}
            <Reveal delay={0.3}>
              <SpotlightCard className="rounded-2xl border border-gray-200 bg-white h-full" spotlightColor="rgba(139,92,246,0.08)">
                <div className="p-6 sm:p-8">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-5 shadow-lg shadow-violet-500/20">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-[20px] font-bold text-gray-900 mb-2">Toby Learns Your Brand</h3>
                  <p className="text-[14px] text-gray-500 leading-relaxed mb-6">An AI agent that runs the entire cycle — and gets smarter every single day.</p>

                  {/* Learning visualization */}
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-gray-500">Toby Score</span>
                      <span className="text-[11px] text-violet-500 bg-violet-50 px-2 py-0.5 rounded-full font-medium">Improving</span>
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
                          <span className="text-[10px] text-gray-400">{l.label}</span>
                          <span className="text-[10px] font-bold text-gray-600">{l.value}</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
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
                    <div className="flex items-center gap-2 bg-violet-50 rounded-lg px-3 py-2 mt-2">
                      <Sparkles className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                      <span className="text-[10px] text-violet-600 font-medium">Curiosity hooks convert 3.2x better for this brand</span>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ CASE STUDY: @thelongevitycollege ══════════ */}
      <section className="py-16 sm:py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-900 to-blue-950" />
        <div className="absolute inset-0 opacity-20">
          <DotPattern className="fill-white/10" />
        </div>

        <div className="relative max-w-[1200px] mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left: Phone mockup */}
            <Reveal>
              <div className="flex justify-center">
                <div className="relative">
                  {/* Phone frame */}
                  <div className="w-[280px] sm:w-[320px] rounded-[2.5rem] border-[8px] border-gray-700 bg-gray-800 shadow-2xl overflow-hidden">
                    <div className="bg-white aspect-[9/16] flex flex-col">
                      {/* Instagram-like header */}
                      <div className="p-4 flex items-center gap-3 border-b border-gray-100">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-[14px]">LC</div>
                        <div>
                          <div className="text-[13px] font-bold text-gray-900">thelongevitycollege</div>
                          <div className="text-[11px] text-gray-400">100K followers</div>
                        </div>
                      </div>
                      {/* Stats */}
                      <div className="grid grid-cols-3 py-4 px-3 border-b border-gray-100 text-center">
                        <div><div className="text-[16px] font-extrabold text-gray-900">847</div><div className="text-[10px] text-gray-400">Posts</div></div>
                        <div><div className="text-[16px] font-extrabold text-gray-900">100K</div><div className="text-[10px] text-gray-400">Followers</div></div>
                        <div><div className="text-[16px] font-extrabold text-gray-900">1.2K</div><div className="text-[10px] text-gray-400">Following</div></div>
                      </div>
                      {/* Bio */}
                      <div className="px-4 py-3">
                        <div className="text-[12px] font-semibold text-gray-900">The Longevity College</div>
                        <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">Science-backed longevity tips. Daily reels by Toby AI.</div>
                      </div>
                      {/* Grid of posts */}
                      <div className="grid grid-cols-3 gap-0.5 flex-1 px-0.5 pb-0.5">
                        {Array.from({ length: 9 }).map((_, i) => (
                          <div key={i} className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                            <Film className="w-4 h-4 text-gray-300" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Floating badge */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8, x: 20 }}
                    whileInView={{ opacity: 1, scale: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5, type: 'spring' }}
                    className="absolute -right-4 sm:-right-8 top-16 bg-white rounded-xl px-4 py-3 shadow-xl border border-gray-100"
                  >
                    <div className="text-[10px] text-gray-400 mb-0.5">Growth</div>
                    <div className="text-[20px] font-extrabold text-emerald-500">+100K</div>
                    <div className="text-[10px] text-gray-400">in 2 months</div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8, x: -20 }}
                    whileInView={{ opacity: 1, scale: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.7, type: 'spring' }}
                    className="absolute -left-4 sm:-left-8 bottom-24 bg-white rounded-xl px-4 py-3 shadow-xl border border-gray-100"
                  >
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-[11px] font-semibold text-gray-700">Full autopilot</span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Powered by Toby</div>
                  </motion.div>
                </div>
              </div>
            </Reveal>

            {/* Right: Story */}
            <Reveal delay={0.2}>
              <div>
                <p className="text-[13px] font-semibold text-blue-400 uppercase tracking-widest mb-4">Case Study</p>
                <h2 className="text-[32px] sm:text-[42px] font-extrabold text-white tracking-tight leading-tight">
                  0 to 100K followers<br />
                  <span className="text-blue-400">in 2 months.</span>
                </h2>
                <p className="mt-6 text-[16px] sm:text-[18px] text-gray-400 leading-relaxed">
                  <strong className="text-white">@thelongevitycollege</strong> connected their brand, defined their Content DNA, and let Toby run on full autopilot. Two months later — 100K followers, hundreds of reels published, zero manual content creation.
                </p>
                <div className="mt-8 grid grid-cols-3 gap-4">
                  {[
                    { value: '100K', label: 'Followers gained' },
                    { value: '847', label: 'Reels published' },
                    { value: '0hrs', label: 'Manual work' },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <div className="text-[24px] sm:text-[32px] font-extrabold text-white">{s.value}</div>
                      <div className="text-[11px] sm:text-[12px] text-gray-500 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-8">
                  <Link
                    to={ctaLink}
                    className="inline-flex items-center gap-2 bg-white text-gray-900 font-semibold text-[15px] px-6 py-3 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    Start your growth story <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ HOW TOBY WORKS — Timeline ══════════ */}
      <section id="how-it-works" className="py-16 sm:py-24 px-5 sm:px-8">
        <div className="max-w-[900px] mx-auto">
          <Reveal>
            <div className="text-center mb-12 sm:mb-16">
              <p className="text-[13px] font-semibold text-violet-600 uppercase tracking-widest mb-3">The Toby Loop</p>
              <h2 className="text-[32px] sm:text-[44px] font-extrabold tracking-tight text-gray-900">Six steps. Fully autonomous.</h2>
              <p className="mt-4 text-[16px] sm:text-[18px] text-gray-500 max-w-xl mx-auto">Toby runs this cycle every 5 minutes — finding, creating, scoring, scheduling, publishing, and learning from results.</p>
            </div>
          </Reveal>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 sm:left-8 top-0 bottom-0 w-[2px] bg-gradient-to-b from-cyan-200 via-blue-200 via-violet-200 via-emerald-200 via-pink-200 to-amber-200" />

            <div className="space-y-6 sm:space-y-8">
              {TIMELINE_STEPS.map((step, i) => (
                <Reveal key={step.title} delay={i * 0.1}>
                  <div className="flex gap-4 sm:gap-6 items-start">
                    {/* Timeline node */}
                    <div className="relative z-10 flex-shrink-0">
                      <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl ${step.color} flex items-center justify-center shadow-lg`} style={{ animation: i === 0 ? 'timeline-pulse 2s infinite' : undefined }}>
                        <step.icon className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                      </div>
                    </div>
                    {/* Content */}
                    <div className="flex-1 pt-1 sm:pt-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${step.textColor}`}>Step {i + 1}</span>
                      </div>
                      <h3 className="text-[18px] sm:text-[20px] font-bold text-gray-900">{step.title}</h3>
                      <p className="text-[14px] text-gray-500 mt-1 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* Loop indicator */}
            <Reveal delay={0.7}>
              <div className="flex items-center gap-3 mt-8 ml-6 sm:ml-8 pl-6 sm:pl-8">
                <Repeat className="w-5 h-5 text-blue-400" />
                <span className="text-[14px] text-gray-400">Then it loops — getting smarter every cycle</span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ SCHEDULING DEEP DIVE ══════════ */}
      <section className="py-16 sm:py-24 px-5 sm:px-8 bg-gray-50">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <Reveal>
              <div>
                <p className="text-[13px] font-semibold text-emerald-600 uppercase tracking-widest mb-3">Scheduling & Analytics</p>
                <h2 className="text-[32px] sm:text-[40px] font-extrabold tracking-tight text-gray-900 leading-tight">
                  Why pay $6/account<br />for scheduling alone?
                </h2>
                <p className="mt-4 text-[16px] text-gray-500 leading-relaxed">
                  ViralToby includes smart scheduling, multi-platform publishing, and analytics — alongside AI content creation. No extra fees per account.
                </p>
                <div className="mt-8 space-y-3">
                  {[
                    { icon: Clock, text: 'Smart time optimization per platform' },
                    { icon: Calendar, text: 'Drag-and-drop content calendar' },
                    { icon: BarChart3, text: 'Built-in engagement analytics' },
                    { icon: Target, text: 'Queue management with priority' },
                    { icon: Zap, text: 'Instant multi-platform publishing' },
                  ].map(f => (
                    <div key={f.text} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <f.icon className="w-4 h-4 text-emerald-500" />
                      </div>
                      <span className="text-[14px] text-gray-700">{f.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.2}>
              <Safari url="viraltoby.com/calendar" className="shadow-xl">
                <div className="bg-white p-4">
                  {/* Calendar header */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[14px] font-bold text-gray-900">Content Calendar</span>
                    <div className="flex gap-1">
                      {PLATFORMS.slice(0, 4).map(p => (
                        <PlatformIcon key={p.id} platform={p.id} className={`w-4 h-4 ${p.color}`} />
                      ))}
                    </div>
                  </div>
                  {/* Calendar grid */}
                  <div className="grid grid-cols-7 gap-1 mb-4">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                      <div key={d} className="text-[10px] font-medium text-gray-400 text-center pb-1">{d}</div>
                    ))}
                    {Array.from({ length: 35 }, (_, i) => {
                      const day = i - 1
                      const slots = day >= 0 && day < 31 ? Math.floor(Math.random() * 4) : 0
                      return (
                        <div key={i} className={`aspect-square rounded-md flex flex-col items-center justify-center ${day >= 0 && day < 31 ? 'bg-gray-50' : ''}`}>
                          {day >= 0 && day < 31 && (
                            <>
                              <span className="text-[9px] text-gray-400">{day + 1}</span>
                              {slots > 0 && (
                                <div className="flex gap-0.5 mt-0.5">
                                  {Array.from({ length: Math.min(slots, 3) }).map((_, j) => (
                                    <div key={j} className={`w-1 h-1 rounded-full ${j === 0 ? 'bg-pink-400' : j === 1 ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {/* Upcoming */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Upcoming today</div>
                    {[
                      { time: '7:30 AM', title: '5 habits for longevity', platform: 'instagram' },
                      { time: '12:00 PM', title: 'The gut-brain connection', platform: 'tiktok' },
                      { time: '5:00 PM', title: 'Sleep science carousel', platform: 'facebook' },
                    ].map(item => (
                      <div key={item.time} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-gray-50">
                        <span className="text-[10px] text-gray-400 w-14">{item.time}</span>
                        <PlatformIcon platform={item.platform} className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-[11px] text-gray-600 truncate">{item.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Safari>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ CONTENT TYPES ══════════ */}
      <section className="py-16 sm:py-24 px-5 sm:px-8">
        <div className="max-w-[1200px] mx-auto">
          <Reveal>
            <div className="text-center mb-12 sm:mb-16">
              <p className="text-[13px] font-semibold text-pink-600 uppercase tracking-widest mb-3">Content Types</p>
              <h2 className="text-[32px] sm:text-[44px] font-extrabold tracking-tight text-gray-900">Reels, Carousels, and more.</h2>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Reels */}
            <Reveal delay={0.1}>
              <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 group hover:shadow-xl hover:shadow-black/[0.04] transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center">
                    <Film className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-[18px] font-bold text-gray-900">Reels & Shorts</h3>
                    <p className="text-[12px] text-gray-400">Instagram, TikTok, YouTube, Facebook</p>
                  </div>
                </div>
                <p className="text-[14px] text-gray-500 leading-relaxed mb-6">Scroll-stopping vertical videos with custom typography, brand colors, and hook-optimized text overlays. Ready for all 4 short-form platforms.</p>

                {/* Reel preview mockup */}
                <div className="flex gap-3 overflow-hidden">
                  {[
                    { title: '5 habits that\nchanged my life', bg: 'from-gray-900 to-gray-800' },
                    { title: 'Why you should\nwalk after meals', bg: 'from-blue-900 to-blue-800' },
                    { title: 'The cortisol\nmorning routine', bg: 'from-violet-900 to-violet-800' },
                  ].map((r, i) => (
                    <div key={i} className={`w-24 sm:w-28 aspect-[9/16] rounded-xl bg-gradient-to-b ${r.bg} flex items-end p-2 flex-shrink-0`}>
                      <span className="text-[8px] sm:text-[9px] font-bold text-white leading-tight whitespace-pre-line">{r.title}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 text-[12px] text-gray-400 flex items-center gap-2">
                  <Zap className="w-3 h-3 text-pink-500" />
                  <span>Generate a reel in <strong className="text-gray-600">30 seconds</strong></span>
                </div>
              </div>
            </Reveal>

            {/* Carousels */}
            <Reveal delay={0.2}>
              <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 group hover:shadow-xl hover:shadow-black/[0.04] transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <Palette className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-[18px] font-bold text-gray-900">Carousels</h3>
                    <p className="text-[12px] text-gray-400">Instagram, Facebook</p>
                  </div>
                </div>
                <p className="text-[14px] text-gray-500 leading-relaxed mb-6">Multi-slide educational posts with branded headers, consistent typography, and swipe-optimized layouts. Up to 10 slides per carousel.</p>

                {/* Carousel preview */}
                <div className="flex gap-2 overflow-hidden">
                  {[
                    { slide: 1, title: 'The Science of\nSleep Quality', bg: 'from-emerald-900 to-emerald-800', isTitle: true },
                    { slide: 2, title: 'Most people sleep\n7 hours but feel\ntired. Here\'s why...', bg: '', isTitle: false },
                    { slide: 3, title: 'Your circadian\nrhythm needs\nconsistency.', bg: '', isTitle: false },
                  ].map((s, i) => (
                    <div key={i} className={`w-28 sm:w-32 aspect-[4/5] rounded-xl flex-shrink-0 flex items-center justify-center p-3 ${s.isTitle ? `bg-gradient-to-b ${s.bg}` : 'bg-[#f8f5f0] border border-gray-200'}`}>
                      <span className={`text-[8px] sm:text-[9px] font-semibold leading-tight whitespace-pre-line ${s.isTitle ? 'text-white' : 'text-gray-700'}`}>{s.title}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 text-[12px] text-gray-400 flex items-center gap-2">
                  <Zap className="w-3 h-3 text-blue-500" />
                  <span>10-slide carousel in <strong className="text-gray-600">1 click</strong></span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ PRICING ══════════ */}
      <section id="pricing" className="py-16 sm:py-24 px-5 sm:px-8 bg-gray-50">
        <div className="max-w-[900px] mx-auto">
          <Reveal>
            <div className="text-center mb-12 sm:mb-16">
              <p className="text-[13px] font-semibold text-blue-600 uppercase tracking-widest mb-3">Pricing</p>
              <h2 className="text-[32px] sm:text-[44px] font-extrabold tracking-tight text-gray-900">The old way vs. The Toby way</h2>
              <p className="mt-4 text-[16px] text-gray-500">Replace your agency, VA, and scheduling tool — for a fraction of the cost.</p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              {/* Header */}
              <div className="grid grid-cols-3 border-b border-gray-100">
                <div className="p-4 sm:p-5" />
                <div className="p-4 sm:p-5 text-center border-l border-gray-100">
                  <span className="text-[13px] font-semibold text-gray-400">Agency / VA</span>
                </div>
                <div className="p-4 sm:p-5 text-center border-l border-gray-100 bg-blue-50/50">
                  <span className="text-[13px] font-bold text-blue-600">ViralToby</span>
                </div>
              </div>
              {/* Rows */}
              {COMPARISON.map((row, i) => (
                <div key={row.label} className={`grid grid-cols-3 ${i < COMPARISON.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <div className="p-3 sm:p-4 text-[13px] sm:text-[14px] font-medium text-gray-700">{row.label}</div>
                  <div className="p-3 sm:p-4 text-center border-l border-gray-50 text-[13px] text-gray-400">{row.old}</div>
                  <div className="p-3 sm:p-4 text-center border-l border-gray-50 bg-blue-50/30 text-[13px] font-semibold text-blue-600 flex items-center justify-center gap-1.5">
                    <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    {row.toby}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="text-center mt-10">
              <Link to={ctaLink}>
                <ShimmerButton className="text-[16px]">
                  {ctaLabel} <ArrowRight className="w-4 h-4" />
                </ShimmerButton>
              </Link>
              <p className="mt-3 text-[13px] text-gray-400">No credit card required</p>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════ TESTIMONIALS ══════════ */}
      <section className="py-16 sm:py-24 overflow-hidden">
        <Reveal>
          <div className="text-center mb-10 px-5">
            <p className="text-[13px] font-semibold text-violet-600 uppercase tracking-widest mb-3">Testimonials</p>
            <h2 className="text-[32px] sm:text-[40px] font-extrabold tracking-tight text-gray-900">Loved by creators</h2>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <InfiniteMovingCards items={TESTIMONIALS} speed="slow" />
        </Reveal>
      </section>


      {/* ══════════ FAQ ══════════ */}
      <section id="faq" className="py-16 sm:py-24 px-5 sm:px-8 bg-gray-50">
        <div className="max-w-[700px] mx-auto">
          <Reveal>
            <div className="text-center mb-10 sm:mb-12">
              <h2 className="text-[32px] sm:text-[40px] font-extrabold tracking-tight text-gray-900">Frequently asked questions</h2>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
              {FAQS.map(f => (
                <FaqItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════ FINAL CTA ══════════ */}
      <section className="relative py-20 sm:py-28 px-5 sm:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900" />
        <BackgroundBeams />

        <div className="relative text-center max-w-2xl mx-auto">
          <Reveal>
            <h2 className="text-[32px] sm:text-[48px] font-extrabold text-white tracking-tight leading-tight">
              Ready to put your social<br />media on autopilot?
            </h2>
            <p className="mt-5 text-[16px] sm:text-[18px] text-gray-400">
              Join 2,917+ creators who let Toby handle their content. Start free — no credit card required.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to={ctaLink}>
                <ShimmerButton className="text-[16px] sm:text-[18px] px-10 py-4" background="linear-gradient(135deg, #3b82f6, #6366f1)">
                  {ctaLabel} <ArrowRight className="w-5 h-5" />
                </ShimmerButton>
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-[13px] text-gray-500">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Free to start</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Cancel anytime</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 6 platforms</span>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════ FOOTER ══════════ */}
      <footer className="bg-gray-900 border-t border-gray-800 py-12 sm:py-16 px-5 sm:px-8">
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
                <h4 className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Product</h4>
                <div className="space-y-2">
                  <button onClick={() => scrollTo('features')} className="block text-[13px] text-gray-500 hover:text-white transition-colors">Features</button>
                  <button onClick={() => scrollTo('pricing')} className="block text-[13px] text-gray-500 hover:text-white transition-colors">Pricing</button>
                  <button onClick={() => scrollTo('faq')} className="block text-[13px] text-gray-500 hover:text-white transition-colors">FAQ</button>
                </div>
              </div>
              <div>
                <h4 className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Legal</h4>
                <div className="space-y-2">
                  <Link to="/privacy-policy" className="block text-[13px] text-gray-500 hover:text-white transition-colors">Privacy Policy</Link>
                  <Link to="/terms" className="block text-[13px] text-gray-500 hover:text-white transition-colors">Terms of Service</Link>
                  <Link to="/data-deletion" className="block text-[13px] text-gray-500 hover:text-white transition-colors">Data Deletion</Link>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-10 pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3">
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
