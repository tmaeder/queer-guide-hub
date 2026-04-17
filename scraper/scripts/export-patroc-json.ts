import { PatrocConnector } from '../src/sources/patroc.js';
import { normalizeEntity } from '../src/normalize/normalize.js';
import * as fs from 'node:fs';

async function main() {
  const connector = new PatrocConnector();
  const results: Array<{ raw: Record<string, unknown>; normalized: Record<string, unknown> }> = [];

  for await (const batch of connector.discover('venue')) {
    for (const discovered of batch) {
      try {
        const rawEntities = await connector.fetchDetail(discovered.url);
        for (const raw of rawEntities) {
          const norm = normalizeEntity(raw);
          if (norm) {
            results.push({
              raw: {
                source_name: raw.source_name,
                source_id: raw.source_id,
                entity_type: raw.entity_type,
                url: raw.url,
              },
              normalized: norm.data as Record<string, unknown>,
            });
          }
        }
      } catch {
        // skip errors
      }
    }
  }

  await connector.cleanup();

  // Write JSON for processing
  fs.writeFileSync('/tmp/patroc_data.json', JSON.stringify(results, null, 2));
  console.log(`Exported ${results.length} entities to /tmp/patroc_data.json`);

  // Show summary
  const byCity: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const r of results) {
    const city = (r.normalized.city as string) || 'Unknown';
    const type = (r.raw.entity_type as string) || 'unknown';
    byCity[city] = (byCity[city] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
  }

  console.log('\nBy type:', byType);
  console.log('\nBy city (top 10):');
  Object.entries(byCity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([c, n]) => console.log(`  ${c}: ${n}`));
}

main().catch(console.error);
