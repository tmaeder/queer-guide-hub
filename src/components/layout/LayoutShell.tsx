import React, { Suspense, lazy } from 'react';
import { useLocation } from 'react-router';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { TripContextBar } from '@/components/trips/TripContextBar';
import { EmailVerifyBanner } from '@/components/auth/EmailVerifyBanner';
import { ClaimUsernameBanner } from '@/components/auth/ClaimUsernameBanner';
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker';

// Peripheral chrome — banners and the feedback FAB. None of these are
// above-the-fold or interaction-critical on first paint, so defer their
// modules to a lazy chunk and mount them via Suspense with a null
// fallback. Each only briefly delays its own appearance, never the rest
// of the page.
const FeedbackButton = lazy(() =>
  import('@/components/feedback/FeedbackButton').then((m) => ({ default: m.FeedbackButton })),
);
const CookieConsentBanner = lazy(() =>
  import('@/components/privacy/CookieConsentBanner').then((m) => ({ default: m.CookieConsentBanner })),
);
const InstallBanner = lazy(() =>
  import('@/components/pwa/InstallBanner').then((m) => ({ default: m.InstallBanner })),
);

/**
 * Visual chrome around the route content: header, footer, banners, skip-link, background.
 * Children are the route table (`<AppRoutes />`).
 *
 * /map is rendered full-bleed: footer is hidden on this route so the map
 * can fill the viewport below the header without forcing a scroll past
 * it to reach language/currency/theme controls (those still live in the
 * user menu in the header).
 */
export const LayoutShell = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  // Match /map and /:locale/map (locale prefix is optional in the router).
  const isFullBleedMap = /^\/(?:[a-z]{2}\/)?map\/?$/.test(pathname);
  const reduced = useReducedMotion();

  // Key route transitions by the first non-locale segment so detail-page
  // tab switches don't trigger a full fade (only true route changes do).
  const transitionKey = pathname.replace(/^\/(?:[a-z]{2}\/)?/, '/').split('/').slice(0, 3).join('/');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Skip link for keyboard users (a11y: WCAG 2.4.1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:bg-card focus:text-foreground focus:px-4 focus:py-2 focus:rounded-element focus:shadow-lg focus:font-semibold focus:text-sm focus:no-underline focus:outline focus:outline-[3px] focus:outline-primary focus:outline-offset-2"
      >
        Skip to main content
      </a>

      {/* Aceternity-style ambient backdrop: solid + dot grid overlay. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 pointer-events-none bg-background"
      />
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 pointer-events-none bg-grid-dots opacity-50"
      />
      <AnalyticsTracker />
      <div className="relative z-10">
        <Header />
        <EmailVerifyBanner />
        <ClaimUsernameBanner />
        <TripContextBar />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={transitionKey}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 flex-1 flex flex-col"
        >
          {children}
        </motion.div>
      </AnimatePresence>
      {!isFullBleedMap && (
        <div className="relative z-10">
          <Footer />
        </div>
      )}
      <Suspense fallback={null}>
        <CookieConsentBanner />
        <FeedbackButton />
        <InstallBanner />
      </Suspense>
    </div>
  );
};
