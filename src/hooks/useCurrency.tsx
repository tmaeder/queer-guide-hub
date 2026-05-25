import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { useProfile, profileQueryKey, type Profile } from '@/hooks/useProfile';
import { formatCurrency, formatCents, getCurrencySymbol } from '@/lib/currency';

const STORAGE_KEY = 'queer-guide-currency';
const DEFAULT_CURRENCY = 'USD';

interface CurrencyContextType {
  currency: string;
  setCurrency: (code: string) => void;
  formatPrice: (amount: number, overrideCurrency?: string) => string;
  formatPriceCents: (cents: number, overrideCurrency?: string) => string;
  symbol: string;
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { location } = useVisitorLocation();
  const [currency, setCurrencyState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) || DEFAULT_CURRENCY,
  );
  const [loading, setLoading] = useState(!localStorage.getItem(STORAGE_KEY));
  const [geoResolved, setGeoResolved] = useState(false);
  // Tracks whether the user has explicitly picked a currency in this session
  // (either by clicking the selector, or by having a prior choice already in
  // localStorage). Profile-sync below must not override an explicit choice —
  // otherwise the GBP-was-just-set-but-displays-as-EUR-after-nav bug returns.
  const userPickedRef = useRef<boolean>(!!localStorage.getItem(STORAGE_KEY));

  // Resolve currency from geo when no stored preference exists
  useEffect(() => {
    if (geoResolved) return;
    if (localStorage.getItem(STORAGE_KEY)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setLoading(false);
      setGeoResolved(true);
      return;
    }
    const country = location?.country;
    if (!country) return;

    (async () => {
      try {
        const { data } = await supabase.rpc('resolve_currency_for_country', {
          p_country_code: country,
        });
        if (data?.[0]?.currency_code) {
          const code = data[0].currency_code.toUpperCase();
          setCurrencyState(code);
          localStorage.setItem(STORAGE_KEY, code);
        }
      } catch {
        // Geo resolution failed — keep default
      } finally {
        setLoading(false);
        setGeoResolved(true);
      }
    })();
  }, [location?.country, geoResolved]);

  // Sync from profile preferences for authenticated users.
  //
  // Reads from the same react-query cache as useProfile (shared queryKey
  // ["profile", userId]) so we don't fire a second /profiles?select=preferences
  // request alongside the /profiles?select=* one in useProfile. This was the
  // duplicate-fetch bug from the QA report.
  const { profile } = useProfile();
  useEffect(() => {
    if (!user || !profile) return;
    // Only seed from the profile when the user has not made an explicit
    // selection in this session. After the first ingest, profile updates
    // (including the round-trip from our own setCurrency below) must not
    // overwrite the active state.
    if (userPickedRef.current) return;
    const saved = (profile.preferences as Record<string, unknown> | null)?.currency;
    if (typeof saved === 'string' && saved.length === 3) {
      const code = saved.toUpperCase();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setCurrencyState(code);
      localStorage.setItem(STORAGE_KEY, code);
      userPickedRef.current = true;
    }
  }, [user?.id, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const queryClient = useQueryClient();
  const setCurrency = useCallback(
    (code: string) => {
      const upper = code.toUpperCase();
      setCurrencyState(upper);
      localStorage.setItem(STORAGE_KEY, upper);
      userPickedRef.current = true;

      // Persist to profile for authenticated users.
      // Read existing preferences from the cached profile (no extra fetch),
      // merge, then write. After the update, patch the cached profile so
      // any other consumer (Header, Settings) sees the new value without a
      // refetch.
      if (user) {
        const cached = queryClient.getQueryData<Profile | null>(profileQueryKey(user.id));
        const prefs = (cached?.preferences as Record<string, unknown> | null) ?? {};
        const nextPrefs = { ...prefs, currency: upper };
        supabase
          .from('profiles')
          .update({ preferences: nextPrefs })
          .eq('user_id', user.id)
          .then(() => {
            if (cached) {
              queryClient.setQueryData<Profile | null>(profileQueryKey(user.id), {
                ...cached,
                preferences: nextPrefs,
              });
            }
          });
      }
    },
    [user, queryClient],
  );

  const formatPrice = useCallback(
    (amount: number, overrideCurrency?: string) =>
      formatCurrency(amount, overrideCurrency || currency),
    [currency],
  );

  const formatPriceCents = useCallback(
    (cents: number, overrideCurrency?: string) =>
      formatCents(cents, overrideCurrency || currency),
    [currency],
  );

  const symbol = getCurrencySymbol(currency);

  return (
    <CurrencyContext.Provider
      value={{ currency, setCurrency, formatPrice, formatPriceCents, symbol, loading }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
