/**
 * Reads the entity payload the Cloudflare Pages middleware injects into the
 * document head, so a block renders populated on first paint instead of
 * flashing a skeleton.
 *
 * PORTABILITY NOTE: unlike its siblings this module is browser-only (it touches
 * `document`), so it is deliberately NOT in the portable set enforced by
 * __tests__/portability.test.ts. It still imports only relative paths.
 *
 * The payload is produced with the anon key against `v_entity_cards`, so it is
 * byte-identical for every viewer and contains no safety-gated entity. A
 * signed-in reader sees the anon payload first and gains gated entries when
 * TanStack revalidates with their JWT — briefly seeing FEWER items, never more,
 * which is the correct direction to fail.
 */

import { normalizeEntityCards, type EntityCard } from './normalize';

export const SEED_ELEMENT_ID = 'qg-db-block-seed';
export const SEED_VERSION = 1;

interface SeedPayload {
  v: number;
  /** Slug the payload was built for. Guards against a bfcache bleed. */
  slug: string;
  /** blockId → raw v_entity_cards rows. */
  blocks: Record<string, unknown[]>;
}

let cached: SeedPayload | null | undefined;

function readPayload(): SeedPayload | null {
  if (cached !== undefined) return cached;

  cached = null;
  if (typeof document === 'undefined') return cached;

  const el = document.getElementById(SEED_ELEMENT_ID);
  if (!el?.textContent) return cached;

  try {
    const parsed: unknown = JSON.parse(el.textContent);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as SeedPayload).v === SEED_VERSION &&
      typeof (parsed as SeedPayload).slug === 'string' &&
      typeof (parsed as SeedPayload).blocks === 'object' &&
      (parsed as SeedPayload).blocks !== null
    ) {
      cached = parsed as SeedPayload;
    }
  } catch {
    // A malformed payload must never break the page; the client just refetches.
  }

  return cached;
}

/**
 * Seeded cards for one block, or undefined when there is no usable payload.
 *
 * `expectedSlug` must be the slug currently rendering: the injected script
 * survives a back/forward-cache restore, and serving one page's entities on
 * another would be wrong (and, for a gated-adjacent page, misleading).
 */
export function seedFor(blockId: string, expectedSlug: string): EntityCard[] | undefined {
  const payload = readPayload();
  if (!payload || payload.slug !== expectedSlug) return undefined;

  const rows = payload.blocks[blockId];
  if (!Array.isArray(rows)) return undefined;

  return normalizeEntityCards(rows);
}

/** Test seam — the payload is memoized at module scope. */
export function __resetSeedCache(): void {
  cached = undefined;
}
