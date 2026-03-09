/**
 * Welcome / Landing Page — viraltoby.com/welcome
 * Design: Dark, bold, creator-focused. ViewCreator-inspired density & credibility.
 * Fonts: Syne (display), Figtree (body).
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, ChevronDown, Sparkles, X, Menu,
  Zap, Brain, BarChart3, Shield, Layers, Send,
  CheckCircle2, Play, Globe, Target,
  Calendar, Eye, Users, TrendingUp, Star,
  Cpu, Activity, Check,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { PlatformIcon } from '@/shared/components/PlatformIcon'
import vaLogo from '@/assets/icons/va-logo.svg'

/* ─────────────────────── Helpers ─────────────────────── */

const SYNE = "'Syne', sans-serif"
const FIG = "'Figtree', sans-serif"

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 28 }} animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }} transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  )
}

/* Counter kept for future use if needed */

function FaqItem({ question, answer, defaultOpen = false }: { question: string; answer: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-5 sm:py-6 text-left group">
        <span style={{ fontFamily: FIG }} className="text-[15px] sm:text-[17px] font-medium text-white/90 pr-8 group-hover:text-white transition-colors">{question}</span>
        <ChevronDown className={`w-5 h-5 text-white/30 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <p style={{ fontFamily: FIG }} className="pb-6 text-[14px] sm:text-[15px] text-white/40 leading-[1.7]">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* Rotating text for hero */
function RotatingPlatform() {
  const platforms = ['Instagram', 'YouTube', 'TikTok', 'Facebook', 'Threads', 'Bluesky']
  const colors = ['#E1306C', '#FF0000', '#ffffff', '#1877F2', '#000000', '#0085ff']
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setIdx((prev) => (prev + 1) % platforms.length), 2000)
    return () => clearInterval(interval)
  }, [])
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={platforms[idx]}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ duration: 0.35 }}
        style={{ color: colors[idx], fontFamily: SYNE }}
        className="inline-block"
      >
        {platforms[idx]}
      </motion.span>
    </AnimatePresence>
  )
}

/* ─────────────────────── Data ─────────────────────── */

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'tiktok', name: 'TikTok' },
  { id: 'threads', name: 'Threads' },
  { id: 'bluesky', name: 'Bluesky' },
]

const OLD_WAY = [
  'Manually creating content every single day',
  'Switching between 5+ platform tabs',
  'Guessing what content will perform',
  'Inconsistent posting schedule',
  'Hours spent on captions & visuals',
  'No idea what\'s actually working',
]

const AGENT_WAY = [
  'AI creates branded content 24/7',
  'One dashboard for all 6 platforms',
  'Data-driven learning per brand',
  'Automated scheduling, never miss a slot',
  'Quality-scored visuals & copy in seconds',
  'Real-time analytics across everything',
]

const AGENT_CAPABILITIES = [
  { icon: Brain, title: 'Content Creator', desc: 'Generates reels, shorts, carousels, and posts using your brand\'s Content DNA. Every piece quality-scored before scheduling.' },
  { icon: BarChart3, title: 'Performance Analyst', desc: 'Analyzes past performance and engagement data to understand what resonates with your audience.' },
  { icon: Eye, title: 'Trend Scout', desc: 'Discovers trending topics and competitor content in your niche. Finds opportunities before they peak.' },
  { icon: Target, title: 'Strategist', desc: 'Plans content roadmaps and picks the optimal strategy — hook type, personality, visual style — for each piece.' },
  { icon: Shield, title: 'Quality Guard', desc: 'Scores content across 5 dimensions. Rejects duplicates and low-quality outputs. Only 80+ gets published.' },
  { icon: Send, title: 'Publisher', desc: 'Handles OAuth tokens, format optimization, and multi-platform publishing. Retries failures automatically.' },
]

const FAQS = [
  { q: 'How does Toby create content for my brand?', a: 'You define your brand\'s Content DNA — niche, tone, target audience, topic categories, and visual style. Toby uses this as the foundation for every piece of content, ensuring everything stays on-brand and aligned with your voice.' },
  { q: 'Do I need to approve content before it goes live?', a: 'You\'re always in control. Content is generated based on your brand rules and quality-scored across 5 dimensions before reaching your schedule. You can review, edit, reschedule, or regenerate anything at any time.' },
  { q: 'Which platforms are supported?', a: 'ViralToby publishes to Instagram (Reels & Posts), Facebook (Reels & Posts), YouTube Shorts, TikTok, Threads, and Bluesky. Connect any combination per brand — publish everywhere from one dashboard.' },
  { q: 'Can I manage multiple brands?', a: 'Yes. Each brand gets its own Content DNA, connected platforms, color scheme, posting schedule, and learning engine. Add as many brands as you need — each one operates independently.' },
  { q: 'What kind of content does it create?', a: 'Short-form video content (Reels, Shorts, TikToks) with text overlays and branded visuals, plus carousel posts with auto-fit typography. All visuals match your brand colors and style automatically.' },
  { q: 'How is this different from Hootsuite or Buffer?', a: 'Traditional tools require you to create content yourself — they only handle posting. ViralToby handles the entire pipeline: content ideation, creation, quality scoring, scheduling, and publishing. It\'s a content team, not a calendar.' },
  { q: 'What does the quality scoring do?', a: 'Every piece is scored across 5 dimensions: structural compliance, pattern familiarity, novelty, emotional hook, and plausibility. Only content scoring 80+ gets published. Below that, Toby regenerates automatically.' },
  { q: 'How does the learning engine work?', a: 'Toby uses Thompson Sampling — a multi-armed bandit algorithm — to test different hooks, personalities, visual styles, and topics per brand. It learns what performs best for YOUR audience, not generic best practices.' },
]

const COMPARISON = [
  { label: 'Monthly cost', agency: '$2,000 — $5,000+', toby: '$50 / brand' },
  { label: 'Content per month', agency: '15 — 30 pieces', toby: 'Unlimited' },
  { label: 'Platforms', agency: '2 — 3', toby: 'All 6' },
  { label: 'Brand voice', agency: 'Hit or miss', toby: 'DNA-driven' },
  { label: 'Turnaround', agency: '24 — 48 hours', toby: 'Minutes' },
  { label: 'Analytics', agency: 'Monthly PDF', toby: 'Real-time' },
  { label: 'Learning & optimization', agency: 'Manual', toby: 'Automatic' },
  { label: 'Setup time', agency: 'Weeks', toby: '5 minutes' },
]


/* ═══════════════════════════════════════ PAGE ═══════════════════════════════ */

export function WelcomePage() {
  const { isAuthenticated } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => {
    document.documentElement.style.backgroundColor = '#050505'
    document.body.style.background = '#050505'
    return () => { document.documentElement.style.backgroundColor = ''; document.body.style.background = '' }
  }, [])

  const scrollTo = useCallback((id: string) => {
    setMobileOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const ctaLink = isAuthenticated ? '/' : '/login'
  const ctaLabel = isAuthenticated ? 'Go to Dashboard' : 'Start Free'

  return (
    <div className="min-h-screen" style={{ fontFamily: FIG, background: '#050505', color: '#fff' }}>

      {/* ═══ NAV ═══ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-[#050505]/80 backdrop-blur-2xl border-b border-white/[0.04]' : 'bg-transparent'}`}>
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between h-[64px]">
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5 group">
              <img src={vaLogo} alt="ViralToby" className="w-[28px] h-[28px] rounded-[7px] transition-transform group-hover:scale-105" />
              <span style={{ fontFamily: SYNE }} className="text-[16px] font-bold text-white tracking-[-0.02em]">ViralToby</span>
            </button>

            <div className="hidden md:flex items-center gap-8">
              {[{ id: 'features', label: 'Features' }, { id: 'how-it-works', label: 'How It Works' }, { id: 'pricing', label: 'Pricing' }, { id: 'faq', label: 'FAQ' }].map((n) => (
                <button key={n.id} onClick={() => scrollTo(n.id)} className="text-[13px] text-white/40 hover:text-white transition-colors">{n.label}</button>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              {isAuthenticated ? (
                <Link to="/" className="bg-white text-[#050505] text-[13px] font-semibold px-5 py-2 rounded-full hover:bg-white/90 transition-all">Dashboard</Link>
              ) : (
                <>
                  <Link to="/login" className="text-[13px] text-white/50 hover:text-white transition-colors px-4 py-2">Sign In</Link>
                  <Link to="/login" className="bg-white text-[#050505] text-[13px] font-semibold px-5 py-2 rounded-full hover:bg-white/90 transition-all">Start Free</Link>
                </>
              )}
            </div>

            <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-white/50 hover:text-white"><Menu className="w-5 h-5" /></button>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="md:hidden bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/[0.04] overflow-hidden">
              <div className="px-5 py-4 space-y-1">
                {['features', 'how-it-works', 'pricing', 'faq'].map((id) => (
                  <button key={id} onClick={() => scrollTo(id)} className="block w-full text-left px-3 py-2.5 text-[14px] text-white/50 hover:text-white hover:bg-white/[0.04] rounded-lg transition-colors">
                    {id === 'how-it-works' ? 'How It Works' : id === 'faq' ? 'FAQ' : id.charAt(0).toUpperCase() + id.slice(1)}
                  </button>
                ))}
                <div className="pt-3 flex flex-col gap-2">
                  <Link to="/login" className="text-center px-4 py-2.5 text-[13px] text-white/60 border border-white/10 rounded-full">Sign In</Link>
                  <Link to="/login" className="text-center px-4 py-2.5 text-[13px] font-semibold text-[#050505] bg-white rounded-full">Start Free</Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>


      {/* ═══ HERO ═══ */}
      <section className="relative pt-36 sm:pt-44 pb-16 sm:pb-24 px-5 sm:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(0,100,140,0.15)_0%,_transparent_60%)]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[800px] bg-[radial-gradient(circle,_rgba(0,180,216,0.06)_0%,_transparent_50%)] blur-3xl" />

        <div className="relative max-w-[1200px] mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] mb-8">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[12px] font-medium text-white/50 tracking-wide">Virality on Autopilot</span>
            </div>

            <h1 style={{ fontFamily: SYNE }} className="text-[38px] sm:text-[56px] lg:text-[72px] font-extrabold text-white leading-[0.95] tracking-[-0.035em]">
              Go viral on<br />
              <span className="inline-flex items-center h-[1.05em]"><RotatingPlatform /></span>
              <br />
              <span className="text-white/30">while you sleep.</span>
            </h1>

            <p className="mt-6 sm:mt-8 text-[16px] sm:text-[19px] text-white/40 leading-[1.6] max-w-[560px] mx-auto">
              AI agents create and publish trending content automatically across 6 platforms — every single day. No manual work required.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to={ctaLink} className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-white text-[#050505] text-[15px] font-semibold px-8 py-3.5 rounded-full hover:bg-white/90 transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.12)]">
                {ctaLabel} <ArrowRight className="w-4 h-4" />
              </Link>
              <button onClick={() => scrollTo('how-it-works')} className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 text-white/60 hover:text-white text-[15px] font-medium px-8 py-3.5 rounded-full border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.03] transition-all">
                <Play className="w-4 h-4" /> See How It Works
              </button>
            </div>

            {/* Social proof */}
            <div className="mt-8 flex items-center justify-center gap-6">
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="w-7 h-7 rounded-full bg-gradient-to-br from-white/10 to-white/5 border-2 border-[#050505] flex items-center justify-center">
                      <Users className="w-3 h-3 text-white/30" />
                    </div>
                  ))}
                </div>
                <span className="text-[13px] text-white/30 ml-1">
                  <span className="text-white/60 font-semibold">2,400+</span> creators joined
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>


      {/* ═══ HERO AGENT VISUAL ═══ */}
      <section className="pb-16 sm:pb-24 px-5 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 50, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }} className="relative max-w-[900px] mx-auto">
          <div className="absolute -inset-8 bg-gradient-to-b from-[#00b4d8]/[0.06] via-transparent to-transparent rounded-[40px] blur-2xl" />

          <div className="relative rounded-[20px] overflow-hidden border border-white/[0.06]" style={{ boxShadow: '0 40px 100px -20px rgba(0,100,140,0.12)' }}>
            <div className="bg-[#0f0f0f] px-4 py-2.5 flex items-center gap-2 border-b border-white/[0.04]">
              <div className="flex gap-1.5">
                <div className="w-[10px] h-[10px] rounded-full bg-[#ec6a5e]/80" />
                <div className="w-[10px] h-[10px] rounded-full bg-[#f4bf4f]/80" />
                <div className="w-[10px] h-[10px] rounded-full bg-[#61c554]/80" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-white/[0.04] rounded-md px-6 py-1 text-[11px] text-white/20 border border-white/[0.04] w-52 text-center font-mono">viraltoby.com</div>
              </div>
            </div>

            <div className="bg-[#0a0a0a] p-5 sm:p-6">
              <div className="flex gap-4">
                <div className="hidden sm:flex flex-col gap-2 w-10">
                  <div className="w-8 h-8 rounded-lg bg-[#F5EDD8]/10 flex items-center justify-center mb-2">
                    <img src={vaLogo} alt="" className="w-5 h-5" />
                  </div>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className={`w-8 h-8 rounded-lg ${i === 0 ? 'bg-white/10' : 'bg-white/[0.03]'}`} />
                  ))}
                </div>

                <div className="flex-1 space-y-3">
                  {/* Agent status badge */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/[0.15]">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] text-emerald-400/80 font-medium">Content Agent Active — Publishing 4/6 platforms...</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Scheduled', value: '24', color: '#00b4d8' },
                      { label: 'Published', value: '156', color: '#10b981' },
                      { label: 'Engagement', value: '8.2%', color: '#8b5cf6' },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
                        <div className="w-2 h-2 rounded-full mb-2" style={{ backgroundColor: s.color }} />
                        <div style={{ fontFamily: SYNE }} className="text-[15px] font-bold text-white">{s.value}</div>
                        <div className="text-[10px] text-white/30 mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
                    <div className="text-[11px] font-medium text-white/40 mb-2">Today's Schedule</div>
                    <div className="space-y-1.5">
                      {[
                        { time: '09:00', platform: 'Instagram', color: 'bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045]' },
                        { time: '12:00', platform: 'YouTube', color: 'bg-[#ff0000]' },
                        { time: '15:00', platform: 'TikTok', color: 'bg-white/80' },
                        { time: '18:00', platform: 'Facebook', color: 'bg-[#1877F2]' },
                      ].map((item) => (
                        <div key={item.time} className="flex items-center gap-2">
                          <span className="text-[10px] text-white/20 w-9 font-mono flex-shrink-0">{item.time}</span>
                          <div className={`${item.color} h-7 rounded-lg flex-1 flex items-center px-2.5`}>
                            <span className={`text-[10px] font-medium ${item.platform === 'TikTok' ? 'text-[#0a0a0a]' : 'text-white'}`}>{item.platform}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="text-center py-2">
                    <p className="text-[10px] text-white/15 italic">This runs automatically every day. No manual work required.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>


      {/* ═══ PLATFORM STRIP ═══ */}
      <section className="py-12 sm:py-16 px-5 sm:px-8 border-y border-white/[0.04]">
        <Reveal>
          <div className="max-w-[1200px] mx-auto">
            <p className="text-center text-[11px] uppercase tracking-[0.2em] text-white/20 mb-6">Connect once. Agents run forever.</p>
            <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-12">
              {PLATFORMS.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-white/25 hover:text-white/60 transition-colors duration-300">
                  <PlatformIcon platform={p.id} className="w-5 h-5" />
                  <span className="text-[13px] font-medium">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>


      {/* ═══ OLD WAY VS AGENT WAY ═══ */}
      <section className="py-24 sm:py-32 px-5 sm:px-8">
        <div className="max-w-[1000px] mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <h2 style={{ fontFamily: SYNE }} className="text-[28px] sm:text-[44px] font-extrabold text-white tracking-[-0.03em] leading-tight">
                Stop the Grind.<br /><span className="text-white/30">Deploy AI Agents.</span>
              </h2>
              <p className="mt-4 text-[16px] text-white/35 max-w-[520px] mx-auto leading-relaxed">Managing social media manually is a full-time job. ViralToby's AI agents do the work for you — researching, creating, and publishing while you focus on what matters.</p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-5">
            <Reveal delay={0.1}>
              <div className="p-6 sm:p-8 rounded-[20px] border border-red-500/[0.1] bg-red-500/[0.02]">
                <h3 style={{ fontFamily: SYNE }} className="text-[18px] font-bold text-white/60 mb-6">The Old Way</h3>
                <ul className="space-y-3.5">
                  {OLD_WAY.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <X className="w-4 h-4 text-red-400/60 mt-0.5 flex-shrink-0" />
                      <span className="text-[14px] text-white/35 leading-[1.5]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={0.2}>
              <div className="p-6 sm:p-8 rounded-[20px] border border-emerald-500/[0.15] bg-emerald-500/[0.02]">
                <h3 style={{ fontFamily: SYNE }} className="text-[18px] font-bold text-white mb-6">With ViralToby Agents</h3>
                <ul className="space-y-3.5">
                  {AGENT_WAY.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-emerald-400/80 mt-0.5 flex-shrink-0" />
                      <span className="text-[14px] text-white/60 leading-[1.5]">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ═══ AGENT CONTROL PANEL ═══ */}
      <section id="features" className="py-24 sm:py-32 px-5 sm:px-8 bg-[#0a0a0a]">
        <div className="max-w-[1100px] mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#00b4d8]/60 mb-4">Agent Control Panel</p>
              <h2 style={{ fontFamily: SYNE }} className="text-[28px] sm:text-[44px] font-extrabold text-white tracking-[-0.03em] leading-tight">
                Stop Managing.<br />Let Agents Handle It.
              </h2>
              <p className="mt-4 text-[16px] text-white/35 max-w-[540px] mx-auto leading-relaxed">Your AI agents are always working. Check in when you want — they'll keep creating, optimizing, and publishing across all your platforms.</p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-3 gap-4">
            <Reveal delay={0.1}>
              <div className="p-6 rounded-[20px] border border-white/[0.06] bg-white/[0.02] h-full">
                <Activity className="w-5 h-5 text-[#00b4d8]/60 mb-4" />
                <h3 style={{ fontFamily: SYNE }} className="text-[16px] font-bold text-white mb-2">Agent Activity Feed</h3>
                <p className="text-[13px] text-white/30 leading-[1.6]">See what your agents are doing — content created, posts scheduled, quality scores, performance updates.</p>
              </div>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="p-6 rounded-[20px] border border-white/[0.06] bg-white/[0.02] h-full">
                <Globe className="w-5 h-5 text-[#00b4d8]/60 mb-4" />
                <h3 style={{ fontFamily: SYNE }} className="text-[16px] font-bold text-white mb-2">Multi-Platform Publishing</h3>
                <p className="text-[13px] text-white/30 leading-[1.6]">Agents format and publish your content to Instagram, Facebook, YouTube, TikTok, Threads, and Bluesky automatically.</p>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="p-6 rounded-[20px] border border-white/[0.06] bg-white/[0.02] h-full">
                <TrendingUp className="w-5 h-5 text-[#00b4d8]/60 mb-4" />
                <h3 style={{ fontFamily: SYNE }} className="text-[16px] font-bold text-white mb-2">Performance Insights</h3>
                <p className="text-[13px] text-white/30 leading-[1.6]">Agents track what's working and adapt your content strategy automatically using multi-armed bandit optimization.</p>
              </div>
            </Reveal>
          </div>

          {/* Stats row */}
          <Reveal delay={0.25}>
            <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { icon: Eye, label: 'Total Views', value: '2.4M', trend: '↑ 12% this week' },
                { icon: Users, label: 'Followers', value: '85.2K', trend: '↑ 540 today' },
                { icon: Activity, label: 'Engagement', value: '8.2%', trend: '↑ 3.1% this month' },
                { icon: Layers, label: 'Content Created', value: '1,247', trend: '↑ 22% this week' },
              ].map((s, i) => (
                <div key={i} className="p-4 rounded-[16px] border border-white/[0.06] bg-white/[0.02] text-center">
                  <s.icon className="w-4 h-4 text-white/15 mx-auto mb-2" />
                  <div style={{ fontFamily: SYNE }} className="text-[22px] font-bold text-white">{s.value}</div>
                  <div className="text-[10px] text-white/25 mt-0.5">{s.label}</div>
                  <div className="text-[10px] text-emerald-400/60 mt-1">{s.trend}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>


      {/* ═══ AGENT CAPABILITIES ═══ */}
      <section className="py-24 sm:py-32 px-5 sm:px-8">
        <div className="max-w-[1100px] mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#00b4d8]/60 mb-4">Specialized agents</p>
              <h2 style={{ fontFamily: SYNE }} className="text-[28px] sm:text-[44px] font-extrabold text-white tracking-[-0.03em] leading-tight">
                6 AI Agents Working<br /><span className="text-white/30">For Every Brand.</span>
              </h2>
              <p className="mt-4 text-[16px] text-white/35 max-w-[540px] mx-auto leading-relaxed">Each agent specializes in a different part of the content pipeline. Together, they handle everything from ideation to publishing.</p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENT_CAPABILITIES.map((agent, i) => (
              <Reveal key={i} delay={i * 0.06}>
                <div className="p-5 sm:p-6 rounded-[16px] border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 h-full">
                  <agent.icon className="w-5 h-5 text-[#00b4d8]/50 mb-3" />
                  <h4 style={{ fontFamily: SYNE }} className="text-[15px] font-bold text-white mb-2">{agent.title}</h4>
                  <p className="text-[13px] text-white/30 leading-[1.6]">{agent.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* ═══ AI-POWERED CREATION ═══ */}
      <section className="py-24 sm:py-32 px-5 sm:px-8 bg-[#0a0a0a]">
        <div className="max-w-[1100px] mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#00b4d8]/60 mb-4">AI-powered creation</p>
              <h2 style={{ fontFamily: SYNE }} className="text-[28px] sm:text-[44px] font-extrabold text-white tracking-[-0.03em] leading-tight">
                Agents Create Content<br /><span className="text-white/30">While You Sleep.</span>
              </h2>
              <p className="mt-4 text-[16px] text-white/35 max-w-[540px] mx-auto leading-relaxed">Your AI agents don't just schedule — they create. From scripts to branded visuals to viral-format videos, agents produce professional content around the clock.</p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: Layers, title: 'Branded Video Reels', desc: 'Agents create short-form video content with text overlays, branded colors, trending music, and platform-optimized formats.', tag: 'Auto' },
              { icon: Cpu, title: 'Carousel Posts', desc: 'Multi-slide carousels with auto-fit typography, brand colors, and engaging copy — formatted for Instagram and Facebook.', tag: 'Auto' },
              { icon: Brain, title: '59 Viral Patterns', desc: 'Battle-tested title archetypes, hook formulas, and content structures based on a real viral database — not guesswork.', tag: 'Built-in' },
              { icon: Eye, title: 'Trend Research', desc: 'Agents research trends in your niche, discover competitor content, and plan pieces with high viral potential.', tag: 'Live' },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div className="p-6 sm:p-8 rounded-[20px] border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 h-full">
                  <div className="flex items-center justify-between mb-4">
                    <item.icon className="w-5 h-5 text-[#00b4d8]/50" />
                    <span className="text-[10px] font-semibold text-[#00b4d8]/40 uppercase tracking-wider bg-[#00b4d8]/[0.06] px-2 py-0.5 rounded-full">{item.tag}</span>
                  </div>
                  <h3 style={{ fontFamily: SYNE }} className="text-[17px] font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-[14px] text-white/30 leading-[1.6]">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how-it-works" className="py-24 sm:py-32 px-5 sm:px-8">
        <div className="max-w-[1000px] mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#00b4d8]/60 mb-4">How it works</p>
              <h2 style={{ fontFamily: SYNE }} className="text-[28px] sm:text-[44px] font-extrabold text-white tracking-[-0.03em] leading-tight">
                Up and Running<br />in Minutes.
              </h2>
              <p className="mt-4 text-[16px] text-white/35 max-w-[460px] mx-auto leading-relaxed">Three steps to turn your brand identity into an autonomous content engine.</p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-3 gap-4 sm:gap-5">
            {[
              { step: '01', icon: Target, title: 'Define your brand', desc: 'Set your niche, tone, audience, topics, and visual style. This becomes your Content DNA — the blueprint Toby follows.', time: '5 min' },
              { step: '02', icon: Sparkles, title: 'Toby creates content', desc: 'AI generates branded reels, shorts, carousels — all quality-scored across 5 dimensions before they hit your calendar.', time: 'Automatic' },
              { step: '03', icon: Send, title: 'Publish everywhere', desc: 'Content publishes across all 6 platforms automatically. Review if you want, or let it run hands-free.', time: '24/7' },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="relative p-6 sm:p-8 rounded-[20px] border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 h-full group">
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-10 h-10 rounded-[12px] bg-white/[0.04] flex items-center justify-center group-hover:bg-[#00b4d8]/[0.08] transition-colors">
                      <item.icon className="w-[18px] h-[18px] text-white/40 group-hover:text-[#00b4d8] transition-colors" />
                    </div>
                    <span className="text-[11px] font-mono text-white/15">{item.time}</span>
                  </div>
                  <div style={{ fontFamily: SYNE }} className="text-[11px] font-bold text-[#00b4d8]/40 tracking-wider uppercase mb-3">{item.step}</div>
                  <h3 style={{ fontFamily: SYNE }} className="text-[18px] font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-[14px] text-white/35 leading-[1.6]">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* ═══ CONTENT CALENDAR + SCHEDULING ═══ */}
      <section className="py-24 sm:py-32 px-5 sm:px-8 bg-[#0a0a0a]">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <Reveal>
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[12px] font-medium text-white/40">Content Calendar</span>
                  <Calendar className="w-4 h-4 text-white/15" />
                </div>
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <div key={d} className="text-[10px] font-medium text-white/20 text-center py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 28 }, (_, i) => {
                    const hasContent = [2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25].includes(i)
                    const colors = ['bg-pink-400', 'bg-red-500', 'bg-blue-500', 'bg-white/80', 'bg-purple-500', 'bg-sky-400']
                    return (
                      <div key={i} className="aspect-square rounded-[8px] bg-white/[0.02] border border-white/[0.04] flex flex-col items-center justify-center gap-0.5 p-0.5">
                        <span className="text-[10px] text-white/20">{i + 1}</span>
                        {hasContent && (
                          <div className="flex gap-[2px]">
                            <div className={`w-[4px] h-[4px] rounded-full ${colors[i % colors.length]}`} />
                            {i % 3 === 0 && <div className={`w-[4px] h-[4px] rounded-full ${colors[(i + 1) % colors.length]}`} />}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Agent queue indicator */}
                <div className="mt-3 flex items-center justify-between px-2 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <span className="text-[10px] text-white/25">Agent Queue</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] text-emerald-400/70 font-medium">Active</span>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#00b4d8]/60 mb-5">Smart Scheduling</p>
                <h3 style={{ fontFamily: SYNE }} className="text-[28px] sm:text-[40px] font-extrabold text-white tracking-[-0.03em] leading-[1.05]">
                  Agents Publish<br />Everywhere.<br /><span className="text-white/30">Automatically.</span>
                </h3>
                <p className="mt-4 text-[15px] text-white/35 leading-[1.7]">Set up once, agents run forever. They format content for each platform, find the optimal posting times, and publish on schedule — daily, automatically.</p>
                <ul className="mt-6 space-y-3">
                  {[
                    'Preview what agents will publish before it goes live',
                    'Agents optimize timing for your audience',
                    'Daily recurring schedules per brand',
                    'Override or adjust agent decisions anytime',
                  ].map((b) => (
                    <li key={b} className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-[#00b4d8]/60 flex-shrink-0" />
                      <span className="text-[14px] text-white/50">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ═══ ANALYTICS ═══ */}
      <section className="py-24 sm:py-32 px-5 sm:px-8">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <Reveal delay={0.1}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#00b4d8]/60 mb-5">Real-time insights</p>
                <h3 style={{ fontFamily: SYNE }} className="text-[28px] sm:text-[40px] font-extrabold text-white tracking-[-0.03em] leading-[1.05]">
                  Unlock Data-Driven<br /><span className="bg-gradient-to-r from-[#00b4d8] to-[#00435c] bg-clip-text text-transparent">Viral Growth.</span>
                </h3>
                <p className="mt-4 text-[15px] text-white/35 leading-[1.7]">Stop guessing what works. ViralToby aggregates data from all your connected accounts into a single, easy-to-understand dashboard.</p>
                <ul className="mt-6 space-y-3">
                  {[
                    'Track cross-platform performance',
                    'Identify your best performing hooks',
                    'Per-platform engagement breakdown',
                    'Watch Toby optimize based on results',
                  ].map((b) => (
                    <li key={b} className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-[#00b4d8]/60 flex-shrink-0" />
                      <span className="text-[14px] text-white/50">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal>
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[12px] font-medium text-white/40">Growth</span>
                  <span className="text-[11px] text-white/20">Last 30 days</span>
                </div>
                <div className="flex items-end gap-[3px] h-28 mb-4">
                  {[30, 42, 28, 55, 48, 62, 38, 72, 65, 85, 70, 90, 78, 95, 88].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t-[3px] bg-[#00b4d8] transition-all" style={{ height: `${h}%`, opacity: 0.2 + (h / 100) * 0.8 }} />
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Avg Reach', value: '+127%' },
                    { label: 'Engagement', value: '4.8x' },
                    { label: 'New Followers/Mo', value: '+12K' },
                    { label: 'ROI on Time', value: '10x' },
                  ].map((s) => (
                    <div key={s.label} className="text-center bg-white/[0.02] rounded-[10px] py-2.5 px-1 border border-white/[0.04]">
                      <div style={{ fontFamily: SYNE }} className="text-[16px] font-bold text-white">{s.value}</div>
                      <div className="text-[10px] text-white/25 mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>


      {/* ═══ QUALITY & CONTROL ═══ */}
      <section className="py-24 sm:py-32 px-5 sm:px-8 bg-[#0a0a0a]">
        <div className="max-w-[1000px] mx-auto text-center">
          <Reveal>
            <h2 style={{ fontFamily: SYNE }} className="text-[28px] sm:text-[44px] font-extrabold text-white tracking-[-0.03em] leading-tight">
              Complete Control.<br /><span className="text-white/30">Full Customization.</span>
            </h2>
            <p className="mt-4 text-[16px] text-white/35 max-w-[480px] mx-auto leading-relaxed">Toby powers your creativity — it doesn't replace it. You set the rules, Toby follows them.</p>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-14 grid sm:grid-cols-3 gap-4">
              {[
                { icon: Shield, title: 'Your rules, always', desc: 'Every piece follows your brand guidelines. Tone, topics, audience, visuals — nothing publishes without meeting your standards.' },
                { icon: Target, title: 'Content your way', desc: 'Control captions, cadence, platforms, visual style. Customize everything per brand, per platform.' },
                { icon: Zap, title: '5-dimension quality scoring', desc: 'Content scored on structure, familiarity, novelty, emotional hook, and plausibility. Only 80+ gets published.' },
              ].map((item, i) => (
                <Reveal key={i} delay={0.1 + i * 0.06}>
                  <div className="p-6 sm:p-8 rounded-[20px] border border-white/[0.06] bg-white/[0.02] text-left hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 h-full">
                    <item.icon className="w-5 h-5 text-white/20 mb-4" />
                    <h3 style={{ fontFamily: SYNE }} className="text-[16px] font-bold text-white mb-2">{item.title}</h3>
                    <p className="text-[14px] text-white/30 leading-[1.6]">{item.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </Reveal>
        </div>
      </section>


      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="py-24 sm:py-32 px-5 sm:px-8">
        <div className="max-w-[800px] mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#00b4d8]/60 mb-4">Pricing</p>
              <h2 style={{ fontFamily: SYNE }} className="text-[28px] sm:text-[44px] font-extrabold text-white tracking-[-0.03em]">
                Agency-Level Output.<br /><span className="text-white/30">Fraction of the Cost.</span>
              </h2>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-[20px] border border-white/[0.06] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/[0.02]">
                    <th className="text-left py-4 px-5 sm:px-6 text-[11px] font-medium text-white/20 uppercase tracking-wider" />
                    <th className="text-center py-4 px-4 sm:px-6 text-[11px] font-medium text-white/20 uppercase tracking-wider">Agency / VA</th>
                    <th className="text-center py-4 px-4 sm:px-6 text-[11px] font-semibold text-[#00b4d8] uppercase tracking-wider bg-[#00b4d8]/[0.04]">Toby</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, i) => (
                    <tr key={i} className="border-t border-white/[0.04]">
                      <td className="py-3.5 px-5 sm:px-6 text-[14px] font-medium text-white/60">{row.label}</td>
                      <td className="py-3.5 px-4 sm:px-6 text-[14px] text-white/20 text-center">{row.agency}</td>
                      <td className="py-3.5 px-4 sm:px-6 text-[14px] font-semibold text-white text-center bg-[#00b4d8]/[0.02]">{row.toby}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="mt-12 text-center">
              <Link to={ctaLink} className="inline-flex items-center gap-2.5 bg-white text-[#050505] text-[15px] font-semibold px-10 py-3.5 rounded-full hover:bg-white/90 transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.12)]">
                {ctaLabel} <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="mt-4 text-[13px] text-white/25">$50/month per brand · Cancel anytime · No credit card to start</p>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ═══ SOCIAL PROOF ═══ */}
      <section className="py-16 sm:py-20 px-5 sm:px-8 bg-[#0a0a0a] border-y border-white/[0.04]">
        <div className="max-w-[800px] mx-auto text-center">
          <Reveal>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/20 mb-6">Creators trust their agents</p>
            <div className="flex items-center justify-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-white/10 to-white/5 border-2 border-[#0a0a0a] flex items-center justify-center">
                      <Users className="w-3 h-3 text-white/30" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-left">
                <p className="text-[14px] text-white/70 font-semibold">Join 2,400+ creators</p>
                <p className="text-[12px] text-white/30">whose AI agents create and publish content every day.</p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <span className="text-[13px] text-white/50 font-medium">4.8</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ═══ FAQ ═══ */}
      <section id="faq" className="py-24 sm:py-32 px-5 sm:px-8">
        <div className="max-w-[640px] mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <h2 style={{ fontFamily: SYNE }} className="text-[28px] sm:text-[40px] font-extrabold text-white tracking-[-0.03em]">Frequently Asked Questions</h2>
              <p className="mt-3 text-[15px] text-white/30">Everything you need to know about scaling your social presence.</p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div>
              {FAQS.map((faq, i) => (
                <FaqItem key={i} question={faq.q} answer={faq.a} defaultOpen={i === 0} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>


      {/* ═══ FINAL CTA ═══ */}
      <section className="relative py-28 sm:py-36 px-5 sm:px-8 bg-[#0a0a0a] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(0,100,140,0.1)_0%,_transparent_60%)]" />

        <div className="relative max-w-[700px] mx-auto text-center">
          <Reveal>
            <h2 style={{ fontFamily: SYNE }} className="text-[32px] sm:text-[52px] font-extrabold text-white tracking-[-0.03em] leading-[1.0]">
              Ready to let AI agents<br />run your content?
            </h2>
            <p className="mt-5 text-[16px] sm:text-[18px] text-white/35 leading-relaxed max-w-[480px] mx-auto">Join 2,400+ creators whose AI agents create and publish content every single day.</p>
            <div className="mt-10">
              <Link to={ctaLink} className="inline-flex items-center gap-2.5 bg-white text-[#050505] text-[16px] font-semibold px-12 py-4 rounded-full hover:bg-white/90 transition-all hover:shadow-[0_0_40px_rgba(255,255,255,0.12)]">
                {ctaLabel} <ArrowRight className="w-4.5 h-4.5" />
              </Link>
            </div>
            <p className="mt-5 text-[12px] text-white/20">No credit card required · Set up in 5 minutes</p>
          </Reveal>
        </div>
      </section>


      {/* ═══ FOOTER ═══ */}
      <footer className="bg-[#020202] pt-16 pb-8 px-5 sm:px-8 border-t border-white/[0.04]">
        <div className="max-w-[1000px] mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 pb-12 border-b border-white/[0.04]">
            <div className="col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <img src={vaLogo} alt="ViralToby" className="w-7 h-7 rounded-[6px]" />
                <span style={{ fontFamily: SYNE }} className="text-[14px] font-bold text-white">ViralToby</span>
              </div>
              <p className="text-[13px] text-white/20 leading-relaxed">AI-powered content creation<br />and publishing for growing brands.</p>
            </div>

            <div>
              <h4 className="text-[11px] font-medium text-white/30 uppercase tracking-wider mb-4">Product</h4>
              <ul className="space-y-2.5">
                <li><button onClick={() => scrollTo('features')} className="text-[13px] text-white/20 hover:text-white transition-colors">Features</button></li>
                <li><button onClick={() => scrollTo('how-it-works')} className="text-[13px] text-white/20 hover:text-white transition-colors">How It Works</button></li>
                <li><button onClick={() => scrollTo('pricing')} className="text-[13px] text-white/20 hover:text-white transition-colors">Pricing</button></li>
                <li><button onClick={() => scrollTo('faq')} className="text-[13px] text-white/20 hover:text-white transition-colors">FAQ</button></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] font-medium text-white/30 uppercase tracking-wider mb-4">Legal</h4>
              <ul className="space-y-2.5">
                <li><Link to="/terms" className="text-[13px] text-white/20 hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link to="/privacy" className="text-[13px] text-white/20 hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link to="/data-deletion" className="text-[13px] text-white/20 hover:text-white transition-colors">Data Deletion</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] font-medium text-white/30 uppercase tracking-wider mb-4">Connect</h4>
              <ul className="space-y-2.5">
                <li>
                  <a href="https://www.instagram.com/viraltoby" target="_blank" rel="noopener noreferrer" className="text-[13px] text-white/20 hover:text-white transition-colors inline-flex items-center gap-1.5">
                    <PlatformIcon platform="instagram" className="w-3.5 h-3.5" /> Instagram
                  </a>
                </li>
                <li>
                  <a href="mailto:viraltobyapp@gmail.com" className="text-[13px] text-white/20 hover:text-white transition-colors inline-flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" /> Contact
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[11px] text-white/15">&copy; {new Date().getFullYear()} ViralToby. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="https://www.instagram.com/viraltoby" target="_blank" rel="noopener noreferrer" className="text-white/15 hover:text-white/50 transition-colors">
                <PlatformIcon platform="instagram" className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
