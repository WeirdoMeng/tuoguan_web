import { defineConfig } from 'vite';

const proxy = {
  '/admin-api': {
    target: process.env.ADMIN_API_TARGET || 'http://127.0.0.1:3001',
    changeOrigin: true,
  },
};

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', proxy },
});
