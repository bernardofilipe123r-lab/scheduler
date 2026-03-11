import { useEffect, useRef, useCallback } from 'react'

interface ParticlesProps {
  className?: string
  quantity?: number
  color?: string
  size?: number
  speed?: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  opacityDir: number
}

export function Particles({ className = '', quantity = 50, color = '#6C5CE7', size = 1.5, speed = 0.3 }: ParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animRef = useRef<number>(0)
  const mouseRef = useRef({ x: -1000, y: -1000 })

  const initParticles = useCallback((w: number, h: number) => {
    particlesRef.current = Array.from({ length: quantity }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      size: Math.random() * size + 0.5,
      opacity: Math.random() * 0.5 + 0.1,
      opacityDir: Math.random() > 0.5 ? 1 : -1,
    }))
  }, [quantity, size, speed])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      initParticles(rect.width, rect.height)
    }

    resize()
    window.addEventListener('resize', resize)

    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    canvas.addEventListener('mousemove', handleMouse)

    // Parse color
    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return `${r},${g},${b}`
    }
    const rgb = hexToRgb(color)

    const animate = () => {
      const w = canvas.width / window.devicePixelRatio
      const h = canvas.height / window.devicePixelRatio
      ctx.clearRect(0, 0, w, h)

      particlesRef.current.forEach((p) => {
        // Move
        p.x += p.vx
        p.y += p.vy

        // Wrap
        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0

        // Pulse opacity
        p.opacity += p.opacityDir * 0.003
        if (p.opacity > 0.6) { p.opacity = 0.6; p.opacityDir = -1 }
        if (p.opacity < 0.1) { p.opacity = 0.1; p.opacityDir = 1 }

        // Mouse repulsion
        const dx = p.x - mouseRef.current.x
        const dy = p.y - mouseRef.current.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 120) {
          const force = (120 - dist) / 120 * 0.8
          p.x += (dx / dist) * force
          p.y += (dy / dist) * force
        }

        // Draw
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${rgb},${p.opacity})`
        ctx.fill()
      })

      // Draw connections
      for (let i = 0; i < particlesRef.current.length; i++) {
        for (let j = i + 1; j < particlesRef.current.length; j++) {
          const a = particlesRef.current[i]
          const b = particlesRef.current[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 100) {
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `rgba(${rgb},${(1 - dist / 100) * 0.15})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', handleMouse)
      cancelAnimationFrame(animRef.current)
    }
  }, [color, initParticles])

  return <canvas ref={canvasRef} className={`absolute inset-0 pointer-events-auto ${className}`} />
}
