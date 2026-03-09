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
  CheckCircle2, Play, Target, Film,
  Calendar, Eye, TrendingUp, Star, Image,
  Check, Repeat,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { PlatformIcon } from '@/shared/components/PlatformIcon'
import vaLogo from '@/assets/icons/va-logo.svg'

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"

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

function RotatingPlatform() {
  const items = [
    { name: 'TikTok', color: '#000000' },
    { name: 'YouTube', color: '#FF0000' },
    { name: 'Instagram', color: '#E1306C' },
    { name: 'Facebook', color: '#1877F2' },
    { name: 'Threads', color: '#000000' },
    { name: 'Bluesky', color: '#0085ff' },
  ]
  const [idx, setIdx] = useState(0)
  useEffect(() => { const i = setInterval(() => setIdx(p => (p + 1) % items.length), 2200); return () => clearInterval(i) }, [])
  return (
    <span className="inline-flex justify-center">
      <AnimatePresence mode="wait">
        <motion.span key={idx} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} style={{ color: items[idx].color }} className="font-extrabold">
          {items[idx].name}
        </motion.span>
      </AnimatePresence>
    </span>
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

        <div className="relative max-w-[1200px] mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-100 mb-7">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[12px] font-semibold text-blue-600 tracking-wide">Growth on Autopilot</span>
            </div>

            <h1 className="text-[40px] sm:text-[56px] lg:text-[72px] font-extrabold text-gray-900 leading-[1.08] tracking-[-0.04em]">
              <span>Go viral on </span><RotatingPlatform /><br />
              <span className="text-gray-300">while you sleep.</span>
            </h1>

            <p className="mt-6 text-[17px] sm:text-[19px] text-gray-500 leading-[1.6] max-w-[560px] mx-auto">
              Create branded Reels and Carousels — or let Toby, your AI agent, handle everything. He ideates, creates, publishes, and learns what goes viral for <em>your</em> niche.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to={ctaLink} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-[15px] font-semibold px-7 py-3.5 rounded-xl shadow-lg shadow-blue-600/25 hover:shadow-xl transition-all">
                {ctaLabel} <ArrowRight className="w-4 h-4" />
              </Link>
              <button onClick={() => scrollTo('how-it-works')} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-gray-600 hover:text-gray-900 text-[15px] font-medium px-7 py-3.5 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all">
                <Play className="w-4 h-4" /> See How It Works
              </button>
            </div>

            <div className="mt-8 flex items-center justify-center gap-3">
              <div className="flex -space-x-2.5">
                {['from-blue-400 to-blue-600', 'from-pink-400 to-pink-600', 'from-emerald-400 to-emerald-600', 'from-amber-400 to-amber-600'].map((g, i) => (
                  <div key={i} className={`w-8 h-8 rounded-full bg-gradient-to-br ${g} border-[2.5px] border-white flex items-center justify-center text-[10px] font-bold text-white`}>{String.fromCharCode(65 + i)}</div>
                ))}
              </div>
              <span className="text-[13px] text-gray-400"><span className="font-semibold text-gray-600">2,917+</span> creators joined</span>
            </div>
          </motion.div>
        </div>
      </section>


      {/* ══════════ HERO VISUAL ══════════ */}
      <section className="pb-16 sm:pb-24 px-5 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, delay: 0.3 }} className="max-w-[1080px] mx-auto">
          <div className="rounded-2xl overflow-hidden border border-gray-200/80 bg-white" style={{ boxShadow: '0 25px 80px -15px rgba(0,0,0,0.08)' }}>
            <div className="bg-gray-50 px-4 py-3 flex items-center gap-2 border-b border-gray-100">
              <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400" /><div className="w-3 h-3 rounded-full bg-amber-400" /><div className="w-3 h-3 rounded-full bg-green-400" /></div>
              <div className="flex-1 flex justify-center"><div className="bg-white rounded-lg px-6 py-1.5 text-[12px] text-gray-400 border border-gray-200 w-60 text-center">viraltoby.com</div></div>
            </div>
            <div className="bg-gray-50/50 p-5 sm:p-8">
              {/* Agent status */}
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 mb-5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[13px] text-emerald-700 font-medium">Toby is working</span>
                <div className="flex-1" />
                <div className="flex items-center gap-4 text-[12px] text-emerald-600/70">
                  <span>Researching</span><span className="font-semibold text-emerald-700">Creating</span><span>Publishing</span>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'Reels Created', value: '48', sub: 'this week', c: 'text-blue-600' },
                  { label: 'Carousels', value: '12', sub: 'this week', c: 'text-violet-600' },
                  { label: 'Published', value: '156', sub: 'this month', c: 'text-emerald-600' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-100">
                    <div className="text-[12px] text-gray-400 mb-1">{s.label}</div>
                    <div className={`text-[28px] font-bold ${s.c} leading-none`}>{s.value}</div>
                    <div className="text-[11px] text-gray-300 mt-1">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Toby's learning */}
              <div className="bg-white rounded-xl p-4 border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-blue-500" />
                    <span className="text-[12px] font-semibold text-gray-700">Toby's Learning Progress</span>
                  </div>
                  <span className="text-[11px] text-emerald-500 font-medium">Getting smarter every day</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Best Hook', value: 'Curiosity', pct: 92 },
                    { label: 'Best Style', value: 'Dark Cinematic', pct: 87 },
                    { label: 'Top Topic', value: 'Mindset', pct: 95 },
                    { label: 'Quality Avg', value: '88/100', pct: 88 },
                  ].map(l => (
                    <div key={l.label} className="text-center">
                      <div className="text-[10px] text-gray-400 mb-1">{l.label}</div>
                      <div className="text-[13px] font-bold text-gray-800">{l.value}</div>
                      <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" style={{ width: `${l.pct}%` }} />
                      </div>
                    </div>
                  ))}
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


      {/* ══════════ WHAT YOU CREATE ══════════ */}
      <section id="features" className="py-20 sm:py-28 px-5 sm:px-8">
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
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow h-full">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center"><Film className="w-5 h-5 text-white" /></div>
                  <span className="text-[11px] font-semibold text-pink-600 bg-pink-50 px-2.5 py-1 rounded-full uppercase tracking-wider">Reels & Shorts</span>
                </div>
                <h3 className="text-[20px] font-bold text-gray-900 mb-2">Short-Form Video Reels</h3>
                <p className="text-[14px] text-gray-500 leading-[1.6] mb-5">Branded video content with text overlays, your colors, trending music, and platform-optimized formats. Perfect for Instagram Reels, TikTok, YouTube Shorts, and Facebook.</p>
                <ul className="space-y-2">
                  {['Multiple reel formats to choose from', 'Your brand colors & logo on every slide', 'Trending music integration', 'Auto-caption with viral-style text'].map(b => (
                    <li key={b} className="flex items-center gap-2.5"><CheckCircle2 className="w-4 h-4 text-pink-400 flex-shrink-0" /><span className="text-[13px] text-gray-600">{b}</span></li>
                  ))}
                </ul>
              </div>
            </Reveal>

            {/* Carousels */}
            <Reveal delay={0.15}>
              <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow h-full">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center"><Image className="w-5 h-5 text-white" /></div>
                  <span className="text-[11px] font-semibold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full uppercase tracking-wider">Carousels</span>
                </div>
                <h3 className="text-[20px] font-bold text-gray-900 mb-2">Multi-Slide Carousels</h3>
                <p className="text-[14px] text-gray-500 leading-[1.6] mb-5">Swipe-worthy carousel posts with auto-fit typography, branded visuals, and engaging copy. Optimized for Instagram and Facebook engagement.</p>
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
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-[1280px] mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-[12px] font-semibold text-blue-600 uppercase tracking-wider mb-3">Meet Toby</p>
              <h2 className="text-[30px] sm:text-[44px] font-extrabold text-gray-900 tracking-[-0.03em] leading-tight">
                Your AI Agent That Never Stops<br />Getting Smarter
              </h2>
              <p className="mt-4 text-[16px] text-gray-500 max-w-[600px] mx-auto leading-relaxed">Toby isn't a template library. He's an autonomous AI agent that researches your niche, creates content, publishes it, and <strong className="text-gray-700">learns what goes viral for your specific audience</strong> — getting exponentially better every single day.</p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: Eye, title: 'Researches Your Niche', desc: 'Toby scouts trending topics, competitor content, and emerging patterns in YOUR niche. He brings the ideas — you don\'t have to think.' },
              { icon: Sparkles, title: 'Creates On-Brand Content', desc: 'Using your Content DNA — tone, style, topics, visuals — Toby generates reels and carousels that sound like you, not a robot.' },
              { icon: Shield, title: 'Quality-Scores Everything', desc: 'Every piece is scored across 5 dimensions before publishing. Only content scoring 80+ goes live. Below that, Toby regenerates.' },
              { icon: Send, title: 'Publishes Across 6 Platforms', desc: 'Instagram, Facebook, YouTube, TikTok, Threads, Bluesky — Toby handles format optimization and posting for each one.' },
              { icon: Brain, title: 'Learns What Works', desc: 'Toby uses multi-armed bandit optimization to test hooks, styles, and topics. He discovers what YOUR audience responds to — not generic best practices.' },
              { icon: TrendingUp, title: 'Gets Smarter Every Day', desc: 'Every piece published teaches Toby more. His strategy evolves exponentially — what works today feeds into better content tomorrow.' },
            ].map((a, i) => (
              <Reveal key={i} delay={i * 0.06}>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all h-full group">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 group-hover:bg-blue-50 flex items-center justify-center mb-4 transition-colors">
                    <a.icon className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <h4 className="text-[15px] font-bold text-gray-900 mb-2">{a.title}</h4>
                  <p className="text-[13px] text-gray-500 leading-[1.6]">{a.desc}</p>
                </div>
              </Reveal>
            ))}
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
              <div className="p-6 sm:p-8 rounded-2xl bg-red-50/50 border border-red-100/80">
                <h3 className="text-[17px] font-bold text-gray-400 mb-6">The Old Way</h3>
                <ul className="space-y-4">
                  {OLD_WAY.map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5"><X className="w-3 h-3 text-red-400" /></div>
                      <span className="text-[14px] text-gray-500 leading-[1.5]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="p-6 sm:p-8 rounded-2xl bg-emerald-50/50 border border-emerald-100/80">
                <h3 className="text-[17px] font-bold text-gray-900 mb-6">With Toby</h3>
                <ul className="space-y-4">
                  {TOBY_WAY.map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5"><Check className="w-3 h-3 text-emerald-600" /></div>
                      <span className="text-[14px] text-gray-700 leading-[1.5]">{item}</span>
                    </li>
                  ))}
                </ul>
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
              { step: '1', icon: Target, title: 'Define Your Brand', desc: 'Set your niche, tone, audience, topics, colors, and visual style. This becomes your Content DNA — the blueprint Toby follows for every piece.', note: '5 min setup' },
              { step: '2', icon: Sparkles, title: 'Toby Creates & Scores', desc: 'Toby generates reels and carousels, quality-scores each one across 5 dimensions, and only schedules content that meets your standard.', note: 'Automatic' },
              { step: '3', icon: Repeat, title: 'Publish, Learn, Repeat', desc: 'Content publishes across 6 platforms. Toby analyzes what works and gets smarter. Every day, his strategy improves for YOUR audience.', note: '24/7 forever' },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow h-full">
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-[15px]">{item.step}</div>
                    <span className="text-[12px] text-gray-300 font-medium">{item.note}</span>
                  </div>
                  <h3 className="text-[17px] font-bold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-[14px] text-gray-500 leading-[1.6]">{item.desc}</p>
                </div>
              </Reveal>
            ))}
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
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[13px] font-semibold text-gray-700">Toby's Learning Engine</span>
                  <span className="text-[11px] text-emerald-500 font-medium flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Always learning</span>
                </div>
                {/* Strategy performance */}
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
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ SCHEDULING + CALENDAR ══════════ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-gray-50">
        <div className="max-w-[1280px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <Reveal>
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
                    const colors = ['bg-pink-400', 'bg-red-500', 'bg-blue-500', 'bg-gray-800', 'bg-violet-500', 'bg-sky-400']
                    return (
                      <div key={i} className="aspect-square rounded-lg bg-gray-50 border border-gray-100 flex flex-col items-center justify-center gap-0.5 p-0.5 hover:bg-blue-50 hover:border-blue-100 transition-colors cursor-pointer">
                        <span className="text-[10px] text-gray-400">{i + 1}</span>
                        {has && <div className="flex gap-[2px]"><div className={`w-[5px] h-[5px] rounded-full ${colors[i % colors.length]}`} />{i % 3 === 0 && <div className={`w-[5px] h-[5px] rounded-full ${colors[(i + 1) % colors.length]}`} />}</div>}
                      </div>
                    )
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                  <span className="text-[11px] font-medium text-emerald-700">Toby's Queue</span>
                  <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><span className="text-[11px] text-emerald-600 font-semibold">Active</span></div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div>
                <p className="text-[12px] font-semibold text-blue-600 uppercase tracking-wider mb-4">Smart Scheduling</p>
                <h3 className="text-[28px] sm:text-[38px] font-extrabold text-gray-900 tracking-[-0.03em] leading-[1.1]">Toby Publishes Everywhere. Automatically.</h3>
                <p className="mt-4 text-[15px] text-gray-500 leading-[1.7]">Set up once, Toby runs forever. He formats content per platform, picks optimal posting times, and publishes on schedule — you just watch it happen.</p>
                <ul className="mt-6 space-y-3">
                  {['Preview what Toby will publish before it goes live', 'Optimizes posting time per platform', 'Daily recurring schedule — never miss a slot', 'Override or adjust any decision anytime'].map(b => (
                    <li key={b} className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" /><span className="text-[14px] text-gray-600">{b}</span></li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ ANALYTICS ══════════ */}
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
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[13px] font-semibold text-gray-700">Growth</span>
                  <span className="text-[11px] text-gray-300">Last 30 days</span>
                </div>
                <div className="flex items-end gap-[3px] h-32 mb-5">
                  {[30, 42, 28, 55, 48, 62, 38, 72, 65, 85, 70, 90, 78, 95, 88].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-blue-500 to-blue-400" style={{ height: `${h}%`, opacity: 0.3 + (h / 100) * 0.7 }} />
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { l: 'Avg. Reach', v: '+127%', c: 'text-blue-600' },
                    { l: 'Engagement', v: '4.8x', c: 'text-emerald-600' },
                    { l: 'New Followers', v: '+12K', c: 'text-violet-600' },
                    { l: 'ROI on Time', v: '10x', c: 'text-amber-600' },
                  ].map(s => (
                    <div key={s.l} className="text-center bg-gray-50 rounded-xl py-3 px-2 border border-gray-100">
                      <div className={`text-[18px] font-bold ${s.c}`}>{s.v}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ══════════ PRICING ══════════ */}
      <section id="pricing" className="py-20 sm:py-28 px-5 sm:px-8 bg-gray-50">
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
                      <td className="py-3.5 px-4 sm:px-6 text-[14px] font-bold text-gray-900 text-center bg-blue-50/30">{row.toby}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-10 text-center">
              <Link to={ctaLink} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-[15px] font-semibold px-8 py-3.5 rounded-xl shadow-lg shadow-blue-600/25 transition-all">
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
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-[700px] mx-auto text-center">
          <Reveal>
            <h2 className="text-[30px] sm:text-[48px] font-extrabold text-gray-900 tracking-[-0.03em] leading-[1.1]">
              Ready to let Toby<br />run your content?
            </h2>
            <p className="mt-5 text-[16px] sm:text-[18px] text-gray-500 leading-relaxed max-w-[480px] mx-auto">Join 2,917+ creators whose AI agent creates and publishes content — getting smarter every single day.</p>
            <div className="mt-9">
              <Link to={ctaLink} className="inline-flex items-center gap-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[16px] font-semibold px-10 py-4 rounded-xl shadow-lg shadow-blue-600/25 transition-all">
                {ctaLabel} <ArrowRight className="w-5 h-5" />
              </Link>
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
                  {['Reel Creation', 'Carousel Creation', 'Toby AI Agent', 'Smart Scheduling', 'Analytics'].map(item => (
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
