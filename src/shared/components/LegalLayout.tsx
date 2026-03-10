/**
 * Shared layout for legal pages (Terms, Privacy, Data Deletion).
 * Matches the Welcome page design: white theme, same nav, same footer.
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { X, Menu } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { PlatformIcon } from '@/shared/components/PlatformIcon'
import vaLogo from '@/assets/icons/va-logo.svg'

const FONT = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram' },
  { id: 'youtube', name: 'YouTube' },
  { id: 'tiktok', name: 'TikTok' },
  { id: 'facebook', name: 'Facebook' },
]

export function LegalLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

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
    // Navigate to welcome page section
    window.location.href = `/welcome#${id}`
  }, [])

  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ fontFamily: FONT }}>
      {/* Nav — same as Welcome */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/80 backdrop-blur-xl shadow-[0_1px_0_0_rgba(0,0,0,0.05)]' : 'bg-white/80 backdrop-blur-xl'}`}>
        <div className="max-w-[1320px] mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/welcome" className="flex items-center gap-2.5 group">
              <img src={vaLogo} alt="ViralToby" className="w-[30px] h-[30px] rounded-lg transition-transform group-hover:scale-105" />
              <span className="text-[16px] font-bold text-gray-900 tracking-tight">ViralToby</span>
            </Link>
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
                  <Link to="/login" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-[14px] font-semibold px-5 py-2.5 rounded-xl shadow-sm shadow-blue-600/25 transition-all hover:-translate-y-0.5">Get Started</Link>
                </>
              )}
            </div>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-gray-500">{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden bg-white/95 backdrop-blur-xl border-t border-gray-100 shadow-lg">
            <div className="px-5 py-4 space-y-1">
              {[{ id: 'features', l: 'Features' }, { id: 'how-it-works', l: 'How It Works' }, { id: 'pricing', l: 'Pricing' }, { id: 'faq', l: 'FAQ' }].map(n => (
                <button key={n.id} onClick={() => scrollTo(n.id)} className="block w-full text-left px-3 py-2.5 text-[14px] text-gray-600 hover:bg-gray-50 rounded-lg">{n.l}</button>
              ))}
              <div className="pt-3 flex flex-col gap-2">
                <Link to="/login" className="text-center py-2.5 text-[14px] border border-gray-200 rounded-xl">Sign In</Link>
                <Link to="/login" className="text-center py-2.5 text-[14px] font-semibold text-white bg-blue-600 rounded-xl">Get Started</Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Content */}
      <div className="pt-24 pb-16">
        {children}
      </div>

      {/* Footer — same as Welcome */}
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
                  <Link to="/welcome" className="block text-[13px] text-gray-500 hover:text-white transition-colors">Home</Link>
                  <Link to="/welcome#pricing" className="block text-[13px] text-gray-500 hover:text-white transition-colors">Pricing</Link>
                  <Link to="/welcome#faq" className="block text-[13px] text-gray-500 hover:text-white transition-colors">FAQ</Link>
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
              {PLATFORMS.map(p => (
                <PlatformIcon key={p.id} platform={p.id} className="w-4 h-4 text-gray-600 hover:text-gray-400 transition-colors" />
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
