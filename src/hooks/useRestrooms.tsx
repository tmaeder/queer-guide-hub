import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

  const fetchRestrooms = async (params?: {
    lat?: number;
    lng?: number;
    page?: number;
    per_page?: number;
  }) => {
    try {
      setLoading(true);
      setError(null);

      const searchParams = new URLSearchParams();
      if (params?.lat) searchParams.append('lat', params.lat.toString());
      if (params?.lng) searchParams.append('lng', params.lng.toString());
      if (params?.page) searchParams.append('page', params.page.toString());
      if (params?.per_page) searchParams.append('per_page', params.per_page.toString());

      const { data, error } = await supabase.functions.invoke('get-refuge-restrooms', {
        body: { searchParams: searchParams.toString() }
      });

      if (error) throw error;
      
      setRestrooms(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch restrooms');
      console.error('Error fetching restrooms:', err);
    } finally {
      setLoading(false);
    }
  };

  return {
    restrooms,
    loading,
    error,
    fetchRestrooms,
  };
}