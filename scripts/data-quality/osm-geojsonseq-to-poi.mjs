#!/usr/bin/env node
// stdin: `osmium export -f geojsonseq` output.  stdout: the POI JSONL that
// poi-match.mjs reads.  Pure stream, no network, no database.
//
// osmium rather than DuckDB's bundled GDAL, and that is not a preference:
// GDAL silently returns ZERO ways for any PBF over ~21 MB. Bremen (21 MB) gives
// 224,154; Berlin, Hamburg, Saarland and Schleswig-Holstein all give 0 with no
// error and no config that changes it. Measured in
// docs/audits/2026-09-04-poi-match-rate-measurement.md §4.

import { createInterface } from 'node:readline';

import { osmAccessibilityFromTags } from './lib/osm-accessibility-tags.mjs';

const NAME_KEYS = ['name', 'name:en', 'alt_name', 'old_name', 'short_name', 'brand'];

// geojsonseq may prefix each record with RS (U+001E) per RFC 8142.
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
let emitted = 0;
let skipped = 0;

for await (const raw of rl) {
  // RFC 8142 lets each record start with a record separator (U+001E), and
  // osmium emits it. Written as an escape rather than the literal byte: the
  // character is invisible in every editor and diff, so a well-meaning
  // reformat deletes it and then EVERY line fails to parse.
  const line = raw.replace(/^\u001E/, '').trim();
  if (!line) continue;
  let f;
  try {
    f = JSON.parse(line);
  } catch {
    skipped++;
    continue;
  }
  const t = f.properties || {};
  if (!t.name) continue;
  const g = f.geometry;
  if (!g || g.type !== 'Point') continue;
  const [lon, lat] = g.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

  process.stdout.write(
    JSON.stringify({
      // `@id` is what `osmium export --add-unique-id=type` emits, e.g. "node/123".
      // It is the value that lands in venue_sources.source_entity_id, so every
      // later refresh is an id lookup instead of a fresh name guess — the whole
      // point of persisting identity.
      ext_id: t['@id'] ?? `${t['@type'] ?? 'node'}/${t['@osm_id'] ?? ''}`,
      name: t.name,
      lat,
      lon,
      variants: NAME_KEYS.map((k) => t[k]).filter(Boolean),
      hours: t.opening_hours ?? null,
      phone: t.phone ?? t['contact:phone'] ?? null,
      website: t.website ?? t['contact:website'] ?? null,
      access: osmAccessibilityFromTags(t),
    }) + '\n',
  );
  emitted++;
}

// A converter that silently emitted nothing would look exactly like a country
// with no POIs, which is the empty-200 failure one layer down.
if (emitted === 0) {
  console.error('osm-geojsonseq-to-poi: read stdin and emitted 0 POIs — the export is empty or not geojsonseq');
  process.exit(1);
}
console.error(`osm-geojsonseq-to-poi: ${emitted} POIs${skipped ? `, ${skipped} unparseable lines skipped` : ''}`);
