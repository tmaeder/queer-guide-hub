import { useState, useEffect } from "react";
import { api } from "@/integrations/api/client";
import { Tables } from "@/types/database";
import { calculateDistanceKm } from '@/utils/calculateDistance';

export type Continent = Tables<"continents">;
export type Region = Tables<"regions">;
export type Country = Tables<"countries"> & {
  regions?: Region;
};
export type City = Tables<"cities"> & {
  countries?: Country;
};

export const useDirectory = () => {
  const [continents, setContinents] = useState<Continent[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContinents = async () => {
    try {
      const { data, error } = await api
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
      const { data, error } = await api
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
      const { data, error } = await api
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
      const { data, error } = await api
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
      const { data, error } = await api
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
        api
          .from("continents")
          .select("*")
          .ilike("name", `%${query}%`),
        api
          .from("countries")
          .select(`
            *,
            regions (*)
          `)
          .ilike("name", `%${query}%`),
        api
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
      
      // Fetch all cities with coordinates
      const { data, error } = await api
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
          distance: calculateDistanceKm(
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