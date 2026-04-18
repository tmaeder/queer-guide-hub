import { IgltaConnector } from '../src/sources/iglta.js';
import { normalizeEntity } from '../src/normalize/normalize.js';
import type { NormalizedEntity } from '../src/types/schemas.js';
import * as fs from 'node:fs';

function escSql(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

async function main() {
  const connector = new IgltaConnector();
  const entities: NormalizedEntity[] = [];

  try {
    for await (const batch of connector.discover('event')) {
      for (const discovered of batch) {
        const rawEntities = await connector.fetchDetail(discovered.url);
        for (const raw of rawEntities) {
          const result = normalizeEntity(raw);
          if (result) entities.push(result);
        }
      }
    }
  } finally {
    await connector.cleanup();
  }

  console.error(`Total IGLTA events: ${entities.length}`);

  // Generate SQL
  const sqlLines = entities.map((e) => {
    const d = e.data as Record<string, unknown>;
    const tags = d.tags && Array.isArray(d.tags) && d.tags.length
      ? `ARRAY[${(d.tags as string[]).map((t) => escSql(t)).join(',')}]`
      : 'NULL';

    return `INSERT INTO scraper_events (source_name, source_id, entity_type, source_url, name, description, city, country, address, start_date, end_date, website, category, tags, raw_json, fetched_at)
VALUES (${escSql(e.source_name)}, ${escSql(e.source_id)}, ${escSql(e.entity_type)}, ${escSql(d.source_url)}, ${escSql(d.name)}, ${escSql(d.description)}, ${escSql(d.city)}, ${escSql(d.country)}, ${escSql(d.address)}, ${d.start_datetime ? escSql(d.start_datetime) : 'NULL'}, ${d.end_datetime ? escSql(d.end_datetime) : 'NULL'}, ${escSql(d.website)}, ${escSql(d.category)}, ${tags}, ${escSql(JSON.stringify(d))}, NOW())
ON CONFLICT (source_name, source_id) DO UPDATE SET
  name = EXCLUDED.name, city = EXCLUDED.city, country = EXCLUDED.country,
  start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
  raw_json = EXCLUDED.raw_json, fetched_at = EXCLUDED.fetched_at;`;
  });

  const sql = sqlLines.join('\n');
  fs.writeFileSync('/tmp/iglta_events.sql', sql);
  console.error(`Wrote /tmp/iglta_events.sql`);

  // Print for reference
  console.log(sql);
}

main().catch(console.error);
