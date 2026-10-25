import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// In the installed app (Android APK or home-screen app) pinch and double-tap
// zoom feel broken, so turn them off there. The website keeps normal zoom.
const installed = window.matchMedia('(display-mode: standalone)').matches || document.referrer.startsWith('android-app://')
if (installed) {
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
  document.documentElement.classList.add('installed')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Lets the app be installed (and wrapped as an Android app by PWABuilder).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Not critical: the site works without it.
    })
  })
}
