/**
 * agendaq.fr — pure parsing and mapping. No I/O, no Supabase client.
 *
 * Shared by `scripts/data-quality/import-agendaq.mjs` (the only caller today)
 * and by any future `source-agendaq` edge function, so the taxon vocabulary and
 * the category mapping cannot drift between them. Mirrors `aids-ch-parse.ts`.
 *
 * ── THE FEED ───────────────────────────────────────────────────────────────
 * `https://data.agendaq.fr/api/v1/businesses?offset=N` returns
 * `{count, items[]}`. Measured 2026-10-05: count 3877, **36 items per page,
 * 108 pages**. `limit` is accepted and IGNORED — only `offset` moves the
 * window, so a caller that passes `limit` and trusts it silently re-reads the
 * same 36 rows forever. `/api/v1/taxons` is 403; the vocabulary below was
 * recovered another way (see TAXONS).
 *
 * Events are NESTED inside each business and REPEAT across businesses — one
 * event lists every business it runs at. Deduplicate by `slug` or you will
 * stage the same party several times: the raw per-business count is ~35k, the
 * distinct count is 16,433.
 *
 * ── TAXON VOCABULARY IS NOT WHAT THE FILTER UI SHOWS ───────────────────────
 * The `/fr/guide` filter dropdown renders 37 taxons with labels and counts, and
 * it is NOT the whole vocabulary — the corpus carries **55**. The 18 it omits
 * split into two groups that must not be treated alike, measured by whether a
 * business carrying one ALSO carries a known category:
 *
 *   SUPPLEMENTARY (96-100% co-occur with a real category): 90, 92..98, 141..143.
 *     An amenity/ambiance facet. Ignored here; it never decides a category.
 *   SOLE MARKER (0% co-occur): 118, 123, 124, 126, 127, 129, 131.
 *     These are all 76 uncategorised businesses carry. agendaq itself renders
 *     them as "Pas d'information sur cet établissement".
 *
 * Both isolates (`beef`=[118], `abraxas-run`=[127]) render NO category label on
 * their own detail page, which is what established the split. Those 76 land as
 * `other` and are left to QG's own `run_venue_category_reclassify` + review
 * queue. They are deliberately NOT name-inferred: inference on a source that
 * says nothing is exactly what produced 167 cafés and bars out of public
 * toilets in the refuge-restrooms pass, including a hair salon labelled
 * `sauna` — which on this platform asserts a sexual venue type.
 *
 * ── SOURCE BEATS NAME ──────────────────────────────────────────────────────
 * Category comes from the taxon and from nothing else. There is no name
 * heuristic in this file on purpose.
 */

/** Category facet. These are the only taxons that may decide `venues.category`. */
export const TAXON_CATEGORY: Record<number, string> = {
  63: 'soirée',
  64: 'association',
  65: 'bar',
  66: 'backroom',
  67: 'bar-backroom',
  68: 'Centre de santé CeGIDD',
  69: 'sauna',
  70: 'sauna + backroom',
  71: 'groupe convivial',
  72: 'discothèque',
  73: 'discothèque + backroom',
  76: 'sex shop',
  77: 'sex shop + backroom',
  99: 'espace cabines',
  100: 'éditeur',
  101: 'organisme public',
  102: 'site internet',
  104: "hôtel & maisons d'hôtes",
  116: 'plage',
  117: 'lieu de drague',
  119: 'bar-restaurant',
  125: 'salon esthétique',
  128: 'boutique de vêtements',
  130: 'salle de spectacle',
  132: 'commerce',
};

/** Audience facet → QG `target_groups` slugs. */
export const TAXON_AUDIENCE: Record<number, string> = {
  178: 'gay-only',
  179: 'gay-friendly',
  180: 'lesbian-only',
  181: 'lesbian-friendly',
  182: 'trans-only',
  183: 'trans-friendly',
  184: 'bisexual',
  185: 'queer-friendly',
  186: 'queer-only',
  187: 'bear',
  188: 'naturist',
  189: 'drag',
};

/**
 * Taxons that ride alongside a real category (96-100% co-occurrence) and never
 * decide one. Listed so an unrecognised id is distinguishable from a known-
 * irrelevant one — a bare "unknown taxon" count cannot tell those apart.
 */
export const TAXON_SUPPLEMENTARY = new Set([90, 92, 93, 94, 95, 96, 97, 98, 141, 142, 143]);

/** Sole-marker taxons on businesses with no category. Resolve before using. */
export const TAXON_UNRESOLVED = new Set([118, 123, 124, 126, 127, 129, 131]);

/**
 * Category taxon → `venues.category`, which is a CLOSED vocabulary
 * (`venues_category_check`, 17 values, mirrored in src/lib/venueCategories.ts).
 *
 * `plage` maps to `outdoor` and NOT to `beach`: `beach` is not a legal value and
 * the admin CMS once offered it, producing a hard constraint violation on save.
 *
 * A `*-backroom` combination keeps the PRIMARY category (a bar with a backroom
 * is a bar); the backroom is an amenity, not the kind of place. Only a venue
 * whose whole purpose is cruising (`backroom`, `espace cabines`, `lieu de
 * drague`) takes `cruising` — which is load-bearing beyond browse, because
 * `venues.safety_gated` is `location_is_high_risk(...) OR category='cruising'`,
 * so this value alone hides the row from anonymous visitors in every country.
 */
export const VENUE_CATEGORY: Record<number, string> = {
  65: 'bar',
  67: 'bar',
  119: 'bar',
  69: 'sauna',
  70: 'sauna',
  72: 'club',
  73: 'club',
  66: 'cruising',
  99: 'cruising',
  117: 'cruising',
  76: 'shop',
  77: 'shop',
  128: 'shop',
  132: 'shop',
  104: 'hotel',
  116: 'outdoor',
  130: 'theater',
  125: 'salon',
};

/**
 * Category taxon → organization lane. An organization is NOT a kind of place:
 * `organization` was retired from the venue vocabulary (migration
 * 20260915140000) for exactly this reason.
 *
 * CeGIDD centres are France's public sexual-health testing service. They go to
 * `organizations` via `commit_health_service_org`, which is the decision
 * `source-aids-ch` already inherits and records: "a testing site IS a place,
 * and minting 534 `venues` rows to hold the coordinates would put clinics into
 * venue browse and onto the map beside bars and saunas." That RPC carries
 * latitude/longitude itself, so filing them here loses no geography.
 */
export const ORG_ROLE: Record<number, 'health' | 'association' | 'public-body'> = {
  68: 'health',
  64: 'association',
  71: 'association',
  101: 'public-body',
};

/** Not a place in any sense. `soirée` is a recurring party — its EVENTS still import. */
export const NOT_A_PLACE: Record<number, string> = {
  63: 'soirée',
  100: 'éditeur',
  102: 'site internet',
};

// ── Feed shapes ────────────────────────────────────────────────────────────

export interface AgendaqAddress {
  pc?: string | null;
  sn?: string | null;
  city?: string | null;
  region?: string | null;
  street?: string | null;
}

export interface AgendaqLocation {
  id?: number;
  label?: string | null;
  lat?: number | null;
  lon?: number | null;
  cc?: string | null;
  addr?: AgendaqAddress | null;
}

export interface AgendaqDateRule {
  tz?: string;
  start?: string;
  end?: string;
  startH?: string;
  endH?: string;
  allDay?: string | boolean;
  recurring?: '' | 'd' | 'w' | 'm';
  every?: number;
  label?: string;
  [k: `w.${number}`]: unknown;
}

export interface AgendaqEvent {
  slug: string;
  name: string;
  start?: string | null;
  end?: string | null;
  updatedOn?: string;
  dates?: Array<[string, AgendaqDateRule]>;
  locations?: AgendaqLocation[];
  taxons?: number[];
  assets?: Array<[string, string, string, number, number, number]>;
  businesses?: Array<{ id: string; name: string; tx?: number[] }>;
  data?: Record<string, unknown>;
  /** Prose. Never read unless prose is explicitly acknowledged — see LICENCE. */
  description?: string;
  descShort?: string;
  price?: unknown;
}

export interface AgendaqBusiness {
  slug: string;
  name: string;
  updatedOn?: string;
  taxons?: number[];
  tags?: number[];
  locations?: AgendaqLocation[];
  assets?: Array<[string, string, string, number, number, number]>;
  events?: AgendaqEvent[];
  data?: {
    url?: string | null;
    email?: string | null;
    phone?: string | null;
    open?: Array<[string, number, string, string]>;
    socials?: Array<{ socialId: string; socialPlatform: string }>;
    currency?: string;
    /** Prose. Never read unless prose is explicitly acknowledged. */
    descShort?: string;
    desc?: string;
  };
}

// ── Classification ─────────────────────────────────────────────────────────

export type Lane = 'venue' | 'org' | 'skip' | 'other';

export interface Classification {
  lane: Lane;
  /** `venues.category` when lane === 'venue' | 'other'. */
  category?: string;
  /** Organization role when lane === 'org'. */
  orgRole?: 'health' | 'association' | 'public-body';
  /** Why it was skipped, when lane === 'skip'. */
  reason?: string;
  /** Category taxons seen, for provenance. */
  taxons: number[];
}

/**
 * Decide which lane a business belongs to, from its taxons alone.
 *
 * Order is load-bearing: a venue category wins over an org role. Measured over
 * the full 3,877-row corpus, **zero** businesses carry both, so the ordering
 * never actually fires — it is here so that if agendaq starts tagging an
 * association's bar as both, the physical place wins rather than the row
 * silently changing lane depending on taxon array order.
 */
export function classify(b: AgendaqBusiness): Classification {
  const taxons = (b.taxons ?? []).filter((t) => t in TAXON_CATEGORY);

  for (const t of taxons) {
    if (VENUE_CATEGORY[t]) return { lane: 'venue', category: VENUE_CATEGORY[t], taxons };
  }
  for (const t of taxons) {
    if (ORG_ROLE[t]) return { lane: 'org', orgRole: ORG_ROLE[t], taxons };
  }
  for (const t of taxons) {
    if (NOT_A_PLACE[t]) return { lane: 'skip', reason: NOT_A_PLACE[t], taxons };
  }
  // No category taxon at all (76 rows). `other` is an honest, documented state;
  // guessing from the name is not.
  return { lane: 'other', category: 'other', taxons };
}

/** Audience taxons → QG target_group slugs. */
export function targetGroups(b: { taxons?: number[] }): string[] {
  return [...new Set((b.taxons ?? []).map((t) => TAXON_AUDIENCE[t]).filter(Boolean))] as string[];
}

// ── Schedule ───────────────────────────────────────────────────────────────

/**
 * agendaq weekday index → QG `schedule.weekly[].day`.
 *
 * **0 is SUNDAY**, verified rather than assumed: the `ludiqueer` series sets
 * only `w.1` and starts 2024-09-02, which is a Monday. The business
 * `data.open[]` array uses the same convention (its rows run 1..6 then 0).
 * Getting this off by one silently shifts every recurring night by a day.
 */
const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

function hhmm(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return /^\d{1,2}:\d{2}$/.test(s) ? s.padStart(5, '0') : null;
}

/**
 * Build `events.schedule` from an agendaq date rule.
 *
 * Shape is fixed by `events_schedule_shape` (migration 20750101100000):
 * `{kind, tz, until, weekly:[{day,start,end}]}` where `weekly` MUST be an array
 * — the CHECK rejects a scalar or object there precisely because the expander
 * would otherwise silently emit no dates.
 *
 * Expansion is driven by `weekly`, never by `kind`; `kind` only decides the
 * sentence a reader gets. A `close <= open` pair is already rolled to the next
 * day by the expander, so a 23:00→04:00 club night needs no special handling.
 *
 * Returns null for a non-recurring rule — a plain point event carries its dates
 * in start_date/end_date and must not get a schedule.
 */
export function toSchedule(rule: AgendaqDateRule | null | undefined): Record<string, unknown> | null {
  if (!rule?.recurring) return null;
  const start = hhmm(rule.startH);
  const end = hhmm(rule.endH);
  const tz = rule.tz || 'Europe/Paris';

  if (rule.recurring === 'w') {
    const weekly: Array<Record<string, string>> = [];
    for (let i = 0; i < 7; i++) {
      if (rule[`w.${i}` as `w.${number}`] === true) {
        const day: Record<string, string> = { day: DOW[i] };
        if (start) day.start = start;
        if (end) day.end = end;
        weekly.push(day);
      }
    }
    // A weekly rule with no day flagged expands to nothing. Emitting it would
    // store a rule that can never produce a date; say so instead.
    if (!weekly.length) return null;
    const s: Record<string, unknown> = { kind: 'recurrence', tz, weekly };
    if (rule.end) s.until = rule.end;
    return s;
  }

  if (rule.recurring === 'd') {
    const weekly = DOW.map((d) => {
      const day: Record<string, string> = { day: d };
      if (start) day.start = start;
      if (end) day.end = end;
      return day;
    });
    const s: Record<string, unknown> = { kind: 'recurrence', tz, weekly };
    if (rule.end) s.until = rule.end;
    return s;
  }

  // Monthly has no representation in `weekly`, and the expander is driven by
  // `weekly` alone. Returning a schedule with no weekly entry would store a
  // rule that yields zero dates and read as success. Left for the point-event
  // path, with the rule preserved in metadata for a later pass.
  return null;
}

/**
 * Business `data.open[]` → `venues.hours`.
 *
 * **This is NOT the `events.schedule` shape** and the two must not be confused:
 * `commit_venue_staging_item` accepts any jsonb object for `hours`, so feeding
 * it a schedule would be written without complaint and understood by no reader.
 * The live convention, measured over all 6,417 entries on prod:
 *
 *   {regular: [{day, open, close}], display?, popular?, open_now?, source?}
 *
 *   * `day` is **1..7, Monday = 1** (ISO). Never 0 — agendaq's own index is
 *     0 = Sunday, so Sunday has to move 0 -> 7 or every Sunday lands on Monday.
 *   * `open`/`close` are **"HHMM" with no colon** (6417/6417 four digits).
 *   * A close after midnight is prefixed **`+`** (`"+0100"`), which is how 1,065
 *     of those entries encode it. `open` is never prefixed.
 *
 * `display` is deliberately NOT generated: it is the string a reader actually
 * sees, and a clumsy machine-built one is worse than none. `tz` has no slot in
 * this shape at all — the times are local wall-clock, which is also why no
 * timezone has to be guessed for a venue.
 */
export function toVenueHours(
  open: Array<[string, number, string, string]> | null | undefined,
): Record<string, unknown> | null {
  const regular: Array<Record<string, string | number>> = [];
  for (const row of open ?? []) {
    if (!Array.isArray(row) || row[0] !== 'dow') continue;
    const idx = Number(row[1]);
    if (!Number.isInteger(idx) || idx < 0 || idx > 6) continue;
    const o = hhmm(row[2]);
    const c = hhmm(row[3]);
    if (!o) continue;
    const day = idx === 0 ? 7 : idx; // 0=Sunday upstream -> 7 here
    const entry: Record<string, string | number> = { day, open: o.replace(':', '') };
    if (c) {
      const flat = c.replace(':', '');
      // close <= open means it closes the following day.
      entry.close = flat <= entry.open ? `+${flat}` : flat;
    }
    regular.push(entry);
  }
  if (!regular.length) return null;
  regular.sort((a, b) => Number(a.day) - Number(b.day) || String(a.open).localeCompare(String(b.open)));
  return { regular, source: 'agendaq' };
}

// ── Location ───────────────────────────────────────────────────────────────

export interface FlatLocation {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  region: string | null;
  country_code: string | null;
}

/**
 * First usable location. A business may carry several (3 of the first 36 do);
 * the first is the primary one agendaq renders.
 *
 * Street number and street name are separate fields upstream (`sn` + `street`);
 * `label` is a pre-joined display string that sometimes carries the city and
 * postcode too, so it is NOT used as the address.
 */
export function flatLocation(locs: AgendaqLocation[] | null | undefined): FlatLocation | null {
  const l = (locs ?? [])[0];
  if (!l) return null;
  const a = l.addr ?? {};
  const street = [a.sn, a.street].filter(Boolean).join(' ').trim();
  return {
    latitude: typeof l.lat === 'number' ? l.lat : null,
    longitude: typeof l.lon === 'number' ? l.lon : null,
    address: street || null,
    city: a.city?.trim() || null,
    postal_code: a.pc?.trim() || null,
    region: a.region?.trim() || null,
    country_code: l.cc?.trim()?.toUpperCase() || null,
  };
}

export const CONTENT_BASE = 'https://data.agendaq.fr';

/** Asset tuples are `[role, path, mime, w, h, _]`. Paths are host-relative. */
export function imageUrls(assets: AgendaqBusiness['assets']): string[] {
  return (assets ?? [])
    .map((a) => (Array.isArray(a) && typeof a[1] === 'string' ? a[1] : null))
    .filter((p): p is string => !!p)
    .map((p) => (p.startsWith('http') ? p : CONTENT_BASE + p));
}

export function socialUrls(data: AgendaqBusiness['data']): string[] {
  return (data?.socials ?? [])
    .map((s) => s?.socialId)
    .filter((s): s is string => typeof s === 'string' && s.startsWith('http'));
}

/** Deduplicate nested events by slug — one event repeats across every business it runs at. */
export function dedupeEvents(businesses: AgendaqBusiness[]): AgendaqEvent[] {
  const seen = new Map<string, AgendaqEvent>();
  for (const b of businesses) {
    for (const e of b.events ?? []) {
      if (e?.slug && !seen.has(e.slug)) seen.set(e.slug, e);
    }
  }
  return [...seen.values()];
}
