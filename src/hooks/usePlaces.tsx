import { useState, useEffect } from "react";
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

export const usePlaces = () => {
  const [continents, setContinents] = useState<Continent[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
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
          regions (*)
        `)
        .order("name");

      if (error) throw error;
      setCountries(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const fetchCitiesByCountry = async (countryId: string) => {
    try {
      const { data, error } = await supabase
        .from("cities")
        .select(`
          *,
          countries (*)
        `)
        .eq("country_id", countryId)
        .order("population", { ascending: false });

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
          *,
          countries (*)
        `)
        .eq("is_major_city", true)
        .order("population", { ascending: false });

      if (error) throw error;
      setCities(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const searchLocations = async (query: string) => {
    try {
      setLoading(true);
      
      const [continentsResult, countriesResult, citiesResult] = await Promise.all([
        supabase
          .from("continents")
          .select("*")
          .ilike("name", `%${query}%`),
        supabase
          .from("countries")
          .select(`
            *,
            regions (*)
          `)
          .ilike("name", `%${query}%`),
        supabase
          .from("cities")
          .select(`
            *,
            countries (*)
          `)
          .ilike("name", `%${query}%`)
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

      // Fetch all cities with coordinates
      const { data, error } = await supabase
        .from("cities")
        .select(`
          *,
          countries (*)
        `)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

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

      setCities(citiesWithDistance);
      
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