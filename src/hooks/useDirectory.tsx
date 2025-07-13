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

export const useDirectory = () => {
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
    searchLocations
  };
};