import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.webp'],
      manifest: {
        name: 'BAD!!',
        short_name: 'BAD!!',
        description: 'Multiplayer Callbreak Card Game',
        theme_color: '#1a1b1f',
        display: 'fullscreen',
        orientation: 'landscape',
        icons: [
          {
            src: 'icon.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
})
