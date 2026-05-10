#!/usr/bin/env node
/**
 * generate-boundary-geojson.mjs
 *
 * Reads Nominatim boundary results from JSON files (output of fetch-nominatim-boundaries.mjs)
 * and generates GeoJSON FeatureCollections suitable for R2 upload and MapLibre rendering.
 *
 * Usage:
 *   node scripts/generate-boundary-geojson.mjs
 *
 * Input:
 *   scripts/output/cities-nominatim.json
 *   scripts/output/neighbourhoods-nominatim.json
 *
 * Output:
 *   scripts/output/cities-boundaries.geojson
 *   scripts/output/neighbourhoods-boundaries.geojson
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'output');

function generateGeoJSON(inputFile, outputFile, label) {
  const inputPath = join(OUT_DIR, inputFile);

  if (!existsSync(inputPath)) {
    console.log(`Skipping ${label}: ${inputFile} not found`);
    return;
  }

  console.log(`\nProcessing ${label}...`);
  const boundaries = JSON.parse(readFileSync(inputPath, 'utf8'));
  console.log(`  Input records: ${boundaries.length}`);

  const features = boundaries.map((b, idx) => ({
    type: 'Feature',
    id: idx + 1, // Numeric ID for MapLibre feature-state
    properties: {
      entity_id: b.entity_id,
      name: b.name,
      entity_type: b.entity_type,
      precision: b.precision,
      source: b.source,
      vertex_count: b.vertex_count,
    },
    geometry: b.geometry_geojson,
  }));

  const geojson = {
    type: 'FeatureCollection',
    features,
  };

  const json = JSON.stringify(geojson);
  const outputPath = join(OUT_DIR, outputFile);
  writeFileSync(outputPath, json);

  console.log(`  Output features: ${features.length}`);
  console.log(`  File size: ${(json.length / 1024).toFixed(1)} KB`);
  console.log(`  Written to: ${outputPath}`);
}

generateGeoJSON('cities-nominatim.json', 'cities-boundaries.geojson', 'City boundaries');
generateGeoJSON(
  'neighbourhoods-nominatim.json',
  'neighbourhoods-boundaries.geojson',
  'Neighbourhood boundaries',
);

console.log('\nDone. Upload output files to R2 bucket.');
