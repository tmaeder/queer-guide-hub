import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initCloudflareOptimizations } from './utils/cloudflareOptimizations'

// Initialize Cloudflare optimizations
initCloudflareOptimizations();

createRoot(document.getElementById("root")!).render(<App />);

// Enhanced Service Worker registration for Cloudflare compatibility
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'imports'
      });
      
      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('New content available. Refresh to update.');
            }
          });
        }
      });
    } catch (err) {
      console.debug('[SW] Registration failed:', err);
    }
  });
} else if ('serviceWorker' in navigator) {
  // Development mode - basic registration
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.debug('[SW] Registration failed:', err);
    });
  });
}
