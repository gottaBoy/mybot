import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'

export default defineConfig({
  plugins: [react({
    babel: {
      plugins: [['@stylexjs/babel-plugin', {
        dev: false,
        runtimeInjection: true,
        classNamePrefix: 'mybot',
        unstable_moduleResolution: {type: 'commonJS'},
      }]],
    },
  })],
  server: {
    port: 5173,
    strictPort: false,
    cors: {origin: ['null', 'http://127.0.0.1:5173', 'http://localhost:5173']},
    proxy: {
      '/api': {
        target: process.env.MYBOT_BACKEND_URL ?? 'http://127.0.0.1:4180',
        changeOrigin: true,
      },
    },
  },
  preview: {
    cors: {origin: ['null']},
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        preview: fileURLToPath(new URL('./preview.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (/\/node_modules\/(?:react|react-dom|scheduler)\//.test(id)) return 'react-vendor'
        },
      },
    },
  },
})
