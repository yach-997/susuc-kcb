import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// 本地默认 './'；CI 也可注入 VITE_BASE
const base = process.env.VITE_BASE || './'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      selfDestroying: false,
      // 暂时不注入 registerSW；由 main.tsx 主动注销，避免再锁死旧缓存
      injectRegister: null,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'clear.html'],
      manifest: {
        name: '川轻化课表助手',
        short_name: '课表助手',
        description: '四川轻化工大学课表助手 · 本地存储 · 零后端',
        theme_color: '#0d6e5a',
        background_color: '#f3f7f5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        lang: 'zh-CN',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,mjs,bcmap}'],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/clear\.html/],
      },
    }),
  ],
})
