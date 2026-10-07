import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { navigateFallbackDenylist: [/^\/api\//], globPatterns: ['**/*.{js,css,html,svg,png,mjs}'], maximumFileSizeToCacheInBytes: 5_000_000 },
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
