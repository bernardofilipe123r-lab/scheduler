export function GradientMesh({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/* Primary blob */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-30 blur-[120px]"
        style={{
          background: 'radial-gradient(circle, #3b82f6, transparent 70%)',
          top: '-10%',
          left: '20%',
          animation: 'float-blob-1 14s ease-in-out infinite',
        }}
      />
      {/* Secondary blob */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-20 blur-[120px]"
        style={{
          background: 'radial-gradient(circle, #8b5cf6, transparent 70%)',
          top: '10%',
          right: '10%',
          animation: 'float-blob-2 18s ease-in-out infinite',
        }}
      />
      {/* Tertiary blob */}
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[100px]"
        style={{
          background: 'radial-gradient(circle, #06b6d4, transparent 70%)',
          bottom: '0%',
          left: '40%',
          animation: 'float-blob-3 16s ease-in-out infinite',
        }}
      />
    </div>
  )
}
