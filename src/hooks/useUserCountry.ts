/**
 * useUserCountry — Lightweight client-side country guess for personalising
 * resource sections (crisis hotlines, support orgs).
 *
 * Resolution order: ?country= URL param → localStorage → navigator.language → 'INT'.
 * No IP geolocation. The user can always override via the section's selector.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

export const SUPPORTED_COUNTRIES: Record<string, string> = {
  DE: 'Deutschland',
  AT: 'Österreich',
  CH: 'Schweiz',
  GB: 'United Kingdom',
  IE: 'Ireland',
  US: 'United States',
  CA: 'Canada',
  AU: 'Australia',
  NL: 'Nederland',
  FR: 'France',
  ES: 'España',
  IT: 'Italia',
  INT: 'International',
};

const STORAGE_KEY = 'qg_user_country';

function detectFromNavigator(): string {
  if (typeof navigator === 'undefined') return 'INT';
  const region = (navigator.language || 'en-US').split('-')[1]?.toUpperCase();
  if (region && SUPPORTED_COUNTRIES[region]) return region;
  return 'INT';
}

function getInitial(urlCountry: string | null): string {
  if (urlCountry && SUPPORTED_COUNTRIES[urlCountry]) return urlCountry;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_COUNTRIES[stored]) return stored;
  }
  return detectFromNavigator();
}

export function useUserCountry() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCountry = searchParams.get('country');
  const [country, setCountryState] = useState<string>(() => getInitial(urlCountry));

  useEffect(() => {
    if (urlCountry && SUPPORTED_COUNTRIES[urlCountry] && urlCountry !== country) {
      setCountryState(urlCountry);
    }
  }, [urlCountry, country]);

  const setCountry = useCallback(
    (next: string) => {
      const valid = SUPPORTED_COUNTRIES[next] ? next : 'INT';
      setCountryState(valid);
      try {
        localStorage.setItem(STORAGE_KEY, valid);
      } catch {
        /* ignore quota errors */
      }
      // Mirror to URL only if it was already present (keeps default URLs clean).
      if (urlCountry) {
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            if (valid === 'INT') p.delete('country');
            else p.set('country', valid);
            return p;
          },
          { replace: true },
        );
      }
    },
    [setSearchParams, urlCountry],
  );

  return { country, setCountry, countries: SUPPORTED_COUNTRIES };
}

export function countryLabel(code: string): string {
  return SUPPORTED_COUNTRIES[code] ?? code;
}
