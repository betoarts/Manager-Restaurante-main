import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',   // escuta em todas as interfaces (Wi-Fi, Ethernet, etc.)
    port: 5173,
    strictPort: true,   // falha se porta estiver ocupada, em vez de incrementar
    proxy: {
      // Repassa chamadas de API ao backend Go
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // Repassa WebSocket ao backend
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})

