import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('hls.js')) return 'streaming-hls';
          if (id.includes('socket.io-client') || id.includes('engine.io')) return 'streaming-socket';
          if (id.includes('video.js')) return 'streaming-videojs';
          if (
            id.includes('react-dom') ||
            id.includes('/react/') ||
            id.includes('react-router') ||
            id.includes('react-helmet')
          ) {
            return 'vendor';
          }
          if (id.includes('axios')) return 'http';
          return undefined;
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
