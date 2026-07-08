import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'react-helmet-async'],
          streaming: ['hls.js', 'socket.io-client'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    // Proxy API calls to the Express backend during development so the
    // frontend can call `/api/...` without CORS hassle.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // Proxy uploaded media (gallery photos, logos) to the backend in dev.
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // Proxy Socket.IO (WebSocket) traffic to the backend during development.
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
