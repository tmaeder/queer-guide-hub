/**
 * useAddressResolver
 *
 * Hook that resolves city/country text fields to their database FK IDs.
 * Works for:
 *  - Address fields (venues, events, hotels): extracts city + country from address components
 *  - Nationality fields (personalities): resolves demonym/country name to country_id
 *  - Birth place fields (personalities): resolves "City, Country" to city_id + country_id
 *
 * Uses the resolve-or-create-city edge function which:
 *  1. Resolves via DB function (exact match, aliases, fuzzy)
 *  2. Creates new cities if not found (with geocoding for coordinates)
 */

import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ResolvedLocation {
  city_id: string | null;
  city_name: string | null;
  country_id: string | null;
  country_name: string | null;
  created: boolean;
}

interface UseAddressResolverReturn {
  /** Resolve city + country names to FK IDs. Creates city if needed. */
  resolveAddress: (
    cityName: string | undefined,
    countryName: string,
    latitude?: number,
    longitude?: number,
  ) => Promise<ResolvedLocation | null>;

  /** Resolve a nationality string (e.g. "American", "German") to country_id */
  resolveNationality: (nationality: string) => Promise<ResolvedLocation | null>;

  /** Resolve a "City, Country" birth_place string to city_id + country_id */
  resolveBirthPlace: (birthPlace: string) => Promise<ResolvedLocation | null>;

  /** Whether a resolution is in progress */
  resolving: boolean;
}

export function useAddressResolver(): UseAddressResolverReturn {
  const [resolving, setResolving] = useState(false);

  const resolveAddress = useCallback(async (
    cityName: string | undefined,
    countryName: string,
    latitude?: number,
    longitude?: number,
  ): Promise<ResolvedLocation | null> => {
    if (!countryName?.trim()) return null;

    setResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke('resolve-or-create-city', {
        body: {
          city_name: cityName?.trim() || null,
          country_name: countryName.trim(),
          latitude,
          longitude,
        },
      });

      if (error) {
        console.error('Address resolution error:', error);
        return null;
      }

      if (data?.success) {
        return {
          city_id: data.city_id,
          city_name: data.city_name,
          country_id: data.country_id,
          country_name: data.country_name,
          created: data.created || false,
        };
      }

      console.warn('Address resolution failed:', data?.error);
      return null;
    } catch (err) {
      console.error('Address resolution exception:', err);
      return null;
    } finally {
      setResolving(false);
    }
  }, []);

  const resolveNationality = useCallback(async (
    nationality: string,
  ): Promise<ResolvedLocation | null> => {
    if (!nationality?.trim()) return null;
    // Nationality is just a country name/demonym — resolve without city
    return resolveAddress(undefined, nationality);
  }, [resolveAddress]);

  const resolveBirthPlace = useCallback(async (
    birthPlace: string,
  ): Promise<ResolvedLocation | null> => {
    if (!birthPlace?.trim()) return null;

    // Parse "City, Country" or "City, State, Country" format
    const parts = birthPlace.split(',').map(s => s.trim()).filter(Boolean);

    if (parts.length === 0) return null;

    if (parts.length === 1) {
      // Could be just a city or just a country — try as country first
      return resolveAddress(undefined, parts[0]);
    }

    // Last part is country, first part is city
    const cityName = parts[0];
    const countryName = parts[parts.length - 1];

    return resolveAddress(cityName, countryName);
  }, [resolveAddress]);

  return {
    resolveAddress,
    resolveNationality,
    resolveBirthPlace,
    resolving,
  };
}
