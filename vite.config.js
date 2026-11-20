import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = '/nce-reviewer/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'NCE Reviewer',
        short_name: 'NCE Reviewer',
        description: 'Practice questions for the PSHS National Competitive Examination.',
        theme_color: '#2456c9',
        background_color: '#f4f6fb',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // App + question figures are saved for offline use up front.
        globPatterns: ['**/*.{js,css,html,svg}', 'figs/*.png'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Full scanned pages are saved the first time you open them.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${base}pages/`),
            handler: 'CacheFirst',
            options: { cacheName: 'reviewer-pages', expiration: { maxEntries: 60 } },
          },
        ],
      },
    }),
  ],
})
