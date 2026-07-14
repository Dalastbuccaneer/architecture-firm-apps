import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Ports are pinned (and strict) so StudioCRM never collides with its siblings:
// StudioHours (dev 5173 / preview 4173), StudioLog (dev 5174 / preview 4174),
// StudioCRM (dev 5175 / preview 4175). The e2e smoke test hardcodes preview port 4175.
// https://vite.dev/config/
export default defineConfig({
  base: './',
  server: { port: 5175, strictPort: true },
  preview: { port: 4175, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'StudioCRM',
        short_name: 'StudioCRM',
        description: 'Lightweight CRM for small architecture firms - clients, contacts, opportunity pipeline, follow-ups',
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
