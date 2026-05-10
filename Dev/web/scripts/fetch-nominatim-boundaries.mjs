#!/usr/bin/env node
/**
 * fetch-nominatim-boundaries.mjs
 *
 * Fetches city and neighbourhood boundary polygons from Nominatim API.
 * Outputs JSON files that can be converted to R2 GeoJSON.
 *
 * Usage:
 *   node scripts/fetch-nominatim-boundaries.mjs --type cities
 *   node scripts/fetch-nominatim-boundaries.mjs --type villages
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'output');
mkdirSync(OUT_DIR, { recursive: true });

const SUPABASE_URL = 'https://xqeacpakadqfxjxjcewc.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'QueerGuide/1.0 (https://queer.guide)';
const CITY_THRESHOLD = 0.005;
const VILLAGE_THRESHOLD = 0.001;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchFromSupabase(table, select, filters = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${filters}&limit=1000`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchNominatimBoundary(query, threshold) {
  const params = new URLSearchParams({
    q: query, format: 'jsonv2', polygon_geojson: '1',
    polygon_threshold: String(threshold), limit: '1',
  });
  const res = await fetch(`${NOMINATIM_BASE}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length) return null;
  const result = data[0];
  const geojson = result.geojson;
  if (!geojson || geojson.type === 'Point' || geojson.type === 'LineString') return null;
  let vertexCount = 0;
  if (geojson.type === 'Polygon') {
    vertexCount = geojson.coordinates.reduce((sum, ring) => sum + ring.length, 0);
  } else if (geojson.type === 'MultiPolygon') {
    vertexCount = geojson.coordinates.reduce(
      (sum, poly) => sum + poly.reduce((s, ring) => s + ring.length, 0), 0,
    );
  }
  return {
    geojson, bbox: result.boundingbox, osmType: result.osm_type,
    osmId: result.osm_id, displayName: result.display_name,
    type: result.type, vertexCount,
  };
}

async function fetchVillages() {
  console.log('Fetching queer villages from Supabase...');
  const villages = await fetchFromSupabase(
    'queer_villages', 'id,name,slug,latitude,longitude,city_id',
    '&latitude=not.is.null&longitude=not.is.null',
  );
  console.log(`Found ${villages.length} villages with coordinates\n`);
  const cities = await fetchFromSupabase('cities', 'id,name');
  const cityById = new Map(cities.map((c) => [c.id, c]));
  const results = [];
  let found = 0, missed = 0;
  for (let i = 0; i < villages.length; i++) {
    const village = villages[i];
    const city = village.city_id ? cityById.get(village.city_id) : null;
    const cityName = city?.name ?? '';
    const query = cityName ? `${village.name}, ${cityName}` : village.name;
    process.stdout.write(`[${i + 1}/${villages.length}] ${village.name}... `);
    const result = await fetchNominatimBoundary(query, VILLAGE_THRESHOLD);
    if (result) {
      found++;
      console.log(`OK (${result.vertexCount} vertices, ${result.type})`);
      results.push({
        entity_type: 'neighbourhood', entity_id: village.id, name: village.name,
        geometry_geojson: result.geojson,
        bbox: { south: parseFloat(result.bbox[0]), north: parseFloat(result.bbox[1]),
                west: parseFloat(result.bbox[2]), east: parseFloat(result.bbox[3]) },
        precision: 'official', source: 'nominatim',
        source_id: `${result.osmType}/${result.osmId}`, vertex_count: result.vertexCount,
      });
    } else { missed++; console.log('MISS'); }
    await sleep(1100);
  }
  console.log(`\nVillages: ${found} found, ${missed} missed out of ${villages.length}`);
  return results;
}

async function fetchCities() {
  console.log('Fetching cities from Supabase...');
  const cities = await fetchFromSupabase(
    'cities', 'id,name,latitude,longitude,country_id',
    '&latitude=not.is.null&longitude=not.is.null',
  );
  console.log(`Found ${cities.length} cities with coordinates\n`);
  const countries = await fetchFromSupabase('countries', 'id,name,code');
  const countryById = new Map(countries.map((c) => [c.id, c]));
  const results = [];
  let found = 0, missed = 0;
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const country = countryById.get(city.country_id);
    const countryName = country?.name ?? '';
    const query = countryName ? `${city.name}, ${countryName}` : city.name;
    process.stdout.write(`[${i + 1}/${cities.length}] ${city.name}... `);
    const result = await fetchNominatimBoundary(query, CITY_THRESHOLD);
    if (result) {
      found++;
      console.log(`OK (${result.vertexCount} vertices, ${result.type})`);
      results.push({
        entity_type: 'city', entity_id: city.id, name: city.name,
        geometry_geojson: result.geojson,
        bbox: { south: parseFloat(result.bbox[0]), north: parseFloat(result.bbox[1]),
                west: parseFloat(result.bbox[2]), east: parseFloat(result.bbox[3]) },
        precision: 'official', source: 'nominatim',
        source_id: `${result.osmType}/${result.osmId}`, vertex_count: result.vertexCount,
      });
    } else { missed++; console.log('MISS'); }
    await sleep(1100);
  }
  console.log(`\nCities: ${found} found, ${missed} missed out of ${cities.length}`);
  return results;
}

const type = process.argv.includes('--type')
  ? process.argv[process.argv.indexOf('--type') + 1] : 'all';

if (type === 'cities' || type === 'all') {
  const r = await fetchCities();
  writeFileSync(join(OUT_DIR, 'cities-nominatim.json'), JSON.stringify(r, null, 2));
  console.log(`Written to cities-nominatim.json\n`);
}
if (type === 'villages' || type === 'all') {
  const r = await fetchVillages();
  writeFileSync(join(OUT_DIR, 'neighbourhoods-nominatim.json'), JSON.stringify(r, null, 2));
  console.log(`Written to neighbourhoods-nominatim.json\n`);
}
console.log('Done.');
