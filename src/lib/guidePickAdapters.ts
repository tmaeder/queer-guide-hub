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
const firstImage = (v: unknown): string | null =>
  Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null;

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
    select: 'id, slug, name, images, category, address, city',
    toDisplay: (r) => ({
      name: str(r.name) ?? 'Venue',
      href: `/venues/${str(r.slug) ?? r.id}`,
      imagePath: firstImage(r.images),
      metaLine: [str(r.address), str(r.city)].filter(Boolean).join(', ') || null,
      categoryLabel: str(r.category),
    }),
  },
  event: {
    table: 'events',
    select: 'id, slug, title, images, event_type, start_date, end_date, venue_name, city',
    toDisplay: (r) => {
      const start = fmtDate(r.start_date);
      const end = fmtDate(r.end_date);
      const dates = start && end && start !== end ? `${start} – ${end}` : start;
      const place = str(r.venue_name) ?? str(r.city);
      return {
        name: str(r.title) ?? 'Event',
        href: `/events/${str(r.slug) ?? r.id}`,
        imagePath: firstImage(r.images),
        metaLine: [dates, place].filter(Boolean).join(' · ') || null,
        categoryLabel: str(r.event_type),
      };
    },
  },
  marketplace: {
    table: 'marketplace_listings',
    select:
      'id, slug, title, business_name, price, currency, images, category, external_url, affiliate_url, availability',
    toDisplay: (r) => ({
      name: str(r.title) ?? 'Listing',
      href: `/marketplace/${str(r.slug) ?? r.id}`,
      imagePath: firstImage(r.images),
      metaLine: [fmtPrice(r.price, r.currency), str(r.business_name)]
        .filter(Boolean)
        .join(' · ') || null,
      categoryLabel: str(r.category),
      outboundUrl: str(r.affiliate_url) ?? str(r.external_url),
      unavailable: r.availability === 'out_of_stock',
    }),
  },
  city: {
    table: 'cities',
    select: 'id, slug, name, image_url',
    toDisplay: (r) => ({
      name: str(r.name) ?? 'City',
      href: `/city/${str(r.slug) ?? r.id}`,
      imagePath: str(r.image_url),
      metaLine: null,
      categoryLabel: null,
    }),
  },
  country: {
    table: 'countries',
    select: 'id, slug, name, image_url',
    toDisplay: (r) => ({
      name: str(r.name) ?? 'Country',
      href: `/country/${str(r.slug) ?? r.id}`,
      imagePath: str(r.image_url),
      metaLine: null,
      categoryLabel: null,
    }),
  },
  queer_village: {
    table: 'queer_villages',
    select: 'id, slug, name, image_url',
    toDisplay: (r) => ({
      name: str(r.name) ?? 'Village',
      href: `/villages/${str(r.slug) ?? r.id}`,
      imagePath: str(r.image_url),
      metaLine: null,
      categoryLabel: null,
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
export async function fetchPickEntities(
  picks: PickRef[],
): Promise<Map<string, PickEntityDisplay>> {
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
      const { data, error } = await untypedFrom(adapter.table)
        .select(adapter.select)
        .in('id', ids);
      if (error) throw error;
      for (const row of (data ?? []) as AdapterRow[]) {
        out.set(`${type}:${row.id}`, adapter.toDisplay(row));
      }
    }),
  );
  return out;
}
