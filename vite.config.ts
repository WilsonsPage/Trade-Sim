import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The site has no server to send security headers, so the production page carries its
// Content Security Policy in a <meta> tag: only the site's own scripts, styles, workers and
// data can load, and nothing can be sent to other sites. (Dev mode needs inline scripts.)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const securityMeta = (): Plugin => ({
  name: 'security-meta',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
  ],
});

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    securityMeta(),
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
            // Each month of a market is its own file; keep the most recently used ones.
            options: { cacheName: 'market-data', expiration: { maxEntries: 400 } },
          },
        ],
      },
    }),
  ],
});
