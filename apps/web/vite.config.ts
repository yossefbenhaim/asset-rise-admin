import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@asset-rise/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: { host: true, port: 5173 },
})
