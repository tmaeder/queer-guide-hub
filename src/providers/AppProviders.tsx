import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/useAuth';
import { AccessibilityProvider } from '@/hooks/useAccessibility';
import { CookieConsentProvider } from '@/hooks/useCookieConsent';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { PWAProvider } from '@/components/pwa/PWAProvider';
import { CurrencyProvider } from '@/hooks/useCurrency';
import { SafeModeProvider } from '@/providers/SafeModeProvider';
import { createOptimizedQueryClient } from '@/utils/queryOptimizations';

const queryClient = createOptimizedQueryClient();

/**
 * Application-wide providers — everything that does NOT require BrowserRouter.
 * ActiveTripProvider stays inside BrowserRouter (uses router hooks) and is wired in App.tsx.
 *
 * Toaster/Sonner are sibling render-only components mounted here
 * to preserve the original App.tsx ordering.
 */
export const AppProviders = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="queer-guide-theme">
      <PWAProvider>
        <AccessibilityProvider>
          <CookieConsentProvider>
            <AuthProvider>
              <CurrencyProvider>
                <SafeModeProvider>
                  <TooltipProvider>
                    <Toaster />
                    <Sonner />
                    {children}
                  </TooltipProvider>
                </SafeModeProvider>
              </CurrencyProvider>
            </AuthProvider>
          </CookieConsentProvider>
        </AccessibilityProvider>
      </PWAProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
