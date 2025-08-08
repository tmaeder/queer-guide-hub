import React, { useState, useEffect, useCallback } from "react";
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
import AdminDashboard from "./pages/AdminDashboard";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminUsers from "./pages/AdminUsers";
import AdminCountries from "./pages/AdminCountries";
import AdminTags from "./pages/AdminTags";
import AdminCities from "./pages/AdminCities";
import AdminGroups from "./pages/AdminGroups";
import CityDetail from "./pages/CityDetail";
import CountryDetail from "./pages/CountryDetail";
import AdminVenues from "./pages/AdminVenues";
import AdminVenueCategories from "./pages/AdminVenueCategories";
import AdminVenueAmenities from "./pages/AdminVenueAmenities";
import AdminVenueServices from "./pages/AdminVenueServices";
import AdminEventTypes from "./pages/AdminEventTypes";
import AdminEventAmenities from "./pages/AdminEventAmenities";
import AdminEventServices from "./pages/AdminEventServices";
import AdminAccessibilityAttributes from "./pages/AdminAccessibilityAttributes";
import AdminTargetGroups from "./pages/AdminTargetGroups";
import AdminEvents from "./pages/AdminEvents";
import AdminMarketplace from "./pages/AdminMarketplace";
import AdminNewsSources from "./pages/AdminNewsSources";
import EmailTemplates from "./pages/admin/EmailTemplates";
import AdminImportHub from "./pages/AdminImportHub";
import News from "./pages/News";
import Travel from "./pages/Travel";

import ProfileSettings from "./pages/ProfileSettings";
import UserProfile from "./pages/UserProfile";
import Feed from "./pages/Feed";

import Messages from "./pages/Messages";
import Friends from "./pages/Friends";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import MyGroups from "./pages/MyGroups";
import AccessibilityHub from "./pages/AccessibilityHub";
import NotFound from "./pages/NotFound";
import SearchResults from "./pages/SearchResults";
import Favorites from "./pages/Favorites";
import { AdminRouteGuard } from "@/components/security/AdminRouteGuard";
import KnowledgeBase from "./pages/KnowledgeBase";

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
              <AnalyticsTracker />
              <Header />
              <main className="flex-1">
                <div className="container mx-auto px-2 sm:px-4">
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
                   <Route path="/admin/import-hub" element={
                     <AdminRouteGuard>
                       <AdminImportHub />
                     </AdminRouteGuard>
                   } />
                   <Route path="/news" element={<News />} />
                   <Route path="/search" element={<SearchResults />} />
                   <Route path="/travel" element={<Travel />} />
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
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                  </Routes>
                </div>
              </main>
              <Footer />
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