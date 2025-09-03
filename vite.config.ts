import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cambia 'tuner-lab' por el nombre de tu repo si usas GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: '/tuner-lab/',
})
