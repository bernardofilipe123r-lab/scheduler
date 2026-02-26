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
