import { useState, useEffect, useCallback } from 'react';
import { api } from '@/integrations/api/client';
import { MapPin, Calendar, Store, Tag, Users, User } from 'lucide-react';

export interface SearchSuggestion {
  id: string;
  name: string;
  type: 'venue' | 'event' | 'marketplace' | 'tag' | 'user' | 'personality' | 'group';
  icon: any;
  subtitle?: string;
  title?: string;
  location?: string;
  city?: string;
  business_name?: string;
  description?: string;
}

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
      const promises = [];

      // Search venues
      promises.push(
        api
          .from('venues')
          .select('id, name, location')
          .neq('data_source', 'refuge_restrooms')
          .ilike('name', `%${searchTerm}%`)
          .limit(3)
          .then(({ data }) =>
            (data || []).map((item: any) => ({
              ...item,
              type: 'venue' as const,
              icon: MapPin,
              subtitle: item.location,
            })),
          ),
      );

      // Search events
      promises.push(
        api
          .from('events')
          .select('id, title, city')
          .ilike('title', `%${searchTerm}%`)
          .limit(3)
          .then(({ data }) =>
            (data || []).map((item: any) => ({
              ...item,
              type: 'event' as const,
              icon: Calendar,
              name: item.title,
              subtitle: item.city,
            })),
          ),
      );

      // Search marketplace
      promises.push(
        api
          .from('marketplace_listings')
          .select('id, title, business_name')
          .ilike('title', `%${searchTerm}%`)
          .eq('status', 'active')
          .limit(3)
          .then(({ data }) =>
            (data || []).map((item: any) => ({
              ...item,
              type: 'marketplace' as const,
              icon: Store,
              name: item.title,
              subtitle: item.business_name,
            })),
          ),
      );

      // Search tags
      promises.push(
        api
          .from('unified_tags')
          .select('id, name, description')
          .ilike('name', `%${searchTerm}%`)
          .limit(3)
          .then(({ data }) =>
            (data || []).map((item: any) => ({
              ...item,
              type: 'tag' as const,
              icon: Tag,
              subtitle: item.description,
            })),
          ),
      );

      // Search users
      promises.push(
        api
          .from('profiles')
          .select('user_id, display_name, location')
          .ilike('display_name', `%${searchTerm}%`)
          .limit(2)
          .then(({ data }) =>
            (data || []).map((item: any) => ({
              id: item.user_id,
              name: item.display_name || 'Anonymous User',
              type: 'user' as const,
              icon: Users,
              subtitle: item.location,
            })),
          ),
      );

      // Search personalities
      promises.push(
        api
          .from('personalities')
          .select('id, name, profession')
          .ilike('name', `%${searchTerm}%`)
          .limit(2)
          .then(({ data }) =>
            (data || []).map((item: any) => ({
              ...item,
              type: 'personality' as const,
              icon: User,
              subtitle: item.profession,
            })),
          ),
      );

      // Search groups
      promises.push(
        api
          .from('community_groups')
          .select('id, name, description')
          .ilike('name', `%${searchTerm}%`)
          .limit(2)
          .then(({ data }) =>
            (data || []).map((item: any) => ({
              ...item,
              type: 'group' as const,
              icon: Users,
              subtitle: item.description,
            })),
          ),
      );

      const results = await Promise.all(promises);
      const allSuggestions = results.flat().slice(0, 8);
      setSuggestions(allSuggestions);
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
