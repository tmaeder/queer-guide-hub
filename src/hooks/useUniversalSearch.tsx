import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SearchResult {
  id: string;
  title: string;
  description?: string;
  type: 'venue' | 'event' | 'marketplace' | 'user' | 'news' | 'location' | 'content' | 'travel' | 'ressource' | 'personality';
  imageUrl?: string;
  location?: string;
  category?: string;
  date?: string;
  price?: number;
  rating?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface SearchFilters {
  types: string[];
  location?: string;
  dateRange?: { start: Date; end: Date };
  priceRange?: { min: number; max: number };
  categories?: string[];
  tags?: string[];
  rating?: number;
  featured?: boolean;
  verified?: boolean;
}

export const useUniversalSearch = (query: string, filters: SearchFilters = { types: [] }) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);

  const searchVenues = async (searchQuery: string): Promise<SearchResult[]> => {
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`)
      .limit(10);

    if (error) return [];

    return data.map(venue => ({
      id: venue.id,
      title: venue.name,
      description: venue.description,
      type: 'venue' as const,
      imageUrl: venue.images?.[0],
      location: `${venue.address}, ${venue.city}`,
      category: venue.category,
      rating: 4.5, // Default rating since not in schema
      tags: venue.amenities || [],
      metadata: { 
        capacity: 100, // Default capacity
        priceRange: venue.price_range,
        phone: venue.phone 
      }
    }));
  };

  const searchEvents = async (searchQuery: string): Promise<SearchResult[]> => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,organizer_name.ilike.%${searchQuery}%`)
      .limit(10);

    if (error) return [];

    return data.map(event => ({
      id: event.id,
      title: event.title,
      description: event.description,
      type: 'event' as const,
      imageUrl: event.images?.[0],
      location: `${event.venue_name || event.address}, ${event.city}`,
      category: event.event_type,
      date: event.start_date,
      price: event.price_min,
      metadata: {
        organizer: event.organizer_name,
        endDate: event.end_date,
        isFree: event.is_free,
        maxAttendees: event.max_attendees,
        featured: event.featured
      }
    }));
  };

  const searchMarketplace = async (searchQuery: string): Promise<SearchResult[]> => {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('*')
      .or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,business_name.ilike.%${searchQuery}%`)
      .eq('status', 'active')
      .limit(10);

    if (error) return [];

    return data.map(listing => ({
      id: listing.id,
      title: listing.title,
      description: listing.description,
      type: 'marketplace' as const,
      imageUrl: listing.images?.[0],
      location: listing.location,
      category: listing.category,
      price: listing.price,
      metadata: {
        businessName: listing.business_name,
        businessType: listing.business_type,
        shippingAvailable: listing.shipping_available,
        viewsCount: listing.views_count
      }
    }));
  };

  const searchUsers = async (searchQuery: string): Promise<SearchResult[]> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, location, bio, pronouns, interests, last_active_at')
        .or(`display_name.ilike.%${searchQuery}%,bio.ilike.%${searchQuery}%,occupation.ilike.%${searchQuery}%`)
        .limit(10);

      if (error) return [];

      return data.map(profile => ({
        id: profile.user_id,
        title: profile.display_name || 'Anonymous User',
        description: profile.bio,
        type: 'user' as const,
        imageUrl: profile.avatar_url,
        location: profile.location,
        category: undefined,
        metadata: {
          pronouns: profile.pronouns,
          interests: profile.interests,
          isActive: profile.last_active_at
        }
      }));
    } catch (error) {
      console.error('User search error:', error);
      return [];
    }
  };

  const searchNews = async (searchQuery: string): Promise<SearchResult[]> => {
    const { data, error } = await supabase
      .from('news_articles')
      .select('*')
      .or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%,author.ilike.%${searchQuery}%`)
      .limit(10);

    if (error) return [];

    return data.map(article => ({
      id: article.id,
      title: article.title,
      description: article.excerpt,
      type: 'news' as const,
      imageUrl: article.image_url,
      category: article.category,
      date: article.published_at,
      metadata: {
        author: article.author,
        sentiment: article.sentiment,
        viewsCount: article.views_count,
        isFeatured: article.is_featured
      }
    }));
  };

  const searchLocations = async (searchQuery: string): Promise<SearchResult[]> => {
    const citiesPromise = supabase
      .from('cities')
      .select('*, countries(name)')
      .ilike('name', `%${searchQuery}%`)
      .limit(5);

    const countriesPromise = supabase
      .from('countries')
      .select('*')
      .ilike('name', `%${searchQuery}%`)
      .limit(5);

    const [citiesResult, countriesResult] = await Promise.all([citiesPromise, countriesPromise]);

    const results: SearchResult[] = [];

    if (citiesResult.data) {
      results.push(...citiesResult.data.map(city => ({
        id: city.id,
        title: city.name,
        description: `City in ${(city.countries as any)?.name || 'Unknown'}`,
        type: 'location' as const,
        imageUrl: city.image_url,
        location: (city.countries as any)?.name,
        metadata: {
          population: city.population,
          isCapital: city.is_capital,
          timezone: city.timezone,
          coordinates: { lat: city.latitude, lng: city.longitude },
          isCountry: false
        }
      })));
    }

    if (countriesResult.data) {
      results.push(...countriesResult.data.map(country => ({
        id: country.id,
        title: country.name,
        description: `Country - Capital: ${country.capital}`,
        type: 'location' as const,
        location: country.capital,
        metadata: {
          population: country.population,
          currency: country.currency,
          languages: country.languages,
          isCountry: true
        }
      })));
    }

    return results;
  };

  const searchContent = async (searchQuery: string): Promise<SearchResult[]> => {
    // Content search removed since CMS is no longer available
    return [];
  };

  const searchRessources = async (searchQuery: string): Promise<SearchResult[]> => {
    const { data, error } = await supabase
      .from('unified_tags')
      .select('*')
      .or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%`)
      .limit(10);

    if (error) return [];

    return data.map(tag => ({
      id: tag.id,
      title: tag.name,
      description: tag.description || `${tag.category} tag`,
      type: 'ressource' as const,
      imageUrl: tag.image_url,
      category: tag.category,
      metadata: {
        slug: tag.slug,
        color: tag.color,
        usageCount: tag.usage_count
      }
    }));
  };

  const searchPersonalities = async (searchQuery: string): Promise<SearchResult[]> => {
    const { data, error } = await supabase
      .from('personalities')
      .select('*')
      .or(`name.ilike.%${searchQuery}%,bio.ilike.%${searchQuery}%,profession.ilike.%${searchQuery}%`)
      .limit(10);

    if (error) return [];

    return data.map(personality => ({
      id: personality.id,
      title: personality.name,
      description: personality.bio,
      type: 'personality' as const,
      imageUrl: personality.image_url,
      category: personality.profession,
      metadata: {
        profession: personality.profession,
        birthDate: personality.birth_date,
        deathDate: personality.death_date,
        nationality: personality.nationality,
        viewCount: personality.view_count,
        tags: personality.tags,
        isFeatured: personality.is_featured,
        isLiving: personality.is_living
      }
    }));
  };

  const searchTravel = async (searchQuery: string): Promise<SearchResult[]> => {
    // Travel booking search removed as booking functionality has been removed
    return [];
  };

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setSuggestions([]);
      return;
    }

    setLoading(true);

    try {
      const searchPromises: Promise<SearchResult[]>[] = [];
      const enabledTypes = filters.types.length > 0 ? filters.types : ['venue', 'event', 'marketplace', 'user', 'news', 'location', 'content', 'travel', 'ressource', 'personality'];

      if (enabledTypes.includes('venue')) searchPromises.push(searchVenues(searchQuery));
      if (enabledTypes.includes('event')) searchPromises.push(searchEvents(searchQuery));
      if (enabledTypes.includes('marketplace')) searchPromises.push(searchMarketplace(searchQuery));
      if (enabledTypes.includes('user')) searchPromises.push(searchUsers(searchQuery));
      if (enabledTypes.includes('news')) searchPromises.push(searchNews(searchQuery));
      if (enabledTypes.includes('location')) searchPromises.push(searchLocations(searchQuery));
      if (enabledTypes.includes('content')) searchPromises.push(searchContent(searchQuery));
      if (enabledTypes.includes('travel')) searchPromises.push(searchTravel(searchQuery));
      if (enabledTypes.includes('ressource')) searchPromises.push(searchRessources(searchQuery));
      if (enabledTypes.includes('personality')) searchPromises.push(searchPersonalities(searchQuery));

      const searchResults = await Promise.all(searchPromises);
      const allResults = searchResults.flat();

      // Apply additional filters
      let filteredResults = allResults;

      if (filters.location) {
        filteredResults = filteredResults.filter(result => 
          result.location?.toLowerCase().includes(filters.location!.toLowerCase())
        );
      }

      if (filters.priceRange) {
        filteredResults = filteredResults.filter(result => {
          if (!result.price) return true;
          return result.price >= filters.priceRange!.min && result.price <= filters.priceRange!.max;
        });
      }

      if (filters.categories && filters.categories.length > 0) {
        filteredResults = filteredResults.filter(result =>
          result.category && filters.categories!.includes(result.category)
        );
      }

      if (filters.rating) {
        filteredResults = filteredResults.filter(result =>
          result.rating && result.rating >= filters.rating!
        );
      }

      if (filters.dateRange?.start && filters.dateRange?.end) {
        const start = new Date(filters.dateRange.start).getTime();
        const end = new Date(filters.dateRange.end).getTime();
        filteredResults = filteredResults.filter(result => {
          if (!result.date) return true;
          const d = new Date(result.date).getTime();
          return d >= start && d <= end;
        });
      }

      if (filters.featured) {
        filteredResults = filteredResults.filter(r => r.metadata?.featured === true || r.metadata?.isFeatured === true);
      }

      if (filters.verified) {
        filteredResults = filteredResults.filter(r => r.metadata?.verified === true);
      }

      // Sort by relevance (title matches first, then description)
      filteredResults.sort((a, b) => {
        const aTitle = a.title.toLowerCase().includes(searchQuery.toLowerCase());
        const bTitle = b.title.toLowerCase().includes(searchQuery.toLowerCase());
        if (aTitle && !bTitle) return -1;
        if (!aTitle && bTitle) return 1;
        return 0;
      });

      setResults(filteredResults);
      setSuggestions(filteredResults.slice(0, 5));
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [query, filters]);

  return {
    results,
    suggestions,
    loading,
    performSearch: () => performSearch(query)
  };
};