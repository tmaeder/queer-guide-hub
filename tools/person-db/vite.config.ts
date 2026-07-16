import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone tool — own dev server on port 5199 to avoid clashing with
// the main app (8080). Not part of the main build/deploy.
export default defineConfig({
  plugins: [react()],
  server: { port: 5199 },
})
