import type { EventDetail, EventListItem } from '@/api/events';
import type { Hotline } from '@/api/hotlines';
import type { Bounds, VenueDetail, VenueListItem } from '@/api/venues';
import type { PackIndexEntry, PackPayload } from './format';

/**
 * The few SQLite operations the pack store needs. expo-sqlite implements it
 * on device (db.ts); tests run the same SQL against node:sqlite, so the
 * schema and queries are exercised for real, not mocked.
 */
export interface PackDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** fn must use the db it is handed, so its statements run inside the transaction. */
  transaction(fn: (tx: PackDb) => Promise<void>): Promise<void>;
}
export type SqlValue = string | number | null;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  venue_count INTEGER NOT NULL,
  installed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  latitude REAL,
  longitude REAL,
  city TEXT,
  country TEXT,
  address TEXT,
  description TEXT,
  website TEXT,
  phone TEXT,
  instagram TEXT,
  tags TEXT,
  accessibility_attributes TEXT
);
CREATE INDEX IF NOT EXISTS venues_slug ON venues (slug);
CREATE INDEX IF NOT EXISTS venues_pack ON venues (pack_id);
CREATE INDEX IF NOT EXISTS venues_geo ON venues (latitude, longitude);
CREATE VIRTUAL TABLE IF NOT EXISTS venues_fts USING fts5 (
  venue_id UNINDEXED, pack_id UNINDEXED, name, category, city, address, tags
);
CREATE TABLE IF NOT EXISTS hotlines (
  pack_id TEXT NOT NULL,
  id TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (pack_id, id)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  latitude REAL,
  longitude REAL,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_slug ON events (slug);
CREATE INDEX IF NOT EXISTS events_pack ON events (pack_id);
CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5 (
  event_id UNINDEXED, pack_id UNINDEXED, title, city, venue_name, event_type
);
`;

export async function migrate(db: PackDb) {
  await db.exec(SCHEMA);
}

const arr = (v: unknown) => (Array.isArray(v) ? JSON.stringify(v) : null);
const parseArr = (v: string | null): string[] | null => {
  if (!v) return null;
  try {
    const out = JSON.parse(v);
    return Array.isArray(out) ? out : null;
  } catch {
    return null;
  }
};

async function deletePackRows(db: PackDb, id: string) {
  await db.run('DELETE FROM venues WHERE pack_id = ?', [id]);
  await db.run('DELETE FROM venues_fts WHERE pack_id = ?', [id]);
  await db.run('DELETE FROM hotlines WHERE pack_id = ?', [id]);
  await db.run('DELETE FROM events WHERE pack_id = ?', [id]);
  await db.run('DELETE FROM events_fts WHERE pack_id = ?', [id]);
}

/**
 * Replace a pack's rows atomically. A crash mid-import rolls back to the
 * previous version of the pack rather than leaving half a city.
 */
export async function installPack(db: PackDb, pack: PackPayload, entry: PackIndexEntry) {
  await db.transaction(async (tx) => {
    await deletePackRows(tx, pack.id);
    for (const v of pack.venues) {
      // A venue now filed under a different city replaces its old copy.
      await tx.run('DELETE FROM venues_fts WHERE venue_id = ?', [v.id]);
      await tx.run(
        `INSERT OR REPLACE INTO venues (id, pack_id, slug, name, category, latitude, longitude, city,
           country, address, description, website, phone, instagram, tags, accessibility_attributes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          v.id,
          pack.id,
          v.slug,
          v.name,
          v.category ?? null,
          v.latitude ?? null,
          v.longitude ?? null,
          v.city ?? null,
          v.country ?? null,
          v.address ?? null,
          v.description ?? null,
          v.website ?? null,
          v.phone ?? null,
          v.instagram ?? null,
          arr(v.tags),
          arr(v.accessibility_attributes),
        ],
      );
      await tx.run(
        'INSERT INTO venues_fts (venue_id, pack_id, name, category, city, address, tags) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [v.id, pack.id, v.name, v.category ?? '', v.city ?? '', v.address ?? '', (v.tags ?? []).join(' ')],
      );
    }
    for (const e of pack.events ?? []) {
      if (!e?.id || !e.slug || !e.title || !e.start_date) continue; // never store what cannot be shown
      await tx.run('DELETE FROM events_fts WHERE event_id = ?', [e.id]);
      await tx.run(
        `INSERT OR REPLACE INTO events (id, pack_id, slug, start_date, end_date, latitude, longitude, body)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, pack.id, e.slug, e.start_date, e.end_date ?? null, e.latitude ?? null, e.longitude ?? null, JSON.stringify(e)],
      );
      await tx.run(
        'INSERT INTO events_fts (event_id, pack_id, title, city, venue_name, event_type) VALUES (?, ?, ?, ?, ?, ?)',
        [e.id, pack.id, e.title, e.city ?? '', e.venue_name ?? '', e.event_type ?? ''],
      );
    }
    for (const h of pack.hotlines) {
      await tx.run('INSERT OR REPLACE INTO hotlines (pack_id, id, body) VALUES (?, ?, ?)', [
        pack.id,
        h.id,
        JSON.stringify(h),
      ]);
    }
    await tx.run(
      `INSERT OR REPLACE INTO packs (id, name, country, generated_at, sha256, bytes, venue_count, installed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pack.id,
        pack.name,
        pack.country,
        pack.generated_at,
        entry.sha256,
        entry.bytes,
        pack.venues.length,
        new Date().toISOString(),
      ],
    );
  });
}

export async function removePack(db: PackDb, id: string) {
  await db.transaction(async (tx) => {
    await deletePackRows(tx, id);
    await tx.run('DELETE FROM packs WHERE id = ?', [id]);
  });
}

export interface InstalledPack {
  id: string;
  name: string;
  country: string;
  generated_at: string;
  sha256: string;
  bytes: number;
  venue_count: number;
  installed_at: string;
}

export function listInstalled(db: PackDb) {
  return db.all<InstalledPack>('SELECT * FROM packs ORDER BY name');
}

type VenueSqlRow = Omit<VenueDetail, 'images' | 'tags' | 'accessibility_attributes'> & {
  tags: string | null;
  accessibility_attributes: string | null;
};

const toDetail = (r: VenueSqlRow): VenueDetail => ({
  ...r,
  images: null,
  tags: parseArr(r.tags),
  accessibility_attributes: parseArr(r.accessibility_attributes),
});

export async function venueBySlug(db: PackDb, slug: string): Promise<VenueDetail | null> {
  const rows = await db.all<VenueSqlRow & { pack_id: string }>(
    'SELECT * FROM venues WHERE slug = ? LIMIT 1',
    [slug],
  );
  if (!rows[0]) return null;
  const { pack_id: _pack, ...row } = rows[0];
  return toDetail(row);
}

export function venuesInBounds(db: PackDb, [w, s, e, n]: Bounds, limit = 500) {
  return db.all<Omit<VenueListItem, 'is_featured'>>(
    `SELECT id, slug, name, category, latitude, longitude, city, address
       FROM venues
      WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
      ORDER BY name LIMIT ?`,
    [s, n, w, e, limit],
  ).then((rows) => rows.map((r) => ({ ...r, is_featured: false })));
}

/** Turn free text into a safe FTS5 prefix query: every token quoted, ANDed. */
export function ftsQuery(input: string): string | null {
  const tokens = input
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  return tokens.length ? tokens.map((t) => `"${t}"*`).join(' ') : null;
}

export async function searchVenues(db: PackDb, input: string, limit = 50) {
  const q = ftsQuery(input);
  if (!q) return [];
  return db.all<{ slug: string; name: string; category: string | null; city: string | null }>(
    `SELECT v.slug, v.name, v.category, v.city
       FROM venues_fts f JOIN venues v ON v.id = f.venue_id
      WHERE venues_fts MATCH ?
      ORDER BY bm25(venues_fts) LIMIT ?`,
    [q, limit],
  );
}

export async function offlineHotlines(db: PackDb): Promise<Hotline[]> {
  const rows = await db.all<{ id: string; body: string }>('SELECT id, body FROM hotlines');
  const byId = new Map<string, Hotline>();
  for (const r of rows) {
    try {
      byId.set(r.id, JSON.parse(r.body) as Hotline);
    } catch {
      // a corrupt row is skipped, never rendered half-parsed
    }
  }
  return [...byId.values()];
}

export async function getMeta(db: PackDb, key: string) {
  const rows = await db.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return rows[0]?.value ?? null;
}

export function setMeta(db: PackDb, key: string, value: string) {
  return db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}

/**
 * "Not over yet", the online feed's endsAtOrAfter on stored ISO strings.
 * ISO-8601 UTC strings from Postgres compare correctly as text only when they
 * share a format, so the comparison runs on parsed times instead.
 */
const stillOn = (start: string, end: string | null, nowMs: number) =>
  Date.parse(end ?? start) + (end ? 0 : 24 * 60 * 60_000) >= nowMs;

function parseEvent(body: string): EventDetail | null {
  try {
    return JSON.parse(body) as EventDetail;
  } catch {
    return null; // a corrupt row is skipped, never rendered half-parsed
  }
}

export async function eventBySlug(db: PackDb, slug: string): Promise<EventDetail | null> {
  const rows = await db.all<{ body: string }>('SELECT body FROM events WHERE slug = ? LIMIT 1', [slug]);
  return rows[0] ? parseEvent(rows[0].body) : null;
}

export async function eventsInBounds(db: PackDb, [w, s, e, n]: Bounds, nowMs = Date.now(), limit = 200) {
  const rows = await db.all<{ body: string; start_date: string; end_date: string | null }>(
    `SELECT body, start_date, end_date FROM events
      WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
      ORDER BY start_date`,
    [s, n, w, e],
  );
  return rows
    .filter((r) => stillOn(r.start_date, r.end_date, nowMs))
    .map((r) => parseEvent(r.body))
    .filter((x): x is EventDetail => x != null)
    .slice(0, limit) as EventListItem[];
}

export async function searchEvents(db: PackDb, input: string, nowMs = Date.now(), limit = 50) {
  const q = ftsQuery(input);
  if (!q) return [];
  const rows = await db.all<{ slug: string; body: string; start_date: string; end_date: string | null }>(
    `SELECT e.slug, e.body, e.start_date, e.end_date
       FROM events_fts f JOIN events e ON e.id = f.event_id
      WHERE events_fts MATCH ?
      ORDER BY bm25(events_fts) LIMIT ?`,
    [q, limit],
  );
  return rows
    .filter((r) => stillOn(r.start_date, r.end_date, nowMs))
    .map((r) => parseEvent(r.body))
    .filter((x): x is EventDetail => x != null)
    .map((ev) => ({ slug: ev.slug, name: ev.title, category: ev.event_type ?? null, city: ev.city ?? null }));
}
