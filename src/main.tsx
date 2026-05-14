import './sentry'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initCloudflareOptimizations } from './utils/cloudflareOptimizations'
import { installErrorBuffer, installNetworkBuffer } from '@/utils/feedbackContext'

// Install feedback context buffers at module load (idempotent)
installErrorBuffer();
installNetworkBuffer();

// Initialize Cloudflare optimizations (includes SW registration)
initCloudflareOptimizations();

createRoot(document.getElementById("root")!).render(<App />);
