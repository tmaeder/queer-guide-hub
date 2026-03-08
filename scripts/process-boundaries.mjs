#!/usr/bin/env node
/**
 * process-boundaries.mjs
 *
 * Processes Natural Earth shapefiles (already converted to GeoJSON by mapshaper)
 * into cleaned, minimal GeoJSON files for country boundary rendering.
 *
 * Prerequisites:
 *   1. Download NE shapefiles and convert with mapshaper:
 *      npx mapshaper ne_110m_admin_0_countries.shp \
 *        -filter-fields ISO_A2,ISO_A2_EH,NAME,NAME_LONG \
 *        -simplify dp 20% -o format=geojson precision=0.001 ne_110m_raw.geojson
 *      npx mapshaper ne_50m_admin_0_countries.shp \
 *        -filter-fields ISO_A2,ISO_A2_EH,NAME,NAME_LONG \
 *        -simplify dp 30% -o format=geojson precision=0.0001 ne_50m_raw.geojson
 *
 *   2. Run this script:
 *      node scripts/process-boundaries.mjs
 *
 * Output:
 *   scripts/output/countries-110m.geojson
 *   scripts/output/countries-50m.geojson
 *
 * Data source: Natural Earth (public domain) — https://www.naturalearthdata.com
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DIR = join(__dirname, 'tmp');
const OUT_DIR = join(__dirname, 'output');

mkdirSync(OUT_DIR, { recursive: true });

// Manual ISO_A2 overrides for features where Natural Earth has -99 or wrong codes
const ISO_OVERRIDES = {
  France: 'FR',
  Norway: 'NO',
  'N. Cyprus': null, // Skip — not a UN member, not in our DB
  Kosovo: 'XK', // XK is user-assigned code (not ISO official but widely used)
  Somaliland: null, // Skip — not in our DB as separate entity
  'Indian Ocean Ter.': null,
  'Dhekelia': null,
  'Akrotiri': null,
  'Bajo Nuevo Bank': null,
  'Serranilla Bank': null,
  'Scarborough Reef': null,
  'US Naval Base Guantanamo Bay': null,
  'USNB Guantanamo Bay': null,
  'Siachen Glacier': null,
  'Baykonur Cosmodrome': null,
  'Clipperton I.': null,
  'Coral Sea Is.': null,
  'Spratly Is.': null,
  'Ashmore and Cartier Is.': null,
};

// ISO code remapping: NE code -> our DB code
// CN-TW in NE = Taiwan (TW in our DB)
const ISO_REMAP = {
  'CN-TW': 'TW',
};

function processFile(inputName, outputName, label) {
  const inputPath = join(TMP_DIR, inputName);
  const outputPath = join(OUT_DIR, outputName);

  console.log(`\nProcessing ${label}...`);
  const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
  console.log(`  Input features: ${raw.features.length}`);

  const features = [];
  const skipped = [];

  for (const feat of raw.features) {
    const props = feat.properties;
    // Use ISO_A2, fall back to ISO_A2_EH for countries where NE has -99
    let code = props.ISO_A2;
    if (!code || code === '-99') {
      code = props.ISO_A2_EH;
    }
    // Apply manual overrides
    const name = props.NAME || props.NAME_LONG;
    if (name in ISO_OVERRIDES) {
      const override = ISO_OVERRIDES[name];
      if (override === null) {
        skipped.push(name);
        continue;
      }
      code = override;
    }

    if (!code || code === '-99') {
      skipped.push(`${name} (no code)`);
      continue;
    }

    // Remap codes to match our DB (e.g. CN-TW -> TW for Taiwan)
    if (code in ISO_REMAP) {
      code = ISO_REMAP[code];
    }

    features.push({
      type: 'Feature',
      id: features.length + 1, // Numeric ID required by MapLibre feature-state
      properties: {
        ISO_A2: code,
        name: name,
      },
      geometry: feat.geometry,
    });
  }

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  const json = JSON.stringify(geojson);
  writeFileSync(outputPath, json);

  console.log(`  Output features: ${features.length}`);
  console.log(`  Skipped: ${skipped.length} (${skipped.join(', ')})`);
  console.log(`  File size: ${(json.length / 1024).toFixed(1)} KB`);
  console.log(`  Written to: ${outputPath}`);

  // Print all ISO codes for verification
  const codes = features.map((f) => f.properties.ISO_A2).sort();
  console.log(`  ISO codes: ${codes.join(', ')}`);
}

processFile('ne_110m_raw.geojson', 'countries-110m.geojson', '110m (world view)');
processFile('ne_50m_raw.geojson', 'countries-50m.geojson', '50m (zoomed)');

console.log('\nDone. Upload output files to R2 bucket.');
