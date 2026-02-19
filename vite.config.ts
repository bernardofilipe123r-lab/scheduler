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
      '/api': 'http://localhost:8000',
      '/reels': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/logs': 'http://localhost:8000',
      '/output': 'http://localhost:8000',
      '/docs': 'http://localhost:8000',
    },
  },
})
