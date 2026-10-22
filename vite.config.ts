import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Keep CSS readable by older phone browsers (Android WebView, in-app browsers).
    cssTarget: ['chrome61', 'safari12', 'firefox60'],
  },
})
