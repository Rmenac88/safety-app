import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Production security headers (CSP...) are defined once, in vercel.json.
// `npm run preview` serves the build with the same headers to test them locally.
const vercelConfig = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf-8')) as {
  headers?: { source: string; headers: { key: string; value: string }[] }[]
}
const productionHeaders = Object.fromEntries(
  (vercelConfig.headers?.find((h) => h.source === '/(.*)')?.headers ?? []).map((h) => [h.key, h.value]),
)

const apiProxy = {
  // Proxy all /api/v1/* calls to the FastAPI backend
  '/api': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    secure: false,
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    headers: productionHeaders,
    proxy: apiProxy,
  },
})
