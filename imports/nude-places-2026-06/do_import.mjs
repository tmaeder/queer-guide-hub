#!/usr/bin/env node
// Stage places.json into ingestion_staging, run venue dedupe (RPC banding), commit directly,
// then set venue_subtype. All via the Supabase Management API (runs as postgres).
//
// Run: node imports/nude-places-2026-06/do_import.mjs            (full run)
//      node imports/nude-places-2026-06/do_import.mjs --dry      (build SQL, no writes; prints first row)
//
// Idempotent: re-running skips already-committed source_entity_ids (venue_sources ON CONFLICT)
// and clears any prior incomplete staging rows before re-staging.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = 'xqeacpakadqfxjxjcewc';
const MGMT = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const UA = 'Mozilla/5.0 QueerGuide/1.0 nude-places-import';
const SOURCE = 'nude-places';
const DRY = process.argv.includes('--dry');
const STAGE_BATCH = 250;
const COMMIT_BATCH = 300;
const DEDUP_BATCH = 25; // find_venue_duplicate_candidates ~1.25s/call -> keep batches under API stmt timeout

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function token() {
  if (process.env.GEOCODE_TOKEN) return process.env.GEOCODE_TOKEN;
  const raw = execSync('security find-generic-password -s "Supabase CLI" -w').toString().trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString();
}
const TOKEN = DRY ? 'dry' : token();

async function mgmt(sql, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(MGMT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify({ query: sql }),
      });
      const body = await res.text();
      if (res.ok) return body ? JSON.parse(body) : [];
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error(`mgmt ${res.status}: ${body.slice(0, 300)}`);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

const SQL = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const JB = (obj) => `'${JSON.stringify(obj).replace(/'/g, "''")}'::jsonb`;

const KIND = {
  'Nude Beach': 'Nude beach', 'Naturist Resort': 'Naturist site',
  'Hot Spring': 'Clothing-optional hot spring', 'Other': 'Social nudity place',
};

function buildDescription(e) {
  let desc = (e.description || '').trim();
  // strip a leading repeat of the name
  if (desc.toLowerCase().startsWith(e.name.toLowerCase())) {
    desc = desc.slice(e.name.length).replace(/^[\s,.\-–—:]+/, '').trim();
  }
  // strip a leading "(Type)" annotation, e.g. "(Beach) The naturist..."
  desc = desc.replace(/^\([^)]*\)\s*/, '').replace(/^[\s,.\-–—:]+/, '').trim();
  if (desc.length < 15) {
    const loc = [e.region, e.country].filter(Boolean).join(', ');
    desc = `${KIND[e.venue_subtype] || 'Social nudity place'}${loc ? ` in ${loc}` : ''}.`;
  }
  return desc.slice(0, 1000);
}

function buildRow(e) {
  const normalized = {
    name: e.name,
    description: buildDescription(e),
    category: 'other',
    tags: ['naturist', 'clothing-optional'],
    location: {
      lat: e.lat, lng: e.lng,
      address: e.address,
      city: e.region || '',
      country: e.country_code,
    },
    metadata: {
      venue_subtype: e.venue_subtype,
      source: 'wikipedia',
      wiki_title: e.wiki_title,
      url: e.url,
      continent: e.continent,
      region: e.region,
      country_name: e.country,
    },
  };
  return {
    source_type: SOURCE,
    source_name: SOURCE,
    target_table: 'venues',
    entity_type: 'venue',
    source_entity_id: e.source_entity_id,
    idempotency_key: e.source_entity_id,
    raw_data: e,
    normalized_data: normalized,
    ai_validation_status: 'approved',
    ai_confidence_score: 0.95,
    dedup_status: 'pending',
    review_status: 'auto',
    disposition: 'pending',
  };
}

function valuesClause(r) {
  return `(${SQL(r.source_type)}, ${SQL(r.source_name)}, ${SQL(r.target_table)}, ${SQL(r.entity_type)}, ` +
    `${SQL(r.source_entity_id)}, ${SQL(r.idempotency_key)}, ${JB(r.raw_data)}, ${JB(r.normalized_data)}, ` +
    `${SQL(r.ai_validation_status)}, ${r.ai_confidence_score}, ${SQL(r.dedup_status)}, ${SQL(r.review_status)}, ${SQL(r.disposition)})`;
}

const COLS = `(source_type, source_name, target_table, entity_type, source_entity_id, idempotency_key, ` +
  `raw_data, normalized_data, ai_validation_status, ai_confidence_score, dedup_status, review_status, disposition)`;

async function main() {
  const places = JSON.parse(readFileSync(join(HERE, 'places.json'), 'utf8'));
  console.log(`loaded ${places.length} places`);
  const rows = places.map(buildRow);

  if (DRY) {
    console.log('--- sample row normalized_data ---');
    console.log(JSON.stringify(rows[0].normalized_data, null, 2));
    console.log('--- sample VALUES ---');
    console.log(valuesClause(rows[0]).slice(0, 600));
    return;
  }

  // 0. clear any prior incomplete staging rows (keep committed)
  console.log('clearing prior incomplete staging rows...');
  await mgmt(`DELETE FROM public.ingestion_staging WHERE source_name=${SQL(SOURCE)} AND disposition NOT IN ('inserted','updated','committed')`);

  // 1. stage in batches (skip rows already committed in a prior run)
  let staged = 0;
  for (let i = 0; i < rows.length; i += STAGE_BATCH) {
    const batch = rows.slice(i, i + STAGE_BATCH);
    const sql = `INSERT INTO public.ingestion_staging ${COLS} VALUES\n` +
      batch.map(valuesClause).join(',\n') +
      `\nON CONFLICT (COALESCE(source_name, source_type), idempotency_key) ` +
      `WHERE (idempotency_key IS NOT NULL AND disposition <> 'rejected') DO NOTHING`;
    await mgmt(sql);
    staged += batch.length;
    console.log(`  staged ${Math.min(i + STAGE_BATCH, rows.length)}/${rows.length}`);
  }
  const pend = await mgmt(`SELECT count(*)::int n FROM public.ingestion_staging WHERE source_name=${SQL(SOURCE)} AND dedup_status='pending' AND disposition='pending'`);
  console.log(`pending staging rows: ${pend[0].n}`);

  // 2. dedupe. The dedup RPC is ~1.25s/call, so we only geo-dedupe the coord-bearing rows
  // (the meaningful matches) and fast-set the rest to unique. Null-coord cross-source dups
  // are swept post-geocode via the platform's /admin/duplicates (find_duplicate_clusters).
  console.log('fast-setting null-coord rows to unique...');
  const uniq0 = await mgmt(`
    WITH u AS (
      UPDATE public.ingestion_staging SET dedup_status='unique', review_status='auto', updated_at=now()
      WHERE source_name=${SQL(SOURCE)} AND dedup_status='pending'
        AND nullif(normalized_data->'location'->>'lat','') IS NULL
      RETURNING 1)
    SELECT count(*)::int n FROM u`);
  console.log(`  null-coord -> unique: ${uniq0[0].n}`);

  console.log('geo-deduping coord-bearing rows...');
  let dq = { unique: 0, dup: 0, flag: 0 };
  for (;;) {
    const r = await mgmt(`
      WITH batch AS (
        SELECT id,
               normalized_data->>'name' nm,
               nullif(normalized_data->'location'->>'lat','')::numeric lat,
               nullif(normalized_data->'location'->>'lng','')::numeric lng,
               normalized_data->'location'->>'address' addr
        FROM public.ingestion_staging
        WHERE source_name=${SQL(SOURCE)} AND dedup_status='pending'
        ORDER BY created_at LIMIT ${DEDUP_BATCH}
      ),
      scored AS (
        SELECT b.id, d.venue_id, d.score
        FROM batch b
        LEFT JOIN LATERAL (
          SELECT venue_id, score
          FROM public.find_venue_duplicate_candidates(b.nm, NULL, NULL, NULL, b.lat, b.lng, NULL, 1, b.addr)
          ORDER BY score DESC LIMIT 1
        ) d ON true
      ),
      upd AS (
        UPDATE public.ingestion_staging s SET
          dedup_status = CASE WHEN sc.score >= 0.90 THEN 'duplicate'
                              WHEN sc.score >= 0.75 THEN 'merge_candidate' ELSE 'unique' END,
          dedup_match_id = CASE WHEN sc.score >= 0.75 THEN sc.venue_id END,
          dedup_match_table = CASE WHEN sc.score >= 0.75 THEN 'venues' END,
          dedup_match_score = sc.score,
          review_status = CASE WHEN sc.score >= 0.75 AND sc.score < 0.90 THEN 'pending_review' ELSE 'auto' END,
          updated_at = now()
        FROM scored sc WHERE s.id = sc.id
        RETURNING s.dedup_status, s.review_status
      )
      SELECT
        count(*) FILTER (WHERE dedup_status='unique')::int uniq,
        count(*) FILTER (WHERE dedup_status='duplicate')::int dup,
        count(*) FILTER (WHERE dedup_status='merge_candidate')::int flag,
        count(*)::int n
      FROM upd`);
    const { uniq, dup, flag, n } = r[0];
    dq.unique += uniq; dq.dup += dup; dq.flag += flag;
    if (!n) break;
    process.stdout.write(`\r  deduped unique=${dq.unique} duplicate=${dq.dup} merge_candidate=${dq.flag}`);
    await sleep(300);
  }
  process.stdout.write('\n');
  console.log(`dedupe done: unique=${dq.unique} duplicate=${dq.dup} merge_candidate(->review)=${dq.flag}`);

  // 3. commit (<=300/call to stay under the search_documents reindex trigger)
  console.log('committing...');
  let ins = 0, upd = 0, batches = 0;
  for (;;) {
    const r = await mgmt(`SELECT count(*)::int n, count(*) FILTER (WHERE action='inserted')::int ins, count(*) FILTER (WHERE action='updated')::int upd, count(*) FILTER (WHERE action='noop')::int noop FROM public.commit_venue_staging_batch(${COMMIT_BATCH})`);
    const { n, ins: i2, upd: u2 } = r[0];
    ins += i2; upd += u2; batches++;
    if (!n) break;
    process.stdout.write(`\r  committed inserted=${ins} updated=${upd} (batch ${batches})`);
    await sleep(1500);
  }
  process.stdout.write('\n');
  console.log(`commit done: inserted=${ins} updated=${upd}`);

  // 4. set venue_subtype (commit does not write it); tags already set at commit
  console.log('setting venue_subtype...');
  let subAffected = 0;
  for (;;) {
    const r = await mgmt(`
      WITH tgt AS (
        SELECT v.id, st.raw_data->>'venue_subtype' AS subtype
        FROM public.venue_sources vs
        JOIN public.venues v ON v.id = vs.venue_id
        JOIN public.ingestion_staging st ON st.source_entity_id = vs.source_entity_id AND st.source_name=${SQL(SOURCE)}
        WHERE vs.source_slug=${SQL(SOURCE)}
          AND st.raw_data->>'venue_subtype' IS NOT NULL
          AND v.venue_subtype IS DISTINCT FROM st.raw_data->>'venue_subtype'
        LIMIT ${COMMIT_BATCH}
      ),
      u AS (UPDATE public.venues v SET venue_subtype = tgt.subtype, updated_at=now()
            FROM tgt WHERE v.id = tgt.id RETURNING 1)
      SELECT count(*)::int n FROM u`);
    const n = r[0].n;
    subAffected += n;
    if (!n) break;
    process.stdout.write(`\r  venue_subtype set: ${subAffected}`);
    await sleep(1500);
  }
  process.stdout.write('\n');
  console.log(`venue_subtype set on ${subAffected} venues`);

  // summary
  const sum = await mgmt(`SELECT venue_subtype, count(*)::int n FROM public.venues WHERE data_source=${SQL(SOURCE)} GROUP BY 1 ORDER BY 2 DESC`);
  console.log('\nvenues by subtype:', JSON.stringify(sum));
  const rej = await mgmt(`SELECT error_message, count(*)::int n FROM public.ingestion_staging WHERE source_name=${SQL(SOURCE)} AND disposition='rejected' GROUP BY 1`);
  if (rej.length) console.log('REJECTED:', JSON.stringify(rej));
  console.log('DONE.');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
