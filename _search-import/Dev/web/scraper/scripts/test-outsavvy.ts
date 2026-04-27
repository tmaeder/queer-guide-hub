import { OutsavvyConnector } from '../src/sources/outsavvy.js';
import { normalizeEntity } from '../src/normalize/normalize.js';

async function test() {
  const connector = new OutsavvyConnector();

  console.log('=== Outsavvy Connector Test ===\n');
  console.log('Discovering event URLs from sitemap...');

  let totalRaw = 0;
  let totalNormalized = 0;
  let totalFailed = 0;
  let batchCount = 0;
  const maxBatches = 2; // Only test first 2 batches (40 URLs) to be polite

  try {
    for await (const batch of connector.discover('event')) {
      batchCount++;
      console.log(`\nBatch ${batchCount}: ${batch.length} URLs`);

      if (batchCount > maxBatches) {
        console.log('(Stopping after 2 batches to be polite)');
        break;
      }

      // Only fetch first 5 from each batch for testing
      const testBatch = batch.slice(0, 5);
      for (const discovered of testBatch) {
        console.log(`  Fetching: ${discovered.url}`);
        const entities = await connector.fetchDetail(discovered.url);
        totalRaw += entities.length;

        for (const raw of entities) {
          const result = normalizeEntity(raw);
          if (result) {
            totalNormalized++;
            console.log(`    ✅ ${result.data.name} — ${result.data.city || 'Unknown city'} (${result.data.start_datetime})`);
          } else {
            totalFailed++;
            console.log(`    ❌ Failed to normalize: ${raw.raw_data.name || raw.source_id}`);
          }
        }

        if (entities.length === 0) {
          console.log(`    (no entities parsed — page may have changed or be unavailable)`);
        }
      }
    }
  } catch (err) {
    console.error('Error:', err);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total batches seen: ${batchCount}`);
  console.log(`Raw entities: ${totalRaw}`);
  console.log(`Normalized: ${totalNormalized}`);
  console.log(`Failed: ${totalFailed}`);
}

test().catch(console.error);
