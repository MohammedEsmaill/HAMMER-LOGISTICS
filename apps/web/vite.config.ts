import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

/** Tunnel domains allowed to reach the dev / preview server when sharing a local run. */
const TUNNEL_HOSTS = ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app'];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // same origin as the API in development, so the httpOnly refresh cookie works
    proxy: { '/api': 'http://localhost:3000' },
    allowedHosts: TUNNEL_HOSTS,
  },
  // `npm run share`: the built app on :4173, the same /api forwarding, reachable
  // through a Cloudflare / ngrok tunnel (docs/SHARE.md)
  preview: {
    port: 4173,
    proxy: { '/api': 'http://localhost:3000' },
    allowedHosts: TUNNEL_HOSTS,
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
