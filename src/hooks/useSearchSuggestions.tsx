import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Calendar, Store, Tag, Users, User } from 'lucide-react';

const SEARCH_PROXY_URL = import.meta.env.VITE_SEARCH_PROXY_URL || 'https://queer-guide-search-proxy.maeder-tobiassimon.workers.dev';

export interface SearchSuggestion {
  id: string;
  name: string;
  type: 'venue' | 'event' | 'marketplace' | 'tag' | 'user' | 'personality' | 'group';
  icon: React.ComponentType;
  subtitle?: string;
  title?: string;
  location?: string;
  city?: string;
  business_name?: string;
  description?: string;
}

const TYPE_ICONS: Record<string, React.ComponentType> = {
  venue: MapPin,
  event: Calendar,
  marketplace: Store,
  tag: Tag,
  personality: User,
  city: MapPin,
  country: MapPin,
  queer_village: MapPin,
  news: Tag,
  user: Users,
  group: Users,
};

export function useSearchSuggestions(query: string) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSuggestions = useCallback(async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(SEARCH_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchTerm,
          hitsPerPage: 8,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: SearchSuggestion[] = (data.suggestions || []).map((hit: any) => ({
        id: hit.id || hit.objectID,
        name: hit.title || hit.name,
        type: hit.type as SearchSuggestion['type'],
        icon: TYPE_ICONS[hit.type] || Tag,
        subtitle: hit.category || hit.location || hit.city || hit.description?.substring(0, 60),
        title: hit.title,
        location: hit.location,
        city: hit.city,
        description: hit.description,
      }));

      setSuggestions(mapped);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, fetchSuggestions]);

  return { suggestions, loading };
}
