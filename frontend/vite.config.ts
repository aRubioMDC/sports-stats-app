import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8001',
    },
  },
})
