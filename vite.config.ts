import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared')
    }
  },
  server: {
    port: 5173,
    host: true, // Listen on all interfaces (0.0.0.0) for LAN access
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true
  }
});
