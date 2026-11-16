import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'
import {monacoAssets} from './scripts/monaco-assets'
import {apiProxy} from './scripts/api-proxy'

export default defineConfig({
  plugins: [monacoAssets(), react({
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
      '/api': apiProxy(process.env.MYBOT_BACKEND_URL ?? 'http://127.0.0.1:4180'),
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
          if (id.includes('/node_modules/typescript/')) return 'preview-typescript'
          if (id.includes('/node_modules/recharts/')) return 'preview-charts'
          // Let Rollup separate shared product primitives from preview-only
          // components, icons and themes. Grouping all Core exports here made
          // the workbench eagerly download the entire Playground runtime.
          if (id.includes('/node_modules/@babel/parser/')) return 'property-parser'
        },
      },
    },
  },
})
