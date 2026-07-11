import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Offline build: a single self-contained index.html, no PWA/service worker.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: 'dist-offline',
  },
})
