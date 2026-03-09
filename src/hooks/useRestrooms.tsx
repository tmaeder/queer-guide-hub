import { useState, useCallback } from 'react';
import { invokeFunction } from '@/integrations/cloudflare-workers';

export interface Restroom {
  id: number;
  name: string;
  street: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  accessible: boolean;
  unisex: boolean;
  changing_table: boolean;
  comment: string;
  directions: string;
  created_at: string;
  updated_at: string;
  upvote: number;
  downvote: number;
}

export function useRestrooms() {
  const [restrooms, setRestrooms] = useState<Restroom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRestrooms = useCallback(
    async (params?: { lat?: number; lng?: number; page?: number; per_page?: number }) => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: fnError } = await invokeFunction('get-refuge-restrooms', {
          body: {
            lat: params?.lat,
            lng: params?.lng,
            page: params?.page ?? 1,
            per_page: params?.per_page ?? 100,
          },
        });

        if (fnError) throw fnError;

        setRestrooms(data || []);
        return data as Restroom[];
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch restrooms';
        setError(msg);
        console.error('Error fetching restrooms:', err);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { restrooms, loading, error, fetchRestrooms };
}
