import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  base: './',
  server: {
    port: Number(import.meta.env.PORT) || 5173,
  },
  test: {
    environment: 'jsdom',
  },
})
