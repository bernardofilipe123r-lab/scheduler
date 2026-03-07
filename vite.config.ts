import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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
      '/api': {
        target: 'https://viraltoby.com',
        changeOrigin: true,
      },
      '/reels': {
        target: 'https://viraltoby.com',
        changeOrigin: true,
      },
      '/health': {
        target: 'https://viraltoby.com',
        changeOrigin: true,
      },
      '/logs': {
        target: 'https://viraltoby.com',
        changeOrigin: true,
      },
      '/output': {
        target: 'https://viraltoby.com',
        changeOrigin: true,
      },
      '/docs': {
        target: 'https://viraltoby.com',
        changeOrigin: true,
      },
      '/jobs': {
        target: 'https://viraltoby.com',
        changeOrigin: true,
      },
    },
  },
})
