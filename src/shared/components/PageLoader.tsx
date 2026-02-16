type PageTheme = 'ai-team' | 'videos' | 'posts' | 'calendar' | 'analytics' | 'brands' | 'jobs' | 'connections' | 'default'

const themes: Record<PageTheme, { emoji: string; message: string; accents: string[] }> = {
  'ai-team':     { emoji: '🤖', message: 'Agents are thinking',      accents: ['🧠', '⚡', '💭'] },
  'videos':      { emoji: '🎬', message: 'Rolling the cameras',      accents: ['🎥', '🎞️', '🎬'] },
  'posts':       { emoji: '📝', message: 'Crafting content',         accents: ['✏️', '💡', '📄'] },
  'calendar':    { emoji: '📅', message: 'Checking your calendar',   accents: ['🗓️', '⏰', '📆'] },
  'analytics':   { emoji: '📊', message: 'Crunching numbers',        accents: ['📈', '🔢', '📉'] },
  'brands':      { emoji: '🎨', message: 'Loading your brands',      accents: ['🖌️', '🌈', '✨'] },
  'jobs':        { emoji: '⚙️', message: 'Processing jobs',          accents: ['🔧', '🛠️', '⚡'] },
  'connections': { emoji: '🔗', message: 'Loading connections',      accents: ['🌐', '📡', '🤝'] },
  'default':     { emoji: '✨', message: 'Loading',                  accents: ['💫', '⭐', '🌟'] },
}

interface PageLoaderProps {
  page?: PageTheme
}

export function PageLoader({ page = 'default' }: PageLoaderProps) {
  const theme = themes[page] || themes.default

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        {/* Floating accent emojis */}
        <div className="flex gap-6 text-xl opacity-40">
          {theme.accents.map((a, i) => (
            <span
              key={i}
              className="animate-bounce"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: '1.2s' }}
            >
              {a}
            </span>
          ))}
        </div>

        {/* Main emoji */}
        <span className="text-5xl animate-pulse">{theme.emoji}</span>

        {/* Message with animated dots */}
        <p className="text-sm text-gray-500 flex items-center gap-0.5">
          {theme.message}
          <span className="inline-flex w-6">
            <span className="animate-bounce" style={{ animationDelay: '0s' }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>.</span>
          </span>
        </p>
      </div>
    </div>
  )
}
