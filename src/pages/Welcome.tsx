/**
 * Welcome / Marketing Landing Page
 * Public route: /welcome
 * Accessible to everyone. Shows "Go to Dashboard" if authenticated.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X, Check, ArrowRight, Sparkles, Calendar, BarChart3, Zap, ChevronRight } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { PlatformIcon } from '@/shared/components/PlatformIcon'
import vaLogo from '@/assets/icons/va-logo.svg'

// ─── Scroll-reveal hook ───────────────────────────────────────────────────────
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.12 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

function RevealSection({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useScrollReveal()
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

// ─── Count-up animation ───────────────────────────────────────────────────────
function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const { ref, visible } = useScrollReveal()
  useEffect(() => {
    if (!visible) return
    const duration = 1400
    const step = 16
    const steps = duration / step
    let current = 0
    const inc = to / steps
    const timer = setInterval(() => {
      current += inc
      if (current >= to) { setCount(to); clearInterval(timer) }
      else setCount(Math.floor(current))
    }, step)
    return () => clearInterval(timer)
  }, [visible, to])
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

// ─── Platform icons strip ─────────────────────────────────────────────────────
const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', color: '#E1306C' },
  { id: 'facebook',  label: 'Facebook',  color: '#1877F2' },
  { id: 'youtube',   label: 'YouTube',   color: '#FF0000' },
  { id: 'tiktok',    label: 'TikTok',    color: '#010101' },
  { id: 'threads',   label: 'Threads',   color: '#000000' },
]

// ─── Comparison table data ────────────────────────────────────────────────────
const COMPARISON_ROWS = [
  { label: 'Monthly cost',     agency: '$2,000–$5,000+', toby: 'From $0',    tobyBold: true },
  { label: 'Content per month', agency: '15–30 posts',    toby: 'Unlimited',  tobyBold: true },
  { label: 'Platforms covered', agency: '2–3',            toby: '5',          tobyBold: true },
  { label: 'Brand voice match', agency: 'Hit or miss',    toby: 'DNA-driven', tobyBold: true },
  { label: 'Response time',    agency: '24–48 hours',     toby: 'Instant',    tobyBold: true },
  { label: 'Analytics',        agency: 'Monthly report',  toby: 'Real-time',  tobyBold: true },
  { label: 'Setup time',       agency: 'Weeks',           toby: 'Minutes',    tobyBold: true },
]

// ─── Feature sections ─────────────────────────────────────────────────────────
const FEATURES = [
  {
    tag: 'Content Creation',
    heading: 'Smart Content That Sounds Like You',
    body: 'Toby learns your brand voice, topics, and visual style — then creates content that actually matches who you are. Not generic. Not robotic. Yours.',
    bullets: ['Reels & Shorts', 'Carousel posts', 'Branded visuals', 'Quality-scored before publishing'],
    icon: Sparkles,
    reversed: false,
    bg: 'bg-gradient-to-br from-[#00435c]/5 to-[#006d8f]/5',
    iconBg: 'bg-[#00435c]/10',
    iconColor: 'text-[#00435c]',
  },
  {
    tag: 'Scheduling',
    heading: 'One Calendar. Every Platform.',
    body: 'Schedule and publish across Instagram, Facebook, YouTube, TikTok, and Threads — all from one dashboard. Visual calendar, drag-to-reschedule, optimal timing built in.',
    bullets: ['Visual drag-and-drop calendar', 'Multi-platform publishing', 'Optimal posting times', 'Reschedule in one click'],
    icon: Calendar,
    reversed: true,
    bg: 'bg-gradient-to-br from-violet-50 to-indigo-50/50',
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
  },
  {
    tag: 'Analytics',
    heading: 'Know What\'s Working',
    body: 'Track performance across every brand and platform in real time. See what content drives growth and let Toby adapt its strategy automatically.',
    bullets: ['Engagement metrics', 'Follower growth tracking', 'Per-platform breakdown', 'AI-driven content insights'],
    icon: BarChart3,
    reversed: false,
    bg: 'bg-gradient-to-br from-emerald-50 to-teal-50/50',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
]

// ─── How it works steps ───────────────────────────────────────────────────────
const STEPS = [
  {
    num: '01',
    icon: '🎨',
    title: 'Define Your Brand',
    desc: 'Set your brand voice, colors, topics, and target audience. Toby learns your identity — not a template.',
  },
  {
    num: '02',
    icon: '✍️',
    title: 'AI Creates Content',
    desc: 'Toby generates drafts aligned with your Content DNA — ready to review, customize, and approve.',
  },
  {
    num: '03',
    icon: '🚀',
    title: 'Publish Everywhere',
    desc: 'Schedule and publish across all your platforms. Your strategy, your schedule, your brand — everywhere.',
  },
]

// ─── Main component ───────────────────────────────────────────────────────────
export function WelcomePage() {
  const { isAuthenticated } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // Set white overscroll background
  useEffect(() => {
    const prev = document.documentElement.style.backgroundColor
    document.documentElement.style.backgroundColor = '#ffffff'
    return () => { document.documentElement.style.backgroundColor = prev }
  }, [])

  return (
    <div className="min-h-screen bg-white text-[#111827] font-['Inter',_sans-serif]">

      {/* ── Nav ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 bg-white transition-shadow duration-300"
        style={{ borderBottom: '1px solid #f0f0f0', boxShadow: scrolled ? '0 1px 3px rgba(0,0,0,0.05)' : 'none' }}
      >
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <img src={vaLogo} alt="ViralToby" className="w-7 h-7" />
            <span className="font-['Poppins',_sans-serif] font-600 text-[15px] text-[#111827] tracking-tight">ViralToby</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-[14px] font-medium text-[#374151] hover:text-[#00435c] transition-colors">How it works</a>
            <a href="#features" className="text-[14px] font-medium text-[#374151] hover:text-[#00435c] transition-colors">Features</a>
            <a href="#pricing" className="text-[14px] font-medium text-[#374151] hover:text-[#00435c] transition-colors">Pricing</a>
          </nav>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <Link
                to="/"
                className="flex items-center gap-1.5 text-[14px] font-medium text-white bg-[#00435c] hover:bg-[#002d3f] px-5 py-2 rounded-lg transition-colors"
              >
                Dashboard <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-[14px] font-medium text-[#374151] hover:text-[#00435c] transition-colors">
                  Log in
                </Link>
                <Link
                  to="/login"
                  className="flex items-center gap-1.5 text-[14px] font-medium text-white bg-[#00435c] hover:bg-[#002d3f] px-5 py-2 rounded-lg transition-colors"
                >
                  Get started <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-[#374151] hover:bg-gray-100 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-6 py-4 flex flex-col gap-4">
            <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="text-[14px] font-medium text-[#374151]">How it works</a>
            <a href="#features" onClick={() => setMenuOpen(false)} className="text-[14px] font-medium text-[#374151]">Features</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)} className="text-[14px] font-medium text-[#374151]">Pricing</a>
            <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
              {isAuthenticated ? (
                <Link to="/" className="text-center text-[14px] font-medium text-white bg-[#00435c] px-5 py-2.5 rounded-lg">
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className="text-center text-[14px] font-medium text-[#374151] border border-gray-200 px-5 py-2.5 rounded-lg">
                    Log in
                  </Link>
                  <Link to="/login" className="text-center text-[14px] font-medium text-white bg-[#00435c] px-5 py-2.5 rounded-lg">
                    Get started free
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main>

        {/* ── Hero ── */}
        <section className="pt-32 pb-20 md:pt-40 md:pb-28 px-6 bg-gradient-to-b from-white to-[#f8fafc]">
          <div className="max-w-[1200px] mx-auto">
            <div className="grid lg:grid-cols-[55fr_45fr] gap-12 items-center">

              {/* Text */}
              <div>
                <div
                  className="inline-flex items-center gap-2 bg-[#00435c]/8 text-[#00435c] text-[12px] font-medium px-3 py-1.5 rounded-full mb-6"
                  style={{ opacity: 0, animation: 'fadeSlideUp 0.6s ease 0.1s forwards' }}
                >
                  <Zap className="w-3 h-3" />
                  AI-powered content partner
                </div>
                <h1
                  className="font-['Poppins',_sans-serif] font-bold text-[40px] md:text-[52px] leading-[1.15] tracking-tight text-[#09090b] mb-6"
                  style={{ opacity: 0, animation: 'fadeSlideUp 0.6s ease 0.2s forwards' }}
                >
                  Your AI-Powered<br />Content Team
                </h1>
                <p
                  className="text-[17px] md:text-[18px] text-[#6b7280] leading-relaxed mb-8 max-w-[480px]"
                  style={{ opacity: 0, animation: 'fadeSlideUp 0.6s ease 0.3s forwards' }}
                >
                  Create, schedule, and publish content across every platform — powered by your brand voice. Save 20+ hours a week without losing what makes your brand unique.
                </p>
                <div
                  className="flex flex-wrap gap-3 mb-8"
                  style={{ opacity: 0, animation: 'fadeSlideUp 0.6s ease 0.4s forwards' }}
                >
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 bg-[#00435c] hover:bg-[#002d3f] text-white font-medium text-[15px] px-7 py-3.5 rounded-lg transition-colors duration-150"
                  >
                    Get Started Free <ArrowRight className="w-4 h-4" />
                  </Link>
                  <a
                    href="#how-it-works"
                    className="inline-flex items-center gap-2 border border-[#00435c] text-[#00435c] hover:bg-[#00435c]/5 font-medium text-[15px] px-7 py-3.5 rounded-lg transition-colors duration-150"
                  >
                    See How It Works
                  </a>
                </div>
                <p
                  className="text-[13px] text-[#9ca3af]"
                  style={{ opacity: 0, animation: 'fadeSlideUp 0.6s ease 0.5s forwards' }}
                >
                  No credit card required · Free plan available
                </p>
              </div>

              {/* Visual */}
              <div
                className="hidden lg:flex items-center justify-center"
                style={{ opacity: 0, animation: 'fadeSlideUp 0.7s ease 0.35s forwards' }}
              >
                <div
                  className="w-full max-w-[420px] bg-white rounded-2xl p-6 relative"
                  style={{
                    boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
                    animation: 'float 3s ease-in-out infinite',
                  }}
                >
                  {/* Mock dashboard card */}
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-[#00435c] flex items-center justify-center">
                      <img src={vaLogo} alt="" className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-[#111827]">ViralToby Dashboard</p>
                      <p className="text-[10px] text-[#9ca3af]">3 brands · 5 platforms</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1 bg-emerald-50 text-emerald-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Toby active
                    </div>
                  </div>

                  {/* Mock content queue */}
                  {[
                    { platform: 'instagram', title: '5 habits that transformed my sleep...', time: 'Today 9:00 AM', status: 'scheduled' },
                    { platform: 'youtube',   title: 'How we grew 10K in 30 days (breakdown)', time: 'Today 2:00 PM', status: 'scheduled' },
                    { platform: 'tiktok',    title: 'POV: you finally have a system that works', time: 'Tomorrow 11:00 AM', status: 'draft' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          background: item.platform === 'instagram' ? '#fce4ec' : item.platform === 'youtube' ? '#ffebee' : '#f3e5f5',
                          color: item.platform === 'instagram' ? '#E1306C' : item.platform === 'youtube' ? '#FF0000' : '#9c27b0',
                        }}
                      >
                        <PlatformIcon platform={item.platform} className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-[#111827] truncate">{item.title}</p>
                        <p className="text-[10px] text-[#9ca3af]">{item.time}</p>
                      </div>
                      <span
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                        style={{
                          background: item.status === 'scheduled' ? '#e8f5e9' : '#fff3e0',
                          color: item.status === 'scheduled' ? '#2e7d32' : '#e65100',
                        }}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))}

                  {/* Platform icons at bottom */}
                  <div className="mt-4 flex items-center gap-2">
                    <p className="text-[10px] text-[#9ca3af]">Publishing to</p>
                    {PLATFORMS.map(p => (
                      <div key={p.id} className="w-5 h-5 rounded flex items-center justify-center" style={{ background: `${p.color}15`, color: p.color }}>
                        <PlatformIcon platform={p.id} className="w-3 h-3" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats strip ── */}
        <section className="py-12 bg-[#f9fafb] border-y border-gray-100">
          <div className="max-w-[1200px] mx-auto px-6">
            <p className="text-center text-[13px] font-medium text-[#9ca3af] mb-6 uppercase tracking-wide">
              Trusted by brands growing their social presence
            </p>
            <div className="flex flex-wrap justify-center gap-8 md:gap-16">
              {[
                { label: 'Posts created',     value: 12000,  suffix: '+' },
                { label: 'Platforms supported', value: 5,   suffix: '' },
                { label: 'Hours saved / brand / mo', value: 40, suffix: '+' },
              ].map(({ label, value, suffix }) => (
                <div key={label} className="text-center">
                  <p className="font-['Poppins',_sans-serif] font-bold text-[28px] text-[#00435c]">
                    <CountUp to={value} suffix={suffix} />
                  </p>
                  <p className="text-[13px] text-[#6b7280] mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how-it-works" className="py-20 md:py-28 px-6">
          <div className="max-w-[1200px] mx-auto">
            <RevealSection className="text-center mb-16">
              <p className="text-[12px] font-medium text-[#00435c] uppercase tracking-widest mb-3">How it works</p>
              <h2 className="font-['Poppins',_sans-serif] font-bold text-[32px] md:text-[38px] text-[#111827] leading-tight">
                How Toby Works For You
              </h2>
              <p className="mt-4 text-[16px] text-[#6b7280] max-w-[520px] mx-auto leading-relaxed">
                Three simple steps. You stay in control. Toby handles the heavy lifting.
              </p>
            </RevealSection>

            <div className="grid md:grid-cols-3 gap-6 relative">
              {/* Connecting dashed line on desktop */}
              <div className="hidden md:block absolute top-[52px] left-[calc(16.67%+16px)] right-[calc(16.67%+16px)] h-px border-t-2 border-dashed border-gray-200" />

              {STEPS.map(({ num, icon, title, desc }, i) => (
                <RevealSection key={num} delay={i * 100}>
                  <div className="bg-white rounded-2xl p-8 relative" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#00435c] text-white font-['Poppins',_sans-serif] font-bold text-[11px] tracking-widest mb-6 relative z-10 shadow-sm">
                      <span className="text-2xl leading-none">{icon}</span>
                    </div>
                    <div className="absolute top-8 right-8 font-['Poppins',_sans-serif] font-bold text-[48px] text-gray-50 leading-none select-none">
                      {num}
                    </div>
                    <h3 className="font-['Poppins',_sans-serif] font-semibold text-[17px] text-[#111827] mb-3">{title}</h3>
                    <p className="text-[14px] text-[#6b7280] leading-relaxed">{desc}</p>
                  </div>
                </RevealSection>
              ))}
            </div>
          </div>
        </section>

        {/* ── Feature showcase ── */}
        <section id="features" className="px-6">
          {FEATURES.map(({ tag, heading, body, bullets, icon: Icon, reversed, bg, iconBg, iconColor }, i) => (
            <div key={tag} className={`py-16 md:py-24 ${i % 2 === 1 ? 'bg-[#f9fafb]' : 'bg-white'}`}>
              <div className="max-w-[1200px] mx-auto">
                <RevealSection>
                  <div className={`grid lg:grid-cols-2 gap-12 lg:gap-20 items-center ${reversed ? 'lg:[&>*:first-child]:order-2' : ''}`}>

                    {/* Visual placeholder */}
                    <div className={`rounded-2xl ${bg} p-8 aspect-[4/3] flex items-center justify-center`} style={{ border: '1px solid rgba(0,0,0,0.04)' }}>
                      <div className="text-center">
                        <div className={`w-20 h-20 rounded-2xl ${iconBg} flex items-center justify-center mx-auto mb-4`}>
                          <Icon className={`w-10 h-10 ${iconColor}`} />
                        </div>
                        <p className="text-[13px] font-medium text-[#9ca3af]">App screenshot coming soon</p>
                      </div>
                    </div>

                    {/* Text */}
                    <div>
                      <p className="text-[11px] font-semibold text-[#00435c] uppercase tracking-widest mb-3">{tag}</p>
                      <h2 className="font-['Poppins',_sans-serif] font-bold text-[28px] md:text-[34px] text-[#111827] leading-tight mb-5">
                        {heading}
                      </h2>
                      <p className="text-[16px] text-[#6b7280] leading-relaxed mb-7">
                        {body}
                      </p>
                      <ul className="space-y-3">
                        {bullets.map(b => (
                          <li key={b} className="flex items-center gap-3 text-[14px] font-medium text-[#374151]">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                              <Check className="w-3 h-3 text-emerald-600" strokeWidth={2.5} />
                            </span>
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </RevealSection>
              </div>
            </div>
          ))}
        </section>

        {/* ── Platform strip ── */}
        <section className="py-20 px-6 bg-[#00435c]">
          <div className="max-w-[900px] mx-auto text-center">
            <RevealSection>
              <h2 className="font-['Poppins',_sans-serif] font-bold text-[28px] md:text-[34px] text-white mb-3">
                One Dashboard. Every Platform.
              </h2>
              <p className="text-[16px] text-white/60 mb-12">
                Connect any combination. Publish everywhere.
              </p>
              <div className="flex flex-wrap justify-center gap-6 md:gap-10">
                {PLATFORMS.map(({ id, label }, i) => (
                  <RevealSection key={id} delay={i * 80}>
                    <div className="group flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-2xl bg-white/10 hover:bg-white/20 transition-colors duration-200 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <PlatformIcon platform={id} className="w-8 h-8 text-white" />
                      </div>
                      <span className="text-[12px] font-medium text-white/60 group-hover:text-white/90 transition-colors">{label}</span>
                    </div>
                  </RevealSection>
                ))}
              </div>
            </RevealSection>
          </div>
        </section>

        {/* ── Comparison table ── */}
        <section id="pricing" className="py-20 md:py-28 px-6 bg-white">
          <div className="max-w-[860px] mx-auto">
            <RevealSection className="text-center mb-14">
              <p className="text-[12px] font-medium text-[#00435c] uppercase tracking-widest mb-3">Why Toby?</p>
              <h2 className="font-['Poppins',_sans-serif] font-bold text-[32px] md:text-[38px] text-[#111827]">
                Why Brands Choose Toby
              </h2>
              <p className="mt-4 text-[16px] text-[#6b7280]">
                Compare Toby to hiring an agency or virtual assistant.
              </p>
            </RevealSection>

            <RevealSection>
              <div className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 24px rgba(0,0,0,0.04)', border: '1px solid #e5e7eb' }}>
                {/* Header */}
                <div className="grid grid-cols-[2fr_1fr_1fr] bg-[#f9fafb]">
                  <div className="px-6 py-4 text-[13px] font-semibold text-[#6b7280]">Feature</div>
                  <div className="px-4 py-4 text-[13px] font-semibold text-[#6b7280] text-center border-l border-gray-200">Agency / VA</div>
                  <div className="px-4 py-4 text-[13px] font-semibold text-[#00435c] text-center border-l border-gray-200 bg-[#00435c]/[0.04]">Toby</div>
                </div>
                {/* Rows */}
                {COMPARISON_ROWS.map(({ label, agency, toby }, i) => (
                  <div key={label} className={`grid grid-cols-[2fr_1fr_1fr] ${i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}`}>
                    <div className="px-6 py-4 text-[14px] font-medium text-[#374151] border-t border-gray-100">{label}</div>
                    <div className="px-4 py-4 text-[14px] text-[#9ca3af] text-center border-t border-gray-100 border-l border-gray-100">{agency}</div>
                    <div className="px-4 py-4 text-[14px] font-semibold text-[#00435c] text-center border-t border-gray-100 border-l border-gray-100 bg-[#00435c]/[0.03]">{toby}</div>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>
        </section>

        {/* ── Testimonial ── */}
        <section className="py-20 px-6 bg-[#f9fafb]">
          <div className="max-w-[720px] mx-auto">
            <RevealSection>
              <div className="bg-white rounded-2xl p-10 md:p-14 text-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 24px rgba(0,0,0,0.04)' }}>
                <div className="text-3xl mb-6 select-none">"</div>
                <p className="font-['Poppins',_sans-serif] font-medium text-[18px] md:text-[20px] text-[#111827] leading-relaxed italic mb-8">
                  Toby handles our content across multiple brands and platforms. We went from spending 20+ hours a week on content to under 2 — without losing our brand voice.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#00435c]/10 flex items-center justify-center text-[#00435c] font-bold text-[14px]">F</div>
                  <div className="text-left">
                    <p className="text-[13px] font-semibold text-[#111827]">Early adopter</p>
                    <p className="text-[12px] text-[#9ca3af]">Multi-brand creator</p>
                  </div>
                </div>
                <div className="mt-6 flex justify-center gap-2">
                  {['90K followers gained', '3 brands managed', '5 platforms'].map(badge => (
                    <span key={badge} className="text-[11px] font-medium text-[#00435c] bg-[#00435c]/8 px-2.5 py-1 rounded-full">
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            </RevealSection>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="py-20 md:py-28 px-6 bg-gradient-to-br from-[#00435c] to-[#006d8f]">
          <div className="max-w-[640px] mx-auto text-center">
            <RevealSection>
              <h2 className="font-['Poppins',_sans-serif] font-bold text-[32px] md:text-[40px] text-white leading-tight mb-5">
                Ready to Grow Your Brand?
              </h2>
              <p className="text-[16px] text-white/70 mb-10 leading-relaxed">
                Start creating content in minutes, not hours. Set your brand voice — Toby does the rest.
              </p>
              {isAuthenticated ? (
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 bg-white text-[#00435c] hover:bg-gray-50 font-semibold text-[16px] px-10 py-4 rounded-xl transition-colors duration-150"
                >
                  Go to Dashboard <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 bg-white text-[#00435c] hover:bg-gray-50 font-semibold text-[16px] px-10 py-4 rounded-xl transition-colors duration-150"
                >
                  Get Started Free <ArrowRight className="w-4 h-4" />
                </Link>
              )}
              <p className="mt-5 text-[13px] text-white/40">
                No credit card required · Free plan available
              </p>
            </RevealSection>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-[#111827] px-6 pt-14 pb-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <img src={vaLogo} alt="ViralToby" className="w-6 h-6 opacity-80" />
                <span className="font-['Poppins',_sans-serif] font-semibold text-[14px] text-white/80">ViralToby</span>
              </div>
              <p className="text-[13px] text-[#6b7280] leading-relaxed max-w-[200px]">
                AI-powered content for growing brands.
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="text-[12px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-4">Product</p>
              <ul className="space-y-2.5">
                {['Features', 'Pricing', 'Log in'].map(link => (
                  <li key={link}>
                    <Link to="/login" className="text-[13px] text-[#6b7280] hover:text-white transition-colors">{link}</Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <p className="text-[12px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-4">Legal</p>
              <ul className="space-y-2.5">
                <li><Link to="/terms" className="text-[13px] text-[#6b7280] hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link to="/privacy" className="text-[13px] text-[#6b7280] hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link to="/data-deletion" className="text-[13px] text-[#6b7280] hover:text-white transition-colors">Data Deletion</Link></li>
              </ul>
            </div>

            {/* Connect */}
            <div>
              <p className="text-[12px] font-semibold text-[#9ca3af] uppercase tracking-widest mb-4">Connect</p>
              <ul className="space-y-2.5">
                <li><a href="mailto:hello@viraltoby.com" className="text-[13px] text-[#6b7280] hover:text-white transition-colors">hello@viraltoby.com</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/[0.06] pt-8 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-[12px] text-[#4b5563]">
              © 2026 ViralToby. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              {PLATFORMS.map(({ id }) => (
                <div key={id} className="text-[#4b5563] hover:text-[#9ca3af] transition-colors cursor-default">
                  <PlatformIcon platform={id} className="w-4 h-4" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* ── CSS animations ── */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  )
}
