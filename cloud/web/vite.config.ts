import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Unlike the on-device UI (which builds into firmware/data and is gzip-embedded),
// the cloud site builds to ./dist and is served by the Node server. In dev, proxy
// the API to the local server so `npm run dev` works end-to-end.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
