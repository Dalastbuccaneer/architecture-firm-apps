import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Ports are pinned (and strict) so StudioLog never collides with its sibling
// StudioHours, which runs dev on 5173 and preview on 4173. The e2e smoke test
// hardcodes preview port 4174.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'StudioLog',
        short_name: 'StudioLog',
        description: 'Project delivery hub for small architecture firms — stage deadlines, drawing register, RFI log, site notes',
        theme_color: '#171717',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
})
