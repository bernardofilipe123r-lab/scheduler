import { Loader2 } from 'lucide-react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
}

export function LoadingSpinner({ size = 'md', text }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }
  
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <Loader2 className={`${sizeClasses[size]} text-primary-500 animate-spin`} />
      {text && <p className="text-sm text-gray-500">{text}</p>}
    </div>
  )
}

export function FullPageLoader({ text }: { text?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <LoadingSpinner size="lg" text={text} />
    </div>
  )
}

export function CardLoader() {
  return (
    <div className="card p-8">
      <div className="flex flex-col items-center justify-center gap-4">
        <LoadingSpinner size="md" />
        <div className="space-y-2 w-full max-w-xs">
          <div className="h-4 skeleton rounded" />
          <div className="h-4 skeleton rounded w-3/4 mx-auto" />
        </div>
      </div>
    </div>
  )
}
