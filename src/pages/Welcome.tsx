/**
 * Welcome / Landing Page — viraltoby.com/welcome
 * Clean modern SaaS, ViewCreator-inspired density.
 * Font: Plus Jakarta Sans. White theme with blue accent.
 *
 * NARRATIVE:
 * 1) You create Reels & Carousels — define format, brand, style
 * 2) Toby is your AI Agent — ideates, creates, publishes, LEARNS
 * 3) Toby gets exponentially smarter every day for YOUR niche
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, ChevronDown, Sparkles, X, Menu,
  Brain, Shield, Send,
  CheckCircle2, Target, Film,
  Calendar, Eye, TrendingUp, Star, Image,
  Check, Repeat, Zap, BarChart3, Users, Heart,
  ArrowUpRight, Clock, Activity, MessageSquare,
  Layers, Globe, Lock,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { PlatformIcon } from '@/shared/components/PlatformIcon'
import vaLogo from '@/assets/icons/va-logo.svg'

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"

/* ═══ Utility: Animated counter ═══ */
function useCounter(end: number, duration = 2000, active = true) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active) return
    let start = 0
    const step = end / (duration / 16)
    const id = setInterval(() => {
      start += step
      if (start >= end) { setVal(end); clearInterval(id) }
      else setVal(Math.floor(start))
    }, 16)
    return () => clearInterval(id)
  }, [end, duration, active])
  return val
}

/* ═══ Components ═══ */

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null)
  const v = useInView(ref, { once: true, margin: '-60px' })
  return <motion.div ref={ref} initial={{ opacity: 0, y: 24 }} animate={v ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>{children}</motion.div>
}

function FaqItem({ q, a, open: defaultOpen = false }: { q: string; a: string; open?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
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

/* SVG mini area chart — pure inline, no dependencies */
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
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* Animated stat that counts up */
function AnimatedStat({ value, suffix = '', prefix = '', label, color, icon: Icon }: { value: number; suffix?: string; prefix?: string; label: string; color: string; icon: React.ElementType }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  const count = useCounter(value, 1800, inView)
  return (
    <div ref={ref} className="text-center">
      <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center ${color.includes('blue') ? 'bg-blue-50' : color.includes('emerald') ? 'bg-emerald-50' : color.includes('violet') ? 'bg-violet-50' : 'bg-amber-50'}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className={`text-[24px] sm:text-[28px] font-extrabold ${color}`}>{prefix}{count.toLocaleString()}{suffix}</div>
      <div className="text-[12px] text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}

/* Floating notification toast — auto-cycles */
function FloatingNotification() {
  const notifications = [
    { icon: Send, text: 'Published to Instagram', brand: '@healthycollege', time: '2m ago', color: 'text-pink-500' },
    { icon: Sparkles, text: 'Reel generated — Score: 92', brand: 'Mindset Mastery', time: '5m ago', color: 'text-blue-500' },
    { icon: Brain, text: 'New hook strategy discovered', brand: 'FitnessPro', time: '8m ago', color: 'text-violet-500' },
    { icon: TrendingUp, text: 'Reel hit 50K views', brand: '@healthycollege', time: '12m ago', color: 'text-emerald-500' },
    { icon: Eye, text: 'Trending topic detected', brand: 'Mindset Mastery', time: '15m ago', color: 'text-amber-500' },
  ]
  const [idx, setIdx] = useState(0)
  useEffect(() => { const i = setInterval(() => setIdx(p => (p + 1) % notifications.length), 3000); return () => clearInterval(i) }, [])
  const n = notifications[idx]
  return (
    <AnimatePresence mode="wait">
      <motion.div key={idx} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }} transition={{ duration: 0.3 }}
        className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-100 shadow-lg shadow-black/[0.04]">
        <div className={`w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center`}><n.icon className={`w-4 h-4 ${n.color}`} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-gray-800 truncate">{n.text}</div>
          <div className="text-[11px] text-gray-400">{n.brand} · {n.time}</div>
        </div>
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
      </motion.div>
    </AnimatePresence>
  )
}

/* ═══ Data ═══ */

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram' }, { id: 'youtube', name: 'YouTube' }, { id: 'tiktok', name: 'TikTok' },
  { id: 'facebook', name: 'Facebook' }, { id: 'threads', name: 'Threads' }, { id: 'bluesky', name: 'Bluesky' },
]

const OLD_WAY = [
  'Brainstorming content ideas from scratch every day',
  'Manually designing reels and carousels for each platform',
  'Guessing which hooks and topics will perform',
  'Missing posting windows and losing momentum',
  'No way to test what actually works for your niche',
]

const TOBY_WAY = [
  'Toby researches your niche and brings the ideas',
  'Toby creates reels & carousels in your brand style',
  'Toby learns which hooks go viral for YOUR audience',
  'Toby publishes on schedule across 6 platforms',
  'Toby gets smarter every day — exponentially',
]

const FAQS = [
  { q: 'What can I create with ViralToby?', a: 'You can create branded Reels (Instagram, Facebook, TikTok, YouTube Shorts) and Carousel posts. You define the format, choose your brand colors, set the content style — ViralToby renders everything with professional typography and visuals.' },
  { q: 'What exactly does Toby do?', a: 'Toby is your autonomous AI agent. He researches trends in your niche, comes up with content ideas, generates reels and carousels, scores them for quality, schedules them, and publishes across all 6 platforms. He runs 24/7 on a 5-minute loop — you don\'t need to lift a finger.' },
  { q: 'How does Toby learn and get smarter?', a: 'Toby uses Thompson Sampling — a multi-armed bandit algorithm — to test different hooks, personalities, visual styles, and topics. Every piece he publishes teaches him more about what works for YOUR specific niche and audience. He gets measurably better every week.' },
  { q: 'Do I need to approve content?', a: 'You\'re always in control. Content is quality-scored across 5 dimensions before it reaches your calendar. You can review, edit, reschedule, or regenerate anything. Or let Toby run fully autonomous — your choice.' },
  { q: 'Which platforms are supported?', a: 'Instagram (Reels & Carousels), Facebook (Reels & Carousels), YouTube Shorts, TikTok, Threads, and Bluesky. Connect any combination per brand.' },
  { q: 'Can I manage multiple brands?', a: 'Yes. Each brand gets its own Content DNA, connected platforms, color scheme, posting schedule, and its own learning engine. Toby learns independently for each brand.' },
  { q: 'How is this different from Hootsuite or Buffer?', a: 'Those tools are calendars — you still create everything yourself. ViralToby creates the content, scores it, schedules it, publishes it, and learns from the results. It\'s an entire content team, not a posting tool.' },
  { q: 'What\'s the quality scoring?', a: 'Every piece is scored across 5 dimensions: structural compliance, pattern familiarity, novelty, emotional hook, and plausibility. Only content scoring 80+ gets published. Below that, Toby regenerates automatically.' },
]

const COMPARISON = [
  { label: 'Monthly cost', old: '$2,000 — $5,000+', toby: '$50 / brand' },
  { label: 'Content per month', old: '15 — 30 pieces', toby: 'Unlimited' },
  { label: 'Platforms', old: '2 — 3', toby: 'All 6' },
  { label: 'Brand voice', old: 'Hit or miss', toby: 'DNA-driven' },
  { label: 'Turnaround', old: '24 — 48 hours', toby: 'Minutes' },
  { label: 'Learns from results', old: 'No', toby: 'Yes — every day' },
  { label: 'Setup time', old: 'Weeks', toby: '5 minutes' },
]

/* Chart data — realistic growth curves */
const GROWTH_DATA = [120, 145, 138, 190, 220, 195, 280, 310, 290, 380, 420, 395, 510, 580, 620, 590, 700, 780, 820, 860, 920, 980, 1050, 1120, 1200, 1350, 1420, 1580, 1700, 1850]
const ENGAGEMENT_DATA = [2.1, 2.4, 2.2, 3.1, 3.5, 3.2, 4.1, 4.5, 4.3, 5.2, 5.8, 5.5, 6.1, 6.8, 7.2, 6.9, 7.5, 8.1, 8.4, 8.8, 9.2, 9.5, 9.8, 10.2, 10.8, 11.2, 11.5, 12.1, 12.8, 13.5]

/* Topic performance for visualization */
const TOPICS = [
  { name: 'Morning Routines', score: 94, views: '245K', color: '#3B82F6' },
  { name: 'Mindset & Habits', score: 91, views: '198K', color: '#8B5CF6' },
  { name: 'Superfoods', score: 87, views: '176K', color: '#10B981' },
  { name: 'Sleep Science', score: 84, views: '152K', color: '#F59E0B' },
  { name: 'Gut Health', score: 79, views: '128K', color: '#EC4899' },
  { name: 'Stress Relief', score: 75, views: '104K', color: '#06B6D4' },
]

/* Testimonials */
const TESTIMONIALS = [
  { name: 'Sarah K.', role: 'Fitness Coach', text: 'Toby went from publishing generic content to understanding exactly what my audience wants. My engagement rate tripled in 6 weeks.', avatar: 'S', gradient: 'from-pink-400 to-rose-500', metric: '3.2x engagement' },
  { name: 'Marcus D.', role: 'Health Brand Owner', text: 'I was spending 4 hours a day on content. Now Toby handles everything and the quality is actually better than what I was making manually.', avatar: 'M', gradient: 'from-blue-400 to-indigo-500', metric: '4hrs/day saved' },
  { name: 'Elena R.', role: 'Wellness Creator', text: 'The learning engine is insane. After 2 weeks, Toby figured out that curiosity hooks with dark visuals perform 4x better for my niche.', avatar: 'E', gradient: 'from-violet-400 to-purple-500', metric: '4x hook performance' },
]

/* Activity feed items for the dashboard */
const ACTIVITY_FEED = [
  { action: 'Published reel to Instagram', detail: '"5 morning habits that changed my life"', time: '2 min ago', icon: Send, color: 'text-pink-500', bg: 'bg-pink-50' },
  { action: 'Quality score: 94/100', detail: 'Passed all 5 dimensions', time: '3 min ago', icon: Shield, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  { action: 'New trend detected', detail: 'Cortisol regulation — rising 340%', time: '8 min ago', icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-50' },
  { action: 'Strategy update', detail: 'Curiosity hooks → 94% success rate', time: '12 min ago', icon: Brain, color: 'text-violet-500', bg: 'bg-violet-50' },
  { action: 'Published carousel to Facebook', detail: '"The gut-brain connection explained"', time: '18 min ago', icon: Send, color: 'text-blue-500', bg: 'bg-blue-50' },
]


/* ═══════════════════════════════════════ PAGE ═══════════════════════════════ */

export function WelcomePage() {
  const { isAuthenticated } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => { const fn = () => setScrolled(window.scrollY > 10); window.addEventListener('scroll', fn, { passive: true }); return () => window.removeEventListener('scroll', fn) }, [])
  useEffect(() => { document.documentElement.style.backgroundColor = '#ffffff'; document.body.style.background = '#ffffff'; return () => { document.documentElement.style.backgroundColor = ''; document.body.style.background = '' } }, [])

  const scrollTo = useCallback((id: string) => { setMobileOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }) }, [])
  const ctaLink = isAuthenticated ? '/' : '/login'
  const ctaLabel = isAuthenticated ? 'Go to Dashboard' : 'Get Started'

  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ fontFamily: FONT }}>

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
                  <Link to="/login" className="text-[14px] font-medium text-gray-500 hover:text-gray-900 px-4 py-2">Sign In</Link>
                  <Link to="/login" className="bg-blue-600 hover:bg-blue-700 text-white text-[14px] font-semibold px-5 py-2.5 rounded-xl shadow-sm shadow-blue-600/25 transition-all">Get Started</Link>
                </>
              )}
            </div>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-gray-500">{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          </div>
        </div>
        <AnimatePresence>
          {mobileOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="md:hidden bg-white border-t border-gray-100 shadow-lg overflow-hidden">
              <div className="px-5 py-4 space-y-1">
                {['features', 'how-it-works', 'pricing', 'faq'].map(id => (
                  <button key={id} onClick={() => scrollTo(id)} className="block w-full text-left px-3 py-2.5 text-[14px] text-gray-600 hover:bg-gray-50 rounded-lg">{id === 'how-it-works' ? 'How It Works' : id === 'faq' ? 'FAQ' : id[0].toUpperCase() + id.slice(1)}</button>
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
      <section className="relative pt-32 sm:pt-40 pb-16 sm:pb-20 px-5 sm:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/60 via-white to-white" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-gradient-to-b from-blue-100/40 to-transparent rounded-full blur-3xl" />

        <div className="relative flex flex-col items-center text-center max-w-5xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="w-full">

            <h1 className="text-[40px] sm:text-[56px] md:text-[64px] lg:text-[76px] font-extrabold tracking-[-0.04em] text-gray-900 leading-[1.08]">
              <span className="relative inline-block">
                <span className="absolute inset-0 bg-blue-500/10 blur-2xl rounded-full scale-150 pointer-events-none" />
                <span className="relative inline-block bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 bg-clip-text text-transparent">Grow</span>
                <span className="absolute -bottom-1 sm:-bottom-2 left-0 right-0 h-1 sm:h-1.5 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 rounded-full" />
              </span>{' '}
              <span className="text-gray-900">on Autopilot</span>
            </h1>

            {/* Platform list — inline with icons */}
            <div className="mt-7 sm:mt-8 max-w-3xl mx-auto">
              <p className="text-[17px] sm:text-[20px] md:text-[24px] text-gray-500 leading-relaxed flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1.5">
                <span>Go viral on</span>
                {[
                  { id: 'tiktok', name: 'TikTok', color: 'text-black' },
                  { id: 'youtube', name: 'YouTube', color: 'text-red-600' },
                  { id: 'instagram', name: 'Instagram', color: 'text-pink-600' },
                  { id: 'facebook', name: 'Facebook', color: 'text-blue-600' },
                ].map((p, i, arr) => (
                  <span key={p.id} className="contents">
                    <span className="inline-flex items-center gap-1">
                      <PlatformIcon platform={p.id} className={`h-5 w-5 sm:h-6 sm:w-6 ${p.color}`} />
                      <span className={`font-semibold ${p.color}`}>{p.name}</span>
                    </span>
                    {i < arr.length - 1 && <span className="text-gray-300">,</span>}
                  </span>
                ))}
                <span className="text-gray-300">&amp;</span>
                <span className="inline-flex items-center gap-1">
                  <PlatformIcon platform="threads" className="h-5 w-5 sm:h-6 sm:w-6 text-black" />
                </span>
              </p>
              <p className="mt-2 text-[17px] sm:text-[20px] md:text-[24px] text-gray-400">while you sleep.</p>
            </div>

            <p className="mt-6 text-[16px] sm:text-[17px] text-gray-500 leading-[1.6] max-w-[580px] mx-auto">
              Create branded Reels and Carousels — or let <strong className="text-gray-700">Toby</strong>, your AI agent, handle everything. He ideates, creates, publishes, and <em>learns</em> what goes viral for your niche.
            </p>

            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link to={ctaLink} className="w-full sm:w-auto min-w-[180px] sm:min-w-[200px] inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white text-[15px] sm:text-[17px] font-semibold px-6 py-3 sm:px-8 sm:py-3.5 rounded-xl shadow-[0_0_20px_-5px_rgba(59,130,246,0.5)] hover:shadow-[0_0_30px_-5px_rgba(59,130,246,0.7)] transition-all hover:-translate-y-0.5">
                {ctaLabel} <ArrowRight className="w-4 h-4" />
              </Link>
              <button onClick={() => scrollTo('how-it-works')} className="w-full sm:w-auto min-w-[180px] sm:min-w-[200px] inline-flex items-center justify-center gap-2 text-gray-700 text-[15px] sm:text-[17px] font-semibold px-6 py-3 sm:px-8 sm:py-3.5 rounded-xl border-2 border-gray-200 bg-white/80 backdrop-blur-sm hover:border-blue-200 hover:bg-white hover:shadow-md transition-all hover:-translate-y-0.5">
                See How It Works <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Real face avatars + social proof */}
            <div className="mt-10 flex items-center justify-center gap-3">
              <div className="flex -space-x-2.5">
                {['/faces/face1.jpg', '/faces/face2.jpg', '/faces/face3.jpg', '/faces/face4.jpg', '/faces/face5.jpg'].map((src, i) => (
                  <div key={i} className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-[3px] border-white bg-gray-200 overflow-hidden shadow-md ring-1 ring-gray-100">
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[14px] sm:text-[15px] font-bold text-gray-900">2,917+</span>
                <span className="text-[12px] sm:text-[13px] text-gray-500">creators joined</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>


      {/* ══════════ HERO DASHBOARD — Rich Visual ══════════ */}
      <section className="pb-16 sm:pb-24 px-5 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, delay: 0.3 }} className="max-w-[1180px] mx-auto">
          <div className="rounded-2xl overflow-hidden border border-gray-200/80 bg-white" style={{ boxShadow: '0 25px 80px -15px rgba(0,0,0,0.08)' }}>
            {/* Browser chrome */}
            <div className="bg-gray-50 px-4 py-3 flex items-center gap-2 border-b border-gray-100">
              <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400" /><div className="w-3 h-3 rounded-full bg-amber-400" /><div className="w-3 h-3 rounded-full bg-green-400" /></div>
              <div className="flex-1 flex justify-center"><div className="bg-white rounded-lg px-6 py-1.5 text-[12px] text-gray-400 border border-gray-200 w-60 text-center">viraltoby.com/dashboard</div></div>
            </div>

            <div className="bg-gradient-to-b from-gray-50/80 to-white p-4 sm:p-6">
              {/* Agent status bar */}
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 mb-4">
                <div className="relative"><div className="w-2 h-2 rounded-full bg-emerald-500" /><div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping" /></div>
                <span className="text-[13px] text-emerald-700 font-medium">Toby is running</span>
                <div className="flex-1" />
                <div className="hidden sm:flex items-center gap-4 text-[12px]">
                  <span className="text-emerald-500/60">Analyzing</span>
                  <span className="font-semibold text-emerald-700">Creating</span>
                  <span className="text-emerald-500/60">Publishing</span>
                </div>
                <span className="text-[11px] text-emerald-500 bg-emerald-100 px-2 py-0.5 rounded-full font-medium">Phase: Learning</span>
              </div>

              <div className="grid lg:grid-cols-[1fr_320px] gap-4">
                {/* Left: Stats + Chart */}
                <div className="space-y-4">
                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Total Views', value: '2.4M', change: '+24%', color: 'text-blue-600', bg: 'bg-blue-50', icon: Eye, up: true },
                      { label: 'Engagement', value: '6.8%', change: '+1.2%', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: Heart, up: true },
                      { label: 'Published', value: '347', change: '+52', color: 'text-violet-600', bg: 'bg-violet-50', icon: Send, up: true },
                      { label: 'Followers', value: '45.2K', change: '+3.1K', color: 'text-amber-600', bg: 'bg-amber-50', icon: Users, up: true },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-xl p-3.5 border border-gray-100 relative overflow-hidden">
                        <div className={`absolute top-0 left-0 right-0 h-[3px] ${s.bg.replace('50', '400')}`} style={{ background: s.color === 'text-blue-600' ? '#3B82F6' : s.color === 'text-emerald-600' ? '#10B981' : s.color === 'text-violet-600' ? '#8B5CF6' : '#F59E0B' }} />
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className={`w-6 h-6 rounded-md ${s.bg} flex items-center justify-center`}><s.icon className={`w-3 h-3 ${s.color}`} /></div>
                          <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{s.label}</span>
                        </div>
                        <div className={`text-[22px] font-extrabold ${s.color} leading-none`}>{s.value}</div>
                        <div className="flex items-center gap-1 mt-1.5">
                          <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                          <span className="text-[11px] font-semibold text-emerald-500">{s.change}</span>
                          <span className="text-[10px] text-gray-300">vs last month</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Growth chart */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-gray-400" />
                        <span className="text-[13px] font-semibold text-gray-700">Growth Trend</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-[10px] text-gray-400">Views</span></div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[10px] text-gray-400">Engagement</span></div>
                      </div>
                    </div>
                    <MiniAreaChart data={GROWTH_DATA} color="#3B82F6" height={100} />
                    <div className="mt-1 flex justify-between text-[10px] text-gray-300">
                      <span>Mar 1</span><span>Mar 10</span><span>Mar 20</span><span>Mar 30</span>
                    </div>
                  </div>

                  {/* Topic performance */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[13px] font-semibold text-gray-700">Top Performing Topics</span>
                      <span className="text-[11px] text-gray-300">by Toby Score</span>
                    </div>
                    <div className="space-y-2">
                      {TOPICS.slice(0, 4).map(t => (
                        <div key={t.name} className="flex items-center gap-3">
                          <span className="text-[12px] text-gray-500 w-28 truncate">{t.name}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${t.score}%`, background: t.color }} />
                          </div>
                          <span className="text-[11px] font-bold text-gray-600 w-8 text-right">{t.score}</span>
                          <span className="text-[10px] text-gray-300 w-10 text-right">{t.views}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: Activity feed + Learning */}
                <div className="space-y-4">
                  {/* Live activity feed */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-gray-400" />
                        <span className="text-[13px] font-semibold text-gray-700">Toby Activity</span>
                      </div>
                      <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><span className="text-[10px] text-emerald-500 font-medium">Live</span></div>
                    </div>
                    <div className="space-y-2.5">
                      {ACTIVITY_FEED.map((a, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className={`w-7 h-7 rounded-lg ${a.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}><a.icon className={`w-3.5 h-3.5 ${a.color}`} /></div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium text-gray-700">{a.action}</div>
                            <div className="text-[11px] text-gray-400 truncate">{a.detail}</div>
                          </div>
                          <span className="text-[10px] text-gray-300 flex-shrink-0 mt-0.5">{a.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Learning progress */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-violet-500" />
                        <span className="text-[13px] font-semibold text-gray-700">Learning Engine</span>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      {[
                        { label: 'Hook Strategy', value: 'Curiosity', pct: 94, color: '#3B82F6' },
                        { label: 'Visual Style', value: 'Dark Cinematic', pct: 87, color: '#8B5CF6' },
                        { label: 'Posting Time', value: '7:30 AM', pct: 91, color: '#10B981' },
                        { label: 'Content Type', value: 'Reels', pct: 82, color: '#F59E0B' },
                      ].map(l => (
                        <div key={l.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-gray-400">{l.label}</span>
                            <span className="text-[11px] font-bold text-gray-600">{l.value}</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${l.pct}%`, background: l.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-2 bg-violet-50 rounded-lg px-3 py-2">
                      <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                      <span className="text-[11px] text-violet-600 font-medium">Curiosity hooks convert 3.2x better for this brand</span>
                    </div>
                  </div>

                  {/* Platform breakdown */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <span className="text-[12px] font-semibold text-gray-600 block mb-2.5">Platform Performance</span>
                    <div className="space-y-2">
                      {[
                        { id: 'instagram', views: '980K', rate: '7.2%', pct: 95 },
                        { id: 'tiktok', views: '620K', rate: '5.8%', pct: 72 },
                        { id: 'youtube', views: '340K', rate: '4.1%', pct: 48 },
                        { id: 'facebook', views: '280K', rate: '3.5%', pct: 38 },
                      ].map(p => (
                        <div key={p.id} className="flex items-center gap-2">
                          <PlatformIcon platform={p.id} className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${p.pct}%` }} />
                          </div>
                          <span className="text-[10px] text-gray-500 w-12 text-right">{p.views}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>


      {/* ══════════ PLATFORM STRIP ══════════ */}
      <section className="py-10 sm:py-14 px-5 sm:px-8 border-y border-gray-100">
        <Reveal>
          <div className="max-w-[1320px] mx-auto">
            <p className="text-center text-[13px] font-medium text-gray-400 mb-6">Publish to 6 platforms simultaneously</p>
            <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-10">
              {PLATFORMS.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-gray-300 hover:text-gray-600 transition-colors group">
                  <PlatformIcon platform={p.id} className="w-5 h-5" />
                  <span className="text-[14px] font-medium">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>


      {/* ══════════ NUMBERS STRIP ══════════ */}
      <section className="py-16 sm:py-20 px-5 sm:px-8">
        <div className="max-w-[1080px] mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <AnimatedStat value={2917} suffix="+" label="Creators using ViralToby" color="text-blue-600" icon={Users} />
            <AnimatedStat value={847} suffix="K" label="Reels created this month" color="text-emerald-600" icon={Film} />
            <AnimatedStat value={6} label="Platforms supported" color="text-violet-600" icon={Globe} />
            <AnimatedStat value={94} suffix="%" label="Avg. quality score" color="text-amber-600" icon={Star} />
          </div>
        </div>
      </section>


      {/* ══════════ WHAT YOU CREATE ══════════ */}
      <section id="features" className="py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-gray-50/50 to-white">
        <div className="max-w-[1280px] mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-[12px] font-semibold text-blue-600 uppercase tracking-wider mb-3">Content Creation</p>
              <h2 className="text-[30px] sm:text-[44px] font-extrabold text-gray-900 tracking-[-0.03em] leading-tight">
                Create Reels & Carousels<br />That Actually Convert
              </h2>
              <p className="mt-4 text-[16px] text-gray-500 max-w-[560px] mx-auto leading-relaxed">Define your brand, pick your format, and ViralToby renders scroll-stopping content with your colors, fonts, and style — or let Toby create everything automatically.</p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-5">
            {/* Reels */}
            <Reveal delay={0.1}>
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all h-full group">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center"><Film className="w-5 h-5 text-white" /></div>
                  <span className="text-[11px] font-semibold text-pink-600 bg-pink-50 px-2.5 py-1 rounded-full uppercase tracking-wider">Reels & Shorts</span>
                </div>
                <h3 className="text-[20px] font-bold text-gray-900 mb-2">Short-Form Video Reels</h3>
                <p className="text-[14px] text-gray-500 leading-[1.6] mb-5">Branded video content with text overlays, your colors, trending music, and platform-optimized formats. Perfect for Instagram Reels, TikTok, YouTube Shorts, and Facebook.</p>
                {/* Visual preview */}
                <div className="mb-5 bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="grid grid-cols-3 gap-2">
                    {['Format A', 'Format B', 'Cinematic'].map((f, i) => (
                      <div key={f} className="aspect-[9/16] bg-gradient-to-b from-gray-800 to-gray-900 rounded-lg overflow-hidden relative flex items-end p-2">
                        <div className={`absolute inset-0 opacity-20 ${i === 0 ? 'bg-gradient-to-b from-blue-500 to-transparent' : i === 1 ? 'bg-gradient-to-b from-pink-500 to-transparent' : 'bg-gradient-to-b from-amber-500 to-transparent'}`} />
                        <div className="relative">
                          <div className="w-4 h-4 rounded-full bg-white/20 mb-1" />
                          <div className="h-1 w-12 bg-white/30 rounded mb-0.5" />
                          <div className="h-1 w-8 bg-white/20 rounded" />
                        </div>
                        <span className="absolute top-2 right-2 text-[8px] text-white/50 font-medium">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <ul className="space-y-2">
                  {['Multiple reel formats to choose from', 'Your brand colors & logo on every slide', 'Trending music integration', 'Auto-caption with viral-style text'].map(b => (
                    <li key={b} className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-pink-400 flex-shrink-0" /><span className="text-[13px] text-gray-600">{b}</span></li>
                  ))}
                </ul>
              </div>
            </Reveal>

            {/* Carousels */}
            <Reveal delay={0.15}>
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all h-full group">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center"><Image className="w-5 h-5 text-white" /></div>
                  <span className="text-[11px] font-semibold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full uppercase tracking-wider">Carousels</span>
                </div>
                <h3 className="text-[20px] font-bold text-gray-900 mb-2">Multi-Slide Carousels</h3>
                <p className="text-[14px] text-gray-500 leading-[1.6] mb-5">Swipe-worthy carousel posts with auto-fit typography, branded visuals, and engaging copy. Optimized for Instagram and Facebook engagement.</p>
                {/* Visual preview */}
                <div className="mb-5 bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="flex gap-2 overflow-hidden">
                    {[
                      { label: 'Cover', bg: 'from-violet-600 to-blue-600' },
                      { label: 'Slide 2', bg: 'from-blue-600 to-cyan-500' },
                      { label: 'Slide 3', bg: 'from-cyan-500 to-emerald-500' },
                      { label: 'CTA', bg: 'from-emerald-500 to-teal-500' },
                    ].map((s, i) => (
                      <div key={s.label} className={`flex-shrink-0 w-[calc(33%-4px)] aspect-square bg-gradient-to-br ${s.bg} rounded-lg relative flex items-center justify-center p-2`} style={{ opacity: 1 - i * 0.15 }}>
                        <div className="text-center">
                          <div className="h-1 w-8 bg-white/40 rounded mx-auto mb-1" />
                          <div className="h-1 w-12 bg-white/30 rounded mx-auto mb-1" />
                          <div className="h-1 w-6 bg-white/20 rounded mx-auto" />
                        </div>
                        <span className="absolute bottom-1.5 right-2 text-[7px] text-white/40 font-medium">{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <ul className="space-y-2">
                  {['Auto-fit text to any slide layout', 'Brand colors applied automatically', 'Multiple carousel templates', '5-dimension quality scoring'].map(b => (
                    <li key={b} className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-violet-400 flex-shrink-0" /><span className="text-[13px] text-gray-600">{b}</span></li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ MEET TOBY ══════════ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-[1280px] mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-[12px] font-semibold text-blue-600 uppercase tracking-wider mb-3">Meet Toby</p>
              <h2 className="text-[30px] sm:text-[44px] font-extrabold text-gray-900 tracking-[-0.03em] leading-tight">
                Your AI Agent That Never Stops<br />Getting Smarter
              </h2>
              <p className="mt-4 text-[16px] text-gray-500 max-w-[600px] mx-auto leading-relaxed">Toby isn't a template library. He's an autonomous AI agent that researches your niche, creates content, publishes it, and <strong className="text-gray-700">learns what goes viral for your specific audience</strong>.</p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Eye, title: 'Researches Your Niche', desc: 'Toby scouts trending topics, competitor content, and emerging patterns in YOUR niche. He brings the ideas — you don\'t have to think.', stat: '340+ trends/week' },
              { icon: Sparkles, title: 'Creates On-Brand Content', desc: 'Using your Content DNA — tone, style, topics, visuals — Toby generates reels and carousels that sound like you, not a robot.', stat: '6 reels/day avg' },
              { icon: Shield, title: 'Quality-Scores Everything', desc: 'Every piece is scored across 5 dimensions before publishing. Only content scoring 80+ goes live. Below that, Toby regenerates.', stat: '94 avg score' },
              { icon: Send, title: 'Publishes Across 6 Platforms', desc: 'Instagram, Facebook, YouTube, TikTok, Threads, Bluesky — Toby handles format optimization and posting for each one.', stat: '6 platforms' },
              { icon: Brain, title: 'Learns What Works', desc: 'Toby uses multi-armed bandit optimization to test hooks, styles, and topics. He discovers what YOUR audience responds to.', stat: 'Thompson Sampling' },
              { icon: TrendingUp, title: 'Gets Smarter Every Day', desc: 'Every piece published teaches Toby more. His strategy evolves exponentially — what works today feeds into better content tomorrow.', stat: 'Exponential growth' },
            ].map((a, i) => (
              <Reveal key={i} delay={i * 0.06}>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all h-full group">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 group-hover:bg-blue-50 flex items-center justify-center transition-colors">
                      <a.icon className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                    </div>
                    <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">{a.stat}</span>
                  </div>
                  <h4 className="text-[15px] font-bold text-gray-900 mb-2">{a.title}</h4>
                  <p className="text-[13px] text-gray-500 leading-[1.6]">{a.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* ══════════ CONTENT DNA — Visual ══════════ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-[1280px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <Reveal>
              <div>
                <p className="text-[12px] font-semibold text-blue-600 uppercase tracking-wider mb-4">Content DNA</p>
                <h3 className="text-[28px] sm:text-[40px] font-extrabold text-gray-900 tracking-[-0.03em] leading-[1.1]">
                  Toby Knows Your Brand<br />Inside Out
                </h3>
                <p className="mt-4 text-[15px] text-gray-500 leading-[1.7]">Define your brand's identity once — niche, tone, topics, visual style, audience — and Toby uses it as the blueprint for every piece of content. No generic templates. Everything sounds like <em>you</em>.</p>
                <ul className="mt-6 space-y-3">
                  {[
                    'Niche, tone of voice, and content philosophy',
                    'Topic categories and keywords to focus on',
                    'Visual style: colors, image mood, typography',
                    'Audience description and engagement language',
                    'CTA options, hashtags, and hook preferences',
                    'Citation style: academic, data-driven, or anecdotal',
                  ].map(b => (
                    <li key={b} className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" /><span className="text-[14px] text-gray-600">{b}</span></li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500" />
                <div className="p-5 sm:p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-[11px] font-bold text-white">HC</div>
                    <div>
                      <div className="text-[13px] font-bold text-gray-800">THE HEALTHY COLLEGE</div>
                      <div className="text-[11px] text-gray-400">Content DNA Profile</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { key: 'Niche', val: 'Health & Wellness for College Students', icon: Target },
                      { key: 'Tone', val: 'Friendly, evidence-based, relatable', icon: MessageSquare },
                      { key: 'Topics', val: 'Superfoods, Sleep, Gut Health, Morning Routines', icon: Layers },
                      { key: 'Hook Style', val: 'Curiosity-driven, myth-busting', icon: Zap },
                      { key: 'Visual', val: 'Dark cinematic, bold typography', icon: Eye },
                      { key: 'Audience', val: 'College students 18-25, health-conscious', icon: Users },
                    ].map(d => (
                      <div key={d.key} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="w-7 h-7 rounded-md bg-white border border-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5"><d.icon className="w-3.5 h-3.5 text-gray-400" /></div>
                        <div>
                          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{d.key}</div>
                          <div className="text-[13px] text-gray-700 mt-0.5">{d.val}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ OLD WAY vs TOBY WAY ══════════ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-[1200px] mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="text-[30px] sm:text-[44px] font-extrabold text-gray-900 tracking-[-0.03em] leading-tight">
                Stop the Grind. Deploy Toby.
              </h2>
              <p className="mt-4 text-[16px] text-gray-500 max-w-[520px] mx-auto leading-relaxed">Manual content creation is a full-time job. Toby does it all — and gets better at it every single day.</p>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-5">
            <Reveal delay={0.1}>
              <div className="p-6 sm:p-8 rounded-2xl bg-red-50/50 border border-red-100/80 h-full">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center"><Clock className="w-5 h-5 text-red-400" /></div>
                  <h3 className="text-[17px] font-bold text-gray-400">The Old Way</h3>
                </div>
                <ul className="space-y-4">
                  {OLD_WAY.map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5"><X className="w-3 h-3 text-red-400" /></div>
                      <span className="text-[14px] text-gray-500 leading-[1.5]">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 pt-4 border-t border-red-100">
                  <div className="flex items-center gap-2">
                    <span className="text-[28px] font-extrabold text-red-300">4+ hrs</span>
                    <span className="text-[13px] text-gray-400">spent daily on content</span>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="p-6 sm:p-8 rounded-2xl bg-emerald-50/50 border border-emerald-100/80 h-full">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Zap className="w-5 h-5 text-emerald-500" /></div>
                  <h3 className="text-[17px] font-bold text-gray-900">With Toby</h3>
                </div>
                <ul className="space-y-4">
                  {TOBY_WAY.map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5"><Check className="w-3 h-3 text-emerald-600" /></div>
                      <span className="text-[14px] text-gray-700 leading-[1.5]">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 pt-4 border-t border-emerald-100">
                  <div className="flex items-center gap-2">
                    <span className="text-[28px] font-extrabold text-emerald-500">0 hrs</span>
                    <span className="text-[13px] text-gray-600">Toby handles everything</span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ HOW IT WORKS ══════════ */}
      <section id="how-it-works" className="py-20 sm:py-28 px-5 sm:px-8 bg-gray-50">
        <div className="max-w-[1200px] mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-[12px] font-semibold text-blue-600 uppercase tracking-wider mb-3">How It Works</p>
              <h2 className="text-[30px] sm:text-[44px] font-extrabold text-gray-900 tracking-[-0.03em] leading-tight">Up and Running in Minutes</h2>
              <p className="mt-4 text-[16px] text-gray-500 max-w-[480px] mx-auto leading-relaxed">Define your brand once. Toby handles everything else — forever.</p>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { step: '1', icon: Target, title: 'Define Your Brand', desc: 'Set your niche, tone, audience, topics, colors, and visual style. This becomes your Content DNA — the blueprint Toby follows for every piece.', note: '5 min setup', color: 'from-blue-500 to-blue-600' },
              { step: '2', icon: Sparkles, title: 'Toby Creates & Scores', desc: 'Toby generates reels and carousels, quality-scores each one across 5 dimensions, and only schedules content that meets your standard.', note: 'Automatic', color: 'from-violet-500 to-violet-600' },
              { step: '3', icon: Repeat, title: 'Publish, Learn, Repeat', desc: 'Content publishes across 6 platforms. Toby analyzes what works and gets smarter. Every day, his strategy improves for YOUR audience.', note: '24/7 forever', color: 'from-emerald-500 to-emerald-600' },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow h-full relative overflow-hidden">
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${item.color}`} />
                  <div className="flex items-center justify-between mb-6 mt-2">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center text-white font-bold text-[15px]`}>{item.step}</div>
                    <span className="text-[12px] text-gray-300 font-medium">{item.note}</span>
                  </div>
                  <h3 className="text-[17px] font-bold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-[14px] text-gray-500 leading-[1.6]">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Connector line */}
          <div className="hidden sm:flex items-center justify-center mt-8 gap-4">
            <div className="flex items-center gap-2 text-[13px] text-gray-400">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><span className="text-[11px] font-bold text-blue-600">1</span></div>
              <ArrowRight className="w-4 h-4 text-gray-300" />
              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center"><span className="text-[11px] font-bold text-violet-600">2</span></div>
              <ArrowRight className="w-4 h-4 text-gray-300" />
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center"><span className="text-[11px] font-bold text-emerald-600">3</span></div>
              <ArrowRight className="w-4 h-4 text-gray-300" />
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100">
                <Repeat className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[11px] font-semibold text-emerald-600">Forever loop</span>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* ══════════ TOBY LEARNS — KEY DIFFERENTIATOR ══════════ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-[1280px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <Reveal>
              <div>
                <p className="text-[12px] font-semibold text-blue-600 uppercase tracking-wider mb-4">Adaptive Intelligence</p>
                <h3 className="text-[28px] sm:text-[40px] font-extrabold text-gray-900 tracking-[-0.03em] leading-[1.1]">
                  Toby Gets Smarter<br />Every Single Day
                </h3>
                <p className="mt-4 text-[15px] text-gray-500 leading-[1.7]">Most tools give you the same generic templates forever. Toby is different — he runs experiments on your content, discovers what YOUR audience loves, and evolves his strategy every day.</p>
                <ul className="mt-6 space-y-3">
                  {[
                    'Tests different hooks, personalities & visual styles per brand',
                    'Multi-armed bandit optimization — not random guessing',
                    'Each brand has its own independent learning engine',
                    'Cross-brand cold-start intelligence for new brands',
                    'Strategy improves exponentially with every publish',
                  ].map(b => (
                    <li key={b} className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" /><span className="text-[14px] text-gray-600">{b}</span></li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="space-y-4">
                {/* Learning engine */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[13px] font-semibold text-gray-700">Toby's Learning Engine</span>
                    <span className="text-[11px] text-emerald-500 font-medium flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Always learning</span>
                  </div>
                  <div className="space-y-3 mb-5">
                    {[
                      { label: 'Curiosity hooks', score: 94, best: true },
                      { label: 'Bold claim hooks', score: 78, best: false },
                      { label: 'Question hooks', score: 71, best: false },
                      { label: 'Myth-buster hooks', score: 85, best: false },
                    ].map(s => (
                      <div key={s.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] text-gray-500">{s.label}</span>
                          <span className={`text-[12px] font-bold ${s.best ? 'text-blue-600' : 'text-gray-400'}`}>{s.score}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${s.best ? 'bg-gradient-to-r from-blue-500 to-blue-400' : 'bg-gray-300'}`} style={{ width: `${s.score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-center text-[11px] text-gray-400 bg-gray-50 rounded-lg py-2">
                    <Brain className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                    Toby prioritizes curiosity hooks — they convert 3.2x better for this brand
                  </div>
                </div>

                {/* Phase progression */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <span className="text-[12px] font-semibold text-gray-600 mb-3 block">Learning Phases</span>
                  <div className="flex items-center gap-2">
                    {[
                      { label: 'Bootstrap', desc: 'First 50 posts', color: 'bg-violet-500', active: false, done: true },
                      { label: 'Learning', desc: 'Testing strategies', color: 'bg-blue-500', active: true, done: false },
                      { label: 'Optimizing', desc: 'Peak performance', color: 'bg-emerald-500', active: false, done: false },
                    ].map((p, i) => (
                      <div key={p.label} className="flex-1 flex items-center gap-2">
                        <div className={`flex-1 rounded-xl p-3 ${p.done ? 'bg-violet-50 border border-violet-100' : p.active ? 'bg-blue-50 border-2 border-blue-200 ring-2 ring-blue-100' : 'bg-gray-50 border border-gray-100'}`}>
                          <div className={`w-6 h-6 rounded-full ${p.done ? 'bg-violet-500' : p.active ? p.color : 'bg-gray-200'} flex items-center justify-center mb-1.5`}>
                            {p.done ? <Check className="w-3 h-3 text-white" /> : p.active ? <Activity className="w-3 h-3 text-white" /> : <Lock className="w-3 h-3 text-gray-400" />}
                          </div>
                          <div className={`text-[11px] font-bold ${p.done ? 'text-violet-700' : p.active ? 'text-blue-700' : 'text-gray-400'}`}>{p.label}</div>
                          <div className="text-[10px] text-gray-400">{p.desc}</div>
                        </div>
                        {i < 2 && <ArrowRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ SCHEDULING + CALENDAR ══════════ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-gray-50">
        <div className="max-w-[1280px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <Reveal>
              <div className="space-y-4">
                {/* Calendar */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[13px] font-semibold text-gray-700">Content Calendar</span>
                    <Calendar className="w-4 h-4 text-gray-300" />
                  </div>
                  <div className="grid grid-cols-7 gap-1.5 mb-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                      <div key={d} className="text-[10px] font-semibold text-gray-400 text-center py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {Array.from({ length: 28 }, (_, i) => {
                      const has = [2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25].includes(i)
                      const multi = [4, 14, 21].includes(i)
                      const colors = ['bg-pink-400', 'bg-red-500', 'bg-blue-500', 'bg-gray-800', 'bg-violet-500', 'bg-sky-400']
                      const today = i === 8
                      return (
                        <div key={i} className={`aspect-square rounded-lg ${today ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'} border flex flex-col items-center justify-center gap-0.5 p-0.5 hover:bg-blue-50 hover:border-blue-100 transition-colors cursor-pointer`}>
                          <span className={`text-[10px] ${today ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>{i + 1}</span>
                          {has && (
                            <div className="flex gap-[2px]">
                              <div className={`w-[5px] h-[5px] rounded-full ${colors[i % colors.length]}`} />
                              {multi && <div className={`w-[5px] h-[5px] rounded-full ${colors[(i + 1) % colors.length]}`} />}
                              {i === 21 && <div className={`w-[5px] h-[5px] rounded-full ${colors[(i + 2) % colors.length]}`} />}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Upcoming queue */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] font-semibold text-gray-600">Upcoming Queue</span>
                    <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><span className="text-[10px] text-emerald-500 font-medium">Active</span></div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { time: '7:30 AM', title: '5 morning habits...', platform: 'instagram', type: 'Reel', score: 94 },
                      { time: '12:00 PM', title: 'Gut-brain connection', platform: 'facebook', type: 'Carousel', score: 88 },
                      { time: '3:00 PM', title: 'Sleep optimization...', platform: 'tiktok', type: 'Reel', score: 91 },
                      { time: '6:00 PM', title: 'Cortisol morning...', platform: 'youtube', type: 'Short', score: 87 },
                    ].map((q, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                        <span className="text-[11px] text-gray-400 font-mono w-14">{q.time}</span>
                        <PlatformIcon platform={q.platform} className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[12px] text-gray-700 font-medium truncate block">{q.title}</span>
                        </div>
                        <span className="text-[10px] text-gray-400">{q.type}</span>
                        <span className={`text-[10px] font-bold ${q.score >= 90 ? 'text-emerald-500' : 'text-blue-500'}`}>{q.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div>
                <p className="text-[12px] font-semibold text-blue-600 uppercase tracking-wider mb-4">Smart Scheduling</p>
                <h3 className="text-[28px] sm:text-[38px] font-extrabold text-gray-900 tracking-[-0.03em] leading-[1.1]">Toby Publishes Everywhere. Automatically.</h3>
                <p className="mt-4 text-[15px] text-gray-500 leading-[1.7]">Set up once, Toby runs forever. He formats content per platform, picks optimal posting times, and publishes on schedule — you just watch it happen.</p>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  {[
                    { icon: Calendar, label: 'Smart Scheduling', desc: 'Optimal posting times per platform' },
                    { icon: Eye, label: 'Preview First', desc: 'Review before it goes live' },
                    { icon: Repeat, label: 'Auto-Recurring', desc: 'Daily schedule, never miss a slot' },
                    { icon: Shield, label: 'Full Control', desc: 'Override any decision anytime' },
                  ].map(f => (
                    <div key={f.label} className="p-3 rounded-xl bg-blue-50/50 border border-blue-100/50">
                      <f.icon className="w-4 h-4 text-blue-500 mb-1.5" />
                      <div className="text-[12px] font-bold text-gray-800">{f.label}</div>
                      <div className="text-[11px] text-gray-500">{f.desc}</div>
                    </div>
                  ))}
                </div>

                {/* Live notification */}
                <div className="mt-6">
                  <FloatingNotification />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ ANALYTICS — Rich ══════════ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-[1280px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <Reveal delay={0.1}>
              <div>
                <p className="text-[12px] font-semibold text-blue-600 uppercase tracking-wider mb-4">Real-Time Insights</p>
                <h3 className="text-[28px] sm:text-[38px] font-extrabold text-gray-900 tracking-[-0.03em] leading-[1.1]">Watch Toby Learn<br />What Works</h3>
                <p className="mt-4 text-[15px] text-gray-500 leading-[1.7]">Real-time analytics across every platform. Toby doesn't just show you the numbers — he uses them to make better content tomorrow.</p>
                <ul className="mt-6 space-y-3">
                  {['Cross-platform performance tracking', 'See which hooks and styles perform best', 'Toby adapts strategy based on real data', 'Per-brand independent analytics'].map(b => (
                    <li key={b} className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" /><span className="text-[14px] text-gray-600">{b}</span></li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal>
              <div className="space-y-4">
                {/* Engagement chart */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[13px] font-semibold text-gray-700">Engagement Growth</span>
                    <div className="flex items-center gap-1">
                      <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[12px] font-bold text-emerald-500">+542%</span>
                      <span className="text-[11px] text-gray-300">30d</span>
                    </div>
                  </div>
                  <MiniAreaChart data={ENGAGEMENT_DATA} color="#10B981" height={90} />
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[
                      { l: 'Avg. Reach', v: '127K', c: 'text-blue-600' },
                      { l: 'Engagement', v: '6.8%', c: 'text-emerald-600' },
                      { l: 'New Followers', v: '+12.4K', c: 'text-violet-600' },
                      { l: 'ROI on Time', v: '∞', c: 'text-amber-600' },
                    ].map(s => (
                      <div key={s.l} className="text-center bg-gray-50 rounded-xl py-2.5 px-2 border border-gray-100">
                        <div className={`text-[16px] font-bold ${s.c}`}>{s.v}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{s.l}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top posts */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <span className="text-[12px] font-semibold text-gray-600 mb-3 block">Top Performing Content</span>
                  <div className="space-y-2">
                    {[
                      { title: '5 morning habits that changed my life', views: '52K', score: 96, platform: 'instagram' },
                      { title: 'The cortisol myth debunked', views: '41K', score: 93, platform: 'tiktok' },
                      { title: 'Why you should never skip breakfast', views: '38K', score: 91, platform: 'youtube' },
                    ].map((p, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                        <span className="text-[11px] font-bold text-gray-300 w-4">{i + 1}</span>
                        <PlatformIcon platform={p.platform} className="w-4 h-4 text-gray-400" />
                        <span className="flex-1 text-[12px] text-gray-700 font-medium truncate">{p.title}</span>
                        <span className="text-[11px] text-gray-400">{p.views} views</span>
                        <div className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${p.score >= 95 ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                          <span className="text-[11px] font-bold text-gray-600">{p.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ TESTIMONIALS ══════════ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-[1280px] mx-auto">
          <Reveal>
            <div className="text-center mb-12">
              <p className="text-[12px] font-semibold text-blue-600 uppercase tracking-wider mb-3">Loved by Creators</p>
              <h2 className="text-[28px] sm:text-[38px] font-extrabold text-gray-900 tracking-[-0.03em]">See What Creators Are Saying</h2>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(5)].map((_, j) => <Star key={j} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />)}
                  </div>
                  <p className="text-[14px] text-gray-600 leading-[1.65] flex-1">"{t.text}"</p>
                  <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-[12px] font-bold text-white`}>{t.avatar}</div>
                      <div>
                        <div className="text-[13px] font-semibold text-gray-800">{t.name}</div>
                        <div className="text-[11px] text-gray-400">{t.role}</div>
                      </div>
                    </div>
                    <div className="text-[10px] font-semibold text-emerald-500 bg-emerald-50 px-2 py-1 rounded-full">{t.metric}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* ══════════ PRICING ══════════ */}
      <section id="pricing" className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-[960px] mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-[12px] font-semibold text-blue-600 uppercase tracking-wider mb-3">Pricing</p>
              <h2 className="text-[30px] sm:text-[44px] font-extrabold text-gray-900 tracking-[-0.03em]">Agency-Level Output.<br />Fraction of the Cost.</h2>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-4 px-5 sm:px-6 text-[12px] font-semibold text-gray-400 uppercase tracking-wider" />
                    <th className="text-center py-4 px-4 sm:px-6 text-[12px] font-semibold text-gray-400 uppercase tracking-wider">Agency / VA</th>
                    <th className="text-center py-4 px-4 sm:px-6 text-[12px] font-bold text-blue-600 uppercase tracking-wider bg-blue-50/50">Toby</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="py-3.5 px-5 sm:px-6 text-[14px] font-medium text-gray-700">{row.label}</td>
                      <td className="py-3.5 px-4 sm:px-6 text-[14px] text-gray-400 text-center">{row.old}</td>
                      <td className="py-3.5 px-4 sm:px-6 text-[14px] font-bold text-gray-900 text-center bg-blue-50/30">
                        <div className="flex items-center justify-center gap-1.5">
                          {row.toby}
                          {row.toby !== '$50 / brand' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-10 text-center">
              <Link to={ctaLink} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-[15px] font-semibold px-8 py-3.5 rounded-xl shadow-lg shadow-blue-600/25 transition-all hover:-translate-y-0.5">
                {ctaLabel} <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="mt-3 text-[13px] text-gray-400">$50/month per brand · Cancel anytime · No credit card to start</p>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════ SOCIAL PROOF ══════════ */}
      <section className="py-14 px-5 sm:px-8 border-y border-gray-100">
        <Reveal>
          <div className="max-w-[960px] mx-auto flex flex-col sm:flex-row items-center justify-center gap-6">
            <p className="text-[14px] text-gray-500">Creators Trust Toby</p>
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                {['from-blue-400 to-blue-600', 'from-pink-400 to-pink-600', 'from-emerald-400 to-emerald-600', 'from-amber-400 to-amber-600', 'from-violet-400 to-violet-600'].map((g, i) => (
                  <div key={i} className={`w-8 h-8 rounded-full bg-gradient-to-br ${g} border-2 border-white flex items-center justify-center text-[10px] font-bold text-white`}>{String.fromCharCode(65 + i)}</div>
                ))}
              </div>
              <div><span className="text-[14px] font-bold text-gray-900">2,917+</span> <span className="text-[13px] text-gray-400">creators</span></div>
            </div>
            <div className="flex items-center gap-1.5">
              {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />)}
              <span className="text-[14px] font-bold text-gray-900 ml-0.5">4.8</span>
              <span className="text-[12px] text-gray-400">(173 reviews)</span>
            </div>
          </div>
        </Reveal>
      </section>


      {/* ══════════ FAQ ══════════ */}
      <section id="faq" className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-[720px] mx-auto">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="text-[28px] sm:text-[38px] font-extrabold text-gray-900 tracking-[-0.03em]">Frequently Asked Questions</h2>
              <p className="mt-3 text-[15px] text-gray-400">Everything you need to know about ViralToby and Toby.</p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 sm:px-8">
              {FAQS.map((faq, i) => <FaqItem key={i} q={faq.q} a={faq.a} open={i === 0} />)}
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════ FINAL CTA ══════════ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-blue-50 to-white relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-blue-100/30 to-transparent rounded-full blur-3xl" />
        <div className="max-w-[700px] mx-auto text-center relative">
          <Reveal>
            <h2 className="text-[30px] sm:text-[48px] font-extrabold text-gray-900 tracking-[-0.03em] leading-[1.1]">
              Ready to let Toby<br />run your content?
            </h2>
            <p className="mt-5 text-[16px] sm:text-[18px] text-gray-500 leading-relaxed max-w-[480px] mx-auto">Join 2,917+ creators whose AI agent creates and publishes content — getting smarter every single day.</p>
            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to={ctaLink} className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[16px] font-semibold px-10 py-4 rounded-xl shadow-lg shadow-blue-600/25 transition-all hover:-translate-y-0.5">
                {ctaLabel} <ArrowRight className="w-5 h-5" />
              </Link>
              <button onClick={() => scrollTo('pricing')} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-gray-600 hover:text-gray-900 text-[15px] font-medium px-7 py-3.5 rounded-xl border border-gray-200 hover:border-gray-300 transition-all">
                View Pricing
              </button>
            </div>
            <p className="mt-4 text-[13px] text-gray-400">No credit card required · Set up in 5 minutes</p>
          </Reveal>
        </div>
      </section>


      {/* ══════════ FOOTER ══════════ */}
      <footer className="bg-gray-900 text-gray-400 pt-16 pb-8 px-5 sm:px-8">
        <div className="max-w-[1280px] mx-auto">
          <div className="flex flex-col sm:flex-row items-start gap-8 sm:gap-16 pb-10 border-b border-gray-800">
            <div className="sm:max-w-[280px]">
              <div className="flex items-center gap-2 mb-4">
                <img src={vaLogo} alt="ViralToby" className="w-8 h-8 rounded-lg" />
                <span className="text-[16px] font-bold text-white">ViralToby</span>
              </div>
              <p className="text-[13px] text-gray-500 leading-relaxed">Create branded Reels & Carousels, or let Toby handle everything. AI-powered content creation that gets smarter every day.</p>
              <div className="mt-5 flex items-center gap-3">
                <a href="https://www.instagram.com/viraltoby" target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors">
                  <PlatformIcon platform="instagram" className="w-4 h-4 text-gray-400" />
                </a>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-8">
              <div>
                <h4 className="text-[12px] font-semibold text-gray-300 uppercase tracking-wider mb-4">Features</h4>
                <ul className="space-y-2.5">
                  {['Reel Creation', 'Carousel Creation', 'Toby AI Agent', 'Smart Scheduling', 'Analytics', 'Content DNA'].map(item => (
                    <li key={item}><button onClick={() => scrollTo('features')} className="text-[13px] text-gray-500 hover:text-white transition-colors">{item}</button></li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-[12px] font-semibold text-gray-300 uppercase tracking-wider mb-4">Platforms</h4>
                <ul className="space-y-2.5">
                  {PLATFORMS.map(p => <li key={p.id} className="text-[13px] text-gray-500">{p.name}</li>)}
                </ul>
              </div>
              <div>
                <h4 className="text-[12px] font-semibold text-gray-300 uppercase tracking-wider mb-4">Legal</h4>
                <ul className="space-y-2.5">
                  <li><Link to="/terms" className="text-[13px] text-gray-500 hover:text-white transition-colors">Terms of Service</Link></li>
                  <li><Link to="/privacy" className="text-[13px] text-gray-500 hover:text-white transition-colors">Privacy Policy</Link></li>
                  <li><Link to="/data-deletion" className="text-[13px] text-gray-500 hover:text-white transition-colors">Data Deletion</Link></li>
                  <li><a href="mailto:viraltobyapp@gmail.com" className="text-[13px] text-gray-500 hover:text-white transition-colors">Contact Support</a></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[12px] text-gray-600">&copy; {new Date().getFullYear()} ViralToby. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <Link to="/terms" className="text-[12px] text-gray-600 hover:text-gray-400 transition-colors">Terms</Link>
              <Link to="/privacy" className="text-[12px] text-gray-600 hover:text-gray-400 transition-colors">Privacy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
