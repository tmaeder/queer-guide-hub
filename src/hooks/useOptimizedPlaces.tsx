import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type Country = Database['public']['Tables']['countries']['Row'];
type City = Database['public']['Tables']['cities']['Row'];

interface PlacesFilters {
  search?: string;
  continent?: string;
  populationRange?: [number, number];
  limit?: number;
  offset?: number;
}

const COUNTRIES_QUERY_KEY = 'countries';
const CITIES_QUERY_KEY = 'cities';
const CACHE_TIME = 30 * 60 * 1000; // 30 minutes - geographic data is stable
const STALE_TIME = 15 * 60 * 1000; // 15 minutes

export function useOptimizedCountries(filters?: PlacesFilters) {
  const fetchCountries = async (): Promise<Country[]> => {
    let query = supabase
      .from('countries')
      .select('*')
      .order('name', { ascending: true });

    if (filters?.search) {
      query = query.or(`name.ilike.%${filters.search}%,capital.ilike.%${filters.search}%`);
    }

    if (filters?.populationRange) {
      query = query
        .gte('population', filters.populationRange[0])
        .lte('population', filters.populationRange[1]);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  };

  const {
    data: countries = [],
    isLoading,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: [COUNTRIES_QUERY_KEY, filters],
    queryFn: fetchCountries,
    gcTime: CACHE_TIME,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 3,
  });

  return {
    countries,
    loading: isLoading,
    error: error?.message || null,
    isFetching,
    refetch,
  };
}

export function useOptimizedCities(filters?: PlacesFilters & { countryId?: string }) {
  const fetchCities = async (): Promise<City[]> => {
    let query = supabase
      .from('cities')
      .select('*')
      .order('population', { ascending: false });

    if (filters?.countryId) {
      query = query.eq('country_id', filters.countryId);
    }

    if (filters?.search) {
      query = query.or(`name.ilike.%${filters.search}%,region_name.ilike.%${filters.search}%`);
    }

    if (filters?.populationRange) {
      query = query
        .gte('population', filters.populationRange[0])
        .lte('population', filters.populationRange[1]);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  };

  const {
    data: cities = [],
    isLoading,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: [CITIES_QUERY_KEY, filters],
    queryFn: fetchCities,
    gcTime: CACHE_TIME,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 3,
  });

  return {
    cities,
    loading: isLoading,
    error: error?.message || null,
    isFetching,
    refetch,
  };
}

export function useOptimizedCountry(countryId: string) {
  const fetchCountry = async (): Promise<Country | null> => {
    const { data, error } = await supabase
      .from('countries')
      .select('*')
      .eq('id', countryId)
      .maybeSingle();

    if (error) throw error;
    return data;
  };

  const {
    data: country,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [COUNTRIES_QUERY_KEY, countryId],
    queryFn: fetchCountry,
    gcTime: CACHE_TIME,
    staleTime: STALE_TIME,
    enabled: !!countryId,
    refetchOnWindowFocus: false,
  });

  return {
    country,
    loading: isLoading,
    error: error?.message || null,
    refetch,
  };
}

export function useOptimizedCity(cityId: string) {
  const fetchCity = async (): Promise<City | null> => {
    const { data, error } = await supabase
      .from('cities')
      .select('*')
      .eq('id', cityId)
      .maybeSingle();

    if (error) throw error;
    return data;
  };

  const {
    data: city,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [CITIES_QUERY_KEY, cityId],
    queryFn: fetchCity,
    gcTime: CACHE_TIME,
    staleTime: STALE_TIME,
    enabled: !!cityId,
    refetchOnWindowFocus: false,
  });

  return {
    city,
    loading: isLoading,
    error: error?.message || null,
    refetch,
  };
}