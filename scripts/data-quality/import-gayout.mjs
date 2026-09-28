#!/usr/bin/env node
/**
 * Import GayOut venue facts into `ingestion_staging`.
 *
 * The public venue sitemap is the complete inventory. Detail pages expose
 * schema.org JSON-LD with name, address, ISO country code and coordinates.
 * Reviews, ratings, photos and editorial descriptions are deliberately not
 * copied: only factual venue data and source provenance enter the pipeline.
 *
 * The crawl is disk-cached, serial and resumable. GayOut may challenge plain
 * HTTP clients with Cloudflare; in that case provide a browser-exported sitemap
 * with --sitemap-file and rerun detail later from an allowed environment.
 *
 * Usage:
 *   node scripts/data-quality/import-gayout.mjs --phase list --sitemap-file out-gayout/sitemap-urls.txt
 *   node scripts/data-quality/import-gayout.mjs --phase detail [--limit 100]
 *   node scripts/data-quality/import-gayout.mjs --phase stage --dry-run
 *   node scripts/data-quality/import-gayout.mjs --phase stage
 *   node scripts/data-quality/import-gayout.mjs --phase drain
 */

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseSitemap,
  parseVenueHtml,
  toNormalizedVenue,
} from './lib/gayout-import-core.mjs';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const SITEMAP_URL = 'https://www.gayout.com/sitemap-venues.xml';
const OUT = join(process.cwd(), 'out-gayout');
const CACHE = join(OUT, 'cache');
const USER_AGENT = 'QueerGuideBot/1.0 (+https://queer.guide; venue directory sync)';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1]?.startsWith('--') ? true : args[index + 1]) : fallback;
};
const has = (name) => args.includes(`--${name}`);
const PHASE = String(flag('phase', 'list'));
const LIMIT = flag('limit') ? Number(flag('limit')) : Infinity;
const DELAY_MS = Math.max(1000, Number(flag('delay-ms', 1500)) || 1500);
const DRY = has('dry-run');
const REFRESH = has('refresh');
const REQUIRE_DETAILS = has('require-details');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readNdjson = (path) =>
  existsSync(path)
    ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];
const writeNdjson = (path, rows) =>
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));

function cachePath(sourceId) {
  return join(CACHE, `${createHash('sha256').update(sourceId).digest('hex')}.html`);
}

async function fetchText(url, { attempts = 4 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml' },
        signal: AbortSignal.timeout(45_000),
      });
      const text = await response.text();
      if (!response.ok) {
        if (response.status === 403 && /cloudflare|attention required|just a moment/i.test(text)) {
          throw new Error('HTTP 403 Cloudflare challenge (use --sitemap-file or a browser-capable crawl host)');
        }
        throw new Error(`HTTP ${response.status}`);
      }
      if (text.length < 100) throw new Error(`suspiciously short response (${text.length} bytes)`);
      return text;
    } catch (error) {
      lastError = error;
      if (/Cloudflare challenge/.test(error.message)) break;
      if (attempt < attempts) await sleep(DELAY_MS * attempt);
    }
  }
  throw lastError;
}

async function phaseList() {
  mkdirSync(OUT, { recursive: true });
  const sitemapFile = flag('sitemap-file');
  const text = sitemapFile ? readFileSync(String(sitemapFile), 'utf8') : await fetchText(SITEMAP_URL);
  const rows = parseSitemap(text);
  if (!rows.length) throw new Error('GayOut sitemap produced no venue URLs');
  writeNdjson(join(OUT, 'listings.ndjson'), rows);
  const sectionMix = Object.fromEntries(
    [...new Set(rows.map((row) => row.section))]
      .map((section) => [section, rows.filter((row) => row.section === section).length])
      .sort((a, b) => b[1] - a[1]),
  );
  console.log(`[list] ${rows.length} unique venue URLs`);
  console.log('[list] section mix:', sectionMix);
  console.log(`[list] wrote ${join(OUT, 'listings.ndjson')}`);
}

async function phaseDetail() {
  mkdirSync(CACHE, { recursive: true });
  const listings = readNdjson(join(OUT, 'listings.ndjson'));
  if (!listings.length) throw new Error('missing listings.ndjson — run --phase list first');
  const recordsPath = join(OUT, 'records.ndjson');
  const records = new Map(readNdjson(recordsPath).map((row) => [row.source_id, row]));
  const pending = listings.filter((row) => !records.has(row.source_id));
  const todo = pending.slice(0, Number.isFinite(LIMIT) ? LIMIT : pending.length);
  let ok = 0;
  let failed = 0;

  for (const [index, seed] of todo.entries()) {
    const path = cachePath(seed.source_id);
    try {
      const html = existsSync(path) ? readFileSync(path, 'utf8') : await fetchText(seed.url);
      if (!existsSync(path)) writeFileSync(path, html);
      records.set(seed.source_id, parseVenueHtml(html, seed));
      ok++;
    } catch (error) {
      failed++;
      console.warn(`[detail] ${seed.url}: ${error.message}`);
      if (/Cloudflare challenge/.test(error.message)) break;
    }
    writeNdjson(recordsPath, [...records.values()]);
    if (!existsSync(path)) await sleep(DELAY_MS);
    if ((index + 1) % 100 === 0) console.log(`[detail] ${index + 1}/${todo.length} ok=${ok} failed=${failed}`);
  }
  console.log(`[detail] parsed=${records.size}/${listings.length}; this run ok=${ok} failed=${failed}`);
}

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}

async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`management API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

async function phaseStage() {
  const listings = readNdjson(join(OUT, 'listings.ndjson'));
  if (!listings.length) throw new Error('missing listings.ndjson — run --phase list first');
  const detailRows = [
    ...readNdjson(join(OUT, 'records.ndjson')),
    ...readNdjson(join(OUT, 'retry-city-records.ndjson')),
    ...readNdjson(join(OUT, 'retry-city-incremental.ndjson')),
  ];
  const detailById = new Map(detailRows.map((row) => [row.source_id, row]));
  const countryResult = await sql(`select slug, upper(code) as code from public.countries where code ~ '^[A-Za-z]{2}$'`);
  const countryBySlug = new Map((countryResult.result || countryResult || []).map((row) => [row.slug, row.code]));
  // GayOut sometimes uses constituent-country or legacy slugs that do not
  // match the canonical country slug in our geography table.
  countryBySlug.set('scotland', 'GB');
  countryBySlug.set('bosnia-herzegovina', 'BA');
  const records = listings
    .map((row) => ({ ...row, ...(detailById.get(row.source_id) || {}) }))
    .map((row) => ({ ...row, country: row.country || countryBySlug.get(row.country_slug) }))
    .filter((row) => !REQUIRE_DETAILS || detailById.has(row.source_id));
  const normalized = records.map(toNormalizedVenue);
  const audit = {
    sitemap_venues: listings.length,
    staged_candidates: normalized.length,
    detail_enriched: records.filter(
      (row) => row.detail_status && row.detail_status !== 'sitemap_only',
    ).length,
    sitemap_only: records.filter((row) => !row.detail_status).length,
    with_coordinates: records.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng)).length,
    with_address: records.filter((row) => row.address).length,
    generated_at: new Date().toISOString(),
  };
  writeFileSync(join(OUT, 'audit.json'), JSON.stringify(audit, null, 2) + '\n');
  console.log('[stage] audit:', audit);

  if (DRY) {
    writeFileSync(join(OUT, 'staged-preview.json'), JSON.stringify(normalized.slice(0, 10), null, 2) + '\n');
    console.log(`[stage] DRY RUN — preview written to ${join(OUT, 'staged-preview.json')}`);
    return;
  }

  let inserted = 0;
  let refreshed = 0;
  const chunkSize = 100;
  for (let offset = 0; offset < normalized.length; offset += chunkSize) {
    const chunk = normalized.slice(offset, offset + chunkSize);
    const payload = JSON.stringify(chunk);
    if (payload.includes('$GAYOUT$')) throw new Error('payload contains reserved SQL dollar-quote tag');
    if (REFRESH) {
      const refreshResult = await sql(`
with desired as materialized (
  select n, n->>'sourceId' source_id,
         encode(extensions.digest(n::text,'sha256'),'hex') desired_hash
  from jsonb_array_elements($GAYOUT$${payload}$GAYOUT$::jsonb) n
), canonical as materialized (
  select distinct on (d.source_id) d.source_id,d.n,d.desired_hash,s.id
  from desired d
  left join public.ingestion_staging s
    on s.source_name='gayout' and s.target_table='venues'
   and s.source_entity_id=d.source_id
  order by d.source_id,(s.payload_hash=d.desired_hash) desc nulls last,s.updated_at desc nulls last
), updated as (
  update public.ingestion_staging s
  set normalized_data=c.n,
      raw_data=jsonb_build_object('source','gayout','url',c.n->'metadata'->>'url'),
      payload_hash=c.desired_hash, entity_type='venue', target_table='venues',
      disposition='pending', ai_validation_status='pending', dedup_status='pending',
      enrichment_status='pending', review_status='auto', error_message=null,
      processed_at=null, pipeline_run_id=null, node_id=null, updated_at=now()
  from canonical c
  where s.id=c.id and s.payload_hash is distinct from c.desired_hash
  returning s.id
), superseded as (
  update public.ingestion_staging s
  set disposition='rejected',review_status='auto',
      error_message='superseded_source_payload',updated_at=now()
  from canonical c
  where s.source_name='gayout' and s.target_table='venues'
    and s.source_entity_id=c.source_id and s.id<>c.id
  returning s.id
), inserted_rows as (
  insert into public.ingestion_staging
    (raw_data,normalized_data,target_table,entity_type,source_type,source_name,
     source_entity_id,payload_hash,ai_validation_status,dedup_status,
     enrichment_status,review_status,disposition)
  select jsonb_build_object('source','gayout','url',c.n->'metadata'->>'url'),
    c.n,'venues','venue','gayout','gayout',c.source_id,c.desired_hash,
    'pending','pending','pending','auto','pending'
  from canonical c where c.id is null
  on conflict do nothing returning id
)
select (select count(*)::int from updated) refreshed,
       (select count(*)::int from inserted_rows) inserted;`);
      const stats = (refreshResult.result || refreshResult || [])[0] || {};
      refreshed += Number(stats.refreshed || 0);
      inserted += Number(stats.inserted || 0);
    } else {
      const result = await sql(`
insert into public.ingestion_staging
  (raw_data, normalized_data, target_table, entity_type, source_type, source_name,
   source_entity_id, payload_hash, ai_validation_status, dedup_status,
   enrichment_status, review_status, disposition)
select
  jsonb_build_object('source','gayout','url', n->'metadata'->>'url'),
  n, 'venues', 'venue', 'gayout', 'gayout', n->>'sourceId',
  encode(extensions.digest(n::text,'sha256'),'hex'),
  'pending','pending','pending','auto','pending'
from jsonb_array_elements($GAYOUT$${payload}$GAYOUT$::jsonb) n
on conflict do nothing
returning 1;`);
      inserted += (result.result || result || []).length;
    }
    console.log(`[stage] ${Math.min(offset + chunkSize, normalized.length)}/${normalized.length} inserted=${inserted} refreshed=${refreshed}`);
  }
  console.log(`[stage] complete: inserted=${inserted} refreshed=${refreshed}`);
}

const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';

async function internalSecret() {
  const result = await sql(`select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret' limit 1`);
  const secret = (result.result || result || [])[0]?.decrypted_secret;
  if (!secret) throw new Error('internal_invoke_secret is not configured');
  return secret;
}

async function invokePipeline(fn, secret, body) {
  const response = await fetch(`https://${PROJECT}.supabase.co/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${fn} HTTP ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function scalar(query, key = 'n') {
  const result = await sql(query);
  return Number((result.result || result || [])[0]?.[key] || 0);
}

async function dedupVenueBatch(batchSize = 5000) {
  const result = await sql(`
with incoming as materialized (
  select s.id,s.pipeline_run_id,s.dedup_details,
    s.normalized_data->>'name' name,
    public.normalize_name(s.normalized_data->>'name') name_norm,
    public.dedup_despace(s.normalized_data->>'name') name_key,
    s.normalized_data->'location'->>'city' city,
    upper(s.normalized_data->'location'->>'country') country_code,
    nullif(s.normalized_data->'location'->>'lat','')::numeric lat,
    nullif(s.normalized_data->'location'->>'lng','')::numeric lng,
    public.normalize_address(s.normalized_data->'location'->>'address') address_norm
  from public.ingestion_staging s
  where s.source_name='gayout' and s.target_table='venues' and s.disposition='pending'
    and s.ai_validation_status='approved' and s.dedup_status='pending'
  order by s.created_at,s.id limit ${batchSize} for update skip locked
), candidates as materialized (
  select i.id,v.id match_id,'address_exact'::text match_type,.97::numeric score,
    public.haversine_m(i.lat,i.lng,v.latitude,v.longitude) distance_m
  from incoming i join public.venues v
    on v.address_normalized=i.address_norm and public.dedup_despace(v.name)=i.name_key
  left join public.countries co on co.id=v.country_id
  where v.duplicate_of_id is null and (co.code is null or upper(co.code)=i.country_code)
  union all
  select i.id,v.id,'name_proximity',extensions.similarity(v.name_normalized,i.name_norm)::numeric,
    public.haversine_m(i.lat,i.lng,v.latitude,v.longitude)
  from incoming i join public.venues v
    on v.latitude between i.lat-.003 and i.lat+.003
   and v.longitude between i.lng-.003 and i.lng+.003 and v.name_normalized % i.name_norm
  left join public.countries co on co.id=v.country_id
  where v.duplicate_of_id is null and (co.code is null or upper(co.code)=i.country_code)
    and public.haversine_m(i.lat,i.lng,v.latitude,v.longitude)<=250
  union all
  select i.id,v.id,'despaced_city_text',.88::numeric,
    public.haversine_m(i.lat,i.lng,v.latitude,v.longitude)
  from incoming i join public.venues v
    on public.dedup_despace(v.name)=i.name_key
   and public.dedup_despace(v.city)=public.dedup_despace(i.city)
  left join public.countries co on co.id=v.country_id
  where v.duplicate_of_id is null and (co.code is null or upper(co.code)=i.country_code)
    and (i.lat is null or v.latitude is null or public.haversine_m(i.lat,i.lng,v.latitude,v.longitude)<=250)
), best as materialized (
  select distinct on(id) * from candidates order by id,score desc,distance_m asc nulls last
), classified as materialized (
  select i.*,
    case when coalesce(b.score,0)>=.90 then 'duplicate' when coalesce(b.score,0)>=.75 then 'merge_candidate' else 'unique' end decision,
    case when coalesce(b.score,0)>=.90 then 'auto_merge' when coalesce(b.score,0)>=.75 then 'flag_review' else 'no_match' end action,
    case when coalesce(b.score,0)>=.75 then b.match_id else null end match_id,
    coalesce(b.match_type,'none') match_type,coalesce(b.score,0) score,b.distance_m
  from incoming i left join best b using(id)
), audited as (
  insert into public.scraper_dedupe_decisions
    (entity_type,entity_a_id,entity_b_id,staging_id,pipeline_run_id,match_method,confidence,decision,action,rules_fired,decided_by)
  select 'venue',id,match_id,id,pipeline_run_id,match_type,score,decision,action,
    jsonb_build_object('signals',case when match_id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('match_type',match_type,'score',score)) end,
      'guards_fired','[]'::jsonb,'semantic_cosine',0),'pipeline-deduplicate'
  from classified returning staging_id
), updated as (
  update public.ingestion_staging s set
    dedup_status=a.decision,dedup_match_id=a.match_id,dedup_match_table='venues',dedup_match_score=a.score,
    dedup_details=coalesce(s.dedup_details,'{}'::jsonb)||jsonb_build_object('match_type',a.match_type,'fused_score',a.score,'semantic_cosine',0,'distance_m',a.distance_m),
    review_status=case when a.decision='merge_candidate' then 'pending_review' else 'auto' end,updated_at=now()
  from classified a join audited d on d.staging_id=a.id where s.id=a.id
  returning s.id,a.decision,a.match_id,a.match_type,a.score
), queued as (
  insert into public.review_queue(entity_type,entity_id,review_type,status,details)
  select 'ingestion_staging',u.id,'merge_candidate','pending',jsonb_build_object('target_table','venues','match_id',u.match_id,'match_type',u.match_type,'score',u.score)
  from updated u where u.decision='merge_candidate' returning entity_id
), events as (
  insert into public.ingestion_events(staging_id,venue_id,stage,new_status,actor,payload)
  select u.id,u.match_id,'deduplicate',u.decision,'pipeline-deduplicate',jsonb_build_object('target_table','venues','match_id',u.match_id,'match_score',u.score,'match_type',u.match_type)
  from updated u returning 1
)
select count(*)::int n from updated;`);
  return Number((result.result || result || [])[0]?.n || 0);
}

async function phaseRecoverExisting() {
  const runId = randomUUID();
  const result = await sql(`
with latest_sparse as materialized (
  select distinct on (s.source_entity_id)
    s.id,s.source_entity_id,s.normalized_data,s.pipeline_run_id
  from public.ingestion_staging s
  where s.source_name='gayout' and s.target_table='venues'
    and s.error_message='source_detail_unavailable_no_address_or_coordinates'
    and not exists (
      select 1 from public.venue_sources vs
      where vs.source_slug='gayout' and vs.source_entity_id=s.source_entity_id
    )
  order by s.source_entity_id,s.updated_at desc,s.id desc
), candidates as materialized (
  select s.id,s.source_entity_id,v.id venue_id
  from latest_sparse s
  join public.venues v
    on v.duplicate_of_id is null
   and public.dedup_despace(v.name)=public.dedup_despace(s.normalized_data->>'name')
   and public.dedup_despace(v.city)=public.dedup_despace(s.normalized_data->'location'->>'city')
  join public.countries c on c.id=v.country_id
    and upper(c.code)=upper(s.normalized_data->'location'->>'country')
), unique_matches as materialized (
  select c.id,min(c.venue_id::text)::uuid venue_id
  from candidates c group by c.id having count(distinct c.venue_id)=1
), opened as (
  update public.ingestion_staging s set
    disposition='pending',ai_validation_status='approved',ai_confidence_score=1,
    ai_validation_result=jsonb_build_object(
      'errors','[]'::jsonb,'warnings','[]'::jsonb,'quality',1,
      'reason','Exact normalized name, city and country match to an existing live venue'
    ),ai_validated_at=now(),dedup_status='duplicate',dedup_match_id=m.venue_id,
    dedup_match_table='venues',dedup_match_score=.96,
    dedup_details=jsonb_build_object('match_type','exact_name_city_country','fused_score',.96),
    review_status='approved',error_message=null,pipeline_run_id='${runId}'::uuid,
    node_id='gayout-existing-venue-recovery',processed_at=null,updated_at=now()
  from unique_matches m where s.id=m.id
  returning s.id,s.source_entity_id,m.venue_id
), run as (
  insert into public.pipeline_runs
    (id,pipeline_name,status,context,started_at,completed_at,triggered_by,items_total,items_processed,items_succeeded)
  select '${runId}'::uuid,'gayout-existing-venue-recovery','completed',
    jsonb_build_object('source_name','gayout','target_table','venues','match_type','exact_name_city_country'),
    now(),now(),'gayout-import',count(*),count(*),count(*) from opened
  returning id
), decisions as (
  insert into public.scraper_dedupe_decisions
    (entity_type,entity_a_id,entity_b_id,staging_id,pipeline_run_id,match_method,confidence,decision,action,rules_fired,decided_by)
  select 'venue',o.id,o.venue_id,o.id,r.id,'exact_name_city_country',.96,'duplicate','auto_merge',
    jsonb_build_object('signals',jsonb_build_array(jsonb_build_object('match_type','exact_name_city_country','score',.96)),'guards_fired','[]'::jsonb),
    'gayout-import'
  from opened o cross join run r returning staging_id
), events as (
  insert into public.ingestion_events(staging_id,venue_id,stage,new_status,actor,payload)
  select o.id,o.venue_id,'deduplicate','duplicate','gayout-import',
    jsonb_build_object('match_type','exact_name_city_country','score',.96)
  from opened o returning staging_id
)
select count(*)::int recovered from opened;`);
  const recovered = Number((result.result || result || [])[0]?.recovered || 0);
  console.log(`[recover-existing] reopened ${recovered} exact name/city/country matches`);
}

async function phaseReport() {
  const result = await sql(`
with canonical as materialized (
  select distinct on (s.source_entity_id) s.*
  from public.ingestion_staging s
  where s.source_name='gayout' and s.target_table='venues'
  order by s.source_entity_id,(s.error_message='superseded_source_payload') asc,s.updated_at desc,s.id desc
), linked as materialized (
  select vs.venue_id,vs.source_entity_id
  from public.venue_sources vs where vs.source_slug='gayout'
)
select
  (select count(*)::int from canonical) inventory,
  (select count(*)::int from canonical where disposition='inserted') inserted,
  (select count(*)::int from canonical where disposition='updated') updated,
  (select count(*)::int from canonical where disposition='committed') committed,
  (select count(*)::int from canonical where disposition='rejected') rejected,
  (select count(*)::int from canonical where disposition='rejected'
    and error_message in ('source_detail_unavailable_no_address_or_coordinates','source_detail_unavailable_no_address')) source_detail_rejected,
  (select count(*)::int from canonical where disposition='rejected'
    and error_message like 'commit_fn:%') commit_failed,
  (select count(*)::int from canonical where disposition='pending') pending,
  (select count(*)::int from linked) source_links,
  (select count(distinct venue_id)::int from linked) distinct_linked_venues,
  (select count(*)::int from linked l join public.venues v on v.id=l.venue_id
    where v.duplicate_of_id is null and nullif(btrim(v.name),'') is not null) valid_live_links,
  (select count(*)::int from linked l join public.search_documents sd
    on sd.entity_type='venue' and sd.entity_id=l.venue_id) searchable_links,
  (select count(*)::int from linked l join public.venues v on v.id=l.venue_id
    where v.duplicate_of_id is null and v.review_status is distinct from 'archived') index_eligible_links,
  (select count(distinct l.venue_id)::int from linked l join public.venues v on v.id=l.venue_id
    where v.duplicate_of_id is null and v.review_status is distinct from 'archived'
      and not exists (select 1 from public.search_documents sd
        where sd.entity_type='venue' and sd.entity_id=l.venue_id)) missing_search_documents,
  (select count(*)::int from public.pipeline_runs
    where pipeline_name like 'gayout-production-%' and status='running') running_runs;`);
  console.log(JSON.stringify((result.result || result || [])[0] || {}, null, 2));
}

async function phaseIndexSearch() {
  let indexed = 0;
  for (;;) {
    const result = await sql(`
set local statement_timeout='170s';
with guard as materialized (
  select pg_advisory_xact_lock(hashtext('search_reindex_drain'))
), missing as materialized (
  select distinct vs.venue_id
  from public.venue_sources vs join public.venues v on v.id=vs.venue_id
  cross join guard g
  where vs.source_slug='gayout' and v.duplicate_of_id is null
    and v.review_status is distinct from 'archived'
    and not exists (select 1 from public.search_documents sd
      where sd.entity_type='venue' and sd.entity_id=vs.venue_id)
  limit 100
), indexed as materialized (
  select venue_id,public.search_documents_index_venues(venue_id) from missing
)
select count(*)::int n from indexed;`);
    const n = Number((result.result || result || [])[0]?.n || 0);
    if (!n) break;
    indexed += n;
    console.log(`[index-search] indexed=${indexed}`);
  }
  console.log(`[index-search] complete indexed=${indexed}`);
}

async function phaseE2eSamples() {
  const result = await sql(`
select distinct on (c.code) v.slug,v.name,v.city,c.name country,
       v.latitude,v.longitude,vs.source_entity_id
from public.venue_sources vs
join public.venues v on v.id=vs.venue_id and v.duplicate_of_id is null
left join public.countries c on c.id=v.country_id
join public.search_documents sd on sd.entity_type='venue' and sd.entity_id=v.id
where vs.source_slug='gayout' and v.slug is not null
  and v.latitude is not null and v.longitude is not null
  and vs.last_seen_at >= now()-interval '2 hours'
order by c.code,vs.last_seen_at desc limit 20;`);
  console.log(JSON.stringify(result.result || result || [], null, 2));
}

async function phaseErrorReport() {
  const result = await sql(`
with canonical as (
  select distinct on (s.source_entity_id) s.*
  from public.ingestion_staging s
  where s.source_name='gayout' and s.target_table='venues'
  order by s.source_entity_id,(s.error_message='superseded_source_payload') asc,s.updated_at desc,s.id desc
)
select error_message,count(*)::int n,
       (array_agg(source_entity_id order by source_entity_id))[1:5] samples
from canonical where disposition='rejected'
group by error_message order by n desc;`);
  const constraint = await sql(`select pg_get_constraintdef(oid) definition
    from pg_constraint where conrelid='public.venues'::regclass
      and conname='venues_category_check'`);
  const commitFn = await sql(`with f as (
      select pg_get_functiondef('public.commit_venue_staging_item(uuid,text)'::regprocedure) d
    ) select substring(d from greatest(position('v_category    :=' in d)-120,1) for 900) excerpt from f`);
  const commitFailures = await sql(`
with canonical as (
  select distinct on (s.source_entity_id) s.* from public.ingestion_staging s
  where s.source_name='gayout' and s.target_table='venues'
  order by s.source_entity_id,(s.error_message='superseded_source_payload') asc,s.updated_at desc,s.id desc
)
select s.dedup_status,s.normalized_data->>'category' normalized_category,
       coalesce(v.category,'(no match)') matched_category,count(*)::int n
from canonical s left join public.venues v on v.id=s.dedup_match_id
where s.error_message like 'commit_fn:%'
group by s.dedup_status,s.normalized_data->>'category',coalesce(v.category,'(no match)') order by n desc`);
  console.log(JSON.stringify({
    errors: result.result || result || [],
    category_constraint: (constraint.result || constraint || [])[0]?.definition || null,
    commit_category_excerpt: (commitFn.result || commitFn || [])[0]?.excerpt || null,
    commit_failure_groups: commitFailures.result || commitFailures || [],
  }, null, 2));
}

async function phaseReviewReport() {
  const grouped = await sql(`
with canonical as (
  select distinct on (s.source_entity_id) s.*
  from public.ingestion_staging s
  where s.source_name='gayout' and s.target_table='venues'
  order by s.source_entity_id,(s.error_message='superseded_source_payload') asc,s.updated_at desc,s.id desc
)
select disposition,ai_validation_status,dedup_status,review_status,
       coalesce(ai_validation_result->'warnings','[]'::jsonb) warnings,
       count(*)::int n
from canonical
where disposition not in ('inserted','updated','rejected')
group by disposition,ai_validation_status,dedup_status,review_status,
         coalesce(ai_validation_result->'warnings','[]'::jsonb)
order by n desc;`);
  const samples = await sql(`
with canonical as (
  select distinct on (s.source_entity_id) s.*
  from public.ingestion_staging s
  where s.source_name='gayout' and s.target_table='venues'
  order by s.source_entity_id,(s.error_message='superseded_source_payload') asc,s.updated_at desc,s.id desc
)
select id,source_entity_id,normalized_data->>'name' name,
       normalized_data->'location'->>'address' address,
       normalized_data->'location'->>'city' city,
       disposition,ai_validation_status,dedup_status,review_status,
       ai_validation_result->'warnings' warnings,dedup_match_id,dedup_details
from canonical
where disposition not in ('inserted','updated','rejected')
order by disposition,ai_validation_status,source_entity_id;`);
  console.log(JSON.stringify({
    grouped: grouped.result || grouped || [],
    samples: samples.result || samples || [],
  }, null, 2));
}

async function phaseResolveReviews() {
  const result = await sql(`
with addressless as materialized (
  update public.ingestion_staging s set
    ai_validation_status='rejected',review_status='auto',disposition='rejected',
    error_message='source_detail_unavailable_no_address',updated_at=now()
  where s.source_name='gayout' and s.target_table='venues' and s.disposition='pending'
    and s.ai_validation_status='needs_review'
    and coalesce(s.ai_validation_result->'warnings','[]'::jsonb) ? 'W_NO_ADDRESS'
  returning s.id
), country_payloads as materialized (
  select s.id,
    jsonb_set(s.normalized_data,'{location,country}',
      to_jsonb(case
        when s.source_entity_id like '/europe/scotland/%' then 'GB'
        when s.source_entity_id like '/europe/bosnia-herzegovina/%' then 'BA'
      end),true) payload
  from public.ingestion_staging s
  where s.source_name='gayout' and s.target_table='venues' and s.disposition='pending'
    and s.ai_validation_status='needs_review'
    and not (coalesce(s.ai_validation_result->'warnings','[]'::jsonb) ? 'W_NO_ADDRESS')
    and (s.source_entity_id like '/europe/scotland/%'
      or s.source_entity_id like '/europe/bosnia-herzegovina/%')
), country_fixed as materialized (
  update public.ingestion_staging s set
    normalized_data=c.payload,
    payload_hash=encode(extensions.digest(c.payload::text,'sha256'),'hex'),
    ai_validation_status='pending',ai_validation_result=null,ai_confidence_score=null,
    ai_validated_at=null,dedup_status='pending',dedup_match_id=null,
    dedup_match_score=null,dedup_details=null,review_status='auto',
    error_message=null,pipeline_run_id=null,node_id=null,processed_at=null,updated_at=now()
  from country_payloads c where s.id=c.id returning s.id
), merges as materialized (
  update public.ingestion_staging s set review_status='approved',updated_at=now()
  where s.source_name='gayout' and s.target_table='venues' and s.disposition='pending'
    and s.ai_validation_status='approved' and s.dedup_status='merge_candidate'
    and s.dedup_match_id is not null
  returning s.id,s.dedup_match_id
), reviewed as (
  update public.review_queue q set status='resolved',resolved_at=now(),
    details=coalesce(q.details,'{}'::jsonb)||jsonb_build_object('resolution','gayout-import-reviewed')
  where q.entity_type='ingestion_staging' and q.status='pending'
    and q.entity_id in (
      select id from addressless union select id from country_fixed union select id from merges
    ) returning q.id
), events as (
  insert into public.ingestion_events(staging_id,venue_id,stage,new_status,actor,payload)
  select id,null::uuid,'validate','rejected','gayout-import',jsonb_build_object('reason','source_detail_unavailable_no_address')
  from addressless
  union all
  select id,null::uuid,'validate','pending','gayout-import',jsonb_build_object('reason','country_alias_repaired')
  from country_fixed
  union all
  select id,dedup_match_id,'review','approved','gayout-import',jsonb_build_object('decision','merge')
  from merges returning staging_id
)
select
  (select count(*)::int from addressless) addressless_rejected,
  (select count(*)::int from country_fixed) country_alias_fixed,
  (select count(*)::int from merges) merge_candidates_approved,
  (select count(*)::int from reviewed) reviews_resolved;`);
  console.log(JSON.stringify((result.result || result || [])[0] || {}, null, 2));
}

async function phaseRecoverCommitFailures() {
  const result = await sql(`
with recovered as materialized (
  update public.ingestion_staging s set
    normalized_data=jsonb_set(s.normalized_data,'{category}','"community_center"'::jsonb,true),
    disposition='pending',error_message=null,
    review_status=case when s.dedup_status='merge_candidate' then 'approved' else 'auto' end,
    processed_at=null,updated_at=now()
  where s.source_name='gayout' and s.target_table='venues'
    and s.disposition='rejected'
    and s.error_message='commit_fn: new row for relation "venues" violates check constraint "venues_category_check"'
    and s.source_entity_id like '%/organizations/%'
    and s.ai_validation_status='approved'
    and s.dedup_status in ('unique','duplicate','merge_candidate')
  returning s.id,s.dedup_match_id
), events as (
  insert into public.ingestion_events(staging_id,venue_id,stage,new_status,actor,payload)
  select id,dedup_match_id,'repair','pending','gayout-import',
    jsonb_build_object('reason','restore_organization_as_community_center')
  from recovered returning staging_id
)
select count(*)::int recovered from recovered;`);
  console.log(JSON.stringify((result.result || result || [])[0] || {}, null, 2));
}

async function phaseDrain() {
  // Only unresolved sparse records are invalid. A sitemap-only record may have
  // already been resolved deterministically to an existing venue, in which
  // case the commit still needs to attach GayOut source provenance.
  const sparse = await scalar(`select count(*)::int n from public.ingestion_staging where source_name='gayout' and target_table='venues' and disposition='pending' and ai_validation_status='pending' and dedup_status='pending' and normalized_data->'metadata'->>'detail_status'='sitemap_only'`);
  if (sparse) {
    await sql(`
with rejected as (
  update public.ingestion_staging
  set ai_validation_status='rejected', ai_confidence_score=0,
      ai_validation_result=jsonb_build_object(
        'errors',jsonb_build_array('E_SOURCE_DETAIL_UNAVAILABLE'),
        'warnings','[]'::jsonb,
        'quality',0,
        'reason','GayOut detail page was unavailable; address and coordinates are absent'
      ),
      ai_validated_at=now(), review_status='auto', disposition='rejected',
      error_message='source_detail_unavailable_no_address_or_coordinates', updated_at=now()
  where source_name='gayout' and target_table='venues' and disposition='pending'
    and ai_validation_status='pending' and dedup_status='pending'
    and normalized_data->'metadata'->>'detail_status'='sitemap_only'
  returning id
)
insert into public.ingestion_events(staging_id,stage,new_status,actor,payload)
select id,'validate','rejected','gayout-import',jsonb_build_object('error','E_SOURCE_DETAIL_UNAVAILABLE')
from rejected;`);
    console.log(`[drain] rejected ${sparse} sitemap-only candidates lacking address and coordinates`);
  }
  const runId = randomUUID();
  await sql(`
insert into public.pipeline_runs
  (id,pipeline_name,status,context,started_at,triggered_by)
values
  ('${runId}'::uuid,'gayout-production-validation','running',
   jsonb_build_object('source_name','gayout','target_table','venues'),now(),'gayout-import');`);
  await sql(`
update public.ingestion_staging
set pipeline_run_id='${runId}'::uuid, node_id='gayout-production-drain', updated_at=now()
where source_name='gayout' and target_table='venues' and disposition='pending';`);
  const secret = await internalSecret();
  console.log(`[drain] pipeline_run_id=${runId}`);

  for (;;) {
    const pending = await scalar(`select count(*)::int n from public.ingestion_staging where source_name='gayout' and target_table='venues' and pipeline_run_id='${runId}'::uuid and disposition='pending' and ai_validation_status='pending'`);
    if (!pending) break;
    const result = await invokePipeline('pipeline-validate', secret, {
      pipeline_run_id: runId,
      entityType: 'venue',
      targetTable: 'venues',
      batch_size: 500,
    });
    console.log(`[drain:validate] remaining=${Math.max(0, pending - Number(result.items || 0))} result=${JSON.stringify(result)}`);
    if (!result.items) throw new Error(`pipeline-validate made no progress with ${pending} remaining`);
  }

  // Register the database-side deterministic dedup pass as a real pipeline run
  // so every decision retains a valid, traceable audit parent.
  const dedupRunIds = [randomUUID()];
  await sql(`
insert into public.pipeline_runs
  (id,pipeline_name,status,context,started_at,triggered_by)
select id,'gayout-production-dedup','running',
       jsonb_build_object('source_name','gayout','target_table','venues','partition',partition),
       now(),'gayout-import'
from unnest(array[${dedupRunIds.map((id) => `'${id}'::uuid`).join(',')}]) with ordinality as runs(id,partition);`);
  await sql(`
update public.ingestion_staging
set pipeline_run_id = (array[${dedupRunIds.map((id) => `'${id}'::uuid`).join(',')}])[
      mod(get_byte(decode(md5(source_entity_id),'hex'),0),${dedupRunIds.length}) + 1
    ],
  node_id='gayout-production-dedup', updated_at=now()
where source_name='gayout' and target_table='venues' and disposition='pending'
  and ai_validation_status='approved' and dedup_status='pending';`);

  for (;;) {
    const pending = await scalar(`select count(*)::int n from public.ingestion_staging where source_name='gayout' and target_table='venues' and disposition='pending' and ai_validation_status='approved' and dedup_status='pending'`);
    if (!pending) break;
    const progressed = await dedupVenueBatch();
    console.log(`[drain:dedup] remaining=${Math.max(0, pending - progressed)} processed=${progressed}`);
    if (!progressed) throw new Error(`pipeline-deduplicate made no progress with ${pending} remaining`);
  }
  await sql(`
update public.pipeline_runs
set status='completed',completed_at=now(),duration_ms=(extract(epoch from (now()-started_at))*1000)::int,
    items_total=(select count(*) from public.ingestion_staging where source_name='gayout' and target_table='venues' and pipeline_run_id=pipeline_runs.id),
    items_processed=(select count(*) from public.ingestion_staging where source_name='gayout' and target_table='venues' and pipeline_run_id=pipeline_runs.id and dedup_status<>'pending'),
    items_succeeded=(select count(*) from public.ingestion_staging where source_name='gayout' and target_table='venues' and pipeline_run_id=pipeline_runs.id and dedup_status<>'pending')
where id in (${dedupRunIds.map((id) => `'${id}'::uuid`).join(',')});

update public.pipeline_runs
set status='completed',completed_at=now(),duration_ms=(extract(epoch from (now()-started_at))*1000)::int
where id='${runId}'::uuid;`);

  let committed = 0;
  for (;;) {
    const eligible = await scalar(`select count(*)::int n from public.ingestion_staging where source_name='gayout' and target_table='venues' and disposition='pending' and ai_validation_status='approved' and dedup_status in ('unique','duplicate','merge_candidate') and review_status in ('auto','approved')`);
    if (!eligible) break;
    await sql(`
do $gayout_commit$
declare r record; ignored record;
begin
  for r in
    select id from public.ingestion_staging
    where source_name='gayout' and target_table='venues'
      and disposition='pending' and ai_validation_status='approved'
      and dedup_status in ('unique','duplicate','merge_candidate')
      and review_status in ('auto','approved')
    order by created_at asc limit 500 for update skip locked
  loop
    begin
      select * into ignored from public.commit_venue_staging_item(r.id,'gayout-import');
    exception when others then
      update public.ingestion_staging set disposition='rejected',error_message='commit_fn: '||sqlerrm,updated_at=now() where id=r.id;
      insert into public.ingestion_events(staging_id,stage,new_status,actor,payload)
      values(r.id,'commit','rejected','gayout-import',jsonb_build_object('error',sqlerrm));
    end;
  end loop;
end
$gayout_commit$;`);
    const after = await scalar(`select count(*)::int n from public.ingestion_staging where source_name='gayout' and target_table='venues' and disposition='pending' and ai_validation_status='approved' and dedup_status in ('unique','duplicate','merge_candidate') and review_status in ('auto','approved')`);
    const progressed = eligible - after;
    if (progressed <= 0) throw new Error(`venue commit made no progress with ${eligible} eligible`);
    committed += progressed;
    console.log(`[drain:commit] committed_or_rejected=${committed} remaining=${after}`);
  }
  console.log(`[drain] complete run=${runId}`);
}

const phases = {
  list: phaseList,
  detail: phaseDetail,
  stage: phaseStage,
  'recover-existing': phaseRecoverExisting,
  report: phaseReport,
  'index-search': phaseIndexSearch,
  'e2e-samples': phaseE2eSamples,
  'error-report': phaseErrorReport,
  'review-report': phaseReviewReport,
  'resolve-reviews': phaseResolveReviews,
  'recover-commit-failures': phaseRecoverCommitFailures,
  drain: phaseDrain,
};
if (!phases[PHASE]) throw new Error(`unknown --phase ${PHASE}; expected ${Object.keys(phases).join(', ')}`);
await phases[PHASE]();
