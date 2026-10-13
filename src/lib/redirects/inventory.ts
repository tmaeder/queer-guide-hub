export interface InventoryRedirect {
  clicks?: number;
  campaign?: Record<string, string>;
  prefill?: Record<string, string>;
  id: string;
  source: string;
  target: string | null;
  origin: string;
  kind: 'Manual' | 'Automatic' | 'Static' | 'Client';
  statusCode: number | null;
  state:
    | 'Enabled'
    | 'Disabled'
    | 'Scheduled'
    | 'Expired'
    | 'Limit reached'
    | 'Missing target'
    | 'Recorded';
  updatedAt: string | null;
  manualId?: string;
}

export interface SlugSource {
  table: string;
  entity: string;
  foreignKey: string;
  prefix: string;
}

export const SLUG_SOURCES: readonly SlugSource[] = [
  { table: 'venue_slug_redirects', entity: 'venues', foreignKey: 'venue_id', prefix: '/venues' },
  { table: 'city_slug_redirects', entity: 'cities', foreignKey: 'city_id', prefix: '/city' },
  {
    table: 'country_slug_redirects',
    entity: 'countries',
    foreignKey: 'country_id',
    prefix: '/country',
  },
  { table: 'event_slug_redirects', entity: 'events', foreignKey: 'event_id', prefix: '/events' },
  { table: 'guide_slug_redirects', entity: 'guides', foreignKey: 'guide_id', prefix: '/guides' },
  { table: 'hotel_slug_redirects', entity: 'hotels', foreignKey: 'hotel_id', prefix: '/hotels' },
  {
    table: 'marketplace_slug_redirects',
    entity: 'marketplace_listings',
    foreignKey: 'listing_id',
    prefix: '/marketplace',
  },
  {
    table: 'marketplace_brand_slug_redirects',
    entity: 'marketplace_brands',
    foreignKey: 'brand_id',
    prefix: '/marketplace/brands',
  },
  {
    table: 'milestone_slug_redirects',
    entity: 'milestones',
    foreignKey: 'milestone_id',
    prefix: '/history',
  },
  {
    table: 'news_slug_redirects',
    entity: 'news_articles',
    foreignKey: 'article_id',
    prefix: '/news',
  },
  {
    table: 'org_slug_redirects',
    entity: 'organizations',
    foreignKey: 'organization_id',
    prefix: '/organizations',
  },
  {
    table: 'personality_slug_redirects',
    entity: 'personalities',
    foreignKey: 'personality_id',
    prefix: '/personalities',
  },
  { table: 'tag_slug_redirects', entity: 'unified_tags', foreignKey: 'tag_id', prefix: '/tags' },
  {
    table: 'village_slug_redirects',
    entity: 'queer_villages',
    foreignKey: 'village_id',
    prefix: '/villages',
  },
];

type Row = Record<string, unknown>;
export type ReadInventoryRows = (
  table: string,
  select: string,
  order: string,
  ids?: { column: string; values: string[] },
) => Promise<Row[]>;

/** Count-driven paging also works when the API caps responses below our batch size. */
export async function readInventoryPages(
  read: (
    offset: number,
  ) => Promise<{ data: Row[] | null; count: number | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (;;) {
    const result = await read(rows.length);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (result.count === null) throw new Error('Redirect source returned no row count');
    if (rows.length >= result.count) return rows;
    if (!page.length) throw new Error('Redirect source ended before all records were loaded');
  }
}

function automatic(
  origin: string,
  key: string,
  source: string,
  target: string | null,
  created: unknown,
): InventoryRedirect {
  return {
    id: `${origin}:${key}`,
    source,
    target,
    origin,
    kind: 'Automatic',
    statusCode: 301,
    state: target ? 'Enabled' : 'Missing target',
    updatedAt: typeof created === 'string' ? created : null,
  };
}

export function manualRedirect(row: Row, now = Date.now()): InventoryRedirect {
  const campaign: Record<string, string> = {};
  try {
    const target = new URL(String(row.target), 'https://queer.guide');
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
      const value = target.searchParams.get(key);
      if (value) campaign[key] = value;
    }
  } catch {
    /* Invalid stored destinations remain visible in the inventory. */
  }
  if (row.utm_defaults && typeof row.utm_defaults === 'object') {
    for (const [key, value] of Object.entries(row.utm_defaults))
      if (typeof value === 'string' && !campaign[key]) campaign[key] = value;
  }
  if (
    row.query_mode === 'OVERRIDE' &&
    row.query_override &&
    typeof row.query_override === 'object'
  ) {
    for (const [key, value] of Object.entries(row.query_override)) {
      if (
        key in campaign ||
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].includes(key)
      ) {
        if (typeof value === 'string') campaign[key] = value;
      }
    }
  }
  let state: InventoryRedirect['state'] = row.is_enabled ? 'Enabled' : 'Disabled';
  if (state === 'Enabled' && row.start_at && Date.parse(String(row.start_at)) > now)
    state = 'Scheduled';
  if (state === 'Enabled' && row.end_at && Date.parse(String(row.end_at)) <= now) state = 'Expired';
  if (
    state === 'Enabled' &&
    row.click_limit != null &&
    Number(row.click_count) >= Number(row.click_limit)
  )
    state = 'Limit reached';
  return {
    id: `redirects:${row.id}`,
    manualId: String(row.id),
    clicks: Number(row.click_count ?? 0),
    campaign,
    prefill:
      row.query_mode === 'OVERRIDE' && row.query_override && typeof row.query_override === 'object'
        ? Object.fromEntries(
            Object.entries(row.query_override).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === 'string' &&
                !['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].includes(
                  entry[0],
                ),
            ),
          )
        : {},
    origin: 'redirects',
    kind: 'Manual',
    source: row.type === 'SHORT' ? `/go/${row.slug}` : String(row.source_path ?? ''),
    target: row.target ? String(row.target) : null,
    statusCode: Number(row.status_code),
    state,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

export async function loadSlugSource(
  source: SlugSource,
  read: ReadInventoryRows,
): Promise<InventoryRedirect[]> {
  const extra = source.table === 'tag_slug_redirects' ? ',new_slug' : '';
  const rows = await read(
    source.table,
    `old_slug,${source.foreignKey},created_at${extra}`,
    'old_slug',
  );
  const ids = [
    ...new Set(
      rows.map((r) => r[source.foreignKey]).filter((id): id is string => typeof id === 'string'),
    ),
  ];
  const slugs = new Map<string, string>();
  // Bound the URL size of PostgREST's in() filter, and fetch only linked entities.
  for (let offset = 0; offset < ids.length; offset += 200) {
    const targets = await read(source.entity, 'id,slug', 'id', {
      column: 'id',
      values: ids.slice(offset, offset + 200),
    });
    for (const target of targets)
      if (target.slug) slugs.set(String(target.id), String(target.slug));
  }
  return rows.map((row) => {
    // Tag aliases without a FK retain their explicit destination slug.
    const slug =
      slugs.get(String(row[source.foreignKey])) ?? (row.new_slug ? String(row.new_slug) : null);
    return automatic(
      source.table,
      String(row.old_slug),
      `${source.prefix}/${row.old_slug}`,
      slug ? `${source.prefix}/${slug}` : null,
      row.created_at,
    );
  });
}

export async function loadDatabaseInventory(read: ReadInventoryRows) {
  const sources = [
    ...SLUG_SOURCES.map((source) => ({
      name: source.table,
      load: () => loadSlugSource(source, read),
    })),
    {
      name: 'redirects',
      load: async () =>
        (
          await read(
            'redirects',
            'id,type,slug,source_path,target,status_code,is_enabled,start_at,end_at,click_limit,click_count,utm_defaults,query_mode,query_override,updated_at',
            'id',
          )
        ).map((r) => manualRedirect(r)),
    },
    {
      name: 'venue_redirects',
      load: async () =>
        (await read('venue_redirects', 'id,slug_from,slug_to,created_at', 'id')).map((r) =>
          automatic(
            'venue_redirects',
            String(r.id),
            `/venues/${r.slug_from}`,
            r.slug_to ? `/venues/${r.slug_to}` : null,
            r.created_at,
          ),
        ),
    },
    {
      name: 'username_redirects',
      load: async () =>
        (
          await read(
            'username_redirects',
            'old_username,user_id,created_at,expires_at',
            'old_username',
          )
        ).map((r) => ({
          ...automatic(
            'username_redirects',
            String(r.old_username),
            `@${r.old_username}`,
            r.user_id ? `/user/${r.user_id}` : null,
            r.created_at,
          ),
          // These are username reservations/aliases, not an HTTP routing rule.
          statusCode: null,
          state:
            r.expires_at && Date.parse(String(r.expires_at)) <= Date.now()
              ? ('Expired' as const)
              : ('Recorded' as const),
        })),
    },
  ];
  const results = await Promise.allSettled(sources.map((source) => source.load()));
  const rows: InventoryRedirect[] = [];
  const errors: string[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') rows.push(...result.value);
    else
      errors.push(
        `${sources[index].name}: ${result.reason instanceof Error ? result.reason.message : 'Could not load source'}`,
      );
  });
  return { rows, errors };
}

/** Read the deployed rule source directly; 200 SPA rewrites are not redirects. */
export function parseStaticRedirects(text: string): InventoryRedirect[] {
  return text.split('\n').flatMap((line, index) => {
    const [source, target, code] = line.trim().split(/\s+/);
    const statusCode = Number(code?.replace('!', ''));
    if (
      !source?.startsWith('/') ||
      !target ||
      statusCode < 300 ||
      statusCode > 399 ||
      !Number.isFinite(statusCode)
    )
      return [];
    return [
      {
        id: `static:${index}`,
        source,
        target,
        origin: 'public/_redirects',
        kind: 'Static' as const,
        statusCode,
        state: 'Enabled' as const,
        updatedAt: null,
      },
    ];
  });
}

/** Inventory declarative aliases without executing (or importing) the router. */
export function parseClientRedirects(text: string): InventoryRedirect[] {
  const adminStart = text.indexOf('path="/admin"');
  const publicStart = text.indexOf('path="/:locale?"');
  const pattern =
    /<Route\s+path="([^"]+)"\s+element=\{\s*<(Navigate|[A-Z][A-Za-z]*Redirect)\b([^]*?)\/>\s*\}/g;
  return [...text.matchAll(pattern)].flatMap((match) => {
    const [, path, component, attributes] = match;
    const to = attributes.match(/\bto="([^"]+)"/)?.[1];
    const base = attributes.match(/\btoBase="([^"]+)"/)?.[1];
    const param = attributes.match(/\bparam="([^"]+)"/)?.[1];
    const tab = attributes.match(/\btab="([^"]+)"/)?.[1];
    const view = attributes.match(/\bview="([^"]+)"/)?.[1];
    const dynamicTargets: Record<string, string> = {
      AuthAliasRedirect: '/auth',
      MeRedirect: `/user/:currentUserId${tab ? `/${tab}` : ''} (or /auth)`,
      FootprintRedirect: '/user/:userId/travel',
      ResourcesTagRedirect: '/tags/:tagName',
      ProfessionRedirect: '/personalities?profession=:slug',
      TripSubrouteRedirect: `/trips/:tripId?view=${view ?? ':view'}`,
      SettingsRedirect: 'Profile settings (depends on signed-in user and section)',
      ReviewRedirect: '/admin/governance?mode=triage',
    };
    const target =
      to ??
      (base
        ? `/${base.replace(/^\//, '')}/:${component === 'SlugAliasRedirect' ? 'slug' : param}`
        : (dynamicTargets[component] ?? `Resolved by ${component}`));
    const admin =
      adminStart >= 0 &&
      publicStart >= 0 &&
      match.index! > adminStart &&
      match.index! < publicStart;
    return [
      {
        id: `client:${match.index}`,
        source: `${admin ? '/admin' : ''}/${path.replace(/^\//, '')}`,
        target,
        origin: 'Client router',
        kind: 'Client' as const,
        statusCode: null,
        state: 'Enabled' as const,
        updatedAt: null,
      },
    ];
  });
}

export function filterInventory(
  rows: InventoryRedirect[],
  search: string,
  origin: string,
  state: string,
) {
  const query = search.trim().toLocaleLowerCase();
  return rows.filter(
    (row) =>
      (!origin || row.origin === origin) &&
      (!state || row.state === state) &&
      (!query ||
        [row.source, row.target, row.origin, row.kind].some((value) =>
          value?.toLocaleLowerCase().includes(query),
        )),
  );
}
