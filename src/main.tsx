import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createOptimizedQueryClient } from '@/utils/queryOptimizations'

// Create optimized query client with better caching and batching
const queryClient = createOptimizedQueryClient()

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="queer-guide-theme">
      <App />
    </ThemeProvider>
  </QueryClientProvider>
);

// Register Service Worker to cache key routes for faster reloads
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.debug('[SW] Registration failed:', err);
    });
  });
}
