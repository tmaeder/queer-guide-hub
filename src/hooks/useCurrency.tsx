import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
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

  // Resolve currency from geo when no stored preference exists
  useEffect(() => {
    if (geoResolved) return;
    if (localStorage.getItem(STORAGE_KEY)) {
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

  // Sync from profile preferences for authenticated users (on login)
  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('preferences')
          .eq('id', user.id)
          .maybeSingle();
        const saved = (data?.preferences as Record<string, unknown>)?.currency;
        if (typeof saved === 'string' && saved.length === 3) {
          const code = saved.toUpperCase();
          setCurrencyState(code);
          localStorage.setItem(STORAGE_KEY, code);
        }
      } catch {
        // Profile fetch failed — keep current
      }
    })();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCurrency = useCallback(
    (code: string) => {
      const upper = code.toUpperCase();
      setCurrencyState(upper);
      localStorage.setItem(STORAGE_KEY, upper);

      // Persist to profile for authenticated users
      if (user) {
        supabase
          .from('profiles')
          .select('preferences')
          .eq('id', user.id)
          .maybeSingle()
          .then(({ data }) => {
            const prefs = (data?.preferences as Record<string, unknown>) || {};
            supabase
              .from('profiles')
              .update({ preferences: { ...prefs, currency: upper } })
              .eq('id', user.id)
              .then(() => {});
          });
      }
    },
    [user],
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

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
