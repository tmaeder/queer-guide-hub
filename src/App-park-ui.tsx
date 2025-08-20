import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { ThemeProvider } from '@/components/park-ui/theme-provider';
import { CredentialSecurityGuard } from '@/components/security/CredentialSecurityGuard';
import { Toaster } from '@/components/ui/toaster';
import { createOptimizedQueryClient } from '@/utils/queryOptimizations';

const queryClient = createOptimizedQueryClient();

/**
 * Park UI Enhanced App component with Park UI design system
 * Implements Park UI design patterns with security-first architecture
 */
function App({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light" storageKey="queer-guide-park-ui-theme">
          <AuthProvider>
            <CredentialSecurityGuard>
              <div className="min-h-screen bg-background text-foreground">
                {children}
              </div>
              <Toaster />
            </CredentialSecurityGuard>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;