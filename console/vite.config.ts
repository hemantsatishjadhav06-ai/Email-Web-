/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { lingui } from '@lingui/vite-plugin'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { readFileSync } from 'fs'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Local dev HTTPS certs are optional and not committed. When present, the dev
// server runs over HTTPS; when absent (CI / production build), it falls back to
// HTTP so `npm run build` never depends on machine-local certificates.
function devHttps() {
  try {
    return {
      key: readFileSync(resolve(__dirname, 'certificates/key.pem')),
      cert: readFileSync(resolve(__dirname, 'certificates/cert.pem')),
    }
  } catch {
    return undefined
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/console/',
  plugins: [
    react({
      babel: {
        plugins: ['@lingui/babel-plugin-lingui-macro'],
      },
    }),
    tailwindcss(),
    lingui(),
  ],
  server: {
    host: 'mailwavedev.com',
    https: devHttps(),
    proxy: {
      '/config.js': {
        target: 'https://localapi.example.com:4000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/console/, '')
      },
      '/console/config.js': {
        target: 'https://localapi.example.com:4000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/console/, '')
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.tsx'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/__tests__/setup.tsx']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    },
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json']
  },
  optimizeDeps: {
    include: ['@fortawesome/react-fontawesome', '@fortawesome/fontawesome-svg-core']
  }
})
