import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const BACKEND = 'https://viraltoby.com'

function proxyTo(target: string) {
  return {
    target,
    changeOrigin: true,
    proxyTimeout: 15_000,
    timeout: 15_000,
    configure: (proxy: import('http-proxy').Server) => {
      proxy.on('error', (err, _req, res) => {
        const code = (err as NodeJS.ErrnoException).code ?? err.message
        console.warn(`[proxy] ${code}`)
        if (res && 'writeHead' in res) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Backend unreachable', detail: code }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'chart-vendor': ['recharts'],
          'canvas-vendor': ['konva', 'react-konva'],
          'animation-vendor': ['framer-motion'],
        },
      },
    },
  },
  server: {
    proxy: {
      // Dev proxy — forwards API calls to the production backend (avoids CORS)
      '/api':    proxyTo(BACKEND),
      '/reels':  proxyTo(BACKEND),
      '/health': proxyTo(BACKEND),
      '/logs':   proxyTo(BACKEND),
      '/output': proxyTo(BACKEND),
      '/docs':   proxyTo(BACKEND),
      '/jobs':   proxyTo(BACKEND),
    },
  },
})
