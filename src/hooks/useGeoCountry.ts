/**
 * useGeoCountry — resolve the visitor's country, IP-first then navigator-lang fallback.
 *
 * Lookup order:
 *   1. URL param (when on /help/:country)
 *   2. localStorage (user's last choice on /help)
 *   3. /api/geo Cloudflare worker (request.cf.country) — best signal for travelers
 *   4. navigator.language region tag
 *   5. 'ALL'
 *
 * Returns { country, loading } so the hero CTA can render an inline skeleton.
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'qg_help_country';

// Known country codes we have hotlines for. Keep in sync with HelpHotlines COUNTRY_NAMES.
const KNOWN = new Set([
  'DE', 'AT', 'CH', 'GB', 'IE', 'US', 'CA', 'AU', 'NL', 'FR', 'ES', 'IT', 'INT',
]);

function fromNavigator(): string | null {
  if (typeof navigator === 'undefined') return null;
  const locale = navigator.language || 'en-US';
  const region = locale.split('-')[1]?.toUpperCase();
  return region && KNOWN.has(region) ? region : null;
}

function fromStorage(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && (KNOWN.has(v) || v === 'ALL') ? v : null;
  } catch {
    return null;
  }
}

export interface UseGeoCountryResult {
  country: string;
  loading: boolean;
}

export function useGeoCountry(initial?: string | null): UseGeoCountryResult {
  const [country, setCountry] = useState<string>(() => {
    if (initial && (KNOWN.has(initial.toUpperCase()) || initial.toUpperCase() === 'ALL')) {
      return initial.toUpperCase();
    }
    return fromStorage() ?? fromNavigator() ?? 'ALL';
  });
  const [loading, setLoading] = useState<boolean>(() => !initial && !fromStorage());

  useEffect(() => {
    if (initial || fromStorage()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch('/api/geo', { credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { country?: string | null } | null) => {
        if (cancelled) return;
        const c = j?.country?.toUpperCase();
        if (c && KNOWN.has(c)) {
          setCountry(c);
        }
      })
      .catch(() => {
        /* silent — navigator fallback already set */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initial]);

  return { country, loading };
}
