import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Calendar, Store, Tag, Users, User } from 'lucide-react';
import type { SearchHit } from '@/lib/searchClient';
import { searchFetch, isSearchUnavailable, SEARCH_UNAVAILABLE_MESSAGE } from '@/lib/searchFetch';

const MIN_QUERY_LEN = 2;

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
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < MIN_QUERY_LEN) {
      setSuggestions([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await searchFetch<{ hits?: SearchHit[]; suggestions?: SearchHit[] }>(
        '/',
        { query: searchTerm, hitsPerPage: 8 },
        { timeoutMs: 5000 },
      );

      const source = data.suggestions ?? data.hits ?? [];
      const mapped: SearchSuggestion[] = source.map((hit: SearchHit) => ({
        id: hit.id || hit.objectID || '',
        name: hit.title || hit.name || '',
        type: hit.type as SearchSuggestion['type'],
        icon: TYPE_ICONS[hit.type] || Tag,
        subtitle: hit.category || hit.location || hit.city || hit.description?.substring(0, 60),
        title: hit.title,
        location: hit.location,
        city: hit.city,
        description: hit.description,
      }));

      setSuggestions(mapped);
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      setSuggestions([]);
      // Surface the unavailable state so the search popover can render an
      // error row instead of silent emptiness (bug #2 / #22).
      if (isSearchUnavailable(err)) setError(SEARCH_UNAVAILABLE_MESSAGE);
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

  return { suggestions, loading, error };
}
