import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

// Derive base path from package.json name for GitHub Pages deployment
const { name } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
)

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? `/${name}/` : '/',
}))

