import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './park-ui-styles.css'
import { ThemeProvider } from '@/components/park-ui/theme-provider'

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="system" storageKey="queer-guide-park-ui-theme">
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