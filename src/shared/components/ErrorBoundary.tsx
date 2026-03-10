import React from 'react'

interface State {
  hasError: boolean
}

/**
 * Catches React render errors (like removeChild DOM crashes) and shows
 * a recovery UI instead of a blank page.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorPage />
    }
    return this.props.children
  }
}

function ErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a14] text-white relative overflow-hidden">
      {/* Subtle animated gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />

      <div className="text-center space-y-6 px-6 relative z-10 max-w-md">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-white/5 flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Something went wrong</h2>
          <p className="text-gray-400 text-[15px] leading-relaxed">
            An unexpected error occurred. This has been logged and we're looking into it.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-medium transition-all shadow-lg shadow-blue-600/20 hover:-translate-y-0.5"
          >
            Refresh Page
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm font-medium transition-all hover:-translate-y-0.5"
          >
            Go Home
          </button>
        </div>

        <p className="text-gray-600 text-xs pt-4">ViralToby</p>
      </div>
    </div>
  )
}

export { ErrorPage }
