import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SitemapLink {
  label: string;
  to: string;
  lastmod?: string;
  priority?: string;
}

interface SitemapSection {
  title: string;
  links: SitemapLink[];
}

type DbItem = {
  id: string;
  name?: string;
  title?: string;
  updated_at?: string;
};

export function useDynamicSitemap() {
  return useQuery({
    queryKey: ["dynamic-sitemap"],
    queryFn: async (): Promise<SitemapSection[]> => {
      // Static routes - fixed the broken links
      const staticExploreLinks: SitemapLink[] = [
        { label: "Home", to: "/" },
        { label: "Venues", to: "/venues" },
        { label: "Events", to: "/events" },
        { label: "Marketplace", to: "/marketplace" },
        { label: "Directory", to: "/directory" },
        { label: "Users", to: "/user-directory" },
        { label: "News", to: "/news" },
        { label: "Groups", to: "/groups" },
        { label: "My Groups", to: "/my-groups" },
        { label: "Feed", to: "/feed" },
        { label: "Favorites", to: "/favorites" },
        { label: "Search", to: "/search-results" },
        { label: "Personalities", to: "/personalities" },
        { label: "Places", to: "/places" },
        { label: "Videos", to: "/videos" },
      ];

      const staticAboutLinks: SitemapLink[] = [
        { label: "About Hub", to: "/about-hub" },
        { label: "About", to: "/about" },
        { label: "Contact", to: "/contact" },
        { label: "Press", to: "/press" },
        { label: "Blog", to: "/blog" },
        { label: "Sustainability", to: "/sustainability" },
        { label: "Our Vision", to: "/our-vision" },
        { label: "Our Values", to: "/our-values" },
        { label: "Legal Hub", to: "/legal-hub" },
        { label: "Terms of Service", to: "/terms-of-service" },
        { label: "Privacy Policy", to: "/privacy-policy" },
        { label: "Cookie Policy", to: "/cookie-policy" },
        { label: "DMCA", to: "/dmca" },
        { label: "Accessibility Hub", to: "/accessibility-hub" },
      ];

      const sections: SitemapSection[] = [
        {
          title: "Explore",
          links: staticExploreLinks
        },
        {
          title: "About & Legal",
          links: staticAboutLinks
        }
      ];

      try {
        // Fetch venues with explicit typing
        const venuesQuery = supabase
          .from('venues')
          .select('id, name, updated_at');
        
        const { data: venues, error: venuesError } = await venuesQuery;
        
        if (!venuesError && venues && venues.length > 0) {
          const venueLinks = venues.slice(0, 20).map((venue: DbItem) => ({
            label: venue.name || `Venue ${venue.id}`,
            to: `/venue-detail?id=${venue.id}`,
            lastmod: venue.updated_at || undefined
          }));

          if (venueLinks.length > 0) {
            sections.push({
              title: "Featured Venues",
              links: venueLinks
            });
          }
        }

        // Fetch events with explicit typing
        const eventsQuery = supabase
          .from('events')
          .select('id, title, updated_at');
        
        const { data: events, error: eventsError } = await eventsQuery;
        
        if (!eventsError && events && events.length > 0) {
          const eventLinks = events.slice(0, 20).map((event: DbItem) => ({
            label: event.title || event.name || `Event ${event.id}`,
            to: `/event-detail?id=${event.id}`,
            lastmod: event.updated_at || undefined
          }));

          if (eventLinks.length > 0) {
            sections.push({
              title: "Upcoming Events",
              links: eventLinks
            });
          }
        }

        // Fetch personalities with explicit typing
        const personalitiesQuery = supabase
          .from('personalities')
          .select('id, name, updated_at');
        
        const { data: personalities, error: personalitiesError } = await personalitiesQuery;
        
        if (!personalitiesError && personalities && personalities.length > 0) {
          const personalityLinks = personalities.slice(0, 20).map((personality: DbItem) => ({
            label: personality.name || `Personality ${personality.id}`,
            to: `/personality-detail?id=${personality.id}`,
            lastmod: personality.updated_at || undefined
          }));

          if (personalityLinks.length > 0) {
            sections.push({
              title: "Personalities",
              links: personalityLinks
            });
          }
        }

        return sections;
      } catch (error) {
        console.error('Error fetching dynamic sitemap data:', error);
        return sections;
      }
    },
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}