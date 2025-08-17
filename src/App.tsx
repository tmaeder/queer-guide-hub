import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import "./i18n";
import { AuthProvider } from "@/hooks/useAuth";
import { AccessibilityProvider } from "@/hooks/useAccessibility";
import { CookieConsentProvider } from "@/hooks/useCookieConsent";
import { useUmamiAnalytics } from "@/hooks/useUmamiAnalytics";
import { AnalyticsTracker } from "@/components/analytics/AnalyticsTracker";
import { CookieConsentBanner } from "@/components/privacy/CookieConsentBanner";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AdminRouteGuard } from "@/components/security/AdminRouteGuard";
import { Skeleton } from "@/components/ui/skeleton";
import Aurora from "@/components/ui/Aurora";

const Index = lazy(() => import("./pages/Index"));
const Venues = lazy(() => import("./pages/Venues"));
const VenueDetail = lazy(() => import("./pages/VenueDetail"));
const Events = lazy(() => import("./pages/Events"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const MarketplaceItemDetail = lazy(() => import("./pages/MarketplaceItemDetail"));
const Donations = lazy(() => import("./pages/Donations"));
const DonationSuccess = lazy(() => import("./pages/DonationSuccess"));

const Directory = lazy(() => import("./pages/Directory"));
const Ressources = lazy(() => import("./pages/Ressources"));
const UserDirectory = lazy(() => import("./pages/UserDirectory"));
const Personalities = lazy(() => import("./pages/Personalities"));
const PersonalityDetail = lazy(() => import("./pages/PersonalityDetail"));
const About = lazy(() => import("./pages/About"));
const AboutHub = lazy(() => import("./pages/AboutHub"));
const Contact = lazy(() => import("./pages/Contact"));
const OurVision = lazy(() => import("./pages/OurVision"));
const OurValues = lazy(() => import("./pages/OurValues"));
const Press = lazy(() => import("./pages/Press"));
const Blog = lazy(() => import("./pages/Blog"));
const Sustainability = lazy(() => import("./pages/Sustainability"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const DMCA = lazy(() => import("./pages/DMCA"));
const LegalHub = lazy(() => import("./pages/LegalHub"));
const Auth = lazy(() => import("./pages/Auth"));
const AdminCMS = lazy(() => import("./pages/AdminCMS"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminCountries = lazy(() => import("./pages/AdminCountries"));
const AdminTags = lazy(() => import("./pages/AdminTags"));
const AdminCities = lazy(() => import("./pages/AdminCities"));
const AdminGroups = lazy(() => import("./pages/AdminGroups"));
const CityDetail = lazy(() => import("./pages/CityDetail"));
const CountryDetail = lazy(() => import("./pages/CountryDetail"));
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
const News = lazy(() => import("./pages/News"));


const ProfileSettings = lazy(() => import("./pages/ProfileSettings"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Feed = lazy(() => import("./pages/Feed"));

const Messages = lazy(() => import("./pages/Messages"));
const Friends = lazy(() => import("./pages/Friends"));
const Groups = lazy(() => import("./pages/Groups"));
const GroupDetail = lazy(() => import("./pages/GroupDetail"));
const MyGroups = lazy(() => import("./pages/MyGroups"));
const AccessibilityHub = lazy(() => import("./pages/AccessibilityHub"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SearchResults = lazy(() => import("./pages/SearchResults"));
const Favorites = lazy(() => import("./pages/Favorites"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const Sitemap = lazy(() => import("./pages/Sitemap"));

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AccessibilityProvider>
        <CookieConsentProvider>
          <AuthProvider>
            <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <div className="min-h-screen flex flex-col relative bg-background">
              <div className="fixed inset-0 z-0">
                <Aurora
                  colorStops={["#000000", "#333333", "#000000"]}
                  blend={0.3}
                  amplitude={0.8}
                  speed={0.3}
                />
              </div>
              <AnalyticsTracker />
              <div className="relative z-10">
                <Header />
              </div>
              <main className="flex-1 relative z-10">
                <div className="container mx-auto px-2 sm:px-4">
                  <Suspense fallback={
                    <div className="py-10">
                      <div className="grid gap-6 sm:grid-cols-2">
                        <Skeleton className="h-48" />
                        <Skeleton className="h-48" />
                      </div>
                    </div>
                  }>
                  <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/venues" element={<Venues />} />
                  <Route path="/venues/:id" element={<VenueDetail />} />
                  <Route path="/events" element={<Events />} />
                  <Route path="/events/:id" element={<EventDetail />} />
                  <Route path="/marketplace" element={<Marketplace />} />
                  <Route path="/marketplace/:id" element={<MarketplaceItemDetail />} />
                  <Route path="/donate" element={<Donations />} />
                  <Route path="/donation-success" element={<DonationSuccess />} />
                  
                  <Route path="/directory" element={<Directory />} />
                  <Route path="/city/:id" element={<CityDetail />} />
                  <Route path="/country/:id" element={<CountryDetail />} />
                  <Route path="/users" element={<UserDirectory />} />
                   <Route path="/personalities" element={<Personalities />} />
                   <Route path="/personalities/:id" element={<PersonalityDetail />} />
                   <Route path="/ressources" element={<Ressources />} />
                   <Route path="/ressources/:tagName" element={<Ressources />} />
                   <Route path="/tags" element={<Navigate to="/ressources" replace />} />
                   <Route path="/tags/:tagName" element={<Navigate to="/ressources" replace />} />
                   <Route path="/knowledge" element={<KnowledgeBase />} />
                   <Route path="/about-hub" element={<AboutHub />} />
                   <Route path="/about" element={<About />} />
                   <Route path="/contact" element={<Contact />} />
                   <Route path="/vision" element={<OurVision />} />
                   <Route path="/values" element={<OurValues />} />
                   <Route path="/press" element={<Press />} />
                   <Route path="/blog" element={<Blog />} />
                   <Route path="/sustainability" element={<Sustainability />} />
                   <Route path="/legal" element={<LegalHub />} />
                   <Route path="/terms" element={<TermsOfService />} />
                   <Route path="/privacy" element={<PrivacyPolicy />} />
                   <Route path="/cookies" element={<CookiePolicy />} />
                   <Route path="/dmca" element={<DMCA />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/admin" element={
                    <AdminRouteGuard>
                      <AdminDashboard />
                    </AdminRouteGuard>
                   } />
                   
                   <Route path="/admin/cms" element={
                     <AdminRouteGuard>
                       <AdminCMS />
                     </AdminRouteGuard>
                   } />
                   
                  <Route path="/admin/tags" element={
                    <AdminRouteGuard>
                      <AdminTags />
                    </AdminRouteGuard>
                  } />
                  <Route path="/admin/cities" element={
                    <AdminRouteGuard>
                      <AdminCities />
                    </AdminRouteGuard>
                  } />
                   <Route path="/admin/venues" element={
                     <AdminRouteGuard>
                       <AdminVenues />
                     </AdminRouteGuard>
                   } />
                   <Route path="/admin/venue-categories" element={
                     <AdminRouteGuard>
                       <AdminVenueCategories />
                     </AdminRouteGuard>
                   } />
                   <Route path="/admin/venue-amenities" element={
                     <AdminRouteGuard>
                       <AdminVenueAmenities />
                     </AdminRouteGuard>
                   } />
                   <Route path="/admin/venue-services" element={
                     <AdminRouteGuard>
                       <AdminVenueServices />
                     </AdminRouteGuard>
                   } />
                   <Route path="/admin/events" element={
                     <AdminRouteGuard>
                       <AdminEvents />
                     </AdminRouteGuard>
                   } />
                   <Route path="/admin/event-types" element={
                     <AdminRouteGuard>
                       <AdminEventTypes />
                     </AdminRouteGuard>
                   } />
                   <Route path="/admin/event-amenities" element={
                     <AdminRouteGuard>
                       <AdminEventAmenities />
                     </AdminRouteGuard>
                   } />
                    <Route path="/admin/event-services" element={
                      <AdminRouteGuard>
                        <AdminEventServices />
                      </AdminRouteGuard>
                    } />
                    <Route path="/admin/accessibility-attributes" element={
                      <AdminRouteGuard>
                        <AdminAccessibilityAttributes />
                      </AdminRouteGuard>
                    } />
                    <Route path="/admin/target-groups" element={
                      <AdminRouteGuard>
                        <AdminTargetGroups />
                      </AdminRouteGuard>
                    } />
                   <Route path="/admin/marketplace" element={
                     <AdminRouteGuard>
                       <AdminMarketplace />
                     </AdminRouteGuard>
                   } />
                   <Route path="/admin/news-sources" element={
                     <AdminRouteGuard>
                       <AdminNewsSources />
                     </AdminRouteGuard>
                   } />
                  <Route path="/admin/groups" element={
                    <AdminRouteGuard>
                      <AdminGroups />
                    </AdminRouteGuard>
                  } />
                  <Route path="/admin/analytics" element={
                    <AdminRouteGuard requiredRole="admin">
                      <AdminAnalytics />
                    </AdminRouteGuard>
                  } />
                  <Route path="/admin/users" element={
                    <AdminRouteGuard requiredRole="admin">
                      <AdminUsers />
                    </AdminRouteGuard>
                  } />
                   <Route path="/admin/countries" element={
                     <AdminRouteGuard>
                       <AdminCountries />
                     </AdminRouteGuard>
                   } />
                   <Route path="/admin/email-templates" element={
                     <AdminRouteGuard requiredRole="admin">
                       <EmailTemplates />
                     </AdminRouteGuard>
                    } />
                    <Route path="/admin/personalities" element={
                      <AdminRouteGuard>
                        <AdminPersonalities />
                      </AdminRouteGuard>
                    } />
                    <Route path="/admin/import-hub" element={
                     <AdminRouteGuard>
                       <AdminImportHub />
                     </AdminRouteGuard>
                   } />
                   <Route path="/news" element={<News />} />
                   <Route path="/search" element={<SearchResults />} />
                   
                    <Route path="/groups" element={<Groups />} />
                    <Route path="/groups/:groupId" element={<GroupDetail />} />
                    <Route path="/my-groups" element={<MyGroups />} />
                   <Route path="/accessibility" element={<AccessibilityHub />} />
                   <Route path="/messages" element={<Messages />} />
                   <Route path="/friends" element={<Friends />} />
                    
                    <Route path="/favorites" element={<Favorites />} />
                     <Route path="/feed" element={<Feed />} />
                      <Route path="/community" element={<Navigate to="/feed" replace />} />
                     <Route path="/profile/settings" element={<ProfileSettings />} />
                     <Route path="/user/:userId" element={<UserProfile />} />
                     <Route path="/sitemap" element={<Sitemap />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                  </Routes>
                  </Suspense>
                </div>
              </main>
              <div className="relative z-10">
                <Footer />
              </div>
              <CookieConsentBanner />
            </div>
          </BrowserRouter>
            </TooltipProvider>
          </AuthProvider>
        </CookieConsentProvider>
      </AccessibilityProvider>
    </QueryClientProvider>
  );
};

export default App;