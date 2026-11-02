import type { EventDetail } from '@/api/events';
import type { Hotline } from '@/api/hotlines';
import type { VenueDetail } from '@/api/venues';

/**
 * Offline city packs, format 1.
 *
 * Distribution is two kinds of file on a static host:
 *
 *   index.json   { payload: "<PackIndex as a JSON string>", sig: "<hex ed25519>" }
 *   <id>.json    a PackPayload, verified by the sha256 the signed index lists
 *
 * The signature covers the index's exact bytes (no canonicalisation step to
 * get wrong), and the index pins every pack's digest, so one key signature
 * authenticates everything a pack carries — including the hotline numbers,
 * which is why packs are signed at all: a swapped crisis number is the
 * attack that matters.
 *
 * Packs are built with the PUBLISHABLE key only (see scripts/packs), so
 * they hold exactly what an anonymous visitor can read — safety-gated venues
 * in criminalising countries are excluded by RLS and never reach a file.
 */
export const PACK_FORMAT = 1;

export interface PackIndexEntry {
  /** canonical city slug */
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  generated_at: string;
  bytes: number;
  /** lowercase hex sha256 of the pack file's bytes */
  sha256: string;
  venues: number;
}

export interface PackIndex {
  format: number;
  generated_at: string;
  packs: PackIndexEntry[];
}

export interface SignedIndex {
  payload: string;
  sig: string;
}

/** Venue detail minus images: photos stay online-only to keep packs small. */
export type PackVenue = Omit<VenueDetail, 'images'>;

export interface PackPayload {
  format: number;
  id: string;
  name: string;
  country: string;
  generated_at: string;
  venues: PackVenue[];
  /** this country's lines plus international ones */
  hotlines: Hotline[];
  /**
   * Events not yet over when the pack was built (next 180 days). Optional so
   * packs built before events existed still verify and install; the app
   * re-filters by end time on read, since a pack ages after download.
   */
  events?: PackEvent[];
}

export type PackEvent = EventDetail;

export type PackErrorCode =
  | 'not_configured'
  | 'bad_signature'
  | 'bad_format'
  | 'rollback'
  | 'digest_mismatch'
  | 'id_mismatch'
  | 'network';

export class PackError extends Error {
  constructor(
    readonly code: PackErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PackError';
  }
}
