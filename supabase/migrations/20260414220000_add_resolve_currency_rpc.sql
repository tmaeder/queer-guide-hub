-- Resolve a country's primary currency from its ISO alpha-2 code.
-- Used by the frontend CurrencyProvider for geo-based auto-detection.
CREATE OR REPLACE FUNCTION public.resolve_currency_for_country(p_country_code TEXT)
RETURNS TABLE(currency_code TEXT, currency_symbol TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT c2.code, c2.symbol
  FROM public.countries c
  JOIN public.currencies c2 ON c2.code = c.currency
  WHERE c.code = upper(p_country_code)
  LIMIT 1;
$$;
