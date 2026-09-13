#!/usr/bin/env node
// import-wikipedia-lgbtq-orgs.mjs — English Wikipedia LGBTQ political
// organizations / advocacy groups -> public.organizations, role `advocacy`.
//
// Inputs (both committed, so a run is reproducible without re-crawling):
//   out/lgbtq-political-orgs.json         crawl-wikipedia-lgbtq-orgs.mjs
//   out/lgbtq-political-org-extracts.json fetch-wikipedia-org-extracts.mjs
//
// Pure decisions (exclusions, country resolution, defunct, merge eligibility)
// live in lib/wikipedia-orgs.mjs and are unit-tested without a database.
// This file is only plumbing: match, plan, write.
//
// Requires migration 20360317142253 (the `advocacy` role and the lifespan
// columns). It checks for it and refuses to run otherwise.
//
// Auth: Supabase PAT (macOS keychain, or SUPABASE_PAT env).
// DEFAULT IS DRY-RUN. Pass --apply to write.
//
// Usage:
//   node scripts/data-quality/import-wikipedia-lgbtq-orgs.mjs            # plan only
//   node scripts/data-quality/import-wikipedia-lgbtq-orgs.mjs --apply
//   node scripts/data-quality/import-wikipedia-lgbtq-orgs.mjs --apply --limit 25
//
// Design: docs/plans/2026-09-08-lgbtq-advocacy-org-import-design.md

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  collapseRecords,
  countryKey,
  decideCountry,
  decideLifespan,
  mayAutoMerge,
  nameKey,
} from './lib/wikipedia-orgs.mjs';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const SOURCE = 'wikipedia';
const RUN_DATE = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || Infinity;
// A 300-row organizations UPDATE fans out through the unscoped
// trg_search_documents_organization into search_reindex_queue. Small batches.
const BATCH = 50;

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}
const TOKEN = token();

async function sql(query, attempt = 0) {
  let res;
  try {
    res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
  } catch (e) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return sql(query, attempt + 1);
    }
    throw e;
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return sql(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`SQL ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const qJson = (v) => `${q(JSON.stringify(v))}::jsonb`;

function slugify(name) {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'organization'
  );
}

/** P856 -> a bare hostname, matching the org_normalize_domain convention. */
function domainOf(website) {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./i, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

const [schema] = await sql(`
  select
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='organizations'
        and column_name in ('founded_at','dissolved_at','is_defunct')) as lifespan_cols,
    (select count(*) from pg_constraint
      where conrelid='public.organizations'::regclass
        and conname='organizations_roles_known'
        and pg_get_constraintdef(oid) like '%advocacy%') as advocacy_ok
`);
const schemaReady = Number(schema.lifespan_cols) === 3 && Number(schema.advocacy_ok) === 1;
if (!schemaReady) {
  const detail = `lifespan_cols=${schema.lifespan_cols}/3, advocacy_role=${schema.advocacy_ok}/1`;
  // A dry run only reads, so it stays useful before the migration lands — the
  // plan is exactly what you want to review while deciding whether to ship it.
  // Writing without the schema would fail mid-batch, so --apply refuses.
  if (APPLY) {
    console.error(`Migration 20360317142253 is not applied on this project (${detail}).`);
    process.exit(1);
  }
  console.warn(`\n  NOTE: migration 20360317142253 not applied yet (${detail}).`);
  console.warn('  Planning anyway; --apply will refuse until it is.');
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

const here = (f) => new URL(`./out/${f}`, import.meta.url).pathname;
const corpus = JSON.parse(readFileSync(here('lgbtq-political-orgs.json'), 'utf8'));
const extracts = JSON.parse(readFileSync(here('lgbtq-political-org-extracts.json'), 'utf8'));
const entities = collapseRecords(corpus.records);

const countries = await sql('select id, name, code from public.countries');
const countryByKey = new Map(countries.map((c) => [countryKey(c.name), c]));

const existing = await sql(`
  select id, name, slug, roles, country_id, website, description,
         coalesce(enrichment_status->'wikidata_lookup'->>'qid','') as qid
    from public.organizations
   where duplicate_of_id is null
`);
const byQid = new Map(existing.filter((o) => o.qid).map((o) => [o.qid, o]));
const byName = new Map();
for (const o of existing) {
  const k = nameKey(o.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(o);
}
const takenSlugs = new Set(existing.map((o) => o.slug));
const countryNameById = new Map(countries.map((c) => [c.id, c.name]));

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const plan = { insert: [], mergeQid: [], mergeName: [], refused: [], noCountry: [] };

for (const e of entities) {
  const country = decideCountry(e);
  const life = decideLifespan(e);
  const website = e.p856?.[0] ?? null;
  const description = extracts[e.titles[0]] ?? extracts[e.name] ?? null;
  const resolved = country.country ? countryByKey.get(countryKey(country.country)) : null;
  if (country.country && !resolved) plan.noCountry.push(`${e.name} -> ${country.country}`);

  const payload = {
    qid: e.qid || null,
    name: e.name,
    titles: e.titles,
    website,
    website_domain: domainOf(website),
    description,
    country_id: resolved?.id ?? null,
    country_label: resolved?.name ?? null,
    country_status: country.status,
    founded_at: life.foundedAt,
    dissolved_at: life.dissolvedAt,
    is_defunct: life.isDefunct,
    defunct_source: life.defunctSource,
    categories: e.paths ?? [],
  };

  // 1. QID is the only identifier that cannot be a namesake.
  const qidHit = e.qid ? byQid.get(e.qid) : null;
  if (qidHit) {
    plan.mergeQid.push({ ...payload, target: qidHit });
    continue;
  }

  // 2. Name match, gated on country. See mayAutoMerge for why a missing or
  //    contradictory country refuses instead of merging.
  const nameHits = byName.get(nameKey(e.name)) ?? [];
  if (nameHits.length > 0) {
    if (nameHits.length > 1) {
      plan.refused.push({ ...payload, reason: `${nameHits.length} existing rows share this name` });
      continue;
    }
    const target = nameHits[0];
    const verdict = mayAutoMerge({
      wikiCountry: payload.country_label,
      wikiCountryStatus: country.status,
      dbCountry: countryNameById.get(target.country_id) ?? null,
    });
    if (verdict.ok) plan.mergeName.push({ ...payload, target });
    else plan.refused.push({ ...payload, target, reason: verdict.reason });
    continue;
  }

  // 3. New organization.
  let slug = slugify(e.name);
  if (takenSlugs.has(slug)) {
    let n = 2;
    while (takenSlugs.has(`${slug}-${n}`)) n += 1;
    slug = `${slug}-${n}`;
  }
  takenSlugs.add(slug);
  plan.insert.push({ ...payload, slug });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const defunct = [...plan.insert, ...plan.mergeQid, ...plan.mergeName].filter((r) => r.is_defunct);
console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} — Wikipedia LGBTQ advocacy import\n`);
console.log(`  entities            ${entities.length}  (from ${corpus.records.length} titles)`);
console.log(`  insert new          ${plan.insert.length}`);
console.log(`  merge by QID        ${plan.mergeQid.length}`);
console.log(`  merge by name+country ${plan.mergeName.length}`);
console.log(`  refused (printed)   ${plan.refused.length}`);
console.log(`  defunct among them  ${defunct.length}`);
console.log(`  with website        ${plan.insert.filter((r) => r.website).length}`);
console.log(`  with description    ${plan.insert.filter((r) => r.description).length}`);
console.log(`  no country resolved ${plan.insert.filter((r) => !r.country_id).length}`);

if (plan.noCountry.length) {
  console.log(`\n  country names absent from public.countries (${plan.noCountry.length}):`);
  for (const n of plan.noCountry) console.log(`    - ${n}`);
}

if (plan.refused.length) {
  console.log(`\n  REFUSED name matches — decide these by hand, nothing was written:`);
  for (const r of plan.refused) {
    console.log(`    - ${r.name}`);
    console.log(`        existing: ${r.target?.name ?? '(several)'} (${r.target?.slug ?? '-'})`);
    console.log(`        reason:   ${r.reason}`);
  }
}

if (!APPLY) {
  console.log('\nDry run. Nothing written. Re-run with --apply.\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

function provenance(r, fields) {
  const stamp = { source: SOURCE, date: RUN_DATE, qid: r.qid };
  return Object.fromEntries(fields.map((f) => [f, stamp]));
}

function enrichment(r) {
  return {
    wikipedia_orgs: {
      date: RUN_DATE,
      qid: r.qid,
      titles: r.titles,
      country_status: r.country_status,
      defunct_source: r.defunct_source,
      categories: r.categories.slice(0, 12),
    },
    ...(r.qid ? { wikidata_lookup: { state: 'resolved', qid: r.qid, date: RUN_DATE } } : {}),
  };
}

let inserted = 0;
const toInsert = plan.insert.slice(0, LIMIT);
for (let i = 0; i < toInsert.length; i += BATCH) {
  const rows = toInsert.slice(i, i + BATCH).map((r) => {
    const fields = ['name'];
    if (r.website) fields.push('website');
    if (r.description) fields.push('description');
    if (r.country_id) fields.push('country_id');
    return `(${[
      q(r.slug),
      q(r.name),
      q(r.description),
      q(r.website),
      q(r.website_domain),
      r.country_id ? q(r.country_id) : 'null',
      r.founded_at ? q(r.founded_at) : 'null',
      r.dissolved_at ? q(r.dissolved_at) : 'null',
      r.is_defunct ? 'true' : 'false',
      qJson(provenance(r, fields)),
      qJson(enrichment(r)),
    ].join(',')})`;
  });
  await sql(`
    insert into public.organizations
      (slug, name, description, website, website_domain, country_id,
       founded_at, dissolved_at, is_defunct, field_provenance, enrichment_status,
       roles, status)
    select v.slug, v.name, v.description, v.website, v.website_domain, v.country_id::uuid,
           v.founded_at::date, v.dissolved_at::date, v.is_defunct, v.prov, v.enrich,
           array['advocacy']::text[], 'active'
      from (values ${rows.join(',')})
        as v(slug, name, description, website, website_domain, country_id,
             founded_at, dissolved_at, is_defunct, prov, enrich)
     on conflict (slug) do nothing
  `);
  inserted += rows.length;
  process.stdout.write(`\r  inserted ${Math.min(i + BATCH, toInsert.length)}/${toInsert.length}`);
}
if (toInsert.length) console.log();

// Merges fill only what is EMPTY and never overwrite a curated value; the one
// exception is the advocacy role, which is additive.
let merged = 0;
const toMerge = [...plan.mergeQid, ...plan.mergeName].slice(0, LIMIT);
for (let i = 0; i < toMerge.length; i += BATCH) {
  for (const r of toMerge.slice(i, i + BATCH)) {
    const fields = [];
    if (r.website) fields.push('website');
    if (r.description) fields.push('description');
    await sql(`
      update public.organizations o set
        website          = coalesce(o.website, ${q(r.website)}),
        website_domain   = coalesce(o.website_domain, ${q(r.website_domain)}),
        description      = coalesce(o.description, ${q(r.description)}),
        country_id       = coalesce(o.country_id, ${r.country_id ? q(r.country_id) : 'null'}::uuid),
        founded_at       = coalesce(o.founded_at, ${r.founded_at ? q(r.founded_at) : 'null'}::date),
        dissolved_at     = coalesce(o.dissolved_at, ${r.dissolved_at ? q(r.dissolved_at) : 'null'}::date),
        is_defunct       = o.is_defunct or ${r.is_defunct ? 'true' : 'false'},
        roles            = (select array(select distinct unnest(o.roles || array['advocacy'::text]))),
        field_provenance = o.field_provenance || ${qJson(provenance(r, fields))},
        enrichment_status = o.enrichment_status || ${qJson(enrichment(r))}
      where o.id = ${q(r.target.id)}::uuid
    `);
    merged += 1;
  }
  process.stdout.write(`\r  merged ${Math.min(i + BATCH, toMerge.length)}/${toMerge.length}`);
}
if (toMerge.length) console.log();

const [after] = await sql(`
  select
    count(*) filter (where 'advocacy' = any(roles)) as advocacy,
    count(*) filter (where 'advocacy' = any(roles) and is_defunct) as defunct,
    count(*) filter (where 'advocacy' = any(roles) and description is not null) as described,
    (select count(*) from public.search_documents
      where entity_type='organization' and closed_at is not null) as closed_docs
  from public.organizations where duplicate_of_id is null
`);
console.log(`\n  advocacy rows now  ${after.advocacy}`);
console.log(`  of them defunct    ${after.defunct}`);
console.log(`  of them described  ${after.described}`);
if (Number(after.closed_docs) > 0) {
  console.error(
    `\n  FAIL: ${after.closed_docs} organization search docs carry closed_at. ` +
      'closed_at hard-excludes from search_hybrid — dissolved organizations would ' +
      'be unfindable. Investigate before trusting this run.',
  );
  process.exit(1);
}
console.log(`\nDone. inserted=${inserted} merged=${merged}\n`);
