import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',   // ✅ this makes paths relative for Electron packaging
  plugins: [react()],
})
