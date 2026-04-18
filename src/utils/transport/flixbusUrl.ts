/**
 * FlixBus (global bus) affiliate deep-link builder.
 *
 * FlixBus runs through Awin — the affiliate tracking code is attached
 * as `awc` (Awin click-ref).
 *
 *   https://global.flixbus.com/search?departureCity=Berlin&arrivalCity=Paris&rideDate=20.04.2026&adult=1&awc={AWIN_ID}
 *
 * Note: FlixBus uses DD.MM.YYYY (German-style) date format in URL params.
 */

const FLIXBUS_AWIN_ID = (import.meta as { env?: Record<string, string> }).env?.VITE_FLIXBUS_AWIN_ID || '';

export interface FlixbusUrlParams {
  origin: string;
  destination: string;
  departDate?: string | null;
  returnDate?: string | null;
  adults?: number;
}

function toFlixbusDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('T')[0].split('-');
  if (!y || !m || !d) return null;
  return `${d}.${m}.${y}`;
}

export function buildFlixbusUrl(params: FlixbusUrlParams): string {
  const { origin, destination, departDate, returnDate } = params;
  const adults = Math.max(1, Math.min(9, Math.round(params.adults ?? 1)));

  const qs = new URLSearchParams({
    departureCity: origin,
    arrivalCity: destination,
    adult: String(adults),
  });

  const dep = toFlixbusDate(departDate);
  const ret = toFlixbusDate(returnDate);
  if (dep) qs.set('rideDate', dep);
  if (ret) qs.set('returnRideDate', ret);
  if (FLIXBUS_AWIN_ID) qs.set('awc', FLIXBUS_AWIN_ID);

  return `https://global.flixbus.com/search?${qs.toString()}`;
}
