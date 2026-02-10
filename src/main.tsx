import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initCloudflareOptimizations } from './utils/cloudflareOptimizations'

// Initialize Cloudflare optimizations (includes SW registration)
initCloudflareOptimizations();

createRoot(document.getElementById("root")!).render(<App />);
