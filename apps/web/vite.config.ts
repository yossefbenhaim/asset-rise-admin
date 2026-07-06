import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Deep subpath imports (e.g. '@asset-rise/shared') must
      // be matched BEFORE the bare-package alias, otherwise the bare alias rewrites
      // them to '<...>/index.ts/schemas/...' (ENOTDIR). This mirrors the tsconfig
      // path map '@asset-rise/shared/*' → 'packages/shared/src/*'.
      '@asset-rise/shared/': path.resolve(__dirname, '../../packages/shared/src') + '/',
      '@asset-rise/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: { host: true, port: 5173 },
})
