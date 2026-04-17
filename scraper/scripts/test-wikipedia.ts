import { WikipediaConnector } from '../src/sources/wikipedia.js';
import { normalizeEntity } from '../src/normalize/normalize.js';

async function test() {
  const connector = new WikipediaConnector();

  console.log('=== Wikipedia Connector Test ===\n');
  console.log('Discovering URLs...');

  for await (const batch of connector.discover('place')) {
    console.log(`Discovered ${batch.length} URLs`);

    for (const discovered of batch) {
      console.log(`\nFetching: ${discovered.url}`);
      const entities = await connector.fetchDetail(discovered.url);
      console.log(`Parsed: ${entities.length} raw entities\n`);

      // Normalize and show results
      let normalized = 0;
      let failed = 0;
      const byCountry: Record<string, number> = {};
      const samples: Array<Record<string, unknown>> = [];

      for (const raw of entities) {
        const result = normalizeEntity(raw);
        if (result) {
          normalized++;
          const country = (result.data.country as string) || 'Unknown';
          byCountry[country] = (byCountry[country] || 0) + 1;
          if (samples.length < 10) {
            samples.push({
              name: result.data.name,
              city: result.data.city,
              country: result.data.country,
              region: result.data.region,
              wikipedia: result.data.wikipedia_url,
            });
          }
        } else {
          failed++;
        }
      }

      console.log(`Normalized: ${normalized} | Failed: ${failed}\n`);

      console.log('--- By Country ---');
      const sorted = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
      for (const [country, count] of sorted) {
        console.log(`  ${country}: ${count}`);
      }

      console.log('\n--- Sample Entries ---');
      for (const s of samples) {
        console.log(`  ${s.name} — ${s.city}, ${s.country} ${s.wikipedia ? '📖' : ''}`);
      }

      // Output JSON for DB insertion
      const forDb = entities
        .map(raw => {
          const result = normalizeEntity(raw);
          if (!result) return null;
          return {
            sourceId: raw.source_id,
            ...result.data,
          };
        })
        .filter(Boolean);

      console.log('\n===JSON_START===');
      console.log(JSON.stringify(forDb));
      console.log('===JSON_END===');
    }
  }
}

test().catch(console.error);
