import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Trade Sim',
        short_name: 'Trade Sim',
        description: 'Replay historical charts and practise trading them.',
        theme_color: '#131722',
        background_color: '#131722',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Market data is large, so it is cached when first opened rather than up front.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        globIgnores: ['data/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'market-data' },
          },
        ],
      },
    }),
  ],
});
