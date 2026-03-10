import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a14] text-white relative overflow-hidden">
      {/* Subtle animated gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />

      <div className="text-center space-y-6 px-6 relative z-10 max-w-md">
        {/* 404 number */}
        <div className="text-8xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent select-none">
          404
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Page not found</h2>
          <p className="text-gray-400 text-[15px] leading-relaxed">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/"
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-medium transition-all shadow-lg shadow-blue-600/20 hover:-translate-y-0.5"
          >
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm font-medium transition-all hover:-translate-y-0.5"
          >
            Go Back
          </button>
        </div>

        <p className="text-gray-600 text-xs pt-4">ViralToby</p>
      </div>
    </div>
  )
}
