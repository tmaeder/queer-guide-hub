/**
 * Trainline (EU rail) affiliate deep-link builder.
 *
 * Trainline uses Partnerize — the partner ID is attached as `clickref`.
 * Search URLs accept origin/destination station names and ISO dates.
 *
 *   https://www.thetrainline.com/book/results?origin=Berlin&destination=Paris&outwardDate=2026-04-20T08:00:00&journeySearchType=single&passengers=1&clickref={PARTNER}
 */

const TRAINLINE_PARTNER_ID = (import.meta as { env?: Record<string, string> }).env?.VITE_TRAINLINE_PARTNER_ID || '';

export interface TrainlineUrlParams {
  /** Free-text origin city (e.g. "Berlin"). Trainline resolves via its own geocoder. */
  origin: string;
  /** Free-text destination city. */
  destination: string;
  /** Departure date (ISO YYYY-MM-DD). Optional — Trainline defaults to today. */
  departDate?: string | null;
  /** Return date (ISO YYYY-MM-DD). Optional — if omitted, a single is built. */
  returnDate?: string | null;
  /** Passenger count. Default 1, max 9. */
  adults?: number;
}

export function buildTrainlineUrl(params: TrainlineUrlParams): string {
  const { origin, destination, departDate, returnDate } = params;
  const adults = Math.max(1, Math.min(9, Math.round(params.adults ?? 1)));
  const isReturn = Boolean(returnDate);

  const qs = new URLSearchParams({
    origin,
    destination,
    journeySearchType: isReturn ? 'return' : 'single',
    passengers: String(adults),
  });
  if (departDate) qs.set('outwardDate', `${departDate}T08:00:00`);
  if (returnDate) qs.set('inwardDate', `${returnDate}T18:00:00`);
  if (TRAINLINE_PARTNER_ID) qs.set('clickref', TRAINLINE_PARTNER_ID);

  return `https://www.thetrainline.com/book/results?${qs.toString()}`;
}
