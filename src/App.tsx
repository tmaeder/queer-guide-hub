import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./i18n";
import { AuthProvider } from "@/hooks/useAuth";
import { AccessibilityProvider } from "@/hooks/useAccessibility";
import { useOffline } from "@/hooks/useOffline";
import { usePerformance } from "@/hooks/usePerformance";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import Index from "./pages/Index";
import Venues from "./pages/Venues";
import VenueDetail from "./pages/VenueDetail";
import Events from "./pages/Events";
import EventDetail from "./pages/EventDetail";
import Marketplace from "./pages/Marketplace";
import MarketplaceItemDetail from "./pages/MarketplaceItemDetail";

import Directory from "./pages/Directory";
import TagsDirectory from "./pages/TagsDirectory";
import UserDirectory from "./pages/UserDirectory";
import About from "./pages/About";
import AboutHub from "./pages/AboutHub";
import Contact from "./pages/Contact";
import OurVision from "./pages/OurVision";
import OurValues from "./pages/OurValues";
import Press from "./pages/Press";
import Blog from "./pages/Blog";
import Sustainability from "./pages/Sustainability";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import CookiePolicy from "./pages/CookiePolicy";
import DMCA from "./pages/DMCA";
import LegalHub from "./pages/LegalHub";
import Auth from "./pages/Auth";
import CityDetail from "./pages/CityDetail";
import CountryDetail from "./pages/CountryDetail";
import News from "./pages/News";
import Travel from "./pages/Travel";

import ProfileSettings from "./pages/ProfileSettings";
import UserProfile from "./pages/UserProfile";
import Feed from "./pages/Feed";

import Messages from "./pages/Messages";
import Friends from "./pages/Friends";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import AccessibilityHub from "./pages/AccessibilityHub";
import NotFound from "./pages/NotFound";
import SearchResults from "./pages/SearchResults";
import Favorites from "./pages/Favorites";
import { AdminRouteGuard } from "@/components/security/AdminRouteGuard";

// Lazy load admin components for better performance
const LazyAdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const LazyAdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));
const LazyAdminUsers = lazy(() => import("./pages/AdminUsers"));
const LazyAdminCountries = lazy(() => import("./pages/AdminCountries"));
const LazyAdminTags = lazy(() => import("./pages/AdminTags"));
const LazyAdminCities = lazy(() => import("./pages/AdminCities"));
const LazyAdminGroups = lazy(() => import("./pages/AdminGroups"));
const LazyAdminVenues = lazy(() => import("./pages/AdminVenues"));
const LazyAdminVenueCategories = lazy(() => import("./pages/AdminVenueCategories"));
const LazyAdminVenueAmenities = lazy(() => import("./pages/AdminVenueAmenities"));
const LazyAdminVenueServices = lazy(() => import("./pages/AdminVenueServices"));
const LazyAdminEventTypes = lazy(() => import("./pages/AdminEventTypes"));
const LazyAdminEventAmenities = lazy(() => import("./pages/AdminEventAmenities"));
const LazyAdminEventServices = lazy(() => import("./pages/AdminEventServices"));
const LazyAdminAccessibilityAttributes = lazy(() => import("./pages/AdminAccessibilityAttributes"));
const LazyAdminTargetGroups = lazy(() => import("./pages/AdminTargetGroups"));
const LazyAdminEvents = lazy(() => import("./pages/AdminEvents"));
const LazyAdminMarketplace = lazy(() => import("./pages/AdminMarketplace"));
const LazyAdminNewsSources = lazy(() => import("./pages/AdminNewsSources"));
const LazyEmailTemplates = lazy(() => import("./pages/admin/EmailTemplates"));
const LazyAdminImportHub = lazy(() => import("./pages/AdminImportHub"));

// Performance optimized QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message.includes('offline')) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
});

// Loading component for Suspense fallback
const SuspenseLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="space-y-4 w-full max-w-md">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-8 w-1/2" />
    </div>
  </div>
);

const App = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const [scrollY, setScrollY] = useState(0);
  
  // Performance and offline hooks
  const { isOnline } = useOffline();
  const { markStart, markEnd } = usePerformance();

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePosition({
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight
    });
  }, []);

  const handleScroll = useCallback(() => {
    setScrollY(window.scrollY);
  }, []);

  useEffect(() => {
    const startTime = markStart('app-initialization');
    
    document.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('scroll', handleScroll);
    
    markEnd('app-initialization', startTime);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [handleMouseMove, handleScroll, markStart, markEnd]);

  return (
    <QueryClientProvider client={queryClient}>
      <AccessibilityProvider>
        <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <div className="min-h-screen flex flex-col relative">
              {/* Offline indicator */}
              {!isOnline && (
                <div className="fixed top-0 left-0 right-0 bg-destructive text-destructive-foreground text-center py-2 z-50">
                  You're offline. Some features may be limited.
                </div>
              )}
              
              {/* Enhanced Rainbow Background Animation - Dark Mode Compatible */}
              <div
                className="fixed inset-0 opacity-[0.03] dark:opacity-[0.02] pointer-events-none z-0"
                style={{
                  background: `
                    radial-gradient(
                      ellipse 120% 80% at ${mousePosition.x * 100}% ${mousePosition.y * 100}%,
                      hsl(${(mousePosition.x * 360 + scrollY * 0.05) % 360}, 30%, 50%) 0%,
                      hsl(${(mousePosition.x * 360 + 72 + scrollY * 0.08) % 360}, 25%, 60%) 15%,
                      hsl(${(mousePosition.x * 360 + 144 + scrollY * 0.1) % 360}, 20%, 55%) 30%,
                      hsl(${(mousePosition.x * 360 + 216 + scrollY * 0.12) % 360}, 15%, 65%) 50%,
                      hsl(${(mousePosition.x * 360 + 288 + scrollY * 0.15) % 360}, 10%, 70%) 70%,
                      transparent 100%
                    )
                  `,
                  filter: 'blur(120px)',
                  transition: 'all 1.5s cubic-bezier(0.23, 1, 0.320, 1)'
                }}
              />
              
              {/* Secondary Layer for More Depth - Dark Mode Compatible */}
              <div
                className="fixed inset-0 opacity-[0.02] dark:opacity-[0.015] pointer-events-none z-0"
                style={{
                  background: `
                    conic-gradient(
                      from ${mousePosition.x * 360 + scrollY * 0.02}deg at ${50 + mousePosition.x * 15}% ${50 + mousePosition.y * 15}%,
                      hsl(${(scrollY * 0.03) % 360}, 20%, 80%) 0deg,
                      hsl(${(90 + scrollY * 0.03) % 360}, 15%, 85%) 90deg,
                      hsl(${(180 + scrollY * 0.03) % 360}, 25%, 75%) 180deg,
                      hsl(${(270 + scrollY * 0.03) % 360}, 10%, 90%) 270deg,
                      hsl(${(scrollY * 0.03) % 360}, 20%, 80%) 360deg
                    )
                  `,
                  filter: 'blur(180px)',
                  transition: 'all 2.5s cubic-bezier(0.165, 0.84, 0.44, 1)'
                }}
              />
              <Header />
              <main className="flex-1 relative z-10" style={{ marginTop: !isOnline ? '40px' : '0' }}>
                <div className="container mx-auto px-2 sm:px-4">
                  <Suspense fallback={<SuspenseLoader />}>
                    <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/venues" element={<Venues />} />
                    <Route path="/venues/:id" element={<VenueDetail />} />
                    <Route path="/events" element={<Events />} />
                    <Route path="/events/:id" element={<EventDetail />} />
                    <Route path="/marketplace" element={<Marketplace />} />
                    <Route path="/marketplace/:id" element={<MarketplaceItemDetail />} />
                    
                    <Route path="/directory" element={<Directory />} />
                    <Route path="/city/:id" element={<CityDetail />} />
                    <Route path="/country/:id" element={<CountryDetail />} />
                    <Route path="/users" element={<UserDirectory />} />
                    <Route path="/tags" element={<TagsDirectory />} />
                    <Route path="/tags/:tagName" element={<TagsDirectory />} />
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
                        <LazyAdminDashboard />
                      </AdminRouteGuard>
                    } />
                    
                    <Route path="/admin/tags" element={
                      <AdminRouteGuard>
                        <LazyAdminTags />
                      </AdminRouteGuard>
                    } />
                    <Route path="/admin/cities" element={
                      <AdminRouteGuard>
                        <LazyAdminCities />
                      </AdminRouteGuard>
                    } />
                     <Route path="/admin/venues" element={
                       <AdminRouteGuard>
                         <LazyAdminVenues />
                       </AdminRouteGuard>
                     } />
                     <Route path="/admin/venue-categories" element={
                       <AdminRouteGuard>
                         <LazyAdminVenueCategories />
                       </AdminRouteGuard>
                     } />
                     <Route path="/admin/venue-amenities" element={
                       <AdminRouteGuard>
                         <LazyAdminVenueAmenities />
                       </AdminRouteGuard>
                     } />
                     <Route path="/admin/venue-services" element={
                       <AdminRouteGuard>
                         <LazyAdminVenueServices />
                       </AdminRouteGuard>
                     } />
                     <Route path="/admin/events" element={
                       <AdminRouteGuard>
                         <LazyAdminEvents />
                       </AdminRouteGuard>
                     } />
                     <Route path="/admin/event-types" element={
                       <AdminRouteGuard>
                         <LazyAdminEventTypes />
                       </AdminRouteGuard>
                     } />
                     <Route path="/admin/event-amenities" element={
                       <AdminRouteGuard>
                         <LazyAdminEventAmenities />
                       </AdminRouteGuard>
                     } />
                      <Route path="/admin/event-services" element={
                        <AdminRouteGuard>
                          <LazyAdminEventServices />
                        </AdminRouteGuard>
                      } />
                      <Route path="/admin/accessibility-attributes" element={
                        <AdminRouteGuard>
                          <LazyAdminAccessibilityAttributes />
                        </AdminRouteGuard>
                      } />
                      <Route path="/admin/target-groups" element={
                        <AdminRouteGuard>
                          <LazyAdminTargetGroups />
                        </AdminRouteGuard>
                      } />
                     <Route path="/admin/marketplace" element={
                       <AdminRouteGuard>
                         <LazyAdminMarketplace />
                       </AdminRouteGuard>
                     } />
                     <Route path="/admin/news-sources" element={
                       <AdminRouteGuard>
                         <LazyAdminNewsSources />
                       </AdminRouteGuard>
                     } />
                    <Route path="/admin/groups" element={
                      <AdminRouteGuard>
                        <LazyAdminGroups />
                      </AdminRouteGuard>
                    } />
                    <Route path="/admin/analytics" element={
                      <AdminRouteGuard requiredRole="admin">
                        <LazyAdminAnalytics />
                      </AdminRouteGuard>
                    } />
                    <Route path="/admin/users" element={
                      <AdminRouteGuard requiredRole="admin">
                        <LazyAdminUsers />
                      </AdminRouteGuard>
                    } />
                     <Route path="/admin/countries" element={
                       <AdminRouteGuard>
                         <LazyAdminCountries />
                       </AdminRouteGuard>
                     } />
                     <Route path="/admin/email-templates" element={
                       <AdminRouteGuard requiredRole="admin">
                         <LazyEmailTemplates />
                       </AdminRouteGuard>
                     } />
                     <Route path="/admin/import-hub" element={
                       <AdminRouteGuard>
                         <LazyAdminImportHub />
                       </AdminRouteGuard>
                     } />
                     <Route path="/news" element={<News />} />
                     <Route path="/search" element={<SearchResults />} />
                     <Route path="/travel" element={<Travel />} />
                     <Route path="/groups" element={<Groups />} />
                     <Route path="/groups/:groupId" element={<GroupDetail />} />
                     <Route path="/accessibility" element={<AccessibilityHub />} />
                     <Route path="/messages" element={<Messages />} />
                     <Route path="/friends" element={<Friends />} />
                      
                      <Route path="/favorites" element={<Favorites />} />
                       <Route path="/feed" element={<Feed />} />
                       <Route path="/community" element={<Navigate to="/feed" replace />} />
                      <Route path="/profile/settings" element={<ProfileSettings />} />
                      <Route path="/user/:userId" element={<UserProfile />} />
                     {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </div>
              </main>
              <Footer />
            </div>
          </BrowserRouter>
        </TooltipProvider>
        </AuthProvider>
      </AccessibilityProvider>
    </QueryClientProvider>
  );
};

export default App;