import { PatrocConnector } from '../src/sources/patroc.js';
import { normalizeEntity } from '../src/normalize/normalize.js';
import type { NormalizedEntity } from '../src/types/schemas.js';
import * as fs from 'node:fs';

function escSql(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

function entityToSql(e: NormalizedEntity, table: string): string {
  const d = e.data as Record<string, unknown>;
  return `INSERT INTO ${table} (source_name, source_id, entity_type, source_url, name, description, city, country, address, website, category, tags, raw_json, fetched_at)
VALUES (${escSql(e.source_name)}, ${escSql(e.source_id)}, ${escSql(e.entity_type)}, ${escSql(d.source_url)}, ${escSql(d.name)}, ${escSql(d.description)}, ${escSql(d.city)}, ${escSql(d.country)}, ${escSql(d.address)}, ${escSql(d.website)}, ${escSql(d.category)}, ${d.tags && Array.isArray(d.tags) && d.tags.length ? `ARRAY[${(d.tags as string[]).map(t => escSql(t)).join(',')}]` : 'NULL'}, ${escSql(JSON.stringify(d))}, NOW())
ON CONFLICT (source_name, source_id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, city = EXCLUDED.city,
  country = EXCLUDED.country, address = EXCLUDED.address, website = EXCLUDED.website,
  raw_json = EXCLUDED.raw_json, fetched_at = EXCLUDED.fetched_at;`;
}

async function main() {
  const connector = new PatrocConnector();
  const entities: NormalizedEntity[] = [];
  let batchCount = 0;

  // Process ALL batches (not just 3)
  for await (const batch of connector.discover('venue')) {
    batchCount++;
    console.error(`Batch ${batchCount}: ${batch.length} URLs`);

    for (const discovered of batch) {
      try {
        const rawEntities = await connector.fetchDetail(discovered.url);
        for (const raw of rawEntities) {
          const result = normalizeEntity(raw);
          if (result) entities.push(result);
        }
      } catch (err: unknown) {
        console.error(`  Error: ${(err as Error).message}`);
      }
    }
  }

  await connector.cleanup();

  console.error(`\nTotal normalized: ${entities.length}`);

  // Split into venue and event tables
  const venues = entities.filter((e) => e.entity_type === 'venue');
  const events = entities.filter((e) => e.entity_type === 'event');

  console.error(`Venues: ${venues.length}, Events: ${events.length}`);

  // Generate SQL in batches of 20
  const all = [...venues, ...events];
  const batchSize = 20;
  for (let i = 0; i < all.length; i += batchSize) {
    const batchEntities = all.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize);
    const _table = 'scraper_places'; // Use scraper_places for venues, scraper_events for events

    const sql = batchEntities
      .map((e) => {
        const tbl = e.entity_type === 'event' ? 'scraper_events' : 'scraper_places';
        return entityToSql(e, tbl);
      })
      .join('\n');

    const filename = `/tmp/patroc_batch_${batchNum}.sql`;
    fs.writeFileSync(filename, sql);
    console.error(`Wrote ${filename} (${batchEntities.length} entities)`);
  }

  // Also output count summary as JSON to stdout
  const summary = {
    total: all.length,
    venues: venues.length,
    events: events.length,
    batches: Math.ceil(all.length / batchSize),
  };
  console.log(JSON.stringify(summary));
}

main().catch(console.error);
