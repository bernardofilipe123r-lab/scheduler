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
      '/api': {
        target: 'https://scheduler-production-29d5.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
      '/reels': {
        target: 'https://scheduler-production-29d5.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
      '/health': {
        target: 'https://scheduler-production-29d5.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
      '/logs': {
        target: 'https://scheduler-production-29d5.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
      '/output': {
        target: 'https://scheduler-production-29d5.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
      '/docs': {
        target: 'https://scheduler-production-29d5.up.railway.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
