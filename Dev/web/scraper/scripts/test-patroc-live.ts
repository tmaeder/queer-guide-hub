import { PatrocConnector } from '../src/sources/patroc.js';
import { normalizeEntity } from '../src/normalize/normalize.js';

async function test() {
  const connector = new PatrocConnector();
  console.log('=== Patroc Connector Test ===\n');

  let totalRaw = 0;
  let totalNormalized = 0;
  let totalFailed = 0;
  const byCountry: Record<string, number> = {};
  const samples: Array<Record<string, unknown>> = [];
  let batchCount = 0;

  try {
    for await (const batch of connector.discover('venue')) {
      batchCount++;
      console.log(`Batch ${batchCount}: ${batch.length} URLs`);

      // Only process first 3 batches to keep test quick
      if (batchCount > 3) {
        console.log('(stopping after 3 batches for test)');
        break;
      }

      for (const discovered of batch) {
        console.log(`  Fetching: ${discovered.url}`);
        try {
          const entities = await connector.fetchDetail(discovered.url);
          totalRaw += entities.length;

          for (const raw of entities) {
            const result = normalizeEntity(raw);
            if (result) {
              totalNormalized++;
              const country = (result.data.country as string) || 'Unknown';
              byCountry[country] = (byCountry[country] || 0) + 1;
              if (samples.length < 8) {
                samples.push({
                  name: result.data.name,
                  city: result.data.city,
                  country: result.data.country,
                  category: result.data.category,
                  type: raw.entity_type,
                });
              }
            } else {
              totalFailed++;
            }
          }

          console.log(`    → ${entities.length} entities`);
        } catch (err: unknown) {
          console.log(`    → Error: ${(err as Error).message}`);
        }
      }
    }
  } catch (err: unknown) {
    console.error('Discovery error:', (err as Error).message);
  } finally {
    await connector.cleanup();
  }

  console.log(`\n=== Results ===`);
  console.log(`Raw: ${totalRaw} | Normalized: ${totalNormalized} | Failed: ${totalFailed}`);
  console.log(`\nBy Country:`);
  for (const [c, n] of Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${c}: ${n}`);
  }
  console.log(`\nSamples:`);
  for (const s of samples) {
    console.log(`  ${s.name} — ${s.city}, ${s.country} [${s.category}] (${s.type})`);
  }
}

test().catch(console.error);
