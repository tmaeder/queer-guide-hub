import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

export type Continent = Tables<"continents">;
export type Region = Tables<"regions">;
export type Country = Tables<"countries"> & {
  regions?: Region;
};
export type City = Tables<"cities"> & {
  countries?: Country;
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

class DirectoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes for directory data

  set<T>(key: string, data: T, ttl = this.DEFAULT_TTL) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiry: ttl
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  clear() {
    this.cache.clear();
  }
}

const directoryCache = new DirectoryCache();

export const useOptimizedDirectory = () => {
  const [continents, setContinents] = useState<Continent[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContinents = useCallback(async () => {
    const cacheKey = 'continents_all';
    const cached = directoryCache.get<Continent[]>(cacheKey);
    
    if (cached) {
      setContinents(cached);
      return cached;
    }

    try {
      const { data, error } = await supabase
        .from("continents")
        .select("id, name, code, created_at, updated_at")
        .order("name");

      if (error) throw error;
      
      const continentsData = data || [];
      directoryCache.set(cacheKey, continentsData);
      setContinents(continentsData);
      return continentsData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch continents");
      return [];
    }
  }, []);

  const fetchCountriesByContinent = useCallback(async (continentId: string) => {
    const cacheKey = `countries_continent_${continentId}`;
    const cached = directoryCache.get<Country[]>(cacheKey);
    
    if (cached) return cached;

    try {
      const { data, error } = await supabase
        .from("countries")
        .select("*")
        .eq("continent_id", continentId)
        .order("name");

      if (error) throw error;
      
      const countriesData = data || [];
      directoryCache.set(cacheKey, countriesData);
      return countriesData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch countries");
      return [];
    }
  }, []);

  const fetchAllCountries = useCallback(async () => {
    const cacheKey = 'countries_all';
    const cached = directoryCache.get<Country[]>(cacheKey);
    
    if (cached) {
      setCountries(cached);
      return cached;
    }

    try {
      const { data, error } = await supabase
        .from("countries")
        .select("*")
        .order("name");

      if (error) throw error;
      
      const countriesData = data || [];
      directoryCache.set(cacheKey, countriesData);
      setCountries(countriesData);
      return countriesData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch countries");
      return [];
    }
  }, []);

  const fetchCitiesByCountry = useCallback(async (countryId: string) => {
    const cacheKey = `cities_country_${countryId}`;
    const cached = directoryCache.get<City[]>(cacheKey);
    
    if (cached) return cached;

    try {
      const { data, error } = await supabase
        .from("cities")
        .select("*")
        .eq("country_id", countryId)
        .order("population", { ascending: false })
        .limit(100); // Limit to improve performance

      if (error) throw error;
      
      const citiesData = data || [];
      directoryCache.set(cacheKey, citiesData);
      return citiesData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch cities");
      return [];
    }
  }, []);

  const fetchMajorCities = useCallback(async () => {
    const cacheKey = 'cities_major';
    const cached = directoryCache.get<City[]>(cacheKey);
    
    if (cached) {
      setCities(cached);
      return cached;
    }

    try {
      const { data, error } = await supabase
        .from("cities")
        .select("*")
        .eq("is_major_city", true)
        .order("population", { ascending: false })
        .limit(50); // Limit major cities for performance

      if (error) throw error;
      
      const citiesData = data || [];
      directoryCache.set(cacheKey, citiesData);
      setCities(citiesData);
      return citiesData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch major cities");
      return [];
    }
  }, []);

  const searchLocations = useCallback(async (query: string) => {
    if (query.length < 2) {
      return { continents: [], countries: [], cities: [] };
    }

    const cacheKey = `search_${query.toLowerCase()}`;
    const cached = directoryCache.get(cacheKey);
    
    if (cached) return cached;

    try {
      setLoading(true);
      
      const [continentsResult, countriesResult, citiesResult] = await Promise.all([
        supabase
          .from("continents")
          .select("id, name, code")
          .ilike("name", `%${query}%`)
          .limit(5),
        supabase
          .from("countries")
          .select("*")
          .ilike("name", `%${query}%`)
          .limit(20),
        supabase
          .from("cities")
          .select("*")
          .ilike("name", `%${query}%`)
          .limit(30)
      ]);

      const results = {
        continents: continentsResult.data || [],
        countries: countriesResult.data || [],
        cities: citiesResult.data || []
      };

      // Cache search results for shorter time
      directoryCache.set(cacheKey, results, 5 * 60 * 1000); // 5 minutes
      
      return results;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      return { continents: [], countries: [], cities: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  const findNearbyCities = useCallback(async (userLocation: { latitude: number; longitude: number }) => {
    const cacheKey = `nearby_${userLocation.latitude.toFixed(2)}_${userLocation.longitude.toFixed(2)}`;
    const cached = directoryCache.get<City[]>(cacheKey);
    
    if (cached) {
      setCities(cached);
      return cached;
    }

    try {
      setLoading(true);
      
      // Fetch cities with coordinates in a reasonable bounding box first
      const latRange = 5; // ~555km at equator
      const lonRange = 5; // varies by latitude
      
      const { data, error } = await supabase
        .from("cities")
        .select("*")
        .gte('latitude', userLocation.latitude - latRange)
        .lte('latitude', userLocation.latitude + latRange)
        .gte('longitude', userLocation.longitude - lonRange)
        .lte('longitude', userLocation.longitude + lonRange)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(200);

      if (error) throw error;

      // Calculate distances and filter
      const citiesWithDistance = (data || [])
        .map(city => ({
          ...city,
          distance: calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            Number(city.latitude),
            Number(city.longitude)
          )
        }))
        .filter((city: any) => city.distance <= 500) // Within 500km
        .sort((a: any, b: any) => a.distance - b.distance)
        .slice(0, 20);

      directoryCache.set(cacheKey, citiesWithDistance);
      setCities(citiesWithDistance);
      
      return citiesWithDistance;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to find nearby cities");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Memoized derived data
  const countriesByContinent = useMemo(() => {
    return countries.reduce((acc, country) => {
      if (!acc[country.continent_id]) acc[country.continent_id] = [];
      acc[country.continent_id].push(country);
      return acc;
    }, {} as Record<string, Country[]>);
  }, [countries]);

  const citiesByCountry = useMemo(() => {
    return cities.reduce((acc, city) => {
      if (!acc[city.country_id]) acc[city.country_id] = [];
      acc[city.country_id].push(city);
      return acc;
    }, {} as Record<string, City[]>);
  }, [cities]);

  const capitalCities = useMemo(() => {
    return cities.filter(city => city.is_capital);
  }, [cities]);

  // Load initial data efficiently
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchContinents(),
          fetchAllCountries(),
          fetchMajorCities()
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load initial data");
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [fetchContinents, fetchAllCountries, fetchMajorCities]);

  return {
    continents,
    countries,
    cities,
    loading,
    error,
    fetchCountriesByContinent,
    fetchCitiesByCountry,
    searchLocations,
    findNearbyCities,
    // Derived data
    countriesByContinent,
    citiesByCountry,
    capitalCities,
    // Cache management
    clearCache: () => directoryCache.clear()
  };
};

// Utility function
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}