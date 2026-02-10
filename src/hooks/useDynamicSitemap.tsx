import { useQuery } from "@tanstack/react-query";

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

export function useDynamicSitemap() {
  return useQuery({
    queryKey: ["dynamic-sitemap"],
    queryFn: async (): Promise<SitemapSection[]> => {
      // Static routes - using actual working routes from the app
      const staticExploreLinks: SitemapLink[] = [
        { label: "Home", to: "/" },
        { label: "Venues", to: "/venues" },
        { label: "Events", to: "/events" },
        { label: "Marketplace", to: "/marketplace" },
        { label: "Users", to: "/users" },
        { label: "News", to: "/news" },
        { label: "Groups", to: "/groups" },
        { label: "My Groups", to: "/my-groups" },
        { label: "Feed", to: "/feed" },
        { label: "Favorites", to: "/favorites" },
        { label: "Search", to: "/search" },
        { label: "Personalities", to: "/personalities" },
        { label: "Places", to: "/places" },
        { label: "Resources", to: "/resources" },
        { label: "Messages", to: "/messages" },
        { label: "Friends", to: "/friends" },
      ];

      const staticAboutLinks: SitemapLink[] = [
        { label: "About Hub", to: "/about-hub" },
        { label: "About", to: "/about" },
        { label: "Contact", to: "/contact" },
        { label: "Press", to: "/press" },
        { label: "Blog", to: "/blog" },
        { label: "Sustainability", to: "/sustainability" },
        { label: "Our Vision", to: "/vision" },
        { label: "Our Values", to: "/values" },
        { label: "Legal Hub", to: "/legal" },
        { label: "Terms of Service", to: "/terms" },
        { label: "Privacy Policy", to: "/privacy" },
        { label: "Cookie Policy", to: "/cookies" },
        { label: "DMCA", to: "/dmca" },
        { label: "Accessibility", to: "/accessibility" },
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
        // Use native fetch to avoid Supabase type issues
        const baseUrl = window.location.origin;
        
        // Fetch from the sitemap API endpoint to get dynamic content
        const response = await fetch(`${baseUrl}/api/sitemap`);
        if (!response.ok) {
          console.warn('Could not fetch dynamic sitemap data, using static links only');
          return sections;
        }

        // For now, return static sections since we've fixed the route URLs
        // TODO: Parse XML sitemap response and extract dynamic URLs when needed
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