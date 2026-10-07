import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Sürüm etiketi: derleme zamanı (Türkiye saati) + commit kısa kodu
const buildTime = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date())
const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7)

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(`${buildTime} (TR)${sha ? ' · ' + sha : ''}`) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      workbox: { navigateFallbackDenylist: [/^\/api\//], globPatterns: ['**/*.{js,css,html,svg,png,mjs,woff2}'], maximumFileSizeToCacheInBytes: 5_000_000 },
      manifest: {
        name: 'TechNote',
        short_name: 'TechNote',
        description: 'Defter, PDF ve Apple Pencil ile not alma',
        display: 'standalone',
        orientation: 'any',
        background_color: '#e5e7eb',
        theme_color: '#1d4ed8',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
