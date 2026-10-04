import { untypedFrom } from '@/integrations/supabase/untyped';

/**
 * Per-entity-type hydration for polymorphic guide_picks. Entity vocab matches
 * search_documents ('marketplace' not 'marketplace_listing', 'queer_village'
 * not 'village'). Each adapter fetches the minimal display fields under the
 * entity's own RLS — safety-gated entities self-filter for anonymous readers,
 * so a gated pick simply renders as absent instead of leaking.
 */

export type GuideEntityType =
  | 'venue'
  | 'event'
  | 'marketplace'
  | 'city'
  | 'country'
  | 'queer_village'
  | 'personality'
  | 'news'
  | 'milestone'
  | 'group'
  | 'organization';

export interface PickEntityDisplay {
  name: string;
  href: string;
  imagePath: string | null;
  /** Secondary line under the name: address, dates, price… */
  metaLine: string | null;
  categoryLabel: string | null;
  outboundUrl?: string | null;
  unavailable?: boolean;
  /**
   * Coordinates, for a guide that is a ROUTE.
   *
   * NOT denormalised onto `guide_picks` — deliberately. `fetchPickEntities`
   * resolves each target under THE TARGET'S OWN RLS, which is why a
   * safety-gated venue renders absent rather than leaking; the
   * `guide_picks_public_read` policy embeds the GUIDE's predicate, not the
   * venue's, so copying coordinates into that table would move a gated
   * venue's location across its own gate. Resolve live, every time.
   */
  lat?: number | null;
  lng?: number | null;
  /**
   * WHERE the coordinates came from, and the reason this is three-valued.
   *
   *  - `own`        — the target row carries them.
   *  - `via_venue`  — an EVENT whose own columns are null and whose joined
   *                   venue has them. `useViewportPoints` documents this split
   *                   (which is why that hook has no server-side bbox filter),
   *                   and without the same fallback here a Pride-trail stop
   *                   anchored to a venue resolves as unmapped.
   *  - `none`       — resolved, and genuinely has no geometry.
   *
   * `undefined` means INELIGIBLE: a marketplace listing has no geometry at
   * all, so "this marketplace pick is unresolved" is a false positive, not a
   * gap in the route. Those two states must not collapse.
   */
  geo?: 'own' | 'via_venue' | 'none';
}

interface AdapterRow {
  id: string;
  [key: string]: unknown;
}

interface Adapter {
  table: string;
  select: string;
  toDisplay: (row: AdapterRow) => PickEntityDisplay;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
/** Postgres `numeric` arrives as a string over PostgREST, so coerce rather than cast. */
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
/** `own` when both coordinates resolved, `none` when the row simply has none. */
function ownGeo(lat: unknown, lng: unknown): Pick<PickEntityDisplay, 'lat' | 'lng' | 'geo'> {
  const la = num(lat);
  const ln = num(lng);
  return la != null && ln != null
    ? { lat: la, lng: ln, geo: 'own' }
    : { lat: null, lng: null, geo: 'none' };
}
const firstImage = (v: unknown): string | null =>
  Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null;
const approvedOverviewImage = (v: unknown): string | null => {
  if (!v || typeof v !== 'object') return null;
  const image = v as Record<string, unknown>;
  return str(image.optimized_url) ?? str(image.thumbnail_url) ?? str(image.url);
};

function fmtDate(iso: unknown): string | null {
  if (typeof iso !== 'string' || !iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

function fmtPrice(price: unknown, currency: unknown): string | null {
  if (price == null) return null;
  const cur = str(currency) ?? 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(
      Number(price),
    );
  } catch {
    return `${cur} ${price}`;
  }
}

const ADAPTERS: Partial<Record<GuideEntityType, Adapter>> = {
  venue: {
    table: 'venues',
    select: 'id, slug, name, images, category, address, city, latitude, longitude',
    toDisplay: (r) => ({
      name: str(r.name) ?? 'Venue',
      href: `/venues/${str(r.slug) ?? r.id}`,
      imagePath: firstImage(r.images),
      metaLine: [str(r.address), str(r.city)].filter(Boolean).join(', ') || null,
      categoryLabel: str(r.category),
      ...ownGeo(r.latitude, r.longitude),
    }),
  },
  event: {
    table: 'events',
    select:
      'id, slug, title, images, event_type, start_date, end_date, venue_name, city, latitude, longitude, venues(latitude, longitude)',
    toDisplay: (r) => {
      const start = fmtDate(r.start_date);
      const end = fmtDate(r.end_date);
      const dates = start && end && start !== end ? `${start} – ${end}` : start;
      const place = str(r.venue_name) ?? str(r.city);
      // THE EVENT TRAP. An event's coordinates live on the row OR on its
      // joined venue — `useViewportPoints` documents exactly this, and it is
      // why that hook has no server-side bbox filter. Without the fallback a
      // Pride-trail stop anchored to a venue resolves as `none` and BLOCKS
      // publication of a route whose geometry is perfectly available.
      const own = ownGeo(r.latitude, r.longitude);
      const v = (r.venues ?? null) as { latitude?: unknown; longitude?: unknown } | null;
      const viaLat = num(v?.latitude);
      const viaLng = num(v?.longitude);
      const geo: Pick<PickEntityDisplay, 'lat' | 'lng' | 'geo'> =
        own.geo === 'own'
          ? own
          : viaLat != null && viaLng != null
            ? { lat: viaLat, lng: viaLng, geo: 'via_venue' }
            : { lat: null, lng: null, geo: 'none' };
      return {
        name: str(r.title) ?? 'Event',
        href: `/events/${str(r.slug) ?? r.id}`,
        imagePath: firstImage(r.images),
        metaLine: [dates, place].filter(Boolean).join(' · ') || null,
        categoryLabel: str(r.event_type),
        ...geo,
      };
    },
  },
  marketplace: {
    table: 'marketplace_listings',
    select:
      'id, slug, title, business_name, price, currency, category, external_url, affiliate_url, availability, overview_image:image_assets!marketplace_listings_overview_image_asset_id_fkey(optimized_url, thumbnail_url, url)',
    toDisplay: (r) => ({
      name: str(r.title) ?? 'Listing',
      href: `/marketplace/${str(r.slug) ?? r.id}`,
      imagePath: approvedOverviewImage(r.overview_image),
      metaLine:
        [fmtPrice(r.price, r.currency), str(r.business_name)].filter(Boolean).join(' · ') || null,
      categoryLabel: str(r.category),
      outboundUrl: str(r.affiliate_url) ?? str(r.external_url),
      unavailable: r.availability === 'out_of_stock',
      // `geo` stays UNDEFINED, not 'none': a listing has no geometry at all,
      // so it is INELIGIBLE as a route stop rather than an unresolved one. A
      // route that includes one shows it as an off-map pick, never as a gap.
    }),
  },
  city: {
    table: 'cities',
    select: 'id, slug, name, image_url, latitude, longitude',
    toDisplay: (r) => ({
      name: str(r.name) ?? 'City',
      href: `/city/${str(r.slug) ?? r.id}`,
      imagePath: str(r.image_url),
      metaLine: null,
      categoryLabel: null,
      ...ownGeo(r.latitude, r.longitude),
    }),
  },
  country: {
    table: 'countries',
    select: 'id, slug, name, image_url, latitude, longitude',
    toDisplay: (r) => ({
      name: str(r.name) ?? 'Country',
      href: `/country/${str(r.slug) ?? r.id}`,
      imagePath: str(r.image_url),
      metaLine: null,
      categoryLabel: null,
      ...ownGeo(r.latitude, r.longitude),
    }),
  },
  queer_village: {
    table: 'queer_villages',
    select: 'id, slug, name, image_url, latitude, longitude',
    toDisplay: (r) => ({
      name: str(r.name) ?? 'Village',
      href: `/villages/${str(r.slug) ?? r.id}`,
      imagePath: str(r.image_url),
      metaLine: null,
      categoryLabel: null,
      ...ownGeo(r.latitude, r.longitude),
    }),
  },
};

export interface PickRef {
  entity_type: GuideEntityType;
  entity_id: string;
}

/**
 * Batch-hydrates pick targets: one query per entity type present.
 * Returns a map keyed `${entity_type}:${entity_id}`. Missing targets
 * (deleted, or RLS-gated for this session) are simply absent.
 */
export async function fetchPickEntities(picks: PickRef[]): Promise<Map<string, PickEntityDisplay>> {
  const byType = new Map<GuideEntityType, string[]>();
  for (const p of picks) {
    if (!ADAPTERS[p.entity_type]) continue;
    const ids = byType.get(p.entity_type) ?? [];
    ids.push(p.entity_id);
    byType.set(p.entity_type, ids);
  }

  const out = new Map<string, PickEntityDisplay>();
  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      const adapter = ADAPTERS[type];
      if (!adapter) return;
      let query = untypedFrom(adapter.table).select(adapter.select).in('id', ids);
      if (type === 'marketplace') query = query.eq('overview_eligible', true);
      const { data, error } = await query;
      if (error) throw error;
      for (const row of (data ?? []) as AdapterRow[]) {
        out.set(`${type}:${row.id}`, adapter.toDisplay(row));
      }
    }),
  );
  return out;
}
