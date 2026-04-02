import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,

    // 关键：Docker + Windows 热更新稳定性
    watch: {
      usePolling: true
    },

    // HMR 设置（避免 websocket 连接失败）
    hmr: {
      host: 'localhost',
      port: 5173
    }
  }
})