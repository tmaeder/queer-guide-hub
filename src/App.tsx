import React, { useState, useEffect, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AccessibilityProvider } from "@/hooks/useAccessibility";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
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
import Contact from "./pages/Contact";
import OurVision from "./pages/OurVision";
import OurValues from "./pages/OurValues";
import Press from "./pages/Press";
import Blog from "./pages/Blog";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import CookiePolicy from "./pages/CookiePolicy";
import DMCA from "./pages/DMCA";
import Auth from "./pages/Auth";
import ContentManagementSystem from "./pages/ContentManagementSystem";
import ContentEditor from "./pages/ContentEditor";
import AdminDashboard from "./pages/AdminDashboard";
import AdminTags from "./pages/AdminTags";
import AdminCities from "./pages/AdminCities";
import CityDetail from "./pages/CityDetail";
import CountryDetail from "./pages/CountryDetail";
import AdminVenues from "./pages/AdminVenues";
import AdminEvents from "./pages/AdminEvents";
import AdminMarketplace from "./pages/AdminMarketplace";
import News from "./pages/News";
import Travel from "./pages/Travel";
import MyBookings from "./pages/MyBookings";
import ProfileSettings from "./pages/ProfileSettings";
import UserProfile from "./pages/UserProfile";

import Messages from "./pages/Messages";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import AccessibilityHub from "./pages/AccessibilityHub";
import NotFound from "./pages/NotFound";
import SearchResults from "./pages/SearchResults";
import Favorites from "./pages/Favorites";
import { AdminRouteGuard } from "@/components/security/AdminRouteGuard";

const queryClient = new QueryClient();

const App = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const [scrollY, setScrollY] = useState(0);

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
    document.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('scroll', handleScroll);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [handleMouseMove, handleScroll]);

  return (
    <QueryClientProvider client={queryClient}>
      <AccessibilityProvider>
        <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <div className="min-h-screen flex flex-col relative">
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
              <main className="flex-1 relative z-10">
                <div className="container mx-auto px-4">
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
                  <Route path="/about" element={<About />} />
                  <Route path="/contact" element={<Contact />} />
                  <Route path="/vision" element={<OurVision />} />
                  <Route path="/values" element={<OurValues />} />
                  <Route path="/press" element={<Press />} />
                  <Route path="/blog" element={<Blog />} />
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
                  
                  <Route path="/admin/content" element={
                    <AdminRouteGuard>
                      <ContentManagementSystem />
                    </AdminRouteGuard>
                  } />
                  <Route path="/admin/content/:id" element={
                    <AdminRouteGuard>
                      <ContentEditor />
                    </AdminRouteGuard>
                  } />
                  <Route path="/admin/content/new" element={
                    <AdminRouteGuard>
                      <ContentEditor />
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
                  <Route path="/admin/events" element={
                    <AdminRouteGuard>
                      <AdminEvents />
                    </AdminRouteGuard>
                  } />
                  <Route path="/admin/marketplace" element={
                    <AdminRouteGuard>
                      <AdminMarketplace />
                    </AdminRouteGuard>
                  } />
                   <Route path="/news" element={<News />} />
                   <Route path="/search" element={<SearchResults />} />
                   <Route path="/travel" element={<Travel />} />
                   <Route path="/groups" element={<Groups />} />
                   <Route path="/groups/:groupId" element={<GroupDetail />} />
                   <Route path="/accessibility" element={<AccessibilityHub />} />
                  <Route path="/messages" element={<Messages />} />
                   <Route path="/my-bookings" element={<MyBookings />} />
                   <Route path="/favorites" element={<Favorites />} />
                   <Route path="/profile/settings" element={<ProfileSettings />} />
                   <Route path="/user/:userId" element={<UserProfile />} />
                   {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                  </Routes>
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