import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const backend = process.env.WIREDOVE_PREVIEW_BACKEND || 'http://127.0.0.1:8000'
const proxy = Object.fromEntries(
  ['/api/application', '/api/git', '/sync/status', '/gossip/poll', '/posts', '/wiredove/image', '/git/']
    .map(path => [path, { target: backend, changeOrigin: true }]),
)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    fs: { allow: ['.', '../client', '../vendor'].map(path => fileURLToPath(new URL(path, import.meta.url))) },
    proxy,
  },
  preview: { proxy },
})
