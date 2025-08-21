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
      // Static routes
      const staticExploreLinks: SitemapLink[] = [
        { label: "Home", to: "/" },
        { label: "Venues", to: "/venues" },
        { label: "Events", to: "/events" },
        { label: "Marketplace", to: "/marketplace" },
        { label: "Directory", to: "/directory" },
        { label: "Users", to: "/users" },
        { label: "Ressources", to: "/ressources" },
        { label: "News", to: "/news" },
        { label: "Groups", to: "/groups" },
        { label: "My Groups", to: "/my-groups" },
        { label: "Feed", to: "/feed" },
        { label: "Favorites", to: "/favorites" },
        { label: "Search", to: "/search" },
        { label: "Personalities", to: "/personalities" },
      ];

      const staticAboutLinks: SitemapLink[] = [
        { label: "About Hub", to: "/about-hub" },
        { label: "About", to: "/about" },
        { label: "Contact", to: "/contact" },
        { label: "Press", to: "/press" },
        { label: "Blog", to: "/blog" },
        { label: "Sustainability", to: "/sustainability" },
        { label: "Legal Hub", to: "/legal" },
        { label: "Terms of Service", to: "/terms" },
        { label: "Privacy Policy", to: "/privacy" },
        { label: "Cookie Policy", to: "/cookies" },
        { label: "DMCA", to: "/dmca" },
        { label: "Accessibility", to: "/accessibility" },
      ];

      try {
        // Use the existing sitemap endpoint to get dynamic data
        const response = await fetch('/api/generate-sitemap');
        
        if (!response.ok) {
          throw new Error('Failed to fetch dynamic sitemap data');
        }

        // For now, return static sections
        // TODO: Parse the XML sitemap response and extract dynamic URLs
        return [
          {
            title: "Explore",
            links: staticExploreLinks
          },
          {
            title: "About & Legal", 
            links: staticAboutLinks
          }
        ];
      } catch (error) {
        console.error('Error fetching dynamic sitemap data:', error);
        // Return static sections as fallback
        return [
          {
            title: "Explore",
            links: staticExploreLinks
          },
          {
            title: "About & Legal",
            links: staticAboutLinks
          }
        ];
      }
    },
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
}