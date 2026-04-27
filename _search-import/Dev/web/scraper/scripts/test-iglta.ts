import { IgltaConnector } from '../src/sources/iglta.js';
import { normalizeEntity } from '../src/normalize/normalize.js';

async function test() {
  const connector = new IgltaConnector();

  console.log('=== IGLTA Connector Test ===\n');
  console.log('Discovering URLs...');

  try {
    for await (const batch of connector.discover('event')) {
      console.log(`Discovered ${batch.length} URLs`);

      for (const discovered of batch) {
        console.log(`\nFetching: ${discovered.url}`);
        const entities = await connector.fetchDetail(discovered.url);
        console.log(`Parsed: ${entities.length} raw entities\n`);

        if (entities.length === 0) {
          console.log('No entities found. IGLTA API may have changed or require browser approach.');
          continue;
        }

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
                start: result.data.start_datetime,
                website: result.data.website,
              });
            }
          } else {
            failed++;
          }
        }

        console.log(`Normalized: ${normalized} | Failed: ${failed}\n`);

        console.log('--- By Country ---');
        const sorted = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
        for (const [country, count] of sorted.slice(0, 20)) {
          console.log(`  ${country}: ${count}`);
        }

        console.log('\n--- Sample Events ---');
        for (const s of samples) {
          console.log(`  ${s.name} — ${s.city}, ${s.country} (${s.start})`);
        }
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connector.cleanup();
  }
}

test().catch(console.error);
