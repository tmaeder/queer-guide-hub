import React from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { TripContextBar } from '@/components/trips/TripContextBar';
import { CookieConsentBanner } from '@/components/privacy/CookieConsentBanner';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker';

/**
 * Visual chrome around the route content: header, footer, banners, skip-link, background.
 * Children are the route table (`<AppRoutes />`).
 */
export const LayoutShell = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen flex flex-col bg-background">
    {/* Skip link for keyboard users (a11y: WCAG 2.4.1) */}
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:bg-card focus:text-foreground focus:px-4 focus:py-2 focus:rounded focus:shadow-lg focus:font-semibold focus:text-sm focus:no-underline focus:outline focus:outline-[3px] focus:outline-primary focus:outline-offset-2"
    >
      Skip to main content
    </a>

    {/* Background — solid color, no decorative effects */}
    <div
      aria-hidden="true"
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        bgcolor: 'background.default',
      }}
      className="fixed inset-0 z-0 pointer-events-none bg-background"
    />
    <AnalyticsTracker />
    <div className="relative z-10">
      <Header />
      <TripContextBar />
    </div>
    {children}
    <div className="relative z-10">
      <Footer />
    </div>
    <CookieConsentBanner />
    <FeedbackButton />
    <InstallBanner />
  </div>
);
