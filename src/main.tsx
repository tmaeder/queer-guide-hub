import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { logSecurityStatus } from '@/utils/security'

// Initialize security measures
logSecurityStatus();

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="system" storageKey="queer-guide-theme">
    <App />
  </ThemeProvider>
);
