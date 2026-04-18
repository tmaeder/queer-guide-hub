/**
 * Omio (multi-modal EU) affiliate deep-link builder.
 *
 * Omio uses Partnerize — partner ID attached as `partner_id` query param.
 * Supports rail + bus + flight. Frontend passes mode preference.
 *
 *   https://www.omio.com/search-frontend/results?departureCity=Berlin&arrivalCity=Paris&departureDate=2026-04-20&mode=trains&adults=1&partner_id={PARTNER}
 */

const OMIO_PARTNER_ID = (import.meta as { env?: Record<string, string> }).env?.VITE_OMIO_PARTNER_ID || '';

export type OmioMode = 'trains' | 'buses' | 'flights' | 'all';

export interface OmioUrlParams {
  origin: string;
  destination: string;
  departDate?: string | null;
  returnDate?: string | null;
  adults?: number;
  mode?: OmioMode;
}

export function buildOmioUrl(params: OmioUrlParams): string {
  const { origin, destination, departDate, returnDate, mode = 'all' } = params;
  const adults = Math.max(1, Math.min(9, Math.round(params.adults ?? 1)));

  const qs = new URLSearchParams({
    departureCity: origin,
    arrivalCity: destination,
    adults: String(adults),
    mode,
  });
  if (departDate) qs.set('departureDate', departDate);
  if (returnDate) qs.set('returnDate', returnDate);
  if (OMIO_PARTNER_ID) qs.set('partner_id', OMIO_PARTNER_ID);

  return `https://www.omio.com/search-frontend/results?${qs.toString()}`;
}
