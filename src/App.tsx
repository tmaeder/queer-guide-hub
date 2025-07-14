import React from "react";
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
import Community from "./pages/Community";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/venues" element={<Venues />} />
                <Route path="/venues/:id" element={<VenueDetail />} />
                <Route path="/events" element={<Events />} />
                <Route path="/events/:id" element={<EventDetail />} />
                <Route path="/marketplace" element={<Marketplace />} />
                <Route path="/marketplace/:id" element={<MarketplaceItemDetail />} />
                <Route path="/community" element={<Community />} />
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
                <Route path="/admin/content" element={<AdminContent />} />
                <Route path="/admin/content/:id" element={<ContentEditor />} />
                <Route path="/admin/tags" element={<AdminTags />} />
                <Route path="/admin/cities" element={<AdminCities />} />
                <Route path="/admin/venues" element={<AdminVenues />} />
                <Route path="/admin/events" element={<AdminEvents />} />
                <Route path="/admin/marketplace" element={<AdminMarketplace />} />
                <Route path="/news" element={<News />} />
                <Route path="/travel" element={<Travel />} />
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

export default App;
