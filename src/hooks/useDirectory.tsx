import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

export type Continent = Tables<"continents">;
export type Region = Tables<"regions">;
export type Country = Tables<"countries"> & {
  regions?: Partial<Region>;
};
export type City = Tables<"cities"> & {
  countries?: Partial<Country>;
  distance?: number;
};

// Optimized partial types for better performance
export type OptimizedCountry = Partial<Tables<"countries">> & {
  id: string;
  name: string;
  code: string;
  regions?: {
    id: string;
    name: string;
  };
};

export type OptimizedCity = Partial<Tables<"cities">> & {
  id: string;
  name: string;
  population?: number;
  latitude?: number;
  longitude?: number;
  is_capital?: boolean;
  is_major_city?: boolean;
  region_name?: string;
  timezone?: string;
  country_id: string;
  countries?: {
    id: string;
    name: string;
    code: string;
    flag_emoji?: string;
    continent_id?: string;
  };
  distance?: number;
};

export const useDirectory = () => {
  const [continents, setContinents] = useState<Continent[]>([]);
  const [countries, setCountries] = useState<OptimizedCountry[]>([]);
  const [cities, setCities] = useState<OptimizedCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContinents = async () => {
    try {
      const { data, error } = await supabase
        .from("continents")
        .select("*")
        .order("name");

      if (error) throw error;
      setContinents(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const fetchCountriesByContinent = async (continentId: string) => {
    try {
      const { data, error } = await supabase
        .from("countries")
        .select(`
          *,
          regions (*)
        `)
        .eq("continent_id", continentId)
        .order("name");

      if (error) throw error;
      return data || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      return [];
    }
  };

  const fetchAllCountries = async () => {
    try {
      const { data, error } = await supabase
        .from("countries")
        .select(`
          *,
          regions (id, name)
        `)
        .order("name")
        .limit(250); // Reasonable limit for performance

      if (error) throw error;
      setCountries(data as OptimizedCountry[] || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const fetchCitiesByCountry = async (countryId: string) => {
    try {
      const { data, error } = await supabase
        .from("cities")
        .select(`
          id,
          name,
          population,
          latitude,
          longitude,
          is_capital,
          is_major_city,
          region_name,
          timezone,
          country_id,
          countries (id, name, code, flag_emoji)
        `)
        .eq("country_id", countryId)
        .order("population", { ascending: false })
        .limit(50); // Reasonable limit per country

      if (error) throw error;
      return data || [];
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      return [];
    }
  };

  const fetchMajorCities = async () => {
    try {
      const { data, error } = await supabase
        .from("cities")
        .select(`
          id,
          name,
          population,
          latitude,
          longitude,
          is_capital,
          is_major_city,
          region_name,
          timezone,
          country_id,
          countries (id, name, code, flag_emoji, continent_id)
        `)
        .eq("is_major_city", true)
        .order("population", { ascending: false })
        .limit(100); // Limit for better performance

      if (error) throw error;
      setCities(data as OptimizedCity[] || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const searchLocations = async (query: string) => {
    try {
      setLoading(true);
      
      // Use the new optimized search with full-text search and better performance
      const [continentsResult, countriesResult, citiesResult] = await Promise.all([
        supabase
          .from("continents")
          .select("*")
          .textSearch("name", `'${query.replace(/'/g, "''")}'`)
          .limit(10),
        supabase
          .from("countries")
          .select(`
            *,
            regions (*)
          `)
          .or(`name.ilike.%${query}%,capital.ilike.%${query}%`)
          .order("population", { ascending: false })
          .limit(15),
        supabase
          .from("cities")
          .select(`
            *,
            countries (name, code, flag_emoji)
          `)
          .or(`name.ilike.%${query}%,region_name.ilike.%${query}%`)
          .order("population", { ascending: false })
          .limit(20)
      ]);

      return {
        continents: continentsResult.data || [],
        countries: countriesResult.data || [],
        cities: citiesResult.data || []
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      return { continents: [], countries: [], cities: [] };
    } finally {
      setLoading(false);
    }
  };

  const findNearbyCities = async (userLocation: { latitude: number; longitude: number }) => {
    try {
      setLoading(true);
      
      // Calculate distance using Haversine formula
      const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 6371; // Radius of the Earth in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c; // Distance in kilometers
        return distance;
      };

      // Fetch cities with coordinates for distance calculation
      const { data, error } = await supabase
        .from("cities")
        .select(`
          id,
          name,
          population,
          latitude,
          longitude,
          is_capital,
          is_major_city,
          region_name,
          country_id,
          countries (id, name, code, flag_emoji)
        `)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .gte('population', 50000) // Only include larger cities for nearby search
        .limit(200); // Increased limit for better nearby results

      if (error) throw error;

      // Calculate distances and filter nearby cities
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
        .slice(0, 20); // Show top 20 closest cities

      setCities(citiesWithDistance as OptimizedCity[]);
      
      return citiesWithDistance;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await Promise.all([
        fetchContinents(),
        fetchAllCountries(),
        fetchMajorCities()
      ]);
      setLoading(false);
    };

    loadInitialData();
  }, []);

  return {
    continents,
    countries,
    cities,
    loading,
    error,
    fetchCountriesByContinent,
    fetchCitiesByCountry,
    searchLocations,
    findNearbyCities
  };
};