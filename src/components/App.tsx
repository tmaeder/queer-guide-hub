import React from 'react';
import { BrowserRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { CurrencyProvider } from '@/hooks/useCurrency';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { CredentialSecurityGuard } from '@/components/security/CredentialSecurityGuard';
import { Toaster } from '@/components/ui/toaster';
import { createOptimizedQueryClient } from '@/utils/queryOptimizations';

const queryClient = createOptimizedQueryClient();

/**
 * Enhanced App component with comprehensive security controls
 * Implements security-first architecture with credential protection
 */
function App({ children }: { children: React.ReactNode }) {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="light" storageKey="queer-guide-theme">
          <AuthProvider>
            <CurrencyProvider>
              <CredentialSecurityGuard>
                {children}
                <Toaster />
              </CredentialSecurityGuard>
            </CurrencyProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
