import { OutsavvyConnector } from '../src/sources/outsavvy.js';
import { normalizeEntity } from '../src/normalize/normalize.js';

async function test() {
  const connector = new OutsavvyConnector();

  console.log('=== Outsavvy Full Test ===\n');

  let totalRaw = 0;
  let totalNormalized = 0;
  let totalFailed = 0;
  let batchCount = 0;
  const maxUrls = 30; // Fetch 30 event pages to be polite
  let urlsFetched = 0;
  const allEvents: Array<Record<string, unknown>> = [];

  try {
    for await (const batch of connector.discover('event')) {
      batchCount++;

      for (const discovered of batch) {
        if (urlsFetched >= maxUrls) break;
        urlsFetched++;

        console.error(`[${urlsFetched}/${maxUrls}] Fetching: ${discovered.url}`);
        const entities = await connector.fetchDetail(discovered.url);
        totalRaw += entities.length;

        for (const raw of entities) {
          const result = normalizeEntity(raw);
          if (result) {
            totalNormalized++;
            allEvents.push({
              sourceId: raw.source_id,
              ...result.data,
            });
            console.error(`  ✅ ${result.data.name}`);
          } else {
            totalFailed++;
            console.error(`  ❌ Failed: ${raw.raw_data.name || raw.source_id}`);
          }
        }
      }

      if (urlsFetched >= maxUrls) break;
    }
  } catch (err) {
    console.error('Error:', err);
  }

  console.error(`\n=== Summary ===`);
  console.error(`URLs fetched: ${urlsFetched}`);
  console.error(`Raw: ${totalRaw} | Normalized: ${totalNormalized} | Failed: ${totalFailed}`);

  // Output JSON to stdout
  console.log('===JSON_START===');
  console.log(JSON.stringify(allEvents));
  console.log('===JSON_END===');
}

test().catch(console.error);
