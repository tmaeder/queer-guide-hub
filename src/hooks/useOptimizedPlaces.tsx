import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database, Tables } from '@/integrations/supabase/types';
import { calculateDistanceKm } from '@/utils/calculateDistance';

type Country = Database['public']['Tables']['countries']['Row'];
type City = Database['public']['Tables']['cities']['Row'];

// Extended types with joins (re-exported for consumers that need them)
export type { Country, City };
export type CountryWithRegions = Tables<'countries'> & { regions?: Tables<'regions'> };
export type CityWithCountry = Tables<'cities'> & { countries?: Tables<'countries'> };

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
    let query = supabase.from('countries').select('*').order('name', { ascending: true });

    if (filters?.search) {
      query = query.or(`name.ilike.%${filters.search}%,capital.ilike.%${filters.search}%`);
    }

    if (filters?.populationRange) {
      query = query
        .gte('population', filters.populationRange[0])
        .lte('population', filters.populationRange[1]);
    }

    query = query.limit(filters?.limit || 200);

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 200) - 1);
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
    isFetching,
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
    let query = supabase.from('cities').select('*').order('population', { ascending: false });

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

    query = query.limit(filters?.limit || 100);

    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1);
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
    isFetching,
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

export function useOptimizedCountry(countrySlug: string) {
  const fetchCountry = async (): Promise<Country | null> => {
    // Try slug first, fall back to ID for backwards compatibility
    const { data, error } = await supabase
      .from('countries')
      .select('*, continents(name), regions(name)')
      .eq('slug', countrySlug)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;

    const { data: byId, error: idError } = await supabase
      .from('countries')
      .select('*, continents(name), regions(name)')
      .eq('id', countrySlug)
      .maybeSingle();

    if (idError) throw idError;
    return byId;
  };

  const {
    data: country,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [COUNTRIES_QUERY_KEY, countrySlug],
    queryFn: fetchCountry,
    gcTime: CACHE_TIME,
    staleTime: STALE_TIME,
    enabled: !!countrySlug,
    refetchOnWindowFocus: false,
  });

  return {
    country,
    loading: isLoading,
    error: error?.message || null,
    refetch,
  };
}

export function useOptimizedCity(citySlug: string) {
  const fetchCity = async (): Promise<City | null> => {
    // Try slug first, fall back to ID for backwards compatibility
    const { data, error } = await supabase
      .from('cities')
      .select('*')
      .eq('slug', citySlug)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;

    // Fallback: try as ID (UUID or numeric)
    const { data: byId, error: idError } = await supabase
      .from('cities')
      .select('*')
      .eq('id', citySlug)
      .maybeSingle();

    if (idError) throw idError;
    return byId;
  };

  const {
    data: city,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [CITIES_QUERY_KEY, citySlug],
    queryFn: fetchCity,
    gcTime: CACHE_TIME,
    staleTime: STALE_TIME,
    enabled: !!citySlug,
    refetchOnWindowFocus: false,
  });

  return {
    city,
    loading: isLoading,
    error: error?.message || null,
    refetch,
  };
}

// Imperative fetch functions (migrated from usePlaces)

export async function fetchCitiesByCountry(countryId: string): Promise<CityWithCountry[]> {
  const { data, error } = await supabase
    .from('cities')
    .select('*, countries (*)')
    .eq('country_id', countryId)
    .order('population', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function searchLocations(query: string) {
  const [countriesResult, citiesResult] = await Promise.all([
    supabase.from('countries').select('*, regions (*)').ilike('name', `%${query}%`),
    supabase.from('cities').select('*, countries (*)').ilike('name', `%${query}%`).limit(20),
  ]);
  return {
    countries: countriesResult.data || [],
    cities: citiesResult.data || [],
  };
}

export async function findNearbyCities(userLocation: {
  latitude: number;
  longitude: number;
}): Promise<CityWithCountry[]> {
  const { data, error } = await supabase
    .from('cities')
    .select('*, countries (*)')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (error) throw error;
  return (data || [])
    .map((city) => ({
      ...city,
      distance: calculateDistanceKm(
        userLocation.latitude,
        userLocation.longitude,
        Number(city.latitude),
        Number(city.longitude),
      ),
    }))
    .filter((c: { distance: number }) => c.distance <= 500)
    .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance)
    .slice(0, 20);
}
