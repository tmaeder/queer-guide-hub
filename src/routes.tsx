import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useSearchTelemetry } from '@/providers/SearchTelemetryProvider';
import { AdminRouteGuard } from '@/components/security/AdminRouteGuard';
import { LocaleRouter } from '@/components/routing/LocaleRouter';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MotionPage } from '@/components/motion';
import { lazyRetry } from '@/utils/lazyRetry';

const Index = lazyRetry(() => import('./pages/Index'));
const TagDetail = lazyRetry(() => import('./pages/TagDetail'));
const Venues = lazyRetry(() => import('./pages/Venues'));
const VenueDetail = lazyRetry(() => import('./pages/VenueDetail'));
const Events = lazyRetry(() => import('./pages/Events'));
const EventDetail = lazyRetry(() => import('./pages/EventDetail'));
const Marketplace = lazyRetry(() => import('./pages/Marketplace'));
const MarketplaceItemDetail = lazyRetry(() => import('./pages/MarketplaceItemDetail'));
const MarketplaceCategory = lazyRetry(() => import('./pages/MarketplaceCategory'));
const MarketplaceMerchant = lazyRetry(() => import('./pages/MarketplaceMerchant'));
const MarketplaceShare = lazyRetry(() => import('./pages/MarketplaceShare'));

const Places = lazyRetry(() => import('./pages/Places'));
const Resources = lazyRetry(() => import('./pages/Ressources'));
const ResourceTopic = lazyRetry(() => import('./pages/resources/ResourceTopic'));
const UserDirectory = lazyRetry(() => import('./pages/UserDirectory'));
const Personalities = lazyRetry(() => import('./pages/Personalities'));
const PersonalityDetail = lazyRetry(() => import('./pages/PersonalityDetail'));
// CMS-managed pages (content from cms_pages table)
const CMSRoutePage = lazyRetry(() => import('./pages/CMSRoutePage'));
const About = lazyRetry(() => import('./pages/About'));
const Contact = lazyRetry(() => import('./pages/Contact'));
const Auth = lazyRetry(() => import('./pages/Auth'));
const AuthCallback = lazyRetry(() => import('./pages/AuthCallback'));
const ExtensionInstall = lazyRetry(() => import('./pages/ExtensionInstall'));
const OnboardingWelcome = lazyRetry(() => import('./pages/onboarding/Welcome'));
const SearchPersonalization = lazyRetry(() => import('./pages/onboarding/SearchPersonalization'));
const PatternLibrary = lazyRetry(() => import('./pages/PatternLibrary'));

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
const AdminGroups = lazy(() => import('./pages/AdminGroups'));
const Cities = lazyRetry(() => import('./pages/Cities'));
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
const AdminProfessions = lazy(() => import('./pages/AdminProfessions'));
const AdminEvents = lazy(() => import('./pages/AdminEvents'));
const AdminMarketplace = lazy(() => import('./pages/AdminMarketplace'));
const AdminNewsSources = lazy(() => import('./pages/AdminNewsSources'));
const EmailTemplates = lazy(() => import('./pages/admin/EmailTemplates'));
const AdminPersonalities = lazy(() => import('./pages/AdminPersonalities'));
const AdminQuests = lazy(() => import('./pages/AdminQuests'));
const Quests = lazyRetry(() => import('./pages/Quests'));
const QuestDetail = lazyRetry(() => import('./pages/QuestDetail'));
const AdminRedirects = lazy(() => import('./pages/AdminRedirects'));
const AdminPipelines = lazy(() => import('./pages/AdminPipelines'));
const AdminIngestionRules = lazy(() => import('./pages/AdminIngestionRules'));
const AdminEmailIngestions = lazy(() => import('./pages/AdminEmailIngestions'));
const AdminSearchIntelligence = lazy(() => import('./pages/AdminSearchIntelligence'));

// New feature pages
const Hotels = lazyRetry(() => import('./pages/Hotels'));
const HotelDetail = lazyRetry(() => import('./pages/HotelDetail'));
const QueerVillageDetail = lazyRetry(() => import('./pages/QueerVillageDetail'));
// Festivals routes now redirect to /events (festivals integrated into events)

// New admin pages
const AdminHotels = lazy(() => import('./pages/AdminHotels'));
const AdminQueerVillages = lazy(() => import('./pages/AdminQueerVillages'));
const AdminReview = lazy(() => import('./pages/AdminReview'));
const AdminFeedback = lazy(() => import('./pages/AdminFeedback'));

// CMS components rendered as admin views
const AdminCMS = lazy(() => import('./pages/AdminCMS'));
const ContentListPanel = lazy(() =>
  import('./components/cms/ContentListPanel').then((m) => ({ default: m.ContentListPanel })),
);
// ReviewQueue (CMS) is now loaded inside AdminReview page
const MediaLibrary = lazy(() =>
  import('./components/cms/MediaLibrary').then((m) => ({ default: m.MediaLibrary })),
);
const MediaDetailPage = lazy(() =>
  import('./components/cms/MediaLibrary/MediaDetailPage').then((m) => ({ default: m.MediaDetailPage })),
);
const AuditLog = lazy(() =>
  import('./components/cms/AuditLog').then((m) => ({ default: m.AuditLog })),
);

// Import Hub components rendered as admin views
const AffiliatePartnersManager = lazy(() =>
  import('./components/admin/AffiliatePartnersManager').then((m) => ({
    default: m.AffiliatePartnersManager,
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
const ProfessionDetail = lazyRetry(() => import('./pages/ProfessionDetail'));
const News = lazyRetry(() => import('./pages/News'));
const NewsDetail = lazyRetry(() => import('./pages/NewsDetail'));
const NewsStoryDetail = lazyRetry(() => import('./pages/NewsStoryDetail'));

const ProfileSettings = lazyRetry(() => import('./pages/ProfileSettings'));
const ProfileTiers = lazyRetry(() => import('./pages/ProfileTiers'));
const Footprint = lazyRetry(() => import('./pages/profile/Footprint'));
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
const TripBookletPage = lazyRetry(() => import('./pages/trips/TripBookletPage'));
const TripsDiscoverPage = lazyRetry(() => import('./pages/trips/TripsDiscoverPage'));
const TodayModePage = lazyRetry(() => import('./pages/trips/TodayModePage'));
const SharedTripPage = lazyRetry(() => import('./pages/trips/SharedTripPage'));
const Donate = lazyRetry(() => import('./pages/Donate'));
const Sitemap = lazyRetry(() => import('./pages/Sitemap'));
const SubmitHub = lazyRetry(() => import('./pages/SubmitHub'));
const SubmitForm = lazyRetry(() => import('./pages/SubmitForm'));
const FeedbackBoard = lazyRetry(() => import('./pages/FeedbackBoard'));
const HelpHotlines = lazyRetry(() => import('./pages/HelpHotlines'));
const CMSPage = lazyRetry(() => import('./pages/Page'));
const ShareTarget = lazyRetry(() => import('./pages/ShareTarget'));

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
              <Route path="/extension" element={<ExtensionInstall />} />
              <Route path="/pattern-library" element={<PatternLibrary />} />
              <Route path="/onboarding/welcome" element={<OnboardingWelcome />} />
              <Route path="/onboarding/search" element={<SearchPersonalization />} />
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
                <Route path="automation" element={<Navigate to="/admin/pipelines" replace />} />
                <Route path="review" element={<AdminReview />} />
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
                <Route path="hotels" element={<AdminHotels />} />
                <Route path="villages" element={<AdminQueerVillages />} />

                {/* System section */}
                <Route path="users" element={<AdminUsers />} />
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
                <Route path="settings/professions" element={<AdminProfessions />} />

                {/* Legacy routes -- redirect to new paths */}
                <Route path="venues" element={<AdminVenues />} />
                <Route path="events" element={<AdminEvents />} />
                <Route path="tags" element={<AdminTags />} />
                <Route path="cities" element={<Navigate to="/admin/content/cities" replace />} />
                <Route path="countries" element={<AdminCountries />} />
                <Route path="personalities" element={<AdminPersonalities />} />
                <Route path="quests" element={<AdminQuests />} />
                <Route path="marketplace" element={<AdminMarketplace />} />
                <Route path="groups" element={<AdminGroups />} />
                <Route path="news-sources" element={<AdminNewsSources />} />
                <Route path="cms" element={<AdminCMS />} />
                <Route path="import-hub" element={<Navigate to="/admin/pipelines" replace />} />
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
                <Route path="venues/:slug" element={<VenueDetail />} />
                <Route path="events" element={<Events />} />
                <Route path="events/:slug" element={<EventDetail />} />
                <Route path="marketplace" element={<Marketplace />} />
                <Route path="marketplace/share" element={<MarketplaceShare />} />
                <Route path="marketplace/category/:slug" element={<MarketplaceCategory />} />
                <Route path="marketplace/merchants/:domain" element={<MarketplaceMerchant />} />
                <Route path="marketplace/:slug" element={<MarketplaceItemDetail />} />
                <Route path="hotels" element={<Hotels />} />
                <Route path="hotels/:slug" element={<HotelDetail />} />
                <Route path="villages" element={<Navigate to="/places" replace />} />
                <Route path="villages/:slug" element={<QueerVillageDetail />} />
                <Route path="festivals" element={<Navigate to="/events" replace />} />
                <Route path="festivals/:id" element={<Navigate to="/events" replace />} />
                <Route path="places" element={<Places />} />
                <Route path="travel" element={<Travel />} />
                <Route path="trips" element={<TripsPage />} />
                <Route path="trips/inbox" element={<Navigate to="/trips" replace />} />
                <Route path="trips/discover" element={<TripsDiscoverPage />} />
                <Route path="trips/shared/:token" element={<SharedTripPage />} />
                <Route path="trips/:tripId/today" element={<TodayModePage />} />
                <Route path="trips/:tripId/booklet" element={<TripBookletPage />} />
                <Route path="trips/:tripId" element={<TripPlannerPage />} />
                <Route path="bookings" element={<Navigate to="/trips" replace />} />
                <Route path="map" element={<MapPage />} />
                <Route path="flights" element={<Navigate to="/travel" replace />} />
                <Route path="cities" element={<Cities />} />
                <Route path="city/:slug" element={<CityDetail />} />
                <Route path="country/:slug" element={<CountryDetail />} />
                <Route path="users" element={<UserDirectory />} />
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
                <Route path="tags/:slug" element={<TagDetail />} />
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
                <Route path="news/story/:slug" element={<NewsStoryDetail />} />
                <Route path="news/:slug" element={<NewsDetail />} />
                <Route path="search" element={<SearchResults />} />
                <Route path="groups" element={<Groups />} />
                <Route path="groups/:groupId" element={<GroupDetail />} />
                <Route path="my-groups" element={<MyGroups />} />
                <Route path="accessibility" element={<CMSRoutePage slug="accessibility" />} />
                <Route path="inbox" element={<Inbox />} />
                <Route path="messages" element={<Messages />} />
                <Route path="friends" element={<Friends />} />
                <Route path="favorites" element={<Favorites />} />
                <Route path="feed" element={<Feed />} />
                <Route path="community" element={<Navigate to="/feed" replace />} />
                <Route path="profile/settings" element={<ProfileSettings />} />
                <Route path="profile/tiers" element={<ProfileTiers />} />
                <Route path="profile/footprint" element={<Footprint />} />
                <Route path="user/:userId" element={<UserProfile />} />
                <Route path="sitemap" element={<Sitemap />} />
                <Route path="feedback" element={<FeedbackBoard />} />
                <Route path="help" element={<HelpHotlines />} />
                <Route path="help/:country" element={<HelpHotlines />} />
                <Route path="submit" element={<SubmitHub />} />
                <Route path="submit/:contentType" element={<SubmitForm />} />
                <Route path="p/:slug" element={<CMSPage />} />
                <Route path="share-target" element={<ShareTarget />} />
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
