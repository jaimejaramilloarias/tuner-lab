import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Explicit base path ensures assets load correctly on GitHub Pages
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/tuner-lab/' : '/',
}))

