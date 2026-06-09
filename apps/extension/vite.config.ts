import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import preact from '@preact/preset-vite'
import manifest from './manifest.config.js'

export default defineConfig({
  plugins: [
    preact(),
    crx({ manifest }),
  ],
  build: {
    // Extension 产物放在 dist/
    outDir: 'dist',
    rollupOptions: {
      output: {
        // 控制 chunk 命名，避免哈希变化导致 manifest 失效
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
})
