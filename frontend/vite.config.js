import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

const devServerPort = Number(process.env.VITE_DEV_SERVER_PORT || 5173)

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '0.0.0.0',
    port: devServerPort,
    strictPort: true,
    allowedHosts: ['imac.tajuren.cn'],

    // 关键：Docker + Windows 热更新稳定性
    watch: {
      usePolling: true
    },

    // HMR 设置（避免 websocket 连接失败）
    hmr: {
      host: 'localhost',
      port: devServerPort
    }
  }
})
