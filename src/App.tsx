import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./i18n";
import { AuthProvider } from "@/hooks/useAuth";
import { AccessibilityProvider } from "@/hooks/useAccessibility";
import { CookieConsentProvider } from "@/hooks/useCookieConsent";
import { AnalyticsTracker } from "@/components/analytics/AnalyticsTracker";
import { CookieConsentBanner } from "@/components/privacy/CookieConsentBanner";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AdminRouteGuard } from "@/components/security/AdminRouteGuard";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
const Aurora = lazy(() => import("@/components/ui/Aurora"));
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { createOptimizedQueryClient } from "@/utils/queryOptimizations";
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';

const Index = lazy(() => import("./pages/Index"));
const Venues = lazy(() => import("./pages/Venues"));
const VenueDetail = lazy(() => import("./pages/VenueDetail"));
const Events = lazy(() => import("./pages/Events"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const MarketplaceItemDetail = lazy(() => import("./pages/MarketplaceItemDetail"));

const Places = lazy(() => import("./pages/Places"));
const Resources = lazy(() => import("./pages/Ressources"));
const UserDirectory = lazy(() => import("./pages/UserDirectory"));
const Personalities = lazy(() => import("./pages/Personalities"));
const PersonalityDetail = lazy(() => import("./pages/PersonalityDetail"));
// CMS-managed pages (content from cms_pages table)
const CMSRoutePage = lazy(() => import("./pages/CMSRoutePage"));
const Auth = lazy(() => import("./pages/Auth"));

// Unified Admin Shell (wraps all /admin/* routes)
const AdminShell = lazy(() => import("./components/admin/shell/AdminShell").then(m => ({ default: m.AdminShell })));

// Admin page components (rendered inside AdminShell via Outlet)
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminCountries = lazy(() => import("./pages/AdminCountries"));
const AdminTags = lazy(() => import("./pages/AdminTags"));
const AdminCities = lazy(() => import("./pages/AdminCities"));
const AdminGroups = lazy(() => import("./pages/AdminGroups"));
const CityDetail = lazy(() => import("./pages/CityDetail"));
const CountryDetail = lazy(() => import("./pages/CountryDetail"));
const Travel = lazy(() => import("./pages/Travel"));
const AdminVenues = lazy(() => import("./pages/AdminVenues"));
const AdminVenueCategories = lazy(() => import("./pages/AdminVenueCategories"));
const AdminVenueAmenities = lazy(() => import("./pages/AdminVenueAmenities"));
const AdminVenueServices = lazy(() => import("./pages/AdminVenueServices"));
const AdminEventTypes = lazy(() => import("./pages/AdminEventTypes"));
const AdminEventAmenities = lazy(() => import("./pages/AdminEventAmenities"));
const AdminEventServices = lazy(() => import("./pages/AdminEventServices"));
const AdminAccessibilityAttributes = lazy(() => import("./pages/AdminAccessibilityAttributes"));
const AdminTargetGroups = lazy(() => import("./pages/AdminTargetGroups"));
const AdminEvents = lazy(() => import("./pages/AdminEvents"));
const AdminMarketplace = lazy(() => import("./pages/AdminMarketplace"));
const AdminNewsSources = lazy(() => import("./pages/AdminNewsSources"));
const EmailTemplates = lazy(() => import("./pages/admin/EmailTemplates"));
const AdminPersonalities = lazy(() => import("./pages/AdminPersonalities"));
const AdminImportHub = lazy(() => import("./pages/AdminImportHub"));
const AdminRedirects = lazy(() => import("./pages/AdminRedirects"));

// CMS components rendered as admin views
const AdminCMS = lazy(() => import("./pages/AdminCMS"));
const ContentListPanel = lazy(() => import("./components/cms/ContentListPanel").then(m => ({ default: m.ContentListPanel })));
const CMSOverview = lazy(() => import("./components/cms/CMSOverview").then(m => ({ default: m.CMSOverview })));
const ReviewQueue = lazy(() => import("./components/cms/ReviewQueue").then(m => ({ default: m.ReviewQueue })));
const MediaLibrary = lazy(() => import("./components/cms/MediaLibrary").then(m => ({ default: m.MediaLibrary })));
const AuditLog = lazy(() => import("./components/cms/AuditLog").then(m => ({ default: m.AuditLog })));

// Import Hub components rendered as admin views
const ImportJobCreator = lazy(() => import("./components/admin/ImportJobCreator").then(m => ({ default: m.ImportJobCreator })));
const NewsSourcesManager = lazy(() => import("./components/admin/NewsSourcesManager").then(m => ({ default: m.NewsSourcesManager })));
const PipelineMonitor = lazy(() => import("./components/admin/PipelineMonitor").then(m => ({ default: m.PipelineMonitor })));
const VenueImportQuickActions = lazy(() => import("./components/admin/VenueImportQuickActions").then(m => ({ default: m.VenueImportQuickActions })));
const ApiKeysManager = lazy(() => import("./components/admin/ApiKeysManager").then(m => ({ default: m.ApiKeysManager })));

// Dashboard sub-views
const SecurityMonitoringDashboard = lazy(() => import("./components/admin/SecurityMonitoringDashboard").then(m => ({ default: m.SecurityMonitoringDashboard })));
const CloudflareDashboard = lazy(() => import("./components/admin/CloudflareDashboard").then(m => ({ default: m.CloudflareDashboard })));
const UmamiAnalyticsDashboard = lazy(() => import("./components/analytics/UmamiAnalyticsDashboard").then(m => ({ default: m.UmamiAnalyticsDashboard })));
const ProfessionDetail = lazy(() => import("./pages/ProfessionDetail"));
const News = lazy(() => import("./pages/News"));


const ProfileSettings = lazy(() => import("./pages/ProfileSettings"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Feed = lazy(() => import("./pages/Feed"));

const Messages = lazy(() => import("./pages/Messages"));
const Friends = lazy(() => import("./pages/Friends"));
const Groups = lazy(() => import("./pages/Groups"));
const GroupDetail = lazy(() => import("./pages/GroupDetail"));
const MyGroups = lazy(() => import("./pages/MyGroups"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SearchResults = lazy(() => import("./pages/SearchResults"));
const Favorites = lazy(() => import("./pages/Favorites"));

const Sitemap = lazy(() => import("./pages/Sitemap"));
const SubmitVenue = lazy(() => import("./pages/SubmitVenue"));
const SubmitEvent = lazy(() => import("./pages/SubmitEvent"));
const CMSPage = lazy(() => import("./pages/Page"));

const queryClient = createOptimizedQueryClient();

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
            <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
               <Box sx={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
                 <Suspense fallback={null}>
                   <Aurora
                     colorStops={["#EF4444", "#22C55E", "#8B5CF6"]}
                     blend={0.35}
                     amplitude={1.0}
                     speed={0.25}
                   />
                 </Suspense>
               </Box>
              <AnalyticsTracker />
              <Box sx={{ position: 'relative', zIndex: 10 }}>
                <Header />
              </Box>
              <Box component="main" sx={{ flex: 1, position: 'relative', zIndex: 10 }}>
                <Container maxWidth="lg" sx={{ px: { xs: 1, sm: 2 } }}>
                  <ErrorBoundary>
                  <Suspense fallback={
                    <Box sx={{ py: 5 }}>
                      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                        <Skeleton sx={{ height: 192 }} />
                        <Skeleton sx={{ height: 192 }} />
                      </Box>
                    </Box>
                  }>
                  <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/venues" element={<Venues />} />
                  <Route path="/venues/:id" element={<VenueDetail />} />
                  <Route path="/events" element={<Events />} />
                  <Route path="/events/:id" element={<EventDetail />} />
                  <Route path="/marketplace" element={<Marketplace />} />
                  <Route path="/marketplace/:id" element={<MarketplaceItemDetail />} />

                  <Route path="/places" element={<Places />} />
                  <Route path="/travel" element={<Travel />} />
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
                  <Route path="/admin" element={
                    <AdminRouteGuard>
                      <AdminShell />
                    </AdminRouteGuard>
                  }>
                    {/* Dashboard section */}
                    <Route index element={<AdminDashboard />} />
                    <Route path="analytics" element={<AdminAnalytics />} />
                    <Route path="security" element={<SecurityMonitoringDashboard />} />
                    <Route path="cloudflare" element={<CloudflareDashboard />} />

                    {/* Content section — unified list + per-type views */}
                    <Route path="content" element={<ContentListPanel />} />
                    <Route path="content/:type" element={<ContentListPanel />} />
                    <Route path="pages" element={<ContentListPanel contentTypeId="cms_pages" />} />
                    <Route path="media" element={<MediaLibrary />} />

                    {/* Imports & Data section */}
                    <Route path="imports" element={<AdminImportHub />} />
                    <Route path="imports/create" element={<ImportJobCreator />} />
                    <Route path="imports/news-sources" element={<NewsSourcesManager />} />
                    <Route path="imports/pipeline" element={<PipelineMonitor />} />
                    <Route path="imports/venues" element={<VenueImportQuickActions />} />
                    <Route path="imports/history" element={<AdminImportHub />} />

                    {/* Review & Workflow section */}
                    <Route path="review" element={<ReviewQueue />} />
                    <Route path="audit" element={<AuditLog />} />

                    {/* System section */}
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="api-keys" element={<ApiKeysManager />} />
                    <Route path="redirects" element={<AdminRedirects />} />
                    <Route path="email-templates" element={<EmailTemplates />} />

                    {/* Settings — taxonomy management pages */}
                    <Route path="settings" element={<AdminTags />} />
                    <Route path="settings/venue-categories" element={<AdminVenueCategories />} />
                    <Route path="settings/venue-amenities" element={<AdminVenueAmenities />} />
                    <Route path="settings/venue-services" element={<AdminVenueServices />} />
                    <Route path="settings/event-types" element={<AdminEventTypes />} />
                    <Route path="settings/event-amenities" element={<AdminEventAmenities />} />
                    <Route path="settings/event-services" element={<AdminEventServices />} />
                    <Route path="settings/accessibility" element={<AdminAccessibilityAttributes />} />
                    <Route path="settings/target-groups" element={<AdminTargetGroups />} />

                    {/* Legacy routes — old standalone pages still accessible via sidebar */}
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

                    {/* Legacy taxonomy routes — redirect to settings */}
                    <Route path="venue-categories" element={<Navigate to="/admin/settings/venue-categories" replace />} />
                    <Route path="venue-amenities" element={<Navigate to="/admin/settings/venue-amenities" replace />} />
                    <Route path="venue-services" element={<Navigate to="/admin/settings/venue-services" replace />} />
                    <Route path="event-types" element={<Navigate to="/admin/settings/event-types" replace />} />
                    <Route path="event-amenities" element={<Navigate to="/admin/settings/event-amenities" replace />} />
                    <Route path="event-services" element={<Navigate to="/admin/settings/event-services" replace />} />
                    <Route path="accessibility-attributes" element={<Navigate to="/admin/settings/accessibility" replace />} />
                    <Route path="target-groups" element={<Navigate to="/admin/settings/target-groups" replace />} />
                  </Route>
                   <Route path="/news" element={<News />} />
                   <Route path="/search" element={<SearchResults />} />

                    <Route path="/groups" element={<Groups />} />
                    <Route path="/groups/:groupId" element={<GroupDetail />} />
                    <Route path="/my-groups" element={<MyGroups />} />
                   <Route path="/accessibility" element={<CMSRoutePage slug="accessibility" />} />
                   <Route path="/messages" element={<Messages />} />
                   <Route path="/friends" element={<Friends />} />

                    <Route path="/favorites" element={<Favorites />} />
                     <Route path="/feed" element={<Feed />} />
                      <Route path="/community" element={<Navigate to="/feed" replace />} />
                     <Route path="/profile/settings" element={<ProfileSettings />} />
                     <Route path="/user/:userId" element={<UserProfile />} />
                     <Route path="/sitemap" element={<Sitemap />} />
                    <Route path="/submit/venue" element={<SubmitVenue />} />
                    <Route path="/submit/event" element={<SubmitEvent />} />
                    <Route path="/p/:slug" element={<CMSPage />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                  </Routes>
                  </Suspense>
                  </ErrorBoundary>
                </Container>
              </Box>
              <Box sx={{ position: 'relative', zIndex: 10 }}>
                <Footer />
              </Box>
              <CookieConsentBanner />
            </Box>
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
