/**
 * Welcome / Landing Page — viraltoby.com/welcome
 * Design: Ocoya-inspired — minimalist, centered, warm neutrals, Inter font,
 * frosted glass nav, smooth framer-motion reveals, generous whitespace.
 * Platform-safe copy: frames AI as content partner, emphasizes human control.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, Calendar, BarChart3, Palette,
  Sparkles, ChevronDown, Layers, Send,
  CheckCircle2, X, Menu, Shield, Zap, Target,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { PlatformIcon } from '@/shared/components/PlatformIcon'
import vaLogo from '@/assets/icons/va-logo.svg'

/* ─── Scroll reveal ─── */
function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ─── Animated counter ─── */
function Counter({ end, suffix = '', prefix = '' }: { end: number; suffix?: string; prefix?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isInView) return
    const duration = 2000
    const startTime = performance.now()
    const ease = (t: number) => 1 - Math.pow(1 - t, 4)
    function animate(now: number) {
      const progress = Math.min((now - startTime) / duration, 1)
      setCount(Math.round(ease(progress) * end))
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [isInView, end])

  return <span ref={ref}>{prefix}{count}{suffix}</span>
}

/* ─── FAQ Item ─── */
function FaqItem({ question, answer, defaultOpen = false }: { question: string; answer: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-zinc-200/60 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 sm:py-6 text-left group"
      >
        <span className="text-[15px] sm:text-[17px] font-medium text-zinc-900 pr-8 group-hover:text-zinc-600 transition-colors">{question}</span>
        <ChevronDown className={`w-5 h-5 text-zinc-400 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="pb-6 text-[14px] sm:text-[15px] text-zinc-500 leading-[1.7]">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Dashboard mockup (hero visual) ─── */
function DashboardMockup() {
  return (
    <div className="relative w-full max-w-[720px] mx-auto">
      <div className="rounded-[20px] overflow-hidden border border-zinc-200/80" style={{ boxShadow: '0 20px 60px -15px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.02)' }}>
        {/* Browser bar */}
        <div className="bg-zinc-100/80 px-4 py-2.5 flex items-center gap-2 border-b border-zinc-200/60">
          <div className="flex gap-1.5">
            <div className="w-[10px] h-[10px] rounded-full bg-[#ec6a5e]" />
            <div className="w-[10px] h-[10px] rounded-full bg-[#f4bf4f]" />
            <div className="w-[10px] h-[10px] rounded-full bg-[#61c554]" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="bg-white rounded-md px-6 py-1 text-[11px] text-zinc-400 border border-zinc-200/60 w-52 text-center font-mono">viraltoby.com</div>
          </div>
        </div>

        {/* Dashboard content */}
        <div className="bg-[#f9fafb] p-5 sm:p-6">
          <div className="flex gap-4">
            {/* Mini sidebar */}
            <div className="hidden sm:flex flex-col gap-2 w-10">
              <div className="w-8 h-8 rounded-lg bg-[#F5EDD8] flex items-center justify-center mb-2">
                <img src={vaLogo} alt="" className="w-5 h-5" />
              </div>
              {[...Array(5)].map((_, i) => (
                <div key={i} className={`w-8 h-8 rounded-lg ${i === 0 ? 'bg-zinc-800' : 'bg-zinc-200/60'}`} />
              ))}
            </div>

            {/* Main content */}
            <div className="flex-1 space-y-3">
              {/* Stat row */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Scheduled', value: '24', color: '#3b82f6' },
                  { label: 'Published', value: '156', color: '#10b981' },
                  { label: 'Engagement', value: '8.2%', color: '#8b5cf6' },
                ].map((s) => (
                  <div key={s.label} className="bg-white rounded-xl p-3 border border-zinc-100">
                    <div className="w-2 h-2 rounded-full mb-2" style={{ backgroundColor: s.color }} />
                    <div className="text-[15px] font-bold text-zinc-900">{s.value}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Schedule preview */}
              <div className="bg-white rounded-xl p-3 border border-zinc-100">
                <div className="text-[11px] font-medium text-zinc-500 mb-2">Today's Schedule</div>
                <div className="space-y-1.5">
                  {[
                    { time: '09:00', platform: 'Instagram', color: 'bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045]' },
                    { time: '12:00', platform: 'YouTube', color: 'bg-[#ff0000]' },
                    { time: '15:00', platform: 'TikTok', color: 'bg-zinc-900' },
                    { time: '18:00', platform: 'Facebook', color: 'bg-[#1877F2]' },
                  ].map((item) => (
                    <div key={item.time} className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-400 w-9 font-mono flex-shrink-0">{item.time}</span>
                      <div className={`${item.color} h-7 rounded-lg flex-1 flex items-center px-2.5`}>
                        <span className="text-[10px] text-white font-medium">{item.platform}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════  DATA  ═══════════════════════════ */

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'facebook',  name: 'Facebook' },
  { id: 'youtube',   name: 'YouTube' },
  { id: 'tiktok',    name: 'TikTok' },
  { id: 'threads',   name: 'Threads' },
]

const FAQS = [
  {
    question: 'How does Toby create content for my brand?',
    answer: 'You define your brand\'s Content DNA — niche, tone, target audience, topic categories, and visual style. Toby uses this as the foundation for every piece of content, ensuring everything stays on-brand and aligned with your voice.',
  },
  {
    question: 'Do I need to approve content before it goes live?',
    answer: 'You\'re always in control. Content is generated based on your brand rules and quality-scored across 5 dimensions before reaching your schedule. You can review, edit, reschedule, or regenerate anything at any time.',
  },
  {
    question: 'Which platforms are supported?',
    answer: 'ViralToby supports Instagram (Reels & Posts), Facebook (Reels & Posts), YouTube Shorts, TikTok, and Threads. Connect any combination of platforms per brand — publish everywhere from one dashboard.',
  },
  {
    question: 'Can I manage multiple brands?',
    answer: 'Yes. ViralToby is built for multi-brand management. Each brand has its own Content DNA, connected platforms, color scheme, and publishing schedule. Add as many brands as you need.',
  },
  {
    question: 'What kind of content does it create?',
    answer: 'Short-form video content (Reels, Shorts, TikToks) with text overlays and branded visuals, plus carousel posts with auto-fit typography. All visuals match your brand colors and style automatically.',
  },
  {
    question: 'How is this different from Hootsuite or Buffer?',
    answer: 'Traditional tools require you to create content yourself — they only handle posting. ViralToby handles the entire pipeline: content creation, quality scoring, scheduling, and publishing. It\'s like having a content team, not just a calendar.',
  },
]

const COMPARISON_ROWS = [
  { label: 'Monthly cost',     agency: '$2K — $5K+',  toby: '$50 / brand' },
  { label: 'Content / month',  agency: '15 — 30',     toby: 'Unlimited' },
  { label: 'Platforms',        agency: '2 — 3',       toby: 'All 5' },
  { label: 'Brand voice',      agency: 'Hit or miss',  toby: 'DNA-driven' },
  { label: 'Turnaround',       agency: '24 — 48h',    toby: 'Minutes' },
  { label: 'Analytics',        agency: 'Monthly PDF',  toby: 'Real-time' },
  { label: 'Setup time',       agency: 'Weeks',        toby: '5 minutes' },
]


/* ═══════════════════════════════════════  WELCOME PAGE  ══════════════════════ */

export function WelcomePage() {
  const { isAuthenticated } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const prev = document.documentElement.style.backgroundColor
    document.documentElement.style.backgroundColor = '#fafafa'
    document.body.style.background = '#fafafa'
    return () => {
      document.documentElement.style.backgroundColor = prev
      document.body.style.background = ''
    }
  }, [])

  const scrollTo = useCallback((id: string) => {
    setMobileMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const ctaLink = isAuthenticated ? '/' : '/login'
  const ctaLabel = isAuthenticated ? 'Go to Dashboard' : 'Get Started'

  return (
    <div className="min-h-screen bg-[#fafafa]" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* ═══ NAV ═══ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-white/70 backdrop-blur-2xl border-b border-zinc-200/40'
          : 'bg-transparent'
      }`}>
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between h-[60px]">
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5 group">
              <img src={vaLogo} alt="ViralToby" className="w-[30px] h-[30px] rounded-[8px] transition-transform duration-200 group-hover:scale-105" />
              <span className="text-[15px] font-semibold text-zinc-900 tracking-[-0.01em]">ViralToby</span>
            </button>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-8">
              {['features', 'how-it-works', 'pricing', 'faq'].map((id) => (
                <button key={id} onClick={() => scrollTo(id)} className="text-[13px] text-zinc-500 hover:text-zinc-900 transition-colors duration-200 capitalize">
                  {id === 'how-it-works' ? 'How It Works' : id === 'faq' ? 'FAQ' : id.charAt(0).toUpperCase() + id.slice(1)}
                </button>
              ))}
            </div>

            {/* Desktop CTAs */}
            <div className="hidden md:flex items-center gap-3">
              {isAuthenticated ? (
                <Link to="/" className="bg-zinc-900 hover:bg-zinc-800 text-white text-[13px] font-medium px-5 py-2 rounded-full transition-all duration-200 hover:shadow-sm">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className="text-[13px] font-medium text-zinc-600 hover:text-zinc-900 transition-colors px-4 py-2">
                    Sign In
                  </Link>
                  <Link to="/login" className="bg-zinc-900 hover:bg-zinc-800 text-white text-[13px] font-medium px-5 py-2 rounded-full transition-all duration-200 hover:shadow-sm">
                    Get Started
                  </Link>
                </>
              )}
            </div>

            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 transition-colors">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="md:hidden bg-white/90 backdrop-blur-xl border-t border-zinc-200/40 overflow-hidden"
            >
              <div className="px-5 py-4 space-y-1">
                {['features', 'how-it-works', 'pricing', 'faq'].map((id) => (
                  <button key={id} onClick={() => scrollTo(id)} className="block w-full text-left px-3 py-2.5 text-[14px] text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 rounded-lg transition-colors capitalize">
                    {id === 'how-it-works' ? 'How It Works' : id === 'faq' ? 'FAQ' : id.charAt(0).toUpperCase() + id.slice(1)}
                  </button>
                ))}
                <div className="pt-3 space-y-2">
                  {isAuthenticated ? (
                    <Link to="/" className="block w-full text-center px-4 py-2.5 text-[13px] font-medium text-white bg-zinc-900 rounded-full">Dashboard</Link>
                  ) : (
                    <>
                      <Link to="/login" className="block w-full text-center px-4 py-2.5 text-[13px] font-medium text-zinc-600 border border-zinc-200 rounded-full">Sign In</Link>
                      <Link to="/login" className="block w-full text-center px-4 py-2.5 text-[13px] font-medium text-white bg-zinc-900 rounded-full">Get Started</Link>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>


      {/* ═══ HERO ═══ */}
      <section className="relative pt-32 sm:pt-40 pb-8 sm:pb-12 px-5 sm:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#f4f4f5] via-[#fafafa] to-[#fafafa]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-[#00435c]/[0.04] to-transparent rounded-full blur-3xl" />

        <div className="relative max-w-[1200px] mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-100 border border-zinc-200/60 mb-8">
              <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-[12px] font-medium text-zinc-600 tracking-wide">Content creation. Powered by AI.</span>
            </div>

            <h1 className="text-[36px] sm:text-[48px] lg:text-[60px] font-bold text-zinc-900 leading-[1.08] tracking-[-0.025em] max-w-[800px] mx-auto">
              Create, schedule,<br className="hidden sm:block" /> and publish — <span className="text-[#00435c]">automatically</span>.
            </h1>

            <p className="mt-5 sm:mt-6 text-[16px] sm:text-[18px] text-zinc-500 leading-[1.6] max-w-[520px] mx-auto">
              Define your brand voice. Toby creates content that sounds like you,
              schedules it, and publishes across every platform.
            </p>

            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to={ctaLink} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white text-[14px] font-medium px-7 py-3 rounded-full transition-all duration-200 hover:shadow-md">
                {ctaLabel}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button onClick={() => scrollTo('how-it-works')} className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-zinc-600 hover:text-zinc-900 text-[14px] font-medium px-7 py-3 rounded-full border border-zinc-200 hover:border-zinc-300 hover:bg-white transition-all duration-200">
                See How It Works
              </button>
            </div>

            <p className="mt-4 text-[12px] text-zinc-400">No credit card required</p>
          </motion.div>
        </div>
      </section>


      {/* ═══ HERO VISUAL ═══ */}
      <section className="pb-16 sm:pb-24 px-5 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[900px] mx-auto"
        >
          <DashboardMockup />
        </motion.div>
      </section>


      {/* ═══ PLATFORM STRIP ═══ */}
      <section className="py-12 sm:py-16 px-5 sm:px-8 border-y border-zinc-200/40">
        <div className="max-w-[1200px] mx-auto">
          <Reveal>
            <p className="text-center text-[13px] text-zinc-400 mb-8 tracking-wide">Publish across every platform</p>
            <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-14">
              {PLATFORMS.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-zinc-400 hover:text-zinc-700 transition-colors duration-300 group">
                  <PlatformIcon platform={p.id} className="w-5 h-5" />
                  <span className="text-[13px] font-medium">{p.name}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>


      {/* ═══ STATS ═══ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-[1000px] mx-auto">
          <Reveal>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-8">
              {[
                { value: 99, suffix: '%', label: 'Lower cost vs. agencies', desc: 'Agency-level content for a fraction of the price.' },
                { value: 40, suffix: '+', label: 'Hours saved monthly', desc: 'Per brand, compared to manual creation.' },
                { value: 5, suffix: '', label: 'Platforms supported', desc: 'Instagram, Facebook, YouTube, TikTok, Threads.' },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="text-[44px] sm:text-[52px] font-bold text-zinc-900 tracking-[-0.03em] leading-none">
                    <Counter end={stat.value} suffix={stat.suffix} />
                  </div>
                  <div className="mt-2 text-[14px] font-semibold text-zinc-700">{stat.label}</div>
                  <div className="mt-1 text-[13px] text-zinc-400">{stat.desc}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>


      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how-it-works" className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-[1000px] mx-auto">
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-[13px] font-medium text-[#00435c] tracking-wide uppercase mb-3">How it works</p>
              <h2 className="text-[28px] sm:text-[40px] font-bold text-zinc-900 tracking-[-0.02em]">Up and running in minutes.</h2>
              <p className="mt-3 text-[16px] text-zinc-500 max-w-[460px] mx-auto leading-relaxed">Three steps to turn your brand identity into a content engine.</p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-3 gap-5 sm:gap-6">
            {[
              { step: '01', icon: Palette, title: 'Define your brand', desc: 'Set your niche, tone, audience, topics, and visual style. This becomes your Content DNA.', time: '5 min' },
              { step: '02', icon: Sparkles, title: 'AI creates content', desc: 'Toby generates branded reels, shorts, carousels, and posts — all quality-scored before they reach your calendar.', time: 'Instant' },
              { step: '03', icon: Send, title: 'Review and publish', desc: 'Content lands on your calendar. Review, tweak if you want, and publish across all platforms.', time: 'Ongoing' },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="relative p-6 sm:p-8 rounded-[20px] border border-zinc-200/60 bg-white hover:border-zinc-300/60 transition-all duration-300 h-full group">
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-10 h-10 rounded-[12px] bg-zinc-100 flex items-center justify-center group-hover:bg-[#00435c]/[0.06] transition-colors duration-300">
                      <item.icon className="w-[18px] h-[18px] text-zinc-500 group-hover:text-[#00435c] transition-colors duration-300" />
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400">{item.time}</span>
                  </div>
                  <h3 className="text-[17px] font-semibold text-zinc-900 mb-2">{item.title}</h3>
                  <p className="text-[14px] text-zinc-500 leading-[1.6]">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* ═══ FEATURES ═══ */}
      <section id="features" className="py-20 sm:py-28 px-5 sm:px-8 bg-white">
        <div className="max-w-[1000px] mx-auto">
          <Reveal>
            <div className="text-center mb-16 sm:mb-20">
              <p className="text-[13px] font-medium text-[#00435c] tracking-wide uppercase mb-3">Features</p>
              <h2 className="text-[28px] sm:text-[40px] font-bold text-zinc-900 tracking-[-0.02em]">Everything you need to grow.</h2>
            </div>
          </Reveal>

          <div className="space-y-16 sm:space-y-24">

            {/* Feature 1: Content Creation */}
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              <Reveal className="order-2 lg:order-1">
                <div className="rounded-[20px] border border-zinc-200/60 bg-[#fafafa] p-5 sm:p-6">
                  <div className="space-y-2.5">
                    {[
                      { title: 'The secret behind consistent brands', platform: 'Instagram Reel', score: 92, color: 'bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045]' },
                      { title: 'Why most content strategies fail', platform: 'YouTube Short', score: 88, color: 'bg-[#ff0000]' },
                      { title: '3 things your audience actually wants', platform: 'TikTok', score: 85, color: 'bg-zinc-900' },
                    ].map((c) => (
                      <div key={c.title} className="flex items-center gap-3 p-3 rounded-[14px] bg-white border border-zinc-100">
                        <div className={`w-9 h-9 ${c.color} rounded-[10px] flex-shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-zinc-800 truncate">{c.title}</div>
                          <div className="text-[11px] text-zinc-400">{c.platform}</div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="text-[12px] font-semibold text-emerald-600">{c.score}</div>
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>

              <Reveal className="order-1 lg:order-2" delay={0.1}>
                <div>
                  <div className="w-9 h-9 rounded-[10px] bg-zinc-100 flex items-center justify-center mb-5">
                    <Layers className="w-[18px] h-[18px] text-zinc-500" />
                  </div>
                  <h3 className="text-[22px] sm:text-[28px] font-bold text-zinc-900 tracking-[-0.02em] leading-tight">Content that sounds like you.</h3>
                  <p className="mt-3 text-[15px] text-zinc-500 leading-[1.7]">Every piece of content is shaped by your Content DNA — your brand identity. Quality-scored across 5 dimensions before it reaches your calendar.</p>
                  <ul className="mt-5 space-y-2.5">
                    {['Reels, Shorts & TikToks', 'Carousel posts', 'Branded visuals', 'Quality scoring'].map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-[14px] text-zinc-600">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>

            {/* Feature 2: Scheduling */}
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              <Reveal delay={0.1}>
                <div>
                  <div className="w-9 h-9 rounded-[10px] bg-zinc-100 flex items-center justify-center mb-5">
                    <Calendar className="w-[18px] h-[18px] text-zinc-500" />
                  </div>
                  <h3 className="text-[22px] sm:text-[28px] font-bold text-zinc-900 tracking-[-0.02em] leading-tight">One calendar. Every platform.</h3>
                  <p className="mt-3 text-[15px] text-zinc-500 leading-[1.7]">Visualize your entire content pipeline. Drag to reschedule, click to edit, publish everywhere with one tap.</p>
                  <ul className="mt-5 space-y-2.5">
                    {['Week & month views', 'Drag-and-drop', 'Multi-platform publishing', 'Smart scheduling'].map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-[14px] text-zinc-600">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>

              <Reveal>
                <div className="rounded-[20px] border border-zinc-200/60 bg-[#fafafa] p-5 sm:p-6">
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                      <div key={d} className="text-[10px] font-medium text-zinc-400 text-center py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 28 }, (_, i) => {
                      const hasContent = [2, 4, 7, 9, 11, 14, 16, 18, 21, 23, 25].includes(i)
                      const colors = ['bg-pink-400', 'bg-red-400', 'bg-blue-500', 'bg-zinc-800', 'bg-purple-500']
                      return (
                        <div key={i} className="aspect-square rounded-[8px] bg-white border border-zinc-100 flex flex-col items-center justify-center gap-0.5 p-0.5">
                          <span className="text-[10px] text-zinc-400">{i + 1}</span>
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
                </div>
              </Reveal>
            </div>

            {/* Feature 3: Analytics */}
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              <Reveal className="order-2 lg:order-1">
                <div className="rounded-[20px] border border-zinc-200/60 bg-[#fafafa] p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[12px] font-medium text-zinc-600">Growth</div>
                    <div className="text-[11px] text-zinc-400">Last 30 days</div>
                  </div>
                  <div className="flex items-end gap-[3px] h-28 mb-4">
                    {[30, 42, 28, 55, 48, 62, 38, 72, 65, 85, 70, 90, 78, 95, 88].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-[3px] bg-[#00435c] transition-all" style={{ height: `${h}%`, opacity: 0.25 + (h / 100) * 0.75 }} />
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Followers', value: '+1,247', trend: '+12%' },
                      { label: 'Engagement', value: '8.2%', trend: '+3.1%' },
                      { label: 'Views', value: '48.5K', trend: '+28%' },
                    ].map((s) => (
                      <div key={s.label} className="text-center bg-white rounded-[10px] py-2 px-1 border border-zinc-100">
                        <div className="text-[13px] font-bold text-zinc-900">{s.value}</div>
                        <div className="text-[10px] text-emerald-600 font-medium">{s.trend}</div>
                        <div className="text-[10px] text-zinc-400">{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>

              <Reveal className="order-1 lg:order-2" delay={0.1}>
                <div>
                  <div className="w-9 h-9 rounded-[10px] bg-zinc-100 flex items-center justify-center mb-5">
                    <BarChart3 className="w-[18px] h-[18px] text-zinc-500" />
                  </div>
                  <h3 className="text-[22px] sm:text-[28px] font-bold text-zinc-900 tracking-[-0.02em] leading-tight">Know what's working.</h3>
                  <p className="mt-3 text-[15px] text-zinc-500 leading-[1.7]">Track followers, engagement, and views across every platform. Real-time insights that help you grow.</p>
                  <ul className="mt-5 space-y-2.5">
                    {['Real-time metrics', 'Per-platform breakdown', 'Growth trends', 'Content insights'].map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-[14px] text-zinc-600">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>


      {/* ═══ CONTROL SECTION ═══ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-[1000px] mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="text-[28px] sm:text-[40px] font-bold text-zinc-900 tracking-[-0.02em]">Complete control. Full customization.</h2>
              <p className="mt-3 text-[16px] text-zinc-500 max-w-[480px] mx-auto leading-relaxed">Built to power your creativity, not replace it.</p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { icon: Shield, title: 'Your rules, always', desc: 'Every piece of content follows your brand guidelines. Tone, topics, audience, visuals — nothing goes out without your approval.' },
              { icon: Target, title: 'Content your way', desc: 'Control captions, visuals, cadence, and platform preferences. Customize everything per brand.' },
              { icon: Zap, title: 'Quality scoring', desc: 'Content is scored across 5 dimensions. Only content that meets your quality threshold gets published.' },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="p-6 sm:p-8 rounded-[20px] border border-zinc-200/60 bg-white hover:border-zinc-300/60 transition-all duration-300 h-full">
                  <div className="w-9 h-9 rounded-[10px] bg-zinc-100 flex items-center justify-center mb-5">
                    <item.icon className="w-[18px] h-[18px] text-zinc-500" />
                  </div>
                  <h3 className="text-[16px] font-semibold text-zinc-900 mb-2">{item.title}</h3>
                  <p className="text-[14px] text-zinc-500 leading-[1.6]">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* ═══ PRICING COMPARISON ═══ */}
      <section id="pricing" className="py-20 sm:py-28 px-5 sm:px-8 bg-white">
        <div className="max-w-[800px] mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-[13px] font-medium text-[#00435c] tracking-wide uppercase mb-3">Pricing</p>
              <h2 className="text-[28px] sm:text-[40px] font-bold text-zinc-900 tracking-[-0.02em]">Why brands choose Toby.</h2>
              <p className="mt-3 text-[16px] text-zinc-500 max-w-[440px] mx-auto">Agency-level content creation for a fraction of the cost.</p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-[20px] border border-zinc-200/60 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-zinc-50/80">
                    <th className="text-left py-4 px-5 sm:px-6 text-[12px] font-medium text-zinc-400 uppercase tracking-wider"></th>
                    <th className="text-center py-4 px-4 sm:px-6 text-[12px] font-medium text-zinc-400 uppercase tracking-wider">Agency / VA</th>
                    <th className="text-center py-4 px-4 sm:px-6 text-[12px] font-semibold text-[#00435c] uppercase tracking-wider bg-[#00435c]/[0.03]">Toby</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, i) => (
                    <tr key={row.label} className={i < COMPARISON_ROWS.length - 1 ? 'border-t border-zinc-100' : 'border-t border-zinc-100'}>
                      <td className="py-3.5 px-5 sm:px-6 text-[14px] font-medium text-zinc-700">{row.label}</td>
                      <td className="py-3.5 px-4 sm:px-6 text-[14px] text-zinc-400 text-center">{row.agency}</td>
                      <td className="py-3.5 px-4 sm:px-6 text-[14px] font-semibold text-zinc-900 text-center bg-[#00435c]/[0.02]">{row.toby}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div className="mt-10 text-center">
              <Link to={ctaLink} className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white text-[14px] font-medium px-8 py-3 rounded-full transition-all duration-200 hover:shadow-md">
                {ctaLabel}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="mt-3 text-[13px] text-zinc-400">$50/month per brand. Cancel anytime.</p>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ═══ FAQ ═══ */}
      <section id="faq" className="py-20 sm:py-28 px-5 sm:px-8">
        <div className="max-w-[640px] mx-auto">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="text-[28px] sm:text-[36px] font-bold text-zinc-900 tracking-[-0.02em]">Questions & answers</h2>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div>
              {FAQS.map((faq, i) => (
                <FaqItem key={i} question={faq.question} answer={faq.answer} defaultOpen={i === 0} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>


      {/* ═══ FINAL CTA ═══ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8 bg-white">
        <div className="max-w-[600px] mx-auto text-center">
          <Reveal>
            <h2 className="text-[28px] sm:text-[44px] font-bold text-zinc-900 tracking-[-0.02em] leading-tight">
              Ready to grow<br className="hidden sm:block" /> your brand?
            </h2>
            <p className="mt-4 text-[16px] sm:text-[18px] text-zinc-500 leading-relaxed max-w-[400px] mx-auto">Start creating content in minutes, not hours.</p>
            <div className="mt-8">
              <Link to={ctaLink} className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white text-[15px] font-medium px-10 py-3.5 rounded-full transition-all duration-200 hover:shadow-md">
                {ctaLabel}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <p className="mt-4 text-[12px] text-zinc-400">No credit card required. Set up in 5 minutes.</p>
          </Reveal>
        </div>
      </section>


      {/* ═══ FOOTER ═══ */}
      <footer className="bg-zinc-950 text-zinc-400 pt-14 pb-8 px-5 sm:px-8">
        <div className="max-w-[1000px] mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 pb-10 border-b border-zinc-800/60">
            {/* Brand */}
            <div className="col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <img src={vaLogo} alt="ViralToby" className="w-7 h-7 rounded-[6px]" />
                <span className="text-[14px] font-semibold text-white tracking-tight">ViralToby</span>
              </div>
              <p className="text-[13px] text-zinc-500 leading-relaxed">AI-powered content creation<br />for growing brands.</p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-4">Product</h4>
              <ul className="space-y-2">
                <li><button onClick={() => scrollTo('features')} className="text-[13px] text-zinc-500 hover:text-white transition-colors">Features</button></li>
                <li><button onClick={() => scrollTo('pricing')} className="text-[13px] text-zinc-500 hover:text-white transition-colors">Pricing</button></li>
                <li><button onClick={() => scrollTo('faq')} className="text-[13px] text-zinc-500 hover:text-white transition-colors">FAQ</button></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-4">Legal</h4>
              <ul className="space-y-2">
                <li><Link to="/terms" className="text-[13px] text-zinc-500 hover:text-white transition-colors">Terms</Link></li>
                <li><Link to="/privacy" className="text-[13px] text-zinc-500 hover:text-white transition-colors">Privacy</Link></li>
                <li><Link to="/data-deletion" className="text-[13px] text-zinc-500 hover:text-white transition-colors">Data Deletion</Link></li>
              </ul>
            </div>

            {/* Connect */}
            <div>
              <h4 className="text-[12px] font-medium text-zinc-400 uppercase tracking-wider mb-4">Connect</h4>
              <ul className="space-y-2">
                <li>
                  <a href="https://www.instagram.com/viraltoby" target="_blank" rel="noopener noreferrer" className="text-[13px] text-zinc-500 hover:text-white transition-colors inline-flex items-center gap-1.5">
                    <PlatformIcon platform="instagram" className="w-3.5 h-3.5" /> Instagram
                  </a>
                </li>
                <li>
                  <a href="mailto:viraltobyapp@gmail.com" className="text-[13px] text-zinc-500 hover:text-white transition-colors inline-flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" /> Contact
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[11px] text-zinc-600">&copy; {new Date().getFullYear()} ViralToby. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="https://www.instagram.com/viraltoby" target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-white transition-colors">
                <PlatformIcon platform="instagram" className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
