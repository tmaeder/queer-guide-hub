import React, { useState, useEffect, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
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
import AdminContent from "./pages/AdminContent";
import ContentEditor from "./pages/ContentEditor";
import AdminDashboard from "./pages/AdminDashboard";
import AdminTags from "./pages/AdminTags";
import AdminCities from "./pages/AdminCities";
import AdminVenues from "./pages/AdminVenues";
import AdminEvents from "./pages/AdminEvents";
import AdminMarketplace from "./pages/AdminMarketplace";
import News from "./pages/News";
import Travel from "./pages/Travel";
import MyBookings from "./pages/MyBookings";
import ProfileSettings from "./pages/ProfileSettings";
import UnifiedCMS from "./pages/UnifiedCMS";
import Messages from "./pages/Messages";
import NotFound from "./pages/NotFound";

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
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <div className="min-h-screen flex flex-col relative">
              {/* Enhanced Rainbow Background Animation */}
              <div
                className="fixed inset-0 opacity-15 pointer-events-none z-0"
                style={{
                  background: `
                    radial-gradient(
                      ellipse 120% 80% at ${mousePosition.x * 100}% ${mousePosition.y * 100}%,
                      hsl(${(mousePosition.x * 360 + scrollY * 0.05) % 360}, 75%, 85%) 0%,
                      hsl(${(mousePosition.x * 360 + 72 + scrollY * 0.08) % 360}, 65%, 88%) 15%,
                      hsl(${(mousePosition.x * 360 + 144 + scrollY * 0.1) % 360}, 70%, 90%) 30%,
                      hsl(${(mousePosition.x * 360 + 216 + scrollY * 0.12) % 360}, 60%, 92%) 50%,
                      hsl(${(mousePosition.x * 360 + 288 + scrollY * 0.15) % 360}, 55%, 94%) 70%,
                      transparent 100%
                    ),
                    linear-gradient(
                      ${mousePosition.x * 180 + scrollY * 0.02}deg,
                      hsla(${(mousePosition.y * 360 + scrollY * 0.1) % 360}, 60%, 90%, 0.3) 0%,
                      hsla(${(mousePosition.y * 360 + 120 + scrollY * 0.1) % 360}, 50%, 95%, 0.2) 50%,
                      transparent 100%
                    )
                  `,
                  filter: 'blur(140px)',
                  transition: 'all 1.2s cubic-bezier(0.23, 1, 0.320, 1)',
                  animation: 'pulse 8s ease-in-out infinite alternate'
                }}
              />
              
              {/* Secondary Layer for More Depth */}
              <div
                className="fixed inset-0 opacity-8 pointer-events-none z-0"
                style={{
                  background: `
                    conic-gradient(
                      from ${mousePosition.x * 360 + scrollY * 0.03}deg at ${50 + mousePosition.x * 20}% ${50 + mousePosition.y * 20}%,
                      hsl(${(scrollY * 0.05) % 360}, 70%, 95%) 0deg,
                      hsl(${(90 + scrollY * 0.05) % 360}, 60%, 97%) 90deg,
                      hsl(${(180 + scrollY * 0.05) % 360}, 65%, 94%) 180deg,
                      hsl(${(270 + scrollY * 0.05) % 360}, 55%, 96%) 270deg,
                      hsl(${(scrollY * 0.05) % 360}, 70%, 95%) 360deg
                    )
                  `,
                  filter: 'blur(200px)',
                  transition: 'all 2s cubic-bezier(0.165, 0.84, 0.44, 1)'
                }}
              />
              <Header />
              <main className="flex-1 relative z-10">
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/venues" element={<Venues />} />
                  <Route path="/venues/:id" element={<VenueDetail />} />
                  <Route path="/events" element={<Events />} />
                  <Route path="/events/:id" element={<EventDetail />} />
                  <Route path="/marketplace" element={<Marketplace />} />
                  <Route path="/marketplace/:id" element={<MarketplaceItemDetail />} />
                  
                  <Route path="/directory" element={<Directory />} />
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
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/cms" element={<UnifiedCMS />} />
                  <Route path="/admin/content" element={<AdminContent />} />
                  <Route path="/admin/content/:id" element={<ContentEditor />} />
                  <Route path="/admin/content/new" element={<ContentEditor />} />
                  <Route path="/admin/tags" element={<AdminTags />} />
                  <Route path="/admin/cities" element={<AdminCities />} />
                  <Route path="/admin/venues" element={<AdminVenues />} />
                  <Route path="/admin/events" element={<AdminEvents />} />
                  <Route path="/admin/marketplace" element={<AdminMarketplace />} />
                  <Route path="/news" element={<News />} />
                  <Route path="/travel" element={<Travel />} />
                  <Route path="/messages" element={<Messages />} />
                  <Route path="/my-bookings" element={<MyBookings />} />
                  <Route path="/profile/settings" element={<ProfileSettings />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;