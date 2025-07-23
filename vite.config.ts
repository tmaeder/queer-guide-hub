import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      // More permissive CSP for development mode to allow Vite HMR
      'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-eval' 'unsafe-inline' ws://localhost:* ws://127.0.0.1:* ws://[::1]:* https://widget.getyourguide.com https://*.supabase.co; connect-src 'self' ws://localhost:* ws://127.0.0.1:* ws://[::1]:* https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://widget.getyourguide.com; img-src 'self' data: blob: https://*.supabase.co https://api.mapbox.com https://images.unsplash.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com; font-src 'self' https://fonts.gstatic.com; frame-src 'self'; frame-ancestors 'none'; object-src 'none'; manifest-src 'self'; media-src 'self'; worker-src 'self' blob:; base-uri 'self'; form-action 'self';"
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
}));
