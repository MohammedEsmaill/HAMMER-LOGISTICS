import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // same origin as the API in development, so the httpOnly refresh cookie works
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    // three.js alone is ~900 kB raw (~245 kB gzip) and loads lazily behind the loader
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // libraries change rarely: separate chunks stay cached across app updates
        manualChunks: {
          three: ['three', '@react-three/fiber'],
          react: ['react', 'react-dom', 'react-router'],
          data: [
            '@tanstack/react-query',
            '@tanstack/react-query-persist-client',
            '@tanstack/query-sync-storage-persister',
            'react-hook-form',
            '@hookform/resolvers',
            'zod',
          ],
          ui: ['motion', 'sonner', 'lucide-react'],
        },
      },
    },
  },
});
