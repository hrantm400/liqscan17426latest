import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
  ],
  server: {
    host: '0.0.0.0', // Allow external connections
    allowedHosts: [
      '.trycloudflare.com', // Allow all Cloudflare Tunnel domains
      '.loca.lt', // Allow localtunnel domains
      '.ngrok-free.dev', // Allow ngrok free domains
      'localhost',
      '127.0.0.1',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
        ws: true, // Enable WebSocket proxying
      },
    },
    fs: {
      strict: false,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['lightweight-charts'],
          'query-vendor': ['@tanstack/react-query'],
          'socket-vendor': ['socket.io-client'],
          'motion-vendor': ['framer-motion'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'lightweight-charts', 'framer-motion', 'lucide-react'],
    esbuildOptions: {
      jsx: 'automatic',
    },
  },
})
