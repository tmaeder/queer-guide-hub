import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useSearchTelemetry } from '@/providers/SearchTelemetryProvider';
import { AdminRouteGuard } from '@/components/security/AdminRouteGuard';
import { LocaleRouter } from '@/components/routing/LocaleRouter';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteFade } from '@/components/layout/RouteFade';
import { lazyRetry } from '@/utils/lazyRetry';
import { submissionRegistry } from '@/config/submissionRegistry';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/languages';
import { useAuth } from '@/hooks/useAuth';

const Index = lazyRetry(() => import('./pages/Index'));
const Venues = lazyRetry(() => import('./pages/Venues'));
const EntityDetail = lazyRetry(() => import('./pages/EntityDetail'));
const Guides = lazyRetry(() => import('./pages/Guides'));
const GuideDetail = lazyRetry(() => import('./pages/GuideDetail'));
const ProfilePage = lazyRetry(() => import('./pages/profile/ProfilePage'));
const VenuePersonalization = lazyRetry(() => import('./pages/onboarding/VenuePersonalization'));
const Events = lazyRetry(() => import('./pages/Events'));
const EventDetail = lazyRetry(() => import('./pages/EventDetail'));
const Marketplace = lazyRetry(() => import('./pages/Marketplace'));
const MarketplaceItemDetail = lazyRetry(() => import('./pages/MarketplaceItemDetail'));
const MarketplaceCategory = lazyRetry(() => import('./pages/MarketplaceCategory'));
const MarketplaceCategories = lazyRetry(() => import('./pages/MarketplaceCategories'));
const MarketplaceMerchant = lazyRetry(() => import('./pages/MarketplaceMerchant'));
const MarketplaceBrand = lazyRetry(() => import('./pages/MarketplaceBrand'));
const Organizations = lazyRetry(() => import('./pages/Organizations'));
const HistoryTimeline = lazyRetry(() => import('./pages/HistoryTimeline'));
const MarketplaceShare = lazyRetry(() => import('./pages/MarketplaceShare'));
const MarketplaceCollection = lazyRetry(() => import('./pages/MarketplaceCollection'));
const Wishlist = lazyRetry(() => import('./pages/Wishlist'));
const Wishlists = lazyRetry(() => import('./pages/Wishlists'));

const GoingOut = lazyRetry(() => import('./pages/intent/GoingOut'));
const RightsIntent = lazyRetry(() => import('./pages/intent/Rights'));
const RightsSources = lazyRetry(() => import('./pages/rights/RightsSources'));
const ShopIntent = lazyRetry(() => import('./pages/intent/Shop'));
const Resources = lazyRetry(() => import('./pages/Resources'));
const ConnectionsExplorer = lazyRetry(() => import('./pages/explore/ConnectionsExplorer'));
const ResourceTopic = lazyRetry(() => import('./pages/resources/ResourceTopic'));
const Personalities = lazyRetry(() => import('./pages/Personalities'));
const PersonalityDetail = lazyRetry(() => import('./pages/PersonalityDetail'));
// CMS-managed pages (content from cms_pages table)
const CMSRoutePage = lazyRetry(() => import('./pages/CMSRoutePage'));
const About = lazyRetry(() => import('./pages/About'));
const BrandGuidelines = lazyRetry(() => import('./pages/Brand'));
const Contact = lazyRetry(() => import('./pages/Contact'));
const Auth = lazyRetry(() => import('./pages/Auth'));
const AuthCallback = lazyRetry(() => import('./pages/AuthCallback'));
const ClaimUsername = lazyRetry(() => import('./pages/ClaimUsername'));
const ExtensionInstall = lazyRetry(() => import('./pages/ExtensionInstall'));
const OnboardingWelcome = lazyRetry(() => import('./pages/onboarding/Welcome'));
const SearchPersonalization = lazyRetry(() => import('./pages/onboarding/SearchPersonalization'));
// Dev-only design showcase — not shipped as a public route in production.
const PatternLibrary = lazyRetry(() => import('./pages/PatternLibrary'));

// Unified Admin Shell (wraps all /admin/* routes)
const AdminShell = lazyRetry(() =>
  import('./components/admin/shell/AdminShell').then((m) => ({ default: m.AdminShell })),
);

// Admin page components (rendered inside AdminShell via Outlet)
const AdminDashboard = lazyRetry(() => import('./pages/admin/AdminDashboard'));
const AdminAnalytics = lazyRetry(() => import('./pages/admin/AdminAnalytics'));
const AdminMaps = lazyRetry(() => import('./pages/admin/AdminMaps'));
const AdminUsers = lazyRetry(() => import('./pages/admin/AdminUsers'));
const AdminTags = lazyRetry(() => import('./pages/admin/AdminTags'));
const Cities = lazyRetry(() => import('./pages/Cities'));
const CitiesCompare = lazyRetry(() => import('./pages/cities/Compare'));
const CityDetail = lazyRetry(() => import('./pages/CityDetail'));
const CountryDetail = lazyRetry(() => import('./pages/CountryDetail'));
const Travel = lazyRetry(() => import('./pages/Travel'));
const TravelBook = lazyRetry(() => import('./pages/travel/Book'));
const MapPage = lazyRetry(() => import('./pages/Map'));
const AdminDuplicates = lazyRetry(() => import('./pages/admin/AdminDuplicates'));
const PersonalityDataSheet = lazyRetry(() => import('./pages/admin/PersonalityDataSheet'));
const PersonalitiesAdmin = lazyRetry(() => import('./pages/admin/PersonalitiesAdmin'));
const MilestonesAdmin = lazyRetry(() => import('./pages/admin/MilestonesAdmin'));
const AdminMailbox = lazyRetry(() => import('./pages/admin/AdminMailbox'));
const AdminLiveness = lazyRetry(() => import('./pages/admin/AdminLiveness'));
const QualityHub = lazyRetry(() => import('./pages/admin/QualityHub'));
const ContentGraph = lazyRetry(() => import('./pages/admin/ContentGraph'));
const AdminTwentyCrm = lazyRetry(() => import('./pages/admin/AdminTwentyCrm'));
const EmailTemplates = lazyRetry(() => import('./pages/admin/EmailTemplates'));
const AdminPlacesEditorial = lazyRetry(() => import('./pages/admin/AdminPlacesEditorial'));
const AdminPipelines = lazyRetry(() => import('./pages/admin/AdminPipelines'));
const AdminEmailIngestions = lazyRetry(() => import('./pages/admin/AdminEmailIngestions'));
const AdminImports = lazyRetry(() => import('./pages/admin/AdminImports'));
const AdminEventQuality = lazyRetry(() => import('./pages/admin/AdminEventQuality'));
const AdminGroupRequests = lazyRetry(() => import('./pages/admin/AdminGroupRequests'));
const AdminSearchIntelligence = lazyRetry(() => import('./pages/admin/AdminSearchIntelligence'));
const AdminRecognition = lazyRetry(() => import('./pages/admin/Recognition'));
const AdminDesignSystem = lazyRetry(() => import('./pages/admin/DesignSystem'));
const Contributors = lazyRetry(() => import('./pages/Contributors'));

// New feature pages
const Hotels = lazyRetry(() => import('./pages/Hotels'));
const HotelDetail = lazyRetry(() => import('./pages/HotelDetail'));
const QueerVillageDetail = lazyRetry(() => import('./pages/QueerVillageDetail'));
const PlaceDetail = lazyRetry(() => import('./pages/PlaceDetail'));
// Festivals routes now redirect to /events (festivals integrated into events)

// New admin pages
const AdminGeography = lazyRetry(() => import('./pages/admin/AdminGeography'));
const AdminInbox = lazyRetry(() => import('./pages/admin/AdminInbox'));
const AdminAutomation = lazyRetry(() => import('./pages/admin/AdminAutomation'));
const AdminFeedback = lazyRetry(() => import('./pages/admin/feedback'));
const AdminNotFound = lazyRetry(() => import('./pages/admin/AdminNotFound'));
const AdminAffiliate = lazyRetry(() => import('./pages/admin/AdminAffiliate'));
const AdminBusiness = lazyRetry(() => import('./pages/admin/AdminBusiness'));
const AdminBusinessDetail = lazyRetry(() => import('./pages/admin/AdminBusinessDetail'));

// CMS components rendered as admin views
const ContentListPanel = lazyRetry(() =>
  import('./components/cms/ContentListPanel').then((m) => ({ default: m.ContentListPanel })),
);
// ReviewQueue (CMS) is now loaded inside AdminReview page
const MediaLibrary = lazyRetry(() =>
  import('./components/cms/MediaLibrary').then((m) => ({ default: m.MediaLibrary })),
);
const MediaDetailPage = lazyRetry(() =>
  import('./components/cms/MediaLibrary/MediaDetailPage').then((m) => ({
    default: m.MediaDetailPage,
  })),
);
const AuditLog = lazyRetry(() =>
  import('./components/cms/AuditLog').then((m) => ({ default: m.AuditLog })),
);

// Import Hub components rendered as admin views

// Dashboard sub-views
const SecurityMonitoringDashboard = lazyRetry(() =>
  import('./components/admin/SecurityMonitoringDashboard').then((m) => ({
    default: m.SecurityMonitoringDashboard,
  })),
);
const CloudflareDashboard = lazyRetry(() =>
  import('./components/admin/CloudflareDashboard').then((m) => ({
    default: m.CloudflareDashboard,
  })),
);
const ProfessionDetail = lazyRetry(() => import('./pages/ProfessionDetail'));
const News = lazyRetry(() => import('./pages/News'));
const NewsArchive = lazyRetry(() => import('./pages/NewsArchive'));
const NewsDetail = lazyRetry(() => import('./pages/NewsDetail'));
const NewsStoryDetail = lazyRetry(() => import('./pages/NewsStoryDetail'));

const Settings = lazyRetry(() => import('./pages/Settings'));
const IntimateOnboard = lazyRetry(() => import('./pages/intimate/IntimateOnboard'));
const IntimateUserDetail = lazyRetry(() => import('./pages/intimate/IntimateUserDetail'));
const KinkChecklist = lazyRetry(() => import('./pages/tools/KinkChecklist'));
const KinkShareView = lazyRetry(() => import('./pages/tools/KinkShareView'));

const People = lazyRetry(() => import('./pages/people/People'));
const PeopleMode = lazyRetry(() => import('./pages/people/PeopleMode'));
const Community = lazyRetry(() => import('./pages/Community'));

const HubPage = lazyRetry(() => import('./pages/hub/HubPage'));
const GroupDetail = lazyRetry(() => import('./pages/GroupDetail'));
const GroupInviteAccept = lazyRetry(() => import('./pages/GroupInviteAccept'));
const NotFound = lazyRetry(() => import('./pages/NotFound'));
const SearchResults = lazyRetry(() => import('./pages/SearchResults'));
const TripWorkspace = lazyRetry(() => import('./pages/trips/TripWorkspace'));
const TripsDiscoverPage = lazyRetry(() => import('./pages/trips/TripsDiscoverPage'));
const SharedTripPage = lazyRetry(() => import('./pages/trips/SharedTripPage'));
const TripSubrouteRedirect = lazyRetry(() => import('./pages/trips/TripSubrouteRedirect'));
const Donate = lazyRetry(() => import('./pages/Donate'));
const Sitemap = lazyRetry(() => import('./pages/Sitemap'));
const SubmitHub = lazyRetry(() => import('./pages/SubmitHub'));
const SubmitForm = lazyRetry(() => import('./pages/SubmitForm'));
const FeedbackBoard = lazyRetry(() => import('./pages/FeedbackBoard'));
const HelpHotlines = lazyRetry(() => import('./pages/HelpHotlines'));
const CMSPage = lazyRetry(() => import('./pages/Page'));
const ShareTarget = lazyRetry(() => import('./pages/ShareTarget'));
const PridePage = lazyRetry(() => import('./pages/Pride'));

/** Preserves ?tab=/?section= deep links when /profile/settings moves to /settings. */
function SettingsRedirect() {
  const location = useLocation();
  return <Navigate to={`/settings${location.search}`} replace />;
}

/** /admin/review merged into /admin/inbox — preserve ?tab=/?queue= deep links. */
function ReviewRedirect() {
  const location = useLocation();
  return <Navigate to={`/admin/inbox${location.search}`} replace />;
}

/** Maps the legacy /profile/footprint/:userId/public URL to the unified profile Travel tab. */
function FootprintRedirect() {
  const { userId } = useParams<{ userId: string }>();
  return <Navigate to={`/user/${userId}/travel`} replace />;
}

/**
 * Identity tabs formerly under /me/* need the signed-in user's id to land on
 * the unified public-profile route (/user/:id/:tab). Locale-preserving,
 * search-preserving; anonymous visitors go to /auth.
 */
function MeRedirect({ tab }: { tab?: string }) {
  const { user, loading } = useAuth();
  const { locale } = useParams<{ locale?: string }>();
  const location = useLocation();
  const prefix =
    locale && isSupportedLocale(locale) && locale !== DEFAULT_LOCALE ? `/${locale}` : '';
  if (loading) return null;
  if (!user) return <Navigate to={`${prefix}/auth`} replace />;
  return (
    <Navigate to={`${prefix}/user/${user.id}${tab ? `/${tab}` : ''}${location.search}`} replace />
  );
}

/**
 * Legacy /resources/:tagName → /tags/:tagName redirect, preserving locale prefix.
 */
function ResourcesTagRedirect() {
  const { tagName, locale } = useParams<{ tagName: string; locale?: string }>();
  const prefix =
    locale && isSupportedLocale(locale) && locale !== DEFAULT_LOCALE ? `/${locale}` : '';
  return <Navigate to={`${prefix}/tags/${tagName ?? ''}`} replace />;
}

/**
 * Locale-preserving redirect for the personal-layer route folds. A raw
 * `<Navigate to="/me/trips">` drops the `/:locale?` prefix, so `/ar/trips`
 * would bounce to the default-locale (LTR/English) hub — an i18n regression.
 * This re-prefixes the current locale (mirroring LocalizedLink) and carries
 * the source query string through, unless `to` already specifies one.
 */
function LocalizedRedirect({ to }: { to: string }) {
  const { locale } = useParams<{ locale?: string }>();
  const location = useLocation();
  const prefix =
    locale && isSupportedLocale(locale) && locale !== DEFAULT_LOCALE ? `/${locale}` : '';
  const search = to.includes('?') ? '' : location.search;
  return <Navigate to={`${prefix}${to}${search}`} replace />;
}

/**
 * Locale-preserving slug alias: legacy/misspelled URL schemes still indexed by
 * crawlers (/personality/x, /geography/x) redirect to the canonical detail
 * route instead of 404ing.
 */
function SlugAliasRedirect({ toBase }: { toBase: string }) {
  const { locale, slug } = useParams<{ locale?: string; slug?: string }>();
  const prefix =
    locale && isSupportedLocale(locale) && locale !== DEFAULT_LOCALE ? `/${locale}` : '';
  return <Navigate to={`${prefix}/${toBase}/${slug ?? ''}`} replace />;
}

/** /profession/:slug (legacy) → personalities directory filtered by profession. */
function ProfessionRedirect() {
  const { locale, slug } = useParams<{ locale?: string; slug?: string }>();
  const prefix =
    locale && isSupportedLocale(locale) && locale !== DEFAULT_LOCALE ? `/${locale}` : '';
  return (
    <Navigate to={`${prefix}/personalities?profession=${encodeURIComponent(slug ?? '')}`} replace />
  );
}

/** Routes table + per-route ErrorBoundary/Suspense/RouteFade and a11y main element */
export const AppRoutes = () => {
  const location = useLocation();

  // Auto-fire `view` events into the search-proxy bias vector on route change.
  useSearchTelemetry();

  // Move focus to main content on route change (a11y: WCAG 2.4.3)
  const mainRef = React.useRef<HTMLElement>(null);
  const lastPathRef = React.useRef<string | null>(null);
  const [routeAnnouncement, setRouteAnnouncement] = React.useState('');
  const { t } = useTranslation();

  // Gate on the pathname ACTUALLY changing, not on "this isn't the first
  // effect run". `t` is a dependency (the announcement is translated) and
  // react-i18next hands back a fresh `t` identity once i18next emits
  // `initialized`/`loaded` — which happens shortly AFTER first paint. The old
  // one-shot `isFirstRender` flag was already spent by then, so that second
  // run focused <main> on the very first page load. Focusing a `tabIndex={-1}`
  // <main> with `preventScroll: false` scrolls it into view, which jumped the
  // document ~127px with no user input, latched useCompactHeader (>40px, and
  // it never un-latches without a later scroll below 4px) and collapsed the
  // header to its one-line state — deleting the entire desktop Intent Router
  // row, so /venues and /people were unreachable from desktop chrome on every
  // fresh load. It also announced "Navigated to …" to screen readers before
  // any navigation had happened.
  React.useEffect(() => {
    const previousPath = lastPathRef.current;
    lastPathRef.current = location.pathname;
    // null = first run (seed only). Equal = a `t` identity change or a
    // StrictMode double-invoke, neither of which is a navigation.
    if (previousPath === null || previousPath === location.pathname) return;
    requestAnimationFrame(() => {
      mainRef.current?.focus({ preventScroll: false });
      // Announce route change to screen readers
      const title = document.title || location.pathname.replace(/\//g, ' ').trim() || 'Home';
      setRouteAnnouncement(t('a11y.navigatedTo', 'Navigated to {{title}}', { title }));
    });
  }, [location.pathname, t]);

  return (
    <>
      {/* Screen reader route change announcements (a11y: WCAG 4.1.3) */}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="absolute w-px h-px overflow-hidden whitespace-nowrap"
        style={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)' }}
      >
        {routeAnnouncement}
      </div>
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        // overflow-x-clip: a viewport-level guard against horizontal page scroll
        // at 320px (WCAG 1.4.10). `clip` (not hidden/auto) doesn't establish a
        // scroll container, so position:sticky inside pages and the -mx-4
        // edge-bleed scroll strips keep working; it only trims stray X overflow.
        className="flex-1 relative z-[1] outline-none overflow-x-clip"
      >
        {/* key={location.pathname} resets ErrorBoundary on every route change */}
        <ErrorBoundary key={location.pathname}>
          <Suspense
            fallback={
              <div className="py-10 px-4 sm:px-6 mx-auto">
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
                  <Skeleton />
                  <Skeleton />
                </div>
              </div>
            }
          >
            <RouteFade>
              <Routes>
                {/* Auth routes — no locale prefix */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/claim-username" element={<ClaimUsername />} />
                <Route path="/extension" element={<ExtensionInstall />} />
                {import.meta.env.DEV && (
                  <Route path="/pattern-library" element={<PatternLibrary />} />
                )}
                <Route path="/onboarding/welcome" element={<OnboardingWelcome />} />
                <Route path="/onboarding/search" element={<SearchPersonalization />} />
                <Route path="/onboarding/venues" element={<VenuePersonalization />} />
                <Route path="/contributors" element={<Contributors />} />
                <Route path="/contributors/:year" element={<Contributors />} />
                <Route path="/brand" element={<BrandGuidelines />} />
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
                  <Route path="affiliate" element={<AdminAffiliate />} />
                  {/* Vendors and brands were absorbed by the Business console. */}
                  <Route
                    path="vendors"
                    element={<Navigate to="/admin/business?tab=merchants" replace />}
                  />
                  <Route
                    path="brands"
                    element={<Navigate to="/admin/business?tab=brands" replace />}
                  />
                  <Route path="business" element={<AdminBusiness />} />
                  <Route path="business/:id" element={<AdminBusinessDetail />} />
                  <Route path="maps" element={<AdminMaps />} />
                  <Route path="security" element={<SecurityMonitoringDashboard />} />
                  <Route path="cloudflare" element={<CloudflareDashboard />} />

                  {/* Content section -- unified list + per-type views */}
                  <Route path="content" element={<ContentListPanel />} />
                  {/* Personalities gets a Personencheck dashboard header above the
                    generic list; static path wins over content/:type. */}
                  <Route path="content/personalities" element={<PersonalitiesAdmin />} />
                  {/* Milestones reuse the generic list but add an "AI suggestions"
                    action above it; static path wins over content/:type. */}
                  <Route path="content/milestones" element={<MilestonesAdmin />} />
                  <Route path="content/:type" element={<ContentListPanel />} />
                  {/* /admin/pages duplicated /admin/content/cms_pages (what nav points at);
                    kept as a redirect for old bookmarks. */}
                  <Route
                    path="pages"
                    element={<Navigate to="/admin/content/cms_pages" replace />}
                  />
                  <Route path="media" element={<MediaLibrary />} />
                  <Route path="media/:id" element={<MediaDetailPage />} />

                  {/* Imports & Data section — admin-internal aliases for the old
                    /admin/imports/* surfaces were pruned 2026-07 (migration to
                    /admin/pipelines completed 2026-04); a catch-all keeps deep
                    bookmarks landing on the pipelines hub. */}
                  <Route path="imports/email-ingestions" element={<AdminEmailIngestions />} />
                  <Route path="imports/data" element={<AdminImports />} />
                  <Route path="imports/*" element={<Navigate to="/admin/pipelines" replace />} />
                  <Route path="imports" element={<Navigate to="/admin/pipelines" replace />} />
                  <Route path="workflows" element={<Navigate to="/admin/pipelines" replace />} />
                  <Route path="pipelines" element={<AdminPipelines />} />
                  <Route
                    path="ingestion-rules"
                    element={<Navigate to="/admin/imports/data" replace />}
                  />
                  <Route
                    path="pipelines/dashboard"
                    element={<Navigate to="/admin/pipelines" replace />}
                  />
                  <Route
                    path="scraping"
                    element={<Navigate to="/admin/pipelines?tab=sources" replace />}
                  />

                  {/* Review & Workflow section -- unified dashboard */}
                  <Route path="review" element={<ReviewRedirect />} />
                  <Route path="inbox" element={<AdminInbox />} />
                  <Route path="automation" element={<AdminAutomation />} />
                  <Route path="feedback" element={<AdminFeedback />} />
                  <Route
                    path="moderation"
                    element={<Navigate to="/admin/inbox?tab=moderation" replace />}
                  />
                  <Route path="audit" element={<AuditLog />} />
                  <Route path="search-intelligence" element={<AdminSearchIntelligence />} />
                  <Route path="design" element={<AdminDesignSystem />} />
                  <Route path="links" element={<Navigate to="/admin/automation" replace />} />
                  <Route
                    path="affiliates"
                    element={<Navigate to="/admin/affiliate?tab=partners" replace />}
                  />
                  <Route
                    path="submissions"
                    element={<Navigate to="/admin/inbox?tab=submissions" replace />}
                  />

                  {/* Content type admin pages */}
                  {/* Standalone quality pages folded into the hub (P5) — review lives in the inbox. */}
                  <Route
                    path="content/venue-quality"
                    element={<Navigate to="/admin/quality" replace />}
                  />
                  <Route path="quality" element={<QualityHub />} />
                  <Route path="graph" element={<ContentGraph />} />
                  <Route path="content/liveness" element={<AdminLiveness />} />
                  <Route path="content/event-quality" element={<AdminEventQuality />} />
                  <Route
                    path="content/city-quality"
                    element={<Navigate to="/admin/quality" replace />}
                  />
                  <Route
                    path="content/personality-quality"
                    element={<Navigate to="/admin/quality" replace />}
                  />
                  <Route
                    path="content/personalities/:id/datasheet"
                    element={<PersonalityDataSheet />}
                  />
                  {/* Legacy — milestone curation moved to the generic CMS. Keep one release. */}
                  <Route
                    path="personalities/milestones"
                    element={<Navigate to="/admin/content/milestones" replace />}
                  />
                  <Route path="postfach" element={<AdminMailbox />} />
                  <Route
                    path="content/marketplace-quality"
                    element={<Navigate to="/admin/quality" replace />}
                  />
                  <Route path="content/twenty-crm" element={<AdminTwentyCrm />} />
                  <Route
                    path="content/village-quality"
                    element={<Navigate to="/admin/quality" replace />}
                  />
                  <Route path="content/group-requests" element={<AdminGroupRequests />} />
                  {/* Hotel CRUD now lives in the Business console's Hotels tab. */}
                  <Route
                    path="hotels"
                    element={<Navigate to="/admin/business?tab=hotels" replace />}
                  />
                  <Route
                    path="villages"
                    element={<Navigate to="/admin/content/queer_villages" replace />}
                  />
                  <Route path="geography" element={<AdminGeography />} />

                  {/* System section */}
                  <Route path="users" element={<AdminUsers />} />
                  <Route
                    path="redirects"
                    element={<Navigate to="/admin/content/redirects" replace />}
                  />
                  <Route path="email-templates" element={<EmailTemplates />} />
                  <Route path="recognition" element={<AdminRecognition />} />

                  {/* Settings -- taxonomy management pages */}
                  <Route path="settings" element={<AdminTags />} />
                  <Route
                    path="settings/venue-categories"
                    element={<Navigate to="/admin/content/venue_categories" replace />}
                  />
                  <Route
                    path="settings/venue-services"
                    element={<Navigate to="/admin/content/venue_services" replace />}
                  />
                  <Route
                    path="settings/event-types"
                    element={<Navigate to="/admin/content/event_types" replace />}
                  />
                  <Route
                    path="settings/event-amenities"
                    element={<Navigate to="/admin/content/event_amenities" replace />}
                  />
                  <Route
                    path="settings/event-services"
                    element={<Navigate to="/admin/content/event_services" replace />}
                  />
                  <Route
                    path="settings/accessibility"
                    element={<Navigate to="/admin/content/accessibility_attributes" replace />}
                  />
                  <Route
                    path="settings/target-groups"
                    element={<Navigate to="/admin/content/target_groups" replace />}
                  />
                  <Route
                    path="settings/professions"
                    element={<Navigate to="/admin/content/professions" replace />}
                  />

                  {/* Legacy routes -- redirect to new paths */}
                  <Route path="venues" element={<Navigate to="/admin/content/venues" replace />} />
                  <Route path="duplicates" element={<AdminDuplicates />} />
                  <Route path="events" element={<Navigate to="/admin/content/events" replace />} />
                  <Route
                    path="tags"
                    element={<Navigate to="/admin/content/unified_tags" replace />}
                  />
                  <Route path="cities" element={<Navigate to="/admin/quality" replace />} />
                  <Route
                    path="countries"
                    element={<Navigate to="/admin/content/countries" replace />}
                  />
                  <Route
                    path="personalities"
                    element={<Navigate to="/admin/content/personalities" replace />}
                  />
                  <Route path="quests" element={<Navigate to="/admin/content/guides" replace />} />
                  <Route path="places-editorial" element={<AdminPlacesEditorial />} />
                  <Route
                    path="marketplace"
                    element={<Navigate to="/admin/content/marketplace_listings" replace />}
                  />
                  <Route
                    path="marketplace/guides"
                    element={<Navigate to="/admin/content/guides" replace />}
                  />
                  <Route
                    path="venue-guides"
                    element={<Navigate to="/admin/content/guides" replace />}
                  />
                  <Route
                    path="groups"
                    element={<Navigate to="/admin/content/community_groups" replace />}
                  />
                  <Route
                    path="news-sources"
                    element={<Navigate to="/admin/pipelines?tab=sources" replace />}
                  />
                  <Route path="cms" element={<Navigate to="/admin/content" replace />} />
                  <Route path="import-hub" element={<Navigate to="/admin/pipelines" replace />} />
                  <Route path="festivals" element={<Navigate to="/admin/events" replace />} />
                  <Route
                    path="venue-categories"
                    element={<Navigate to="/admin/settings/venue-categories" replace />}
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

                  {/* Unknown /admin/* — React Router ranks "*" lowest, so this can
                    never shadow content/:type. Without it the shell renders an
                    empty content area, which reads as a broken page. */}
                  <Route path="*" element={<AdminNotFound />} />
                </Route>

                {/* ── Locale-aware public routes ── */}
                {/* /:locale? makes the locale segment optional — /venues and /de/venues both work */}
                <Route path="/:locale?" element={<LocaleRouter />}>
                  <Route index element={<Index />} />
                  {/* Declared FIRST among the locale parent's children on purpose.
                  React Router expands the optional `:locale?`, so /p/about
                  scores `/:locale/about` (locale="p" → About) and `/p/:slug`
                  (slug="about" → CMSPage) identically (17). The tie breaks
                  toward the earlier-declared sibling, so every CMS slug that
                  also names a top-level route (about, contact, help, blog,
                  press, …) rendered NotFound via LocaleRouter's unknown-locale
                  branch. Unlike the `submit/<slug>` fix below, CMS slugs are DB
                  rows and can't be enumerated into static paths, so ordering is
                  the lever: from here `p/:slug` wins every /p/* tie, and its
                  static first segment means it can steal nothing else.
                  Guarded by src/__tests__/cmsPageRouting.test.tsx. */}
                  <Route path="p/:slug" element={<CMSPage />} />
                  <Route path="venues" element={<Venues />} />
                  {/* Section-name slugs collide with /venues/:slug — redirect to top-level pages */}
                  <Route path="venues/hotels" element={<Navigate to="/hotels" replace />} />
                  <Route path="venues/events" element={<Navigate to="/events" replace />} />
                  <Route path="venues/news" element={<Navigate to="/news" replace />} />
                  <Route
                    path="venues/marketplace"
                    element={<Navigate to="/marketplace" replace />}
                  />
                  <Route path="venues/travel" element={<Navigate to="/travel" replace />} />
                  <Route path="venues/groups" element={<Navigate to="/groups" replace />} />
                  <Route path="venues/resources" element={<Navigate to="/tags" replace />} />
                  {/* Legacy routes — canonical lives under /me/*. Keep one release. */}
                  <Route
                    path="venues/leaderboard"
                    element={<Navigate to="/me/progress" replace />}
                  />
                  <Route path="venues/passport" element={<Navigate to="/me/progress" replace />} />
                  <Route path="guides" element={<Guides />} />
                  <Route path="guides/:slug" element={<GuideDetail />} />
                  <Route
                    path="venues/guides"
                    element={<LocalizedRedirect to="/guides?entity=venue" />}
                  />
                  <Route
                    path="venues/guides/:slug"
                    element={<SlugAliasRedirect toBase="guides" />}
                  />
                  <Route path="venues/:slug" element={<EntityDetail source="venue" />} />
                  <Route path="organizations" element={<Organizations />} />
                  <Route
                    path="organizations/:slug"
                    element={<EntityDetail source="organization" />}
                  />
                  <Route path="history" element={<HistoryTimeline />} />
                  <Route path="history/:slug" element={<EntityDetail source="milestone" />} />
                  <Route path="milestones" element={<Navigate to="/history" replace />} />
                  <Route path="events" element={<Events />} />
                  <Route
                    path="events/guides"
                    element={<LocalizedRedirect to="/guides?entity=event" />}
                  />
                  <Route
                    path="events/guides/:slug"
                    element={<SlugAliasRedirect toBase="guides" />}
                  />
                  <Route path="events/:slug" element={<EventDetail />} />
                  <Route path="pride" element={<PridePage />} />
                  <Route path="pride/:year" element={<PridePage />} />
                  <Route path="marketplace" element={<Marketplace />} />
                  <Route path="marketplace/share" element={<MarketplaceShare />} />
                  <Route
                    path="marketplace/missions"
                    element={<Navigate to="/me/progress" replace />}
                  />
                  <Route path="marketplace/categories" element={<MarketplaceCategories />} />
                  <Route path="marketplace/category/:slug" element={<MarketplaceCategory />} />
                  <Route path="marketplace/collection/:slug" element={<MarketplaceCollection />} />
                  <Route
                    path="marketplace/guides"
                    element={<LocalizedRedirect to="/guides?entity=marketplace" />}
                  />
                  <Route
                    path="marketplace/guides/:slug"
                    element={<SlugAliasRedirect toBase="guides" />}
                  />
                  <Route path="marketplace/merchants/:domain" element={<MarketplaceMerchant />} />
                  <Route path="marketplace/brands/:slug" element={<MarketplaceBrand />} />
                  <Route path="marketplace/:slug" element={<MarketplaceItemDetail />} />
                  <Route path="wishlists" element={<Wishlists />} />
                  <Route path="wishlists/:slug" element={<Wishlist />} />
                  <Route path="hotels" element={<Hotels />} />
                  <Route path="hotels/:slug" element={<HotelDetail />} />
                  <Route path="villages" element={<Navigate to="/places" replace />} />
                  <Route path="villages/:slug" element={<QueerVillageDetail />} />
                  <Route path="place/:slug" element={<PlaceDetail />} />
                  <Route path="festivals" element={<Navigate to="/events" replace />} />
                  <Route path="festivals/:id" element={<Navigate to="/events" replace />} />
                  {/* Intent Router. Top-level nav names the JOB, not the table.
                    Slug rules, both load-bearing and asserted by
                    src/config/__tests__/navigation.test.ts and
                    src/__tests__/intentNavRouting.test.tsx:
                      1. Never a 2-letter first segment — stripLocale() in
                         src/lib/locale.ts strips ANY [a-z]{2} leading segment,
                         so `/go` would be silently rewritten to `/` by the
                         header, the bottom nav, RouteFade and getSubmitCta.
                      2. Any future child must be a STATIC two-segment path
                         (`rights/compare`), never `:tab?` — otherwise `/X/Y`
                         ties with the `/:locale/Y` branch and LocaleRouter
                         renders NotFound for an unknown "locale". */}
                  <Route path="going-out" element={<GoingOut />} />
                  <Route path="rights" element={<RightsIntent />} />
                  {/* Static second segment — scores 24 and beats /:locale/<static>
                      at 17 unconditionally. A param here would tie at 17 and
                      resolve to NotFound for an unknown "locale"; see rule 2. */}
                  <Route path="rights/sources" element={<RightsSources />} />
                  {/* /support was the org-directory slice of /help wrapped in
                    intent chrome: same hook, same `role: 'support'` filter, and its
                    own crisis band was just a link to /help. Its two unique pieces
                    (coverage note, "know the law") now live on /help. The URL stays
                    so the Support track keeps its identity and inbound links work. */}
                  <Route path="support" element={<LocalizedRedirect to="/help" />} />
                  {/* `shop` MUST stay declared before `shop/*` so the static
                    sibling wins the /shop tie, same precedent as `p/:slug`. */}
                  <Route path="shop" element={<ShopIntent />} />
                  {/* /places retired: it duplicated /cities and the Travelling
                    intent, kept client-side viewMode state instead of routes
                    (no deep links, broken Back), and shipped dead filters. The
                    edge rule `/places/* → /city/:splat` in public/_redirects is
                    untouched and still handles legacy sub-paths. */}
                  <Route path="places" element={<LocalizedRedirect to="/travel" />} />
                  <Route path="travel" element={<Travel />} />
                  <Route path="travel/book" element={<TravelBook />} />
                  {/* /trips list folded into the /hub office (Plans module). The
                  /trips/:id workspace + discover/shared stay top-level. */}
                  <Route path="trips" element={<LocalizedRedirect to="/hub/plans" />} />
                  <Route path="trips/inbox" element={<LocalizedRedirect to="/hub/plans" />} />
                  <Route path="trips/discover" element={<TripsDiscoverPage />} />
                  <Route path="trips/shared/:token" element={<SharedTripPage />} />
                  <Route
                    path="trips/:tripId/today"
                    element={<TripSubrouteRedirect view="today" />}
                  />
                  <Route
                    path="trips/:tripId/booklet"
                    element={<TripSubrouteRedirect view="booklet" />}
                  />
                  <Route path="trips/:tripId" element={<TripWorkspace />} />
                  {/* Legacy trip sub-tabs (e.g. /trips/:id/packing from old
                    notification links) fold into the workspace. */}
                  <Route path="trips/:tripId/*" element={<TripSubrouteRedirect view="plan" />} />
                  <Route path="bookings" element={<LocalizedRedirect to="/hub/plans" />} />
                  <Route path="map" element={<MapPage />} />
                  <Route path="explore/connections" element={<ConnectionsExplorer />} />
                  <Route path="flights" element={<Navigate to="/travel" replace />} />
                  <Route path="cities" element={<Cities />} />
                  {/* The compare tool lives under the SINGULAR segment because
                  public/_redirects 301s every `/cities/:slug` to `/city/:slug`
                  before React ever runs — a plural-namespaced page there is
                  unreachable in production (it 301'd into /city/compare, which
                  the edge then hard-404'd as a missing city row). The plural
                  route below only exists for the localized paths
                  (/de/cities/compare), which the _redirects rule never sees. */}
                  <Route path="city/compare" element={<CitiesCompare />} />
                  <Route path="cities/compare" element={<LocalizedRedirect to="/city/compare" />} />
                  <Route path="city/:slug" element={<CityDetail />} />
                  <Route path="country/:slug" element={<CountryDetail />} />
                  {/* /users folded into the /community hub (Members tab). */}
                  <Route path="users" element={<LocalizedRedirect to="/community/members" />} />
                  <Route path="personalities" element={<Personalities />} />
                  <Route path="personalities/:slug" element={<PersonalityDetail />} />
                  {/* Legacy URL schemes still crawled — alias to canonical routes. */}
                  <Route
                    path="personality/:slug"
                    element={<SlugAliasRedirect toBase="personalities" />}
                  />
                  <Route path="geography/:slug" element={<SlugAliasRedirect toBase="city" />} />
                  <Route
                    path="organizer/:slug"
                    element={<SlugAliasRedirect toBase="organizations" />}
                  />
                  <Route path="tag/:slug" element={<SlugAliasRedirect toBase="tags" />} />
                  <Route path="profession/:slug" element={<ProfessionRedirect />} />
                  <Route path="shop/*" element={<LocalizedRedirect to="/marketplace" />} />
                  <Route path="produkt/:slug" element={<LocalizedRedirect to="/marketplace" />} />
                  <Route path="home" element={<LocalizedRedirect to="/" />} />
                  <Route path="login" element={<Navigate to="/auth" replace />} />
                  <Route path="signin" element={<Navigate to="/auth" replace />} />
                  <Route path="dashboard" element={<LocalizedRedirect to="/hub" />} />
                  <Route path="directory" element={<LocalizedRedirect to="/community" />} />
                  <Route path="users/:slug" element={<SlugAliasRedirect toBase="user" />} />
                  <Route path="wiki/:slug" element={<SlugAliasRedirect toBase="tags" />} />
                  <Route path="europe" element={<LocalizedRedirect to="/cities" />} />
                  <Route path="africa" element={<LocalizedRedirect to="/cities" />} />
                  <Route path="quests" element={<LocalizedRedirect to="/guides?format=quest" />} />
                  <Route path="quests/:slug" element={<SlugAliasRedirect toBase="guides" />} />
                  <Route path="tags" element={<Resources />} />
                  <Route path="tags/topic/:slug" element={<ResourceTopic />} />
                  <Route path="tags/c/:categorySlug" element={<Resources />} />
                  <Route path="tags/:tagName" element={<Resources />} />
                  <Route path="professions/:professionName" element={<ProfessionDetail />} />
                  {/* Legacy redirects → /tags */}
                  <Route path="resources" element={<Navigate to="/tags" replace />} />
                  <Route path="resources/topic/:slug" element={<ResourceTopic />} />
                  <Route
                    path="resources/c/:categorySlug"
                    element={<Navigate to="/tags" replace />}
                  />
                  <Route path="resources/:tagName" element={<ResourcesTagRedirect />} />
                  <Route path="ressources" element={<Navigate to="/tags" replace />} />
                  <Route path="ressources/:tagName" element={<Navigate to="/tags" replace />} />
                  <Route path="donate" element={<Donate />} />
                  <Route path="about-hub" element={<CMSRoutePage slug="about-hub" />} />
                  <Route path="about" element={<About />} />
                  <Route path="contact" element={<Contact />} />
                  <Route path="vision" element={<CMSRoutePage slug="vision" />} />
                  <Route path="values" element={<CMSRoutePage slug="values" />} />
                  <Route path="press" element={<CMSRoutePage slug="press" />} />
                  <Route path="blog" element={<CMSRoutePage slug="blog" />} />
                  <Route path="sustainability" element={<CMSRoutePage slug="sustainability" />} />
                  <Route path="legal" element={<CMSRoutePage slug="legal" />} />
                  <Route path="terms" element={<CMSRoutePage slug="terms" />} />
                  <Route path="privacy" element={<CMSRoutePage slug="privacy" />} />
                  <Route path="cookies" element={<CMSRoutePage slug="cookies" />} />
                  <Route path="dmca" element={<CMSRoutePage slug="dmca" />} />
                  <Route path="news" element={<News />} />
                  <Route path="news/all" element={<NewsArchive />} />
                  <Route path="news/me" element={<Navigate to="/me/progress" replace />} />
                  <Route path="news/story/:slug" element={<NewsStoryDetail />} />
                  <Route path="news/:slug" element={<NewsDetail />} />
                  <Route path="search" element={<SearchResults />} />
                  {/* /groups + /my-groups folded into the /community hub (Groups tab). */}
                  <Route path="groups" element={<LocalizedRedirect to="/community/groups" />} />
                  <Route path="groups/invite/:token" element={<GroupInviteAccept />} />
                  <Route path="groups/:groupId" element={<GroupDetail />} />
                  <Route
                    path="my-groups"
                    element={<LocalizedRedirect to="/community/groups?tab=mine" />}
                  />
                  <Route path="accessibility" element={<CMSRoutePage slug="accessibility" />} />
                  {/* "Inbox" was email + notifications, never messages. Notifications now
                  live in the header menu; the @queer.guide mailbox moved to /mailbox.
                  /inbox now resolves to the hub Messages surface (Chats sub-view). */}
                  <Route path="inbox" element={<LocalizedRedirect to="/hub/messages" />} />
                  <Route path="mailbox" element={<LocalizedRedirect to="/hub/messages" />} />
                  {/* /messages folded into the hub Messages module. LocalizedRedirect
                  carries the query string, so DB-stored open_target strings
                  ('/messages?conversation=…') and ?tripmail= deep links keep
                  resolving without any data rewrite. */}
                  <Route path="messages" element={<LocalizedRedirect to="/hub/messages" />} />
                  {/* /favorites folded into /hub (Saved module). */}
                  <Route path="favorites" element={<LocalizedRedirect to="/hub/saved" />} />
                  {/* Feed, Members, Friends, Groups now live under the /community hub. */}
                  <Route path="feed" element={<LocalizedRedirect to="/community/feed" />} />
                  <Route path="friends" element={<LocalizedRedirect to="/community/friends" />} />
                  {/* Static per-tab routes (not community/:tab?) so the optional
                  /:locale? parent can't capture "community" as an unknown locale
                  and 404 — same reason /trips/discover is spelled out statically. */}
                  <Route path="community" element={<Community />} />
                  <Route path="community/feed" element={<Community tab="feed" />} />
                  <Route path="community/members" element={<Community tab="members" />} />
                  <Route path="community/friends" element={<Community tab="friends" />} />
                  <Route path="community/groups" element={<Community tab="groups" />} />
                  {/* /hub — the personal office (replaces /messages + the private
                  /me hub). Consolidated 2026-07 to four surfaces: Overview
                  (landing), Messages (inbox + people), Plans (calendar agenda +
                  trips) and Saved. Static per-module routes so the optional
                  /:locale? parent can't capture "hub" as an unknown locale —
                  same fix as the /community hub above. */}
                  <Route path="hub" element={<HubPage module="overview" />} />
                  <Route path="hub/messages" element={<HubPage module="messages" />} />
                  <Route path="hub/plans" element={<HubPage module="plans" />} />
                  <Route path="hub/saved" element={<HubPage module="saved" />} />
                  {/* Retired module paths → their consolidated home. LocalizedRedirect
                  preserves the query string (e.g. ?conversation=). */}
                  <Route path="hub/calendar" element={<LocalizedRedirect to="/hub/plans" />} />
                  <Route path="hub/trips" element={<LocalizedRedirect to="/hub/plans" />} />
                  <Route path="hub/contacts" element={<LocalizedRedirect to="/hub/messages" />} />
                  <Route path="hub/news" element={<LocalizedRedirect to="/hub/saved" />} />
                  {/* /me folded into /hub; identity tabs live on the unified
                  public profile (/user/:id/:tab) via MeRedirect. */}
                  <Route path="me" element={<LocalizedRedirect to="/hub" />} />
                  <Route path="me/saved" element={<LocalizedRedirect to="/hub/saved" />} />
                  <Route path="me/trips" element={<LocalizedRedirect to="/hub/plans" />} />
                  {/* #1974's /me/calendar folds into the hub Plans module. */}
                  <Route path="me/calendar" element={<LocalizedRedirect to="/hub/plans" />} />
                  <Route path="me/travel" element={<MeRedirect tab="travel" />} />
                  <Route path="me/groups" element={<LocalizedRedirect to="/hub/messages" />} />
                  <Route path="me/contributions" element={<MeRedirect tab="contributions" />} />
                  <Route path="me/progress" element={<MeRedirect tab="progress" />} />
                  <Route path="me/passport" element={<MeRedirect tab="progress" />} />
                  <Route path="me/missions" element={<MeRedirect tab="progress" />} />
                  <Route path="me/leaderboard" element={<MeRedirect tab="progress" />} />
                  <Route path="me/settings" element={<Navigate to="/settings" replace />} />
                  <Route path="me/tiers" element={<MeRedirect tab="progress" />} />
                  <Route path="settings" element={<Settings />} />
                  <Route
                    path="settings/privacy"
                    element={<Navigate to="/settings?section=privacy" replace />}
                  />
                  <Route path="profile/settings" element={<SettingsRedirect />} />
                  {/* Unified People surface. Static per-tab routes (not people/:tab?)
                  so the optional :locale? parent can't capture "people" as an
                  unknown locale and 404 — same reason /community/* is spelled out. */}
                  <Route path="people" element={<People />} />
                  {/* The hub is place-led; each matching mode is its own page with
                  its own meta. Kept as real routes because /intimate, /discover,
                  /cruising and TripTravelBuddiesCTA all deep-link into them. */}
                  <Route path="people/friends" element={<PeopleMode tab="friends" />} />
                  <Route path="people/dating" element={<PeopleMode tab="dating" />} />
                  <Route path="people/travel" element={<PeopleMode tab="travel" />} />
                  <Route path="people/nearby" element={<PeopleMode tab="nearby" />} />
                  {/* Dating folded into the People hub; legacy entry points redirect. */}
                  <Route path="intimate" element={<LocalizedRedirect to="/people/dating" />} />
                  <Route path="discover" element={<LocalizedRedirect to="/people/dating" />} />
                  <Route path="cruising" element={<LocalizedRedirect to="/people/dating" />} />
                  <Route path="intimate/onboard" element={<IntimateOnboard />} />
                  <Route path="intimate/u/:userId" element={<IntimateUserDetail />} />
                  {/* Kink checklist tool — static paths (see people/* locale note). */}
                  <Route path="tools/checklist" element={<KinkChecklist />} />
                  <Route path="tools/checklist/s/:code" element={<KinkShareView />} />
                  {/* Hand-typed shortcut (404 reports) → the checklist tool. */}
                  <Route path="kink" element={<LocalizedRedirect to="/tools/checklist" />} />
                  <Route path="profile/tiers" element={<Navigate to="/me/progress" replace />} />
                  <Route path="profile/footprint" element={<Navigate to="/me/travel" replace />} />
                  <Route path="profile/footprint/:userId/public" element={<FootprintRedirect />} />
                  <Route path="user/:userId/:tab?" element={<ProfilePage />} />
                  <Route path="sitemap" element={<Sitemap />} />
                  <Route path="feedback" element={<FeedbackBoard />} />
                  <Route path="help" element={<HelpHotlines />} />
                  <Route path="help/:country" element={<HelpHotlines />} />
                  {/* Legacy crisis URL. public/_redirects 301s it, but that is a
                  Cloudflare Pages feature and is inert anywhere else (local
                  dev, `vite preview`, the PR e2e run) — so the route exists
                  too. A dead crisis link must not depend on the host layer. */}
                  <Route path="help-hotlines" element={<LocalizedRedirect to="/help" />} />
                  <Route path="submit" element={<SubmitHub />} />
                  {/* Explicit static route per submission type. The locale
                  layout parent is `/:locale?`; React Router expands the
                  optional segment, so /submit/news scores `/:locale/news`
                  (locale="submit") identically to `/submit/:contentType` and
                  the earlier sibling (news / feedback) wins the tie — making
                  LocaleRouter treat "submit" as an unknown locale and render
                  NotFound. A fully-static two-segment path outranks the locale
                  branch deterministically, so every submit slug resolves to
                  the form. Generated from the registry so future colliding
                  slugs stay covered. The `:contentType` route below still
                  handles unknown types ("Unknown submission type"). */}
                  {Object.keys(submissionRegistry).map((slug) => (
                    <Route
                      key={slug}
                      path={`submit/${slug}`}
                      element={<SubmitForm contentType={slug} />}
                    />
                  ))}
                  <Route path="submit/:contentType" element={<SubmitForm />} />
                  {/* `p/:slug` moved to the top of this list — see note there. */}
                  <Route path="share-target" element={<ShareTarget />} />
                  {/* Inner catch-all: paths like /de/unknown or /en/typo
                  fall through to NotFound instead of rendering nothing
                  inside the locale layout. */}
                  <Route path="*" element={<NotFound />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </RouteFade>
          </Suspense>
        </ErrorBoundary>
      </main>
    </>
  );
};
