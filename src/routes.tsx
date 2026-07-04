import React, { Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useSearchTelemetry } from '@/providers/SearchTelemetryProvider';
import { AdminRouteGuard } from '@/components/security/AdminRouteGuard';
import { LocaleRouter } from '@/components/routing/LocaleRouter';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MotionPage } from '@/components/motion';
import { lazyRetry } from '@/utils/lazyRetry';
import { submissionRegistry } from '@/config/submissionRegistry';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/languages';

const Index = lazyRetry(() => import('./pages/Index'));
const Venues = lazyRetry(() => import('./pages/Venues'));
const VenueDetail = lazyRetry(() => import('./pages/VenueDetail'));
const VenueGuides = lazyRetry(() => import('./pages/VenueGuides'));
const VenueGuide = lazyRetry(() => import('./pages/VenueGuide'));
const ProfilePage = lazyRetry(() => import('./pages/profile/ProfilePage'));
const VenuePersonalization = lazyRetry(() => import('./pages/onboarding/VenuePersonalization'));
const Events = lazyRetry(() => import('./pages/Events'));
const EventDetail = lazyRetry(() => import('./pages/EventDetail'));
const EventGuides = lazyRetry(() => import('./pages/EventGuides'));
const EventGuide = lazyRetry(() => import('./pages/EventGuide'));
const Marketplace = lazyRetry(() => import('./pages/Marketplace'));
const MarketplaceItemDetail = lazyRetry(() => import('./pages/MarketplaceItemDetail'));
const MarketplaceCategory = lazyRetry(() => import('./pages/MarketplaceCategory'));
const MarketplaceCategories = lazyRetry(() => import('./pages/MarketplaceCategories'));
const MarketplaceMerchant = lazyRetry(() => import('./pages/MarketplaceMerchant'));
const OrganizationDetail = lazyRetry(() => import('./pages/OrganizationDetail'));
const Organizations = lazyRetry(() => import('./pages/Organizations'));
const MarketplaceShare = lazyRetry(() => import('./pages/MarketplaceShare'));
const MarketplaceCollection = lazyRetry(() => import('./pages/MarketplaceCollection'));
const MarketplaceGuides = lazyRetry(() => import('./pages/MarketplaceGuides'));
const MarketplaceGuide = lazyRetry(() => import('./pages/MarketplaceGuide'));
const Wishlist = lazyRetry(() => import('./pages/Wishlist'));
const Wishlists = lazyRetry(() => import('./pages/Wishlists'));

const Places = lazyRetry(() => import('./pages/Places'));
const Resources = lazyRetry(() => import('./pages/Resources'));
const ResourceTopic = lazyRetry(() => import('./pages/resources/ResourceTopic'));
const Personalities = lazyRetry(() => import('./pages/Personalities'));
const PersonalityDetail = lazyRetry(() => import('./pages/PersonalityDetail'));
// CMS-managed pages (content from cms_pages table)
const CMSRoutePage = lazyRetry(() => import('./pages/CMSRoutePage'));
const About = lazyRetry(() => import('./pages/About'));
const Contact = lazyRetry(() => import('./pages/Contact'));
const Auth = lazyRetry(() => import('./pages/Auth'));
const AuthCallback = lazyRetry(() => import('./pages/AuthCallback'));
const ClaimUsername = lazyRetry(() => import('./pages/ClaimUsername'));
const ExtensionInstall = lazyRetry(() => import('./pages/ExtensionInstall'));
const OnboardingWelcome = lazyRetry(() => import('./pages/onboarding/Welcome'));
const SearchPersonalization = lazyRetry(() => import('./pages/onboarding/SearchPersonalization'));
const PatternLibrary = lazyRetry(() => import('./pages/PatternLibrary'));

// Unified Admin Shell (wraps all /admin/* routes)
const AdminShell = lazyRetry(() =>
  import('./components/admin/shell/AdminShell').then((m) => ({ default: m.AdminShell })),
);

// Admin page components (rendered inside AdminShell via Outlet)
const AdminDashboard = lazyRetry(() => import('./pages/AdminDashboard'));
const AdminAnalytics = lazyRetry(() => import('./pages/AdminAnalytics'));
const AdminMaps = lazyRetry(() => import('./pages/AdminMaps'));
const AdminUsers = lazyRetry(() => import('./pages/AdminUsers'));
const AdminCountries = lazyRetry(() => import('./pages/AdminCountries'));
const AdminTags = lazyRetry(() => import('./pages/AdminTags'));
const AdminGroups = lazyRetry(() => import('./pages/AdminGroups'));
const Cities = lazyRetry(() => import('./pages/Cities'));
const CitiesCompare = lazyRetry(() => import('./pages/cities/Compare'));
const CityDetail = lazyRetry(() => import('./pages/CityDetail'));
const CountryDetail = lazyRetry(() => import('./pages/CountryDetail'));
const Travel = lazyRetry(() => import('./pages/Travel'));
const TravelBook = lazyRetry(() => import('./pages/travel/Book'));
const MapPage = lazyRetry(() => import('./pages/Map'));
const AdminVenues = lazyRetry(() => import('./pages/AdminVenues'));
const AdminDuplicates = lazyRetry(() => import('./pages/AdminDuplicates'));
const AdminVenueCategories = lazyRetry(() => import('./pages/AdminVenueCategories'));
const AdminVenueServices = lazyRetry(() => import('./pages/AdminVenueServices'));
const AdminEventTypes = lazyRetry(() => import('./pages/AdminEventTypes'));
const AdminEventAmenities = lazyRetry(() => import('./pages/AdminEventAmenities'));
const AdminEventServices = lazyRetry(() => import('./pages/AdminEventServices'));
const AdminAccessibilityAttributes = lazyRetry(() => import('./pages/AdminAccessibilityAttributes'));
const AdminTargetGroups = lazyRetry(() => import('./pages/AdminTargetGroups'));
const AdminProfessions = lazyRetry(() => import('./pages/AdminProfessions'));
const AdminEvents = lazyRetry(() => import('./pages/AdminEvents'));
const AdminCityQuality = lazyRetry(() => import('./pages/AdminCityQuality'));
const AdminPersonalityQuality = lazyRetry(() => import('./pages/AdminPersonalityQuality'));
const AdminVenueQuality = lazyRetry(() => import('./pages/AdminVenueQuality'));
const AdminLiveness = lazyRetry(() => import('./pages/AdminLiveness'));
const AdminMarketplace = lazyRetry(() => import('./pages/AdminMarketplace'));
const AdminMarketplaceQuality = lazyRetry(() => import('./pages/AdminMarketplaceQuality'));
const AdminMarketplaceGuides = lazyRetry(() => import('./pages/AdminMarketplaceGuides'));
const AdminVenueGuides = lazyRetry(() => import('./pages/AdminVenueGuides'));
const EmailTemplates = lazyRetry(() => import('./pages/admin/EmailTemplates'));
const AdminPersonalities = lazyRetry(() => import('./pages/AdminPersonalities'));
const AdminQuests = lazyRetry(() => import('./pages/AdminQuests'));
const AdminPlacesEditorial = lazyRetry(() => import('./pages/AdminPlacesEditorial'));
const Quests = lazyRetry(() => import('./pages/Quests'));
const QuestDetail = lazyRetry(() => import('./pages/QuestDetail'));
const AdminRedirects = lazyRetry(() => import('./pages/AdminRedirects'));
const AdminPipelines = lazyRetry(() => import('./pages/AdminPipelines'));
const AdminIngestionRules = lazyRetry(() => import('./pages/AdminIngestionRules'));
const AdminEmailIngestions = lazyRetry(() => import('./pages/AdminEmailIngestions'));
const AdminSearchIntelligence = lazyRetry(() => import('./pages/AdminSearchIntelligence'));
const AdminRecognition = lazyRetry(() => import('./pages/admin/Recognition'));
const Contributors = lazyRetry(() => import('./pages/Contributors'));

// New feature pages
const Hotels = lazyRetry(() => import('./pages/Hotels'));
const HotelDetail = lazyRetry(() => import('./pages/HotelDetail'));
const QueerVillageDetail = lazyRetry(() => import('./pages/QueerVillageDetail'));
// Festivals routes now redirect to /events (festivals integrated into events)

// New admin pages
const AdminHotels = lazyRetry(() => import('./pages/AdminHotels'));
const AdminQueerVillages = lazyRetry(() => import('./pages/AdminQueerVillages'));
const AdminVillageQuality = lazyRetry(() => import('./pages/AdminVillageQuality'));
const AdminReview = lazyRetry(() => import('./pages/AdminReview'));
const AdminInbox = lazyRetry(() => import('./pages/AdminInbox'));
const AdminAutomation = lazyRetry(() => import('./pages/AdminAutomation'));
const AdminFeedback = lazyRetry(() => import('./pages/AdminFeedback'));
const AdminAffiliate = lazyRetry(() => import('./pages/AdminAffiliate'));

// CMS components rendered as admin views
const ContentListPanel = lazyRetry(() =>
  import('./components/cms/ContentListPanel').then((m) => ({ default: m.ContentListPanel })),
);
// ReviewQueue (CMS) is now loaded inside AdminReview page
const MediaLibrary = lazyRetry(() =>
  import('./components/cms/MediaLibrary').then((m) => ({ default: m.MediaLibrary })),
);
const MediaDetailPage = lazyRetry(() =>
  import('./components/cms/MediaLibrary/MediaDetailPage').then((m) => ({ default: m.MediaDetailPage })),
);
const AuditLog = lazyRetry(() =>
  import('./components/cms/AuditLog').then((m) => ({ default: m.AuditLog })),
);

// Import Hub components rendered as admin views
const AffiliatePartnersManager = lazyRetry(() =>
  import('./components/admin/AffiliatePartnersManager').then((m) => ({
    default: m.AffiliatePartnersManager,
  })),
);

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

const People = lazyRetry(() => import('./pages/people/People'));
const Community = lazyRetry(() => import('./pages/Community'));

const Messages = lazyRetry(() => import('./pages/Messages'));
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

/** Maps the legacy /profile/footprint/:userId/public URL to the unified profile Travel tab. */
function FootprintRedirect() {
  const { userId } = useParams<{ userId: string }>();
  return <Navigate to={`/user/${userId}/travel`} replace />;
}

/**
 * The legacy /tags/:slug stub is retired — the canonical glossary surface is
 * /resources/:tagName. Redirect through, preserving the locale prefix (the
 * `/:locale?` capture would otherwise be dropped, bouncing non-EN visitors to
 * the default locale).
 */
function TagSlugRedirect() {
  const { slug, locale } = useParams<{ slug: string; locale?: string }>();
  const prefix =
    locale && isSupportedLocale(locale) && locale !== DEFAULT_LOCALE ? `/${locale}` : '';
  return <Navigate to={`${prefix}/resources/${slug ?? ''}`} replace />;
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

/** Routes table + per-route ErrorBoundary/Suspense/MotionPage and a11y main element */
export const AppRoutes = () => {
  const location = useLocation();

  // Auto-fire `view` events into the search-proxy bias vector on route change.
  useSearchTelemetry();

  // Move focus to main content on route change (a11y: WCAG 2.4.3)
  const mainRef = React.useRef<HTMLElement>(null);
  const isFirstRender = React.useRef(true);
  const [routeAnnouncement, setRouteAnnouncement] = React.useState('');
  const { t } = useTranslation();

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
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
        className="flex-1 relative z-[1] outline-none"
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
            <MotionPage>
            <Routes>
              {/* Auth routes — no locale prefix */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/claim-username" element={<ClaimUsername />} />
              <Route path="/extension" element={<ExtensionInstall />} />
              <Route path="/pattern-library" element={<PatternLibrary />} />
              <Route path="/onboarding/welcome" element={<OnboardingWelcome />} />
              <Route path="/onboarding/search" element={<SearchPersonalization />} />
              <Route path="/onboarding/venues" element={<VenuePersonalization />} />
              <Route path="/contributors" element={<Contributors />} />
              <Route path="/contributors/:year" element={<Contributors />} />
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
                <Route path="maps" element={<AdminMaps />} />
                <Route path="security" element={<SecurityMonitoringDashboard />} />
                <Route path="cloudflare" element={<CloudflareDashboard />} />

                {/* Content section -- unified list + per-type views */}
                <Route path="content" element={<ContentListPanel />} />
                <Route path="content/:type" element={<ContentListPanel />} />
                <Route path="pages" element={<ContentListPanel contentTypeId="cms_pages" />} />
                <Route path="media" element={<MediaLibrary />} />
                <Route path="media/:id" element={<MediaDetailPage />} />

                {/* Imports & Data section — all redirect to unified /admin/pipelines */}
                <Route path="imports" element={<Navigate to="/admin/pipelines" replace />} />
                <Route path="imports/create" element={<Navigate to="/admin/pipelines" replace />} />
                <Route path="imports/news-sources" element={<Navigate to="/admin/pipelines?tab=sources" replace />} />
                <Route path="imports/pipeline" element={<Navigate to="/admin/pipelines?tab=monitor" replace />} />
                <Route path="imports/enrichment" element={<Navigate to="/admin/pipelines?tab=monitor" replace />} />
                <Route path="imports/venues" element={<Navigate to="/admin/pipelines?tab=sources" replace />} />
                <Route path="imports/email-ingestions" element={<AdminEmailIngestions />} />
                <Route path="imports/history" element={<Navigate to="/admin/pipelines?tab=monitor" replace />} />
                <Route path="workflows" element={<Navigate to="/admin/pipelines" replace />} />
                <Route path="pipelines" element={<AdminPipelines />} />
                <Route path="ingestion-rules" element={<AdminIngestionRules />} />
                <Route path="pipelines/dashboard" element={<Navigate to="/admin/pipelines" replace />} />
                <Route path="scraping" element={<Navigate to="/admin/pipelines?tab=sources" replace />} />

                {/* Review & Workflow section -- unified dashboard */}
                <Route path="review" element={<AdminReview />} />
                <Route path="inbox" element={<AdminInbox />} />
                <Route path="automation" element={<AdminAutomation />} />
                <Route path="feedback" element={<AdminFeedback />} />
                <Route
                  path="moderation"
                  element={<Navigate to="/admin/review?tab=moderation" replace />}
                />
                <Route path="audit" element={<AuditLog />} />
                <Route path="search-intelligence" element={<AdminSearchIntelligence />} />
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
                <Route path="content/venue-quality" element={<AdminVenueQuality />} />
                <Route path="content/liveness" element={<AdminLiveness />} />
                <Route path="content/city-quality" element={<AdminCityQuality />} />
                <Route path="content/personality-quality" element={<AdminPersonalityQuality />} />
                <Route path="content/marketplace-quality" element={<AdminMarketplaceQuality />} />
                <Route path="content/village-quality" element={<AdminVillageQuality />} />
                <Route path="hotels" element={<AdminHotels />} />
                <Route path="villages" element={<AdminQueerVillages />} />

                {/* System section */}
                <Route path="users" element={<AdminUsers />} />
                <Route path="redirects" element={<AdminRedirects />} />
                <Route path="email-templates" element={<EmailTemplates />} />
                <Route path="recognition" element={<AdminRecognition />} />

                {/* Settings -- taxonomy management pages */}
                <Route path="settings" element={<AdminTags />} />
                <Route path="settings/venue-categories" element={<AdminVenueCategories />} />
                <Route path="settings/venue-services" element={<AdminVenueServices />} />
                <Route path="settings/event-types" element={<AdminEventTypes />} />
                <Route path="settings/event-amenities" element={<AdminEventAmenities />} />
                <Route path="settings/event-services" element={<AdminEventServices />} />
                <Route path="settings/accessibility" element={<AdminAccessibilityAttributes />} />
                <Route path="settings/target-groups" element={<AdminTargetGroups />} />
                <Route path="settings/professions" element={<AdminProfessions />} />

                {/* Legacy routes -- redirect to new paths */}
                <Route path="venues" element={<AdminVenues />} />
                <Route path="duplicates" element={<AdminDuplicates />} />
                <Route path="events" element={<AdminEvents />} />
                <Route path="tags" element={<Navigate to="/admin/content/unified_tags" replace />} />
                <Route path="cities" element={<Navigate to="/admin/content/city-quality" replace />} />
                <Route path="countries" element={<AdminCountries />} />
                <Route path="personalities" element={<AdminPersonalities />} />
                <Route path="quests" element={<AdminQuests />} />
                <Route path="places-editorial" element={<AdminPlacesEditorial />} />
                <Route path="marketplace" element={<AdminMarketplace />} />
                <Route path="marketplace/guides" element={<AdminMarketplaceGuides />} />
                <Route path="venue-guides" element={<AdminVenueGuides />} />
                <Route path="groups" element={<AdminGroups />} />
                <Route path="news-sources" element={<Navigate to="/admin/pipelines?tab=sources" replace />} />
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
              </Route>

              {/* ── Locale-aware public routes ── */}
              {/* /:locale? makes the locale segment optional — /venues and /de/venues both work */}
              <Route path="/:locale?" element={<LocaleRouter />}>
                <Route index element={<Index />} />
                <Route path="venues" element={<Venues />} />
                {/* Section-name slugs collide with /venues/:slug — redirect to top-level pages */}
                <Route path="venues/hotels" element={<Navigate to="/hotels" replace />} />
                <Route path="venues/events" element={<Navigate to="/events" replace />} />
                <Route path="venues/news" element={<Navigate to="/news" replace />} />
                <Route path="venues/marketplace" element={<Navigate to="/marketplace" replace />} />
                <Route path="venues/travel" element={<Navigate to="/travel" replace />} />
                <Route path="venues/groups" element={<Navigate to="/groups" replace />} />
                <Route path="venues/resources" element={<Navigate to="/resources" replace />} />
                {/* Legacy routes — canonical lives under /me/*. Keep one release. */}
                <Route path="venues/leaderboard" element={<Navigate to="/me/progress" replace />} />
                <Route path="venues/passport" element={<Navigate to="/me/progress" replace />} />
                <Route path="venues/guides" element={<VenueGuides />} />
                <Route path="venues/guides/:slug" element={<VenueGuide />} />
                <Route path="venues/:slug" element={<VenueDetail />} />
                <Route path="organizations" element={<Organizations />} />
                <Route path="organizations/:slug" element={<OrganizationDetail />} />
                <Route path="events" element={<Events />} />
                <Route path="events/guides" element={<EventGuides />} />
                <Route path="events/guides/:slug" element={<EventGuide />} />
                <Route path="events/:slug" element={<EventDetail />} />
                <Route path="pride" element={<PridePage />} />
                <Route path="pride/:year" element={<PridePage />} />
                <Route path="marketplace" element={<Marketplace />} />
                <Route path="marketplace/share" element={<MarketplaceShare />} />
                <Route path="marketplace/missions" element={<Navigate to="/me/progress" replace />} />
                <Route path="marketplace/categories" element={<MarketplaceCategories />} />
                <Route path="marketplace/category/:slug" element={<MarketplaceCategory />} />
                <Route path="marketplace/collection/:slug" element={<MarketplaceCollection />} />
                <Route path="marketplace/guides" element={<MarketplaceGuides />} />
                <Route path="marketplace/guides/:slug" element={<MarketplaceGuide />} />
                <Route path="marketplace/merchants/:domain" element={<MarketplaceMerchant />} />
                <Route path="marketplace/:slug" element={<MarketplaceItemDetail />} />
                <Route path="wishlists" element={<Wishlists />} />
                <Route path="wishlists/:slug" element={<Wishlist />} />
                <Route path="hotels" element={<Hotels />} />
                <Route path="hotels/:slug" element={<HotelDetail />} />
                <Route path="villages" element={<Navigate to="/places" replace />} />
                <Route path="villages/:slug" element={<QueerVillageDetail />} />
                <Route path="festivals" element={<Navigate to="/events" replace />} />
                <Route path="festivals/:id" element={<Navigate to="/events" replace />} />
                <Route path="places" element={<Places />} />
                <Route path="travel" element={<Travel />} />
                <Route path="travel/book" element={<TravelBook />} />
                {/* /trips list folded into the /me hub (Trips tab). The
                  /trips/:id workspace + discover/shared stay top-level. */}
                <Route path="trips" element={<LocalizedRedirect to="/me/trips" />} />
                <Route path="trips/inbox" element={<LocalizedRedirect to="/me/trips" />} />
                <Route path="trips/discover" element={<TripsDiscoverPage />} />
                <Route path="trips/shared/:token" element={<SharedTripPage />} />
                <Route path="trips/:tripId/today" element={<TripSubrouteRedirect view="today" />} />
                <Route path="trips/:tripId/booklet" element={<TripSubrouteRedirect view="booklet" />} />
                <Route path="trips/:tripId" element={<TripWorkspace />} />
                <Route path="bookings" element={<LocalizedRedirect to="/me/trips" />} />
                <Route path="map" element={<MapPage />} />
                <Route path="flights" element={<Navigate to="/travel" replace />} />
                <Route path="cities" element={<Cities />} />
                <Route path="cities/compare" element={<CitiesCompare />} />
                <Route path="city/:slug" element={<CityDetail />} />
                <Route path="country/:slug" element={<CountryDetail />} />
                {/* /users folded into the /community hub (Members tab). */}
                <Route path="users" element={<LocalizedRedirect to="/community/members" />} />
                <Route path="personalities" element={<Personalities />} />
                <Route path="personalities/:slug" element={<PersonalityDetail />} />
                <Route path="quests" element={<Quests />} />
                <Route path="quests/:slug" element={<QuestDetail />} />
                <Route path="resources" element={<Resources />} />
                <Route path="resources/topic/:slug" element={<ResourceTopic />} />
                <Route path="resources/c/:categorySlug" element={<Resources />} />
                <Route path="resources/:tagName" element={<Resources />} />
                <Route path="professions/:professionName" element={<ProfessionDetail />} />
                <Route path="ressources" element={<Navigate to="/resources" replace />} />
                <Route path="ressources/:tagName" element={<Navigate to="/resources" replace />} />
                <Route path="tags" element={<Navigate to="/resources" replace />} />
                <Route path="tags/:slug" element={<TagSlugRedirect />} />
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
                <Route path="my-groups" element={<LocalizedRedirect to="/community/groups?tab=mine" />} />
                <Route path="accessibility" element={<CMSRoutePage slug="accessibility" />} />
                {/* "Inbox" was email + notifications, never messages. Notifications now
                  live in the header menu; the @queer.guide mailbox moved to /mailbox.
                  /inbox now resolves to the real conversation hub. */}
                <Route path="inbox" element={<LocalizedRedirect to="/messages" />} />
                <Route path="mailbox" element={<LocalizedRedirect to="/messages" />} />
                <Route path="messages" element={<Messages />} />
                {/* /favorites folded into the /me hub (Saved tab). */}
                <Route path="favorites" element={<LocalizedRedirect to="/me/saved" />} />
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
                {/* Static per-tab routes (not me/:tab?) so the optional /:locale?
                  parent can't capture "me" as an unknown locale and let a tab name
                  that's also a top-level route (trips, travel) win the match → 404.
                  Same fix as the /community hub above. */}
                <Route path="me" element={<ProfilePage />} />
                <Route path="me/saved" element={<ProfilePage tab="saved" />} />
                <Route path="me/trips" element={<ProfilePage tab="trips" />} />
                <Route path="me/travel" element={<ProfilePage tab="travel" />} />
                <Route path="me/contributions" element={<ProfilePage tab="contributions" />} />
                <Route path="me/progress" element={<ProfilePage tab="progress" />} />
                <Route path="me/passport" element={<Navigate to="/me/progress" replace />} />
                <Route path="me/missions" element={<Navigate to="/me/progress" replace />} />
                <Route path="me/leaderboard" element={<Navigate to="/me/progress" replace />} />
                <Route path="me/settings" element={<Navigate to="/settings" replace />} />
                <Route path="me/tiers" element={<Navigate to="/me/progress" replace />} />
                <Route path="settings" element={<Settings />} />
                <Route path="settings/privacy" element={<Navigate to="/settings?section=privacy" replace />} />
                <Route path="profile/settings" element={<SettingsRedirect />} />
                {/* Unified People surface. Static per-tab routes (not people/:tab?)
                  so the optional :locale? parent can't capture "people" as an
                  unknown locale and 404 — same reason /community/* is spelled out. */}
                <Route path="people" element={<People />} />
                <Route path="people/friends" element={<People tab="friends" />} />
                <Route path="people/dating" element={<People tab="dating" />} />
                <Route path="people/travel" element={<People tab="travel" />} />
                <Route path="people/nearby" element={<People tab="nearby" />} />
                {/* Dating folded into the People hub; legacy entry points redirect. */}
                <Route path="intimate" element={<LocalizedRedirect to="/people/dating" />} />
                <Route path="discover" element={<LocalizedRedirect to="/people/dating" />} />
                <Route path="intimate/onboard" element={<IntimateOnboard />} />
                <Route path="intimate/u/:userId" element={<IntimateUserDetail />} />
                <Route path="profile/tiers" element={<Navigate to="/me/progress" replace />} />
                <Route path="profile/footprint" element={<Navigate to="/me/travel" replace />} />
                <Route path="profile/footprint/:userId/public" element={<FootprintRedirect />} />
                <Route path="user/:userId/:tab?" element={<ProfilePage />} />
                <Route path="sitemap" element={<Sitemap />} />
                <Route path="feedback" element={<FeedbackBoard />} />
                <Route path="help" element={<HelpHotlines />} />
                <Route path="help/:country" element={<HelpHotlines />} />
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
                  <Route key={slug} path={`submit/${slug}`} element={<SubmitForm contentType={slug} />} />
                ))}
                <Route path="submit/:contentType" element={<SubmitForm />} />
                <Route path="p/:slug" element={<CMSPage />} />
                <Route path="share-target" element={<ShareTarget />} />
                {/* Inner catch-all: paths like /de/unknown or /en/typo
                  fall through to NotFound instead of rendering nothing
                  inside the locale layout. */}
                <Route path="*" element={<NotFound />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
            </MotionPage>
          </Suspense>
        </ErrorBoundary>
      </main>
    </>
  );
};
