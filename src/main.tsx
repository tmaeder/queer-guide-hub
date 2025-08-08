import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ThemeProvider } from '@/components/theme/ThemeProvider'

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="system" storageKey="queer-guide-theme">
    <App />
  </ThemeProvider>
);

// Register Service Worker to cache key routes for faster reloads
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.debug('[SW] Registration failed:', err);
    });
  });
}
