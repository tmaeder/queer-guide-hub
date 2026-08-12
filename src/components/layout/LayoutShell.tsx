import React, { Suspense } from 'react';
import { useLocation } from 'react-router';
import { LucideProvider } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { TripContextBar } from '@/components/trips/TripContextBar';
import { EmailVerifyBanner } from '@/components/auth/EmailVerifyBanner';
import { BreadcrumbBar } from '@/components/breadcrumbs/BreadcrumbBar';
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker';
import { useGlobalPresence } from '@/hooks/useConversationPresence';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { lazyOptional } from '@/utils/lazyRetry';
import { isMapRoute, isAdminRoute } from '@/lib/locale';

// Peripheral chrome — banners and the feedback FAB. None of these are
// above-the-fold or interaction-critical on first paint, so defer their
// modules to a lazy chunk and mount them via Suspense with a null
// fallback. lazyOptional() makes a permanent chunk-load failure render
// nothing (instead of throwing into the parent boundary) — losing the
// cookie banner is always strictly better than blanking the entire app.
const FeedbackButton = lazyOptional(() =>
  import('@/components/feedback/FeedbackButton').then((m) => ({ default: m.FeedbackButton })),
);
const CookieConsentBanner = lazyOptional(() =>
  import('@/components/privacy/CookieConsentBanner').then((m) => ({
    default: m.CookieConsentBanner,
  })),
);
const InstallBanner = lazyOptional(() =>
  import('@/components/pwa/InstallBanner').then((m) => ({ default: m.InstallBanner })),
);

/**
 * Visual chrome around the route content: header, footer, banners, skip-link, background.
 * Children are the route table (`<AppRoutes />`).
 *
 * Two routes opt out of parts of it.
 *
 * /map is rendered full-bleed: footer is hidden on this route so the map
 * can fill the viewport below the header without forcing a scroll past
 * it to reach language/currency/theme controls (those still live in the
 * user menu in the header).
 *
 * /admin/* opts out of ALL public chrome. AdminShell brings its own top bar,
 * breadcrumbs and navigation, so rendering the public ones as well stacked
 * five bars above the fold and let the floating MobileBottomNav cover the
 * bottom of every admin page (admin content never got the footer wrapper's
 * `pb-24` clearance). Each block is gated in place rather than early-returning
 * a different tree, so `{children}` keeps its index in the children array and
 * React reconciles the route subtree instead of remounting it as the pathname
 * flips. Two things stay mounted on admin deliberately: AnalyticsTracker
 * (renders null; gating it would silently drop admin pageviews) and
 * CookieConsentBanner (analytics does not consent-gate itself, so a first-time
 * visitor landing straight on /admin must still get the prompt).
 */
export const LayoutShell = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  // Match /map and /:locale/map (locale prefix is optional in the router).
  const isFullBleedMap = isMapRoute(pathname);
  const isAdmin = isAdminRoute(pathname);
  // Broadcast the current user's global presence (only if they opted into the
  // global dot) so inbox/discovery surfaces can show "active now".
  useGlobalPresence();

  // Key route transitions by the first non-locale segment so detail-page
  // tab switches don't trigger a full fade (only true route changes do).

  // PASTE-UP iconography. lucide stamps `.lucide` on every icon it renders and
  // exposes a context that sets strokeWidth for a whole subtree, so a thicker,
  // square-cut mark costs one provider plus one CSS rule instead of an
  // icon-library swap across the ~780 files that import icons. Scoped to the
  // public tree — the admin console keeps lucide's softer default.
  const tree = (
    <div
      className="min-h-screen flex flex-col bg-background"
      {...(!isAdmin ? { 'data-ink-icons': '' } : {})}
    >
      {/* Skip link for keyboard users (a11y: WCAG 2.4.1). AdminShell renders
        its own ("Skip to admin content"), so this one would just be a
        competing first tab stop inside the console. */}
      {!isAdmin && (
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:bg-card focus:text-foreground focus:px-4 focus:py-2 focus:rounded-element focus:font-semibold focus:text-sm focus:no-underline focus:outline focus:outline-[3px] focus:outline-primary focus:outline-offset-2"
        >
          Skip to main content
        </a>
      )}

      {/* PASTE-UP backdrop: the page is a sheet of stock, so the ambient layer
          is paper grain rather than the old dot grid. The grid read as a
          designer's canvas; grain reads as something printed.

          Admin gets the stock too (2026-08-04) — it is the same product, and
          excluding it was making /admin read as a different application. The
          grain is the ONLY print layer admin takes: no drum screens, no
          misregistration. /admin/design especially renders literal colour
          swatches for judging, and texture behind a swatch defeats the one
          thing that surface exists to do. */}
      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none bg-background" />
      <AnalyticsTracker />
      {/* Header + banners are wrapped in dedicated error boundaries so a crash
        in (e.g.) the avatar menu's notifications subscription cannot blank the
        whole app. The inner ErrorBoundary in routes.tsx handles route-level
        crashes; this outer boundary catches the chrome. */}
      {!isAdmin && (
        <>
          {/* The header is a DIRECT child of the flex column, deliberately NOT
              inside the chrome wrapper below. `position: sticky` can only
              travel inside its parent's box, and that wrapper is exactly as
              tall as the chrome it contains — so a header nested in it stuck
              for 0px and scrolled straight off, which is why the compact ink
              state (Header.tsx panel 02) was never once visible in production.
              The wrapper's `z-10` also capped the header's own `z-1100` to
              that stacking context, letting the equally-z-10 content column
              below paint over it. Anything given `sticky` here must be a child
              of the tall column, not of a wrapper sized to its own content. */}
          <ErrorBoundary section="header" fallback={null}>
            <Header />
          </ErrorBoundary>
          <div className="relative z-10">
            <ErrorBoundary section="banners" fallback={null}>
              <EmailVerifyBanner />
              <TripContextBar />
            </ErrorBoundary>
            {!isFullBleedMap && (
              <ErrorBoundary section="breadcrumbs" fallback={null}>
                <BreadcrumbBar />
              </ErrorBoundary>
            )}
          </div>
        </>
      )}
      {/* Route transitions live in RouteFade (routes.tsx) — the former
          AnimatePresence mode="wait" wrapper here both duplicated that fade
          and held every incoming route's paint hostage to the exit animation,
          while chaining framer-motion onto the entry bundle. */}
      <div className="relative z-10 flex-1 flex flex-col">{children}</div>
      {!isFullBleedMap && !isAdmin && (
        <div className="relative z-10 pb-24 md:pb-0">
          <ErrorBoundary section="footer" fallback={null}>
            <Footer />
          </ErrorBoundary>
        </div>
      )}
      {!isAdmin && (
        <ErrorBoundary section="mobile-bottom-nav" fallback={null}>
          <MobileBottomNav />
        </ErrorBoundary>
      )}
      {/* Belt-and-suspenders: lazyOptional already swallows permanent
        failures, but a dedicated boundary with fallback={null} ensures
        any unexpected throw inside these banners can never blank the
        whole layout. */}
      <ErrorBoundary section="peripheral-chrome" fallback={null}>
        <Suspense fallback={null}>
          <CookieConsentBanner />
          {!isAdmin && <FeedbackButton />}
          {!isAdmin && <InstallBanner />}
        </Suspense>
      </ErrorBoundary>
    </div>
  );

  return isAdmin ? tree : <LucideProvider strokeWidth={2.5}>{tree}</LucideProvider>;
};
