import React, { Suspense, lazy } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router';
import './i18n';
import { AuthProvider } from '@/hooks/useAuth';
import { AccessibilityProvider } from '@/hooks/useAccessibility';
import { CookieConsentProvider } from '@/hooks/useCookieConsent';
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker';
import { CookieConsentBanner } from '@/components/privacy/CookieConsentBanner';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AdminRouteGuard } from '@/components/security/AdminRouteGuard';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { createOptimizedQueryClient } from '@/utils/queryOptimizations';
import Box from '@mui/material/Box';
const Aurora = lazy(() => import('@/components/ui/Aurora'));

const Index = lazyRetry(() => import('./pages/Index'));
const Venues = lazyRetry(() => import('./pages/Venues'));
const VenueDetail = lazyRetry(() => import('./pages/VenueDetail'));
const Events = lazyRetry(() => import('./pages/Events'));
const EventDetail = lazyRetry(() => import('./pages/EventDetail'));
const Marketplace = lazyRetry(() => import('./pages/Marketplace'));
const MarketplaceItemDetail = lazyRetry(() => import('./pages/MarketplaceItemDetail'));

const Places = lazyRetry(() => import('./pages/Places'));
const Resources = lazyRetry(() => import('./pages/Ressources'));
const UserDirectory = lazyRetry(() => import('./pages/UserDirectory'));
const Personalities = lazyRetry(() => import('./pages/Personalities'));
const PersonalityDetail = lazyRetry(() => import('./pages/PersonalityDetail'));
// CMS-managed pages (content from cms_pages table)
const CMSRoutePage = lazyRetry(() => import('./pages/CMSRoutePage'));
const Auth = lazyRetry(() => import('./pages/Auth'));

// Unified Admin Shell (wraps all /admin/* routes)
const AdminShell = lazy(() =>
  import('./components/admin/shell/AdminShell').then((m) => ({ default: m.AdminShell })),
);

// Admin page components (rendered inside AdminShell via Outlet)
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminCountries = lazy(() => import('./pages/AdminCountries'));
const AdminTags = lazy(() => import('./pages/AdminTags'));
const AdminCities = lazy(() => import('./pages/AdminCities'));
const AdminGroups = lazy(() => import('./pages/AdminGroups'));
const CityDetail = lazyRetry(() => import('./pages/CityDetail'));
const CountryDetail = lazyRetry(() => import('./pages/CountryDetail'));
const Travel = lazyRetry(() => import('./pages/Travel'));
const MapPage = lazyRetry(() => import('./pages/Map'));
const AdminVenues = lazy(() => import('./pages/AdminVenues'));
const AdminVenueCategories = lazy(() => import('./pages/AdminVenueCategories'));
const AdminVenueAmenities = lazy(() => import('./pages/AdminVenueAmenities'));
const AdminVenueServices = lazy(() => import('./pages/AdminVenueServices'));
const AdminEventTypes = lazy(() => import('./pages/AdminEventTypes'));
const AdminEventAmenities = lazy(() => import('./pages/AdminEventAmenities'));
const AdminEventServices = lazy(() => import('./pages/AdminEventServices'));
const AdminAccessibilityAttributes = lazy(() => import('./pages/AdminAccessibilityAttributes'));
const AdminTargetGroups = lazy(() => import('./pages/AdminTargetGroups'));
const AdminEvents = lazy(() => import('./pages/AdminEvents'));
const AdminMarketplace = lazy(() => import('./pages/AdminMarketplace'));
const AdminNewsSources = lazy(() => import('./pages/AdminNewsSources'));
const EmailTemplates = lazy(() => import('./pages/admin/EmailTemplates'));
const AdminPersonalities = lazy(() => import('./pages/AdminPersonalities'));
const AdminImportHub = lazy(() => import('./pages/AdminImportHub'));
const AdminRedirects = lazy(() => import('./pages/AdminRedirects'));
const AdminPipelines = lazy(() => import('./pages/AdminPipelines'));
const AdminEmailIngestions = lazy(() => import('./pages/AdminEmailIngestions'));

// New feature pages
const Hotels = lazyRetry(() => import('./pages/Hotels'));
const HotelDetail = lazyRetry(() => import('./pages/HotelDetail'));
const QueerVillageDetail = lazyRetry(() => import('./pages/QueerVillageDetail'));
// Festivals routes now redirect to /events (festivals integrated into events)

// New admin pages
const AdminHotels = lazy(() => import('./pages/AdminHotels'));
const AdminQueerVillages = lazy(() => import('./pages/AdminQueerVillages'));
const AdminReview = lazy(() => import('./pages/AdminReview'));
const AdminSubmissions = lazy(() => import('./pages/AdminSubmissions'));

// CMS components rendered as admin views
const AdminCMS = lazy(() => import('./pages/AdminCMS'));
const ContentListPanel = lazy(() =>
  import('./components/cms/ContentListPanel').then((m) => ({ default: m.ContentListPanel })),
);
const CMSOverview = lazy(() =>
  import('./components/cms/CMSOverview').then((m) => ({ default: m.CMSOverview })),
);
// ReviewQueue (CMS) is now loaded inside AdminReview page
const MediaLibrary = lazy(() =>
  import('./components/cms/MediaLibrary').then((m) => ({ default: m.MediaLibrary })),
);
const AuditLog = lazy(() =>
  import('./components/cms/AuditLog').then((m) => ({ default: m.AuditLog })),
);

// Import Hub components rendered as admin views
const ImportJobCreator = lazy(() =>
  import('./components/admin/ImportJobCreator').then((m) => ({ default: m.ImportJobCreator })),
);
const NewsSourcesManager = lazy(() =>
  import('./components/admin/NewsSourcesManager').then((m) => ({ default: m.NewsSourcesManager })),
);
const PipelineMonitor = lazy(() =>
  import('./components/admin/PipelineMonitor').then((m) => ({ default: m.PipelineMonitor })),
);
const EnrichmentDashboard = lazy(() =>
  import('./components/admin/EnrichmentDashboard').then((m) => ({
    default: m.EnrichmentDashboard,
  })),
);
const VenueImportQuickActions = lazy(() =>
  import('./components/admin/VenueImportQuickActions').then((m) => ({
    default: m.VenueImportQuickActions,
  })),
);
const ApiKeysManager = lazy(() =>
  import('./components/admin/ApiKeysManager').then((m) => ({ default: m.ApiKeysManager })),
);
const AffiliatePartnersManager = lazy(() =>
  import('./components/admin/AffiliatePartnersManager').then((m) => ({
    default: m.AffiliatePartnersManager,
  })),
);
const LinkHealthDashboard = lazy(() =>
  import('./components/admin/LinkHealthDashboard').then((m) => ({
    default: m.LinkHealthDashboard,
  })),
);

// Dashboard sub-views
const SecurityMonitoringDashboard = lazy(() =>
  import('./components/admin/SecurityMonitoringDashboard').then((m) => ({
    default: m.SecurityMonitoringDashboard,
  })),
);
const CloudflareDashboard = lazy(() =>
  import('./components/admin/CloudflareDashboard').then((m) => ({
    default: m.CloudflareDashboard,
  })),
);
const UmamiAnalyticsDashboard = lazy(() =>
  import('./components/analytics/UmamiAnalyticsDashboard').then((m) => ({
    default: m.UmamiAnalyticsDashboard,
  })),
);
const ProfessionDetail = lazyRetry(() => import('./pages/ProfessionDetail'));
const News = lazyRetry(() => import('./pages/News'));
const NewsDetail = lazyRetry(() => import('./pages/NewsDetail'));

const ProfileSettings = lazyRetry(() => import('./pages/ProfileSettings'));
const UserProfile = lazyRetry(() => import('./pages/UserProfile'));
const Feed = lazyRetry(() => import('./pages/Feed'));

const Messages = lazyRetry(() => import('./pages/Messages'));
const Inbox = lazyRetry(() => import('./pages/Inbox'));
const Friends = lazyRetry(() => import('./pages/Friends'));
const Groups = lazyRetry(() => import('./pages/Groups'));
const GroupDetail = lazyRetry(() => import('./pages/GroupDetail'));
const MyGroups = lazyRetry(() => import('./pages/MyGroups'));
const NotFound = lazyRetry(() => import('./pages/NotFound'));
const SearchResults = lazyRetry(() => import('./pages/SearchResults'));
const Favorites = lazyRetry(() => import('./pages/Favorites'));

const TripsPage = lazyRetry(() => import('./pages/trips/TripsPage'));
const TripPlannerPage = lazyRetry(() => import('./pages/trips/TripPlannerPage'));
const Donate = lazyRetry(() => import('./pages/Donate'));
const Sitemap = lazyRetry(() => import('./pages/Sitemap'));
const SubmitHub = lazyRetry(() => import('./pages/SubmitHub'));
const SubmitForm = lazyRetry(() => import('./pages/SubmitForm'));
const CMSPage = lazyRetry(() => import('./pages/Page'));

const queryClient = createOptimizedQueryClient();

// Retry wrapper for React.lazy — handles chunk load failures after deploys
function lazyRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((err) => {
      // If the chunk failed to load (e.g. after a new deploy changed hashes),
      // try a hard reload once. Use sessionStorage to prevent infinite loops.
      const key = 'chunk-reload-' + window.location.pathname;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        // Return a never-resolving promise so React doesn't render the error
        return new Promise(() => {});
      }
      // Already tried reloading — surface the real error
      sessionStorage.removeItem(key);
      throw err;
    }),
  );
}

/** Inner shell — uses useLocation (requires BrowserRouter ancestor) */
const AppRoutes = () => {
  const location = useLocation();

  // Move focus to main content on route change (a11y: WCAG 2.4.3)
  const mainRef = React.useRef<HTMLElement>(null);
  const isFirstRender = React.useRef(true);
  const pageRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    requestAnimationFrame(() => {
      mainRef.current?.focus({ preventScroll: false });
    });

    // Page entrance animation
    const el = pageRef.current;
    if (!el) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) return;

    el.classList.remove('page-transition-enter');
    // Force reflow to restart animation
    void el.offsetHeight;
    el.classList.add('page-transition-enter');
  }, [location.pathname]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      {/* Skip link for keyboard users (a11y: WCAG 2.4.1) */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: '-9999px',
          top: 'auto',
          width: 1,
          height: 1,
          overflow: 'hidden',
          zIndex: 9999,
          '&:focus': {
            position: 'fixed',
            top: 8,
            left: 8,
            width: 'auto',
            height: 'auto',
            overflow: 'visible',
            bgcolor: 'background.paper',
            color: 'text.primary',
            px: 2,
            py: 1,
            borderRadius: 1,
            boxShadow: 3,
            fontWeight: 600,
            fontSize: '0.875rem',
            textDecoration: 'none',
            outline: '3px solid',
            outlineColor: 'primary.main',
            outlineOffset: '2px',
          },
        }}
      >
        Skip to main content
      </Box>

      {/* Rainbow aurora background — fixed behind all content.
          bgcolor matches the theme so the transparent aurora edges
          blend into white (light) or black (dark). */}
      <Box
        aria-hidden="true"
        sx={(theme) => ({
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          bgcolor: theme.palette.mode === 'dark' ? '#000000' : '#ffffff',
        })}
      >
        <ErrorBoundary section="aurora" fallback={null}>
          <Suspense fallback={null}>
            <Aurora
              colorStops={['#F4A0B0', '#F5C5A0', '#F5E6A0', '#A0D8B0', '#A0B8E8', '#C4A0D8']}
              blend={0.15}
              amplitude={0.4}
              speed={0.08}
            />
          </Suspense>
        </ErrorBoundary>
      </Box>
      <AnalyticsTracker />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Header />
      </Box>
      <Box
        component="main"
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        sx={{ flex: 1, position: 'relative', zIndex: 1, outline: 'none' }}
      >
        {/* key={location.pathname} resets ErrorBoundary on every route change */}
        <ErrorBoundary key={location.pathname}>
          <Suspense
            fallback={
              <Box sx={{ py: 5, px: { xs: 2, sm: 3 }, maxWidth: 'lg', mx: 'auto' }}>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 3,
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  }}
                >
                  <Skeleton sx={{ height: 192 }} />
                  <Skeleton sx={{ height: 192 }} />
                </Box>
              </Box>
            }
          >
            <div ref={pageRef}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/venues" element={<Venues />} />
              <Route path="/venues/:id" element={<VenueDetail />} />
              <Route path="/events" element={<Events />} />
              <Route path="/events/:id" element={<EventDetail />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/marketplace/:id" element={<MarketplaceItemDetail />} />

              <Route path="/hotels" element={<Hotels />} />
              <Route path="/hotels/:id" element={<HotelDetail />} />
              <Route path="/villages" element={<Navigate to="/places" replace />} />
              <Route path="/villages/:slug" element={<QueerVillageDetail />} />
              <Route path="/festivals" element={<Navigate to="/events" replace />} />
              <Route path="/festivals/:id" element={<Navigate to="/events" replace />} />
              <Route path="/places" element={<Places />} />
              <Route path="/travel" element={<Travel />} />
              <Route path="/trips" element={<TripsPage />} />
              <Route path="/trips/:tripId" element={<TripPlannerPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/flights" element={<Navigate to="/travel" replace />} />
              <Route path="/city/:id" element={<CityDetail />} />
              <Route path="/country/:id" element={<CountryDetail />} />
              <Route path="/users" element={<UserDirectory />} />
              <Route path="/personalities" element={<Personalities />} />
              <Route path="/personalities/:id" element={<PersonalityDetail />} />
              <Route path="/resources" element={<Resources />} />
              <Route path="/resources/:tagName" element={<Resources />} />
              <Route path="/professions/:professionName" element={<ProfessionDetail />} />
              <Route path="/ressources" element={<Navigate to="/resources" replace />} />
              <Route path="/ressources/:tagName" element={<Navigate to="/resources" replace />} />
              <Route path="/tags" element={<Navigate to="/resources" replace />} />
              <Route path="/tags/:tagName" element={<Navigate to="/resources" replace />} />

              <Route path="/donate" element={<Donate />} />

              {/* CMS-managed pages (content from cms_pages table) */}
              <Route path="/about-hub" element={<CMSRoutePage slug="about-hub" />} />
              <Route path="/about" element={<CMSRoutePage slug="about" />} />
              <Route path="/contact" element={<CMSRoutePage slug="contact" />} />
              <Route path="/vision" element={<CMSRoutePage slug="vision" />} />
              <Route path="/values" element={<CMSRoutePage slug="values" />} />
              <Route path="/press" element={<CMSRoutePage slug="press" />} />
              <Route path="/blog" element={<CMSRoutePage slug="blog" />} />
              <Route path="/sustainability" element={<CMSRoutePage slug="sustainability" />} />
              <Route path="/legal" element={<CMSRoutePage slug="legal" />} />
              <Route path="/terms" element={<CMSRoutePage slug="terms" />} />
              <Route path="/privacy" element={<CMSRoutePage slug="privacy" />} />
              <Route path="/cookies" element={<CMSRoutePage slug="cookies" />} />
              <Route path="/dmca" element={<CMSRoutePage slug="dmca" />} />
              <Route path="/auth" element={<Auth />} />
              {/* ── Unified Admin Console ── */}
              {/* All /admin/* routes wrapped in AdminShell layout with sidebar */}
              <Route
                path="/admin"
                element={
                  <AdminRouteGuard>
                    <AdminShell />
                  </AdminRouteGuard>
                }
              >
                {/* Dashboard section */}
                <Route index element={<AdminDashboard />} />
                <Route path="analytics" element={<AdminAnalytics />} />
                <Route path="security" element={<SecurityMonitoringDashboard />} />
                <Route path="cloudflare" element={<CloudflareDashboard />} />

                {/* Content section -- unified list + per-type views */}
                <Route path="content" element={<ContentListPanel />} />
                <Route path="content/:type" element={<ContentListPanel />} />
                <Route path="pages" element={<ContentListPanel contentTypeId="cms_pages" />} />
                <Route path="media" element={<MediaLibrary />} />

                {/* Imports & Data section */}
                <Route path="imports" element={<AdminImportHub />} />
                <Route path="imports/create" element={<Navigate to="/admin/imports" replace />} />
                <Route path="imports/news-sources" element={<NewsSourcesManager />} />
                <Route path="imports/pipeline" element={<PipelineMonitor />} />
                <Route path="imports/enrichment" element={<Navigate to="/admin/pipelines?tab=monitor" replace />} />
                <Route path="imports/venues" element={<VenueImportQuickActions />} />
                <Route path="imports/email-ingestions" element={<AdminEmailIngestions />} />
                <Route path="imports/history" element={<AdminImportHub />} />
                <Route path="workflows" element={<Navigate to="/admin/pipelines?tab=health" replace />} />
                <Route path="pipelines" element={<AdminPipelines />} />
                <Route path="pipelines/dashboard" element={<Navigate to="/admin/pipelines?tab=monitor" replace />} />
                <Route path="scraping" element={<Navigate to="/admin/imports" replace />} />

                {/* Review & Workflow section -- unified dashboard */}
                <Route path="automation" element={<Navigate to="/admin/pipelines?tab=modules" replace />} />
                <Route path="review" element={<AdminReview />} />
                <Route
                  path="moderation"
                  element={<Navigate to="/admin/review?tab=moderation" replace />}
                />
                <Route path="audit" element={<AuditLog />} />
                <Route
                  path="links"
                  element={<Navigate to="/admin/automation" replace />}
                />
                <Route path="affiliates" element={<AffiliatePartnersManager />} />
                <Route
                  path="submissions"
                  element={<Navigate to="/admin/review?tab=submissions" replace />}
                />

                {/* Content type admin pages */}
                <Route path="hotels" element={<AdminHotels />} />
                <Route path="villages" element={<AdminQueerVillages />} />

                {/* System section */}
                <Route path="users" element={<AdminUsers />} />
                <Route path="api-keys" element={<ApiKeysManager />} />
                <Route path="redirects" element={<AdminRedirects />} />
                <Route path="email-templates" element={<EmailTemplates />} />

                {/* Settings -- taxonomy management pages */}
                <Route path="settings" element={<AdminTags />} />
                <Route path="settings/venue-categories" element={<AdminVenueCategories />} />
                <Route path="settings/venue-amenities" element={<AdminVenueAmenities />} />
                <Route path="settings/venue-services" element={<AdminVenueServices />} />
                <Route path="settings/event-types" element={<AdminEventTypes />} />
                <Route path="settings/event-amenities" element={<AdminEventAmenities />} />
                <Route path="settings/event-services" element={<AdminEventServices />} />
                <Route path="settings/accessibility" element={<AdminAccessibilityAttributes />} />
                <Route path="settings/target-groups" element={<AdminTargetGroups />} />

                {/* Legacy routes -- redirect to new paths */}
                <Route path="venues" element={<AdminVenues />} />
                <Route path="events" element={<AdminEvents />} />
                <Route path="tags" element={<AdminTags />} />
                <Route path="cities" element={<AdminCities />} />
                <Route path="countries" element={<AdminCountries />} />
                <Route path="personalities" element={<AdminPersonalities />} />
                <Route path="marketplace" element={<AdminMarketplace />} />
                <Route path="groups" element={<AdminGroups />} />
                <Route path="news-sources" element={<AdminNewsSources />} />
                <Route path="cms" element={<AdminCMS />} />
                <Route path="import-hub" element={<AdminImportHub />} />
                <Route path="festivals" element={<Navigate to="/admin/events" replace />} />
                <Route
                  path="venue-categories"
                  element={<Navigate to="/admin/settings/venue-categories" replace />}
                />
                <Route
                  path="venue-amenities"
                  element={<Navigate to="/admin/settings/venue-amenities" replace />}
                />
                <Route
                  path="venue-services"
                  element={<Navigate to="/admin/settings/venue-services" replace />}
                />
                <Route
                  path="event-types"
                  element={<Navigate to="/admin/settings/event-types" replace />}
                />
                <Route
                  path="event-amenities"
                  element={<Navigate to="/admin/settings/event-amenities" replace />}
                />
                <Route
                  path="event-services"
                  element={<Navigate to="/admin/settings/event-services" replace />}
                />
                <Route
                  path="accessibility-attributes"
                  element={<Navigate to="/admin/settings/accessibility" replace />}
                />
                <Route
                  path="target-groups"
                  element={<Navigate to="/admin/settings/target-groups" replace />}
                />
              </Route>
              <Route path="/news" element={<News />} />
              <Route path="/news/:id" element={<NewsDetail />} />
              <Route path="/search" element={<SearchResults />} />

              <Route path="/groups" element={<Groups />} />
              <Route path="/groups/:groupId" element={<GroupDetail />} />
              <Route path="/my-groups" element={<MyGroups />} />
              <Route path="/accessibility" element={<CMSRoutePage slug="accessibility" />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/friends" element={<Friends />} />

              <Route path="/favorites" element={<Favorites />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/community" element={<Navigate to="/feed" replace />} />
              <Route path="/profile/settings" element={<ProfileSettings />} />
              <Route path="/user/:userId" element={<UserProfile />} />
              <Route path="/sitemap" element={<Sitemap />} />
              <Route path="/submit" element={<SubmitHub />} />
              <Route path="/submit/:contentType" element={<SubmitForm />} />
              <Route path="/p/:slug" element={<CMSPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </div>
          </Suspense>
        </ErrorBoundary>
      </Box>
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Footer />
      </Box>
      <CookieConsentBanner />
    </Box>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="queer-guide-theme">
        <AccessibilityProvider>
          <CookieConsentProvider>
            <AuthProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <AppRoutes />
                </BrowserRouter>
              </TooltipProvider>
            </AuthProvider>
          </CookieConsentProvider>
        </AccessibilityProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
