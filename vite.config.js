import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue(), tailwindcss()],
    base: './',
    server: {
      port: Number(env.VITE_APP_PORT) || 5173,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.js'],
    },
  }
})
