import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { AppProviders } from '@/app/providers'
import '@/index.css'

// Fade out the pre-React loading screen once the app mounts
function dismissPreloader() {
  const el = document.getElementById('preloader')
  if (el) {
    el.classList.add('hidden')
    el.addEventListener('transitionend', () => el.remove(), { once: true })
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders onReady={dismissPreloader} />
    <Toaster
      position="top-right"
      containerStyle={{ zIndex: 99999 }}
      toastOptions={{
        duration: 3000,
        style: {
          background: '#333',
          color: '#fff',
          borderRadius: '8px',
        },
      }}
    />
  </React.StrictMode>,
)
