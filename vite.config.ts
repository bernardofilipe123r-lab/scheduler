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
      // Fallback proxy — used when VITE_API_URL is not set (i.e. running local backend on port 8000)
      '/api': 'http://localhost:8000',
      '/reels': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/logs': 'http://localhost:8000',
      '/output': 'http://localhost:8000',
      '/docs': 'http://localhost:8000',
    },
  },
})
