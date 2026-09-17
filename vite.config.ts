import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['icon-192.svg', 'icon-512.svg', 'apple-touch-icon.svg'],
      manifest: {
        name: 'LZ Advogados — Gestão do escritório',
        short_name: 'LZ Advogados',
        description: 'Plataforma de gestão do escritório de advocacia.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f4f7fa',
        theme_color: '#142d40',
        lang: 'pt-BR',
        prefer_related_applications: false,
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          {
            src: '/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: { cleanupOutdatedCaches: true, navigateFallback: '/index.html', runtimeCaching: [] },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', testTimeout: 30000, hookTimeout: 60000, fileParallelism: false },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-auth': ['@supabase/supabase-js'],
          'vendor-forms': ['react-hook-form', '@hookform/resolvers/zod', 'zod'],
        },
      },
    },
  },
})
