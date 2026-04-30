import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 8433,
    proxy: {
      // 后端把路由挂在根路径（/bible, /outline, /chapter, /agent），
      // 前端用 /api 命名空间，转发时去掉这个前缀。
      '/api': {
        target: 'http://localhost:8432',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
