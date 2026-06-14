import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [
    react(),
    viteCompression({
      verbose: false,
      algorithm: 'gzip',
      ext: '.gz',
      deleteOriginFile: true,
      threshold: 0,
    }),
  ],
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: '../firmware/data',
    emptyOutDir: true,
    assetsDir: '',
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: 'app-[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
})
