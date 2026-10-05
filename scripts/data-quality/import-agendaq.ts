#!/usr/bin/env node
/**
 * Import agendaq.fr into `venues`, `events` and `organizations`.
 *
 * ── CONSENT GATE (read this first) ─────────────────────────────────────────
 * Every phase that touches their servers or writes to our database exits unless
 * `AGENDAQ_CONSENT_REF` is set. See docs/licences/agendaq-consent.md — that file
 * is STATUS: INCOMPLETE, so as shipped this script cannot write anything.
 *
 * agendaq's /fr/legals carries NO conditions of use (verified 2026-10-05: it is
 * an editor/host/cookies notice and nothing else). An absent prohibition is not
 * a grant. The operative right is the French database producer's right
 * (CPI L341-1/L342-1), which forbids extracting a "qualitatively or
 * quantitatively substantial" part independently of copyright in any single
 * fact. This pulls the whole guide and the whole agenda, so it is squarely one.
 * robots.txt allowing /fr/guide with Crawl-delay: 5 is permission to crawl and
 * index; it is not a database-right licence and must not be cited as one.
 *
 * `report` is the one phase that runs ungated: it reads only pages already on
 * this disk and writes nothing, so blocking local analysis of bytes we already
 * hold protects nobody.
 *
 * ── PROSE IS A SECOND GATE ─────────────────────────────────────────────────
 * Blue Savanah is a société de presse; `descShort`, `desc` and event
 * `description` are its copy. `--include-prose` additionally requires
 * AGENDAQ_PROSE_ACK, so editorial text cannot be swept in by someone running
 * the obvious command. Facts (address, coordinates, hours, dates, category)
 * import either way. Images are REFERENCED by URL, never mirrored to R2.
 *
 * ── WHY A SCRIPT AND NOT AN EDGE FUNCTION ──────────────────────────────────
 * The feed is 36 items per page over 108 pages, and `limit` is accepted and
 * IGNORED — only `offset` moves the window. At robots.txt's Crawl-delay: 5 that
 * is ~9 minutes of wall clock, which does not fit an edge invocation. Same
 * reasoning `source-aids-ch` records for the 46-page testfinder import: one
 * request fits a cron, 108 pages have to be a script. Nothing here registers a
 * cron, an `admin_automations` row or an `ingestion_sources` row, and
 * agendaqLicence.test.ts asserts that stays true.
 *
 * ── IT RUNS UNDER PLAIN `node` AND IMPORTS THE DENO MODULE ─────────────────
 * Node 24 strips types natively, so this is `.ts` and imports
 * supabase/functions/_shared/agendaq-parse.ts directly rather than keeping a
 * second copy of the taxon vocabulary. That duplication is the specific failure
 * src/lib/venueCategories.ts exists to prevent — five divergent copies, one of
 * which offered categories the CHECK constraint rejected.
 *
 * ── LANES (measured over the full 3,877-row corpus, 2026-10-05) ────────────
 *   venue  1,388  bar 641 · sauna 192 · club 188 · theater 132 · shop 108 ·
 *                 outdoor 83 · hotel 33 · cruising 8 · salon 3
 *   org    2,359  CeGIDD health 1,376 · association 981 · public body 2
 *   other     76  no category taxon at all -> `other`, never name-inferred
 *   skip      54  soirée 33 · website 13 · publisher 8 (not places)
 *   events 16,433 distinct after dedupe by slug (the raw per-business count is
 *                 ~35k because one event lists every business it runs at)
 * The four lanes partition the corpus exactly and zero rows carry both a venue
 * category and an org role.
 *
 * Usage:
 *   node scripts/data-quality/import-agendaq.ts --phase fetch
 *   node scripts/data-quality/import-agendaq.ts --phase report
 *   node scripts/data-quality/import-agendaq.ts --phase stage --dry-run
 *   node scripts/data-quality/import-agendaq.ts --phase stage --country FR
 *   node scripts/data-quality/import-agendaq.ts --phase drain
 *   node scripts/data-quality/import-agendaq.ts --phase orgs --role health
 *   node scripts/data-quality/import-agendaq.ts --phase schedule
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  classify,
  dedupeEvents,
  flatLocation,
  imageUrls,
  toVenueHours,
  socialUrls,
  targetGroups,
  toSchedule,
  type AgendaqBusiness,
  type AgendaqEvent,
} from '../../supabase/functions/_shared/agendaq-parse.ts';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const SOURCE_NAME = 'agendaq';
const API = 'https://data.agendaq.fr/api/v1/businesses';
const PAGE = 36; // fixed upstream; `limit` is ignored
const CRAWL_DELAY_MS = 5000; // robots.txt Crawl-delay: 5
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide)';
const OUT = join(process.cwd(), 'out-agendaq');
const PAGES = join(OUT, 'pages');
const PROSE_ACK = 'i-accept-republishing-agendaq-editorial-prose';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const args = process.argv.slice(2);
const flag = (n: string, d: string | null = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const has = (n: string) => args.includes(`--${n}`);

const PHASE = flag('phase', 'report')!;
const DRY = has('dry-run');
const ONLY_COUNTRY = flag('country')?.toUpperCase() ?? null;
const ONLY_ROLE = flag('role');
const LIMIT = flag('limit') ? Number(flag('limit')) : Infinity;
const BATCH = Number(flag('batch', '200'));
const INCLUDE_PROSE = has('include-prose') && process.env.AGENDAQ_PROSE_ACK === PROSE_ACK;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const quote = (v: unknown) =>
  v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
const jsonb = (v: unknown) => `${quote(JSON.stringify(v))}::jsonb`;

// ── gates ──────────────────────────────────────────────────────────────────

function requireConsent(phase: string) {
  const ref = process.env.AGENDAQ_CONSENT_REF;
  if (ref && ref.trim()) return ref.trim();
  console.error(
    `\nREFUSING to run --phase ${phase}: AGENDAQ_CONSENT_REF is not set.\n\n` +
      `  This extracts a substantial part of a French database (CPI L342-1).\n` +
      `  Fill in docs/licences/agendaq-consent.md and export the Ref token:\n\n` +
      `      export AGENDAQ_CONSENT_REF='<ref from the consent record>'\n\n` +
      `  The variable is not a password. Its job is to make enabling this name\n` +
      `  the permission it relies on.\n`,
  );
  process.exit(1);
}

if (has('include-prose') && !INCLUDE_PROSE) {
  console.error(
    `\n--include-prose ignored: set AGENDAQ_PROSE_ACK='${PROSE_ACK}' to republish ` +
      `Blue Savanah's editorial copy. Facts import without it.\n`,
  );
  process.exit(1);
}

// ── transport ──────────────────────────────────────────────────────────────

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}

async function sql<T = unknown>(query: string, attempt = 1): Promise<T> {
  const MAX = 5;
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 400);
      if ((res.status === 429 || res.status >= 500) && attempt < MAX) {
        await sleep(2000 * attempt);
        return sql(query, attempt + 1);
      }
      throw new Error(`mgmt API ${res.status}: ${body}`);
    }
    const j = await res.json();
    return j.result ?? j;
  } catch (e) {
    if (e instanceof Error && !/^mgmt API \d/.test(e.message) && attempt < MAX) {
      await sleep(2000 * attempt);
      return sql(query, attempt + 1);
    }
    throw e;
  }
}

// ── phase: fetch ───────────────────────────────────────────────────────────

async function phaseFetch() {
  requireConsent('fetch');
  mkdirSync(PAGES, { recursive: true });
  let total: number | null = null;
  for (let off = 0; total === null || off < total; off += PAGE) {
    const f = join(PAGES, `biz-${String(off).padStart(5, '0')}.json`);
    if (existsSync(f)) {
      if (total === null) total = JSON.parse(readFileSync(f, 'utf8')).count;
      continue;
    }
    const res = await fetch(`${API}?offset=${off}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`agendaq ${res.status} at offset ${off}`);
    const text = await res.text();
    const j = JSON.parse(text);
    // An empty page is not "we reached the end" when count says otherwise —
    // treating it as one silently truncates the import.
    if (!Array.isArray(j.items)) throw new Error(`offset ${off}: no items array`);
    if (total === null) {
      total = j.count;
      console.log(`total ${total} (${Math.ceil(total! / PAGE)} pages)`);
    }
    if (!j.items.length) {
      if (off < total!) throw new Error(`offset ${off}: empty page before count ${total}`);
      break;
    }
    writeFileSync(f, text);
    console.log(`offset ${off} items ${j.items.length}`);
    await sleep(CRAWL_DELAY_MS);
  }
  console.log('fetch done');
}

// ── load ───────────────────────────────────────────────────────────────────

function loadCorpus(): AgendaqBusiness[] {
  if (!existsSync(PAGES)) {
    console.error(`no corpus at ${PAGES} — run --phase fetch first`);
    process.exit(1);
  }
  const byslug = new Map<string, AgendaqBusiness>();
  for (const f of readdirSync(PAGES).filter((f) => f.endsWith('.json'))) {
    for (const b of JSON.parse(readFileSync(join(PAGES, f), 'utf8')).items) {
      byslug.set(b.slug, b);
    }
  }
  return [...byslug.values()];
}

const inCountry = (b: AgendaqBusiness) =>
  !ONLY_COUNTRY || flatLocation(b.locations)?.country_code === ONLY_COUNTRY;

// ── payload builders ───────────────────────────────────────────────────────

function venuePayload(b: AgendaqBusiness) {
  const c = classify(b);
  const loc = flatLocation(b.locations);
  const hours = toVenueHours(b.data?.open);
  return {
    entityType: 'venue',
    sourceId: b.slug,
    sourceName: SOURCE_NAME,
    name: b.name.trim(),
    ...(INCLUDE_PROSE && b.data?.descShort ? { description: b.data.descShort } : {}),
    category: c.category,
    location: {
      lat: loc?.latitude ?? undefined,
      lng: loc?.longitude ?? undefined,
      address: loc?.address ?? undefined,
      city: loc?.city ?? undefined,
      countryCode: loc?.country_code ?? undefined,
    },
    postal_code: loc?.postal_code ?? undefined,
    state: loc?.region ?? undefined,
    contacts: {
      email: b.data?.email ?? undefined,
      phone: b.data?.phone ?? undefined,
      website: b.data?.url ?? undefined,
    },
    urls: [b.data?.url, ...socialUrls(b.data)].filter(Boolean),
    images: imageUrls(b.assets),
    tags: targetGroups(b),
    hours: hours ?? undefined,
    metadata: {
      agendaq_slug: b.slug,
      agendaq_taxons: b.taxons ?? [],
      agendaq_category_taxons: c.taxons,
      target_groups: targetGroups(b),
      source_url: `https://www.agendaq.fr/fr/guide/${b.slug}`,
      updated_on: b.updatedOn ?? null,
      // Recorded so a later pass can resolve the sole-marker taxons rather than
      // re-deriving which rows were unclassified.
      uncategorised: c.lane === 'other',
    },
  };
}

function eventPayload(e: AgendaqEvent) {
  const loc = flatLocation(e.locations);
  const rule = (e.dates ?? []).map(([, p]) => p).find((p) => p?.recurring) ?? null;
  const schedule = toSchedule(rule);
  const venueName = e.businesses?.[0]?.name?.trim() || null;
  return {
    entityType: 'event',
    sourceId: e.slug,
    sourceName: SOURCE_NAME,
    name: e.name.trim(),
    title: e.name.trim(),
    ...(INCLUDE_PROSE && e.description ? { description: e.description } : {}),
    start_date: e.start ?? undefined,
    end_date: e.end ?? undefined,
    timezone: (e.dates ?? [])[0]?.[1]?.tz ?? undefined,
    // The identity signal the event dedup arms actually run on; only 5.4% of
    // live events carry a resolved venue_id, so where this is null those arms
    // are blind. Top level, not metadata — a fallback is not the contract.
    venue_name: venueName ?? undefined,
    location: {
      lat: loc?.latitude ?? undefined,
      lng: loc?.longitude ?? undefined,
      address: loc?.address ?? undefined,
      city: loc?.city ?? undefined,
      countryCode: loc?.country_code ?? undefined,
    },
    postal_code: loc?.postal_code ?? undefined,
    state: loc?.region ?? undefined,
    images: imageUrls(e.assets),
    urls: [`https://www.agendaq.fr/fr/agenda/${e.slug}`],
    metadata: {
      agendaq_slug: e.slug,
      agendaq_taxons: e.taxons ?? [],
      agendaq_businesses: (e.businesses ?? []).map((x) => x.id),
      source_url: `https://www.agendaq.fr/fr/agenda/${e.slug}`,
      updated_on: e.updatedOn ?? null,
      // `schedule` has no slot in commit_event_staging_item, so it rides here
      // and `--phase schedule` applies it after commit. The raw rule is kept
      // alongside it: 446 monthly rules have no representation in
      // schedule.weekly[] and would otherwise leave no trace of why.
      agendaq_recurrence: rule ?? null,
      schedule: schedule ?? null,
    },
  };
}

/** Payload for `commit_health_service_org`. Keys are fixed by that RPC. */
function orgPayload(b: AgendaqBusiness, role: string) {
  const loc = flatLocation(b.locations);
  return {
    external_id: b.slug,
    source: SOURCE_NAME,
    name: b.name.trim(),
    ...(INCLUDE_PROSE && b.data?.descShort ? { description: b.data.descShort } : {}),
    slug_fallback: b.slug,
    enrichment_key: `${SOURCE_NAME}:${b.slug}`,
    address: loc?.address ?? null,
    city: loc?.city ?? null,
    postal_code: loc?.postal_code ?? null,
    country_code: loc?.country_code ?? null,
    latitude: loc?.latitude ?? null,
    longitude: loc?.longitude ?? null,
    email: b.data?.email ?? null,
    phone: b.data?.phone ?? null,
    website: b.data?.url ?? null,
    tags: [role === 'health' ? 'sexual-health' : role],
    target_terms: targetGroups(b),
    detail: {
      agendaq_slug: b.slug,
      agendaq_taxons: b.taxons ?? [],
      source_url: `https://www.agendaq.fr/fr/guide/${b.slug}`,
      role,
    },
  };
}

// ── phase: report ──────────────────────────────────────────────────────────

function phaseReport() {
  const corpus = loadCorpus().filter(inCountry);
  const lanes = new Map<string, number>();
  const cats = new Map<string, number>();
  const roles = new Map<string, number>();
  let noLoc = 0;
  for (const b of corpus) {
    const c = classify(b);
    lanes.set(c.lane, (lanes.get(c.lane) ?? 0) + 1);
    if (c.category) cats.set(c.category, (cats.get(c.category) ?? 0) + 1);
    if (c.orgRole) roles.set(c.orgRole, (roles.get(c.orgRole) ?? 0) + 1);
    if (!flatLocation(b.locations)) noLoc++;
  }
  const evs = dedupeEvents(corpus);
  let sched = 0;
  let recur = 0;
  for (const e of evs) {
    const rule = (e.dates ?? []).map(([, p]) => p).find((p) => p?.recurring);
    if (rule) recur++;
    if (toSchedule(rule)) sched++;
  }
  const show = (m: Map<string, number>) =>
    [...m]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');
  console.log(`businesses       ${corpus.length}`);
  console.log(`lanes            ${show(lanes)}`);
  console.log(`venue categories ${show(cats)}`);
  console.log(`org roles        ${show(roles)}`);
  console.log(`no location      ${noLoc}`);
  console.log(`events (distinct) ${evs.length}  recurring ${recur}  with schedule ${sched}`);
  console.log(`prose            ${INCLUDE_PROSE ? 'INCLUDED' : 'excluded (facts only)'}`);
}

// ── phase: stage ───────────────────────────────────────────────────────────

async function stageRows(
  rows: Array<{
    sourceId: string;
    entityType: string;
    targetTable: string;
    raw: unknown;
    norm: unknown;
  }>,
) {
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk
      .map(
        (r) =>
          `(${quote(SOURCE_NAME)},${quote(SOURCE_NAME)},${quote(r.sourceId)},${quote(r.entityType)},` +
          `${quote(r.targetTable)},${jsonb(r.raw)},${jsonb(r.norm)},${quote(NIL_UUID)}::uuid)`,
      )
      .join(',\n');
    if (DRY) {
      written += chunk.length;
      continue;
    }
    const res = await sql(`
insert into public.ingestion_staging
  (source_type, source_name, source_entity_id, entity_type, target_table, raw_data, normalized_data, job_id)
values
${values}
on conflict do nothing
returning id;`);
    written += Array.isArray(res) ? res.length : 0;
    console.log(`  staged ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  return written;
}

async function phaseStage() {
  requireConsent('stage');
  const corpus = loadCorpus().filter(inCountry);
  const venues = corpus.filter((b) => {
    const l = classify(b).lane;
    return l === 'venue' || l === 'other';
  });
  const events = dedupeEvents(corpus);

  const vRows = venues.slice(0, LIMIT).map((b) => ({
    sourceId: b.slug,
    entityType: 'venue',
    targetTable: 'venues',
    raw: b,
    norm: venuePayload(b),
  }));
  const eRows = events.slice(0, LIMIT).map((e) => ({
    sourceId: e.slug,
    entityType: 'event',
    targetTable: 'events',
    raw: e,
    norm: eventPayload(e),
  }));

  console.log(`${DRY ? '[dry-run] ' : ''}staging ${vRows.length} venues, ${eRows.length} events`);
  const v = await stageRows(vRows);
  const e = await stageRows(eRows);
  console.log(`venues staged ${v} · events staged ${e}`);
  if (DRY) {
    writeFileSync(join(OUT, 'sample-venue.json'), JSON.stringify(vRows[0]?.norm, null, 2));
    writeFileSync(join(OUT, 'sample-event.json'), JSON.stringify(eRows[0]?.norm, null, 2));
    console.log(`wrote sample payloads to ${OUT}/`);
  }
}

// ── phase: orgs ────────────────────────────────────────────────────────────

async function phaseOrgs() {
  requireConsent('orgs');
  const corpus = loadCorpus().filter(inCountry);
  const orgs = corpus
    .map((b) => ({ b, c: classify(b) }))
    .filter(({ c }) => c.lane === 'org' && (!ONLY_ROLE || c.orgRole === ONLY_ROLE))
    .slice(0, LIMIT);

  console.log(`${DRY ? '[dry-run] ' : ''}committing ${orgs.length} organizations`);
  if (DRY) {
    writeFileSync(
      join(OUT, 'sample-org.json'),
      JSON.stringify(orgPayload(orgs[0].b, orgs[0].c.orgRole!), null, 2),
    );
    console.log(`wrote ${OUT}/sample-org.json`);
    return;
  }

  let ok = 0;
  const errors: string[] = [];
  for (let i = 0; i < orgs.length; i += BATCH) {
    const chunk = orgs.slice(i, i + BATCH);
    // One statement per chunk, each row isolated: a single bad payload must not
    // take the batch down (the source-aids-ch rule — "141 of 201 committed"
    // plus the reason is actionable, a 500 with one Postgres message is not).
    const calls = chunk
      .map(
        ({ b, c }) =>
          `select public.commit_health_service_org(${jsonb(orgPayload(b, c.orgRole!))})`,
      )
      .join(';\n');
    try {
      await sql(calls + ';');
      ok += chunk.length;
      console.log(`  committed ${Math.min(i + BATCH, orgs.length)}/${orgs.length}`);
    } catch (err) {
      errors.push(`chunk @${i}: ${(err as Error).message}`);
    }
  }
  console.log(`organizations committed ${ok}/${orgs.length}`);
  if (errors.length) console.log(errors.slice(0, 10).join('\n'));
}

// ── phase: drain ───────────────────────────────────────────────────────────

/**
 * Push staged rows through validate -> dedup -> commit.
 *
 * WITHOUT THIS PHASE THE IMPORT DOES NOTHING VISIBLE. Rows land at
 * `disposition='pending'` and no DAG collects them: the ingestion pipelines
 * fetch from their OWN `source-*` functions, they do not sweep arbitrary
 * staging rows. Left pending they also trip
 * `pipeline_hygiene_stats().stale_pending_by_entity`, which hard-fails CI at
 * >48h pending per target_table — so staging without draining converts a
 * half-finished import into a broken build for everyone.
 *
 * Two target tables here, which the gays-cruising original did not have to
 * handle: `venues` and `events` are separate queues with separate commit RPCs,
 * and each entity type has to be drained with its own `entityType` or the stage
 * function silently processes the other one's rows.
 */
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';

/**
 * Serialised on purpose — the stage functions have no FOR UPDATE SKIP LOCKED,
 * so concurrent invocations grab the same rows. Fired through pg_net so the
 * internal-invoke secret is read from the vault rather than passed from here.
 */
async function firePipelineStage(fn: string, entityType: string, batchSize: number) {
  await sql(`
select net.http_post(
  url := 'https://${PROJECT}.supabase.co/functions/v1/${fn}',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer ${ANON_KEY}',
    'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')
  ),
  body := '{"entityType":"${entityType}","batch_size":${batchSize}}'::jsonb,
  timeout_milliseconds := 150000
);`);
}

async function countActionable(targetTable: string, predicate: string): Promise<number> {
  const res = await sql<Array<{ n: number }>>(`
select count(*)::int as n from public.ingestion_staging
where source_name=${quote(SOURCE_NAME)} and target_table=${quote(targetTable)}
  and disposition = 'pending' and ${predicate};`);
  return Number(res[0].n);
}

async function drainStage(
  label: string,
  fn: string,
  entityType: string,
  targetTable: string,
  predicate: string,
  batchSize: number,
): Promise<boolean> {
  let stallRounds = 0;
  let prev = await countActionable(targetTable, predicate);
  console.log(`[drain] ${label}: ${prev} pending`);

  while (prev > 0) {
    await firePipelineStage(fn, entityType, batchSize);
    await sleep(35_000);
    const now = await countActionable(targetTable, predicate);
    if (now >= prev) {
      // Not a retry loop: two rounds of no progress means something upstream is
      // wrong, and hammering it makes the diagnosis harder, not the drain faster.
      if (++stallRounds >= 2) {
        console.warn(`[drain] ${label}: STALLED at ${now} — stopping, inspect manually`);
        return false;
      }
    } else {
      stallRounds = 0;
    }
    prev = now;
    console.log(`[drain] ${label}: ${now} pending`);
  }
  return true;
}

async function statusBreakdown(targetTable: string, column: string) {
  return await sql<Array<{ k: string | null; n: number }>>(`
select ${column} as k, count(*)::int as n from public.ingestion_staging
where source_name=${quote(SOURCE_NAME)} and target_table=${quote(targetTable)}
group by 1 order by 2 desc;`);
}

async function drainEntity(entityType: string, targetTable: string, commitFn: string) {
  console.log(`\n=== draining ${targetTable} ===`);

  if (
    !(await drainStage(
      'validate',
      'pipeline-validate',
      entityType,
      targetTable,
      "ai_validation_status = 'pending'",
      500,
    ))
  )
    return 0;

  /*
   * Deliberate checkpoint, and it is tuned to THIS cohort rather than copied.
   * 13 of the 1,388 venues carry no location at all and 76 no category, so a
   * couple of warnings are expected and harmless (the needs_review threshold is
   * 3). A large needs_review share means a THIRD warning is firing across the
   * board — most likely an unresolved country or a missing address — and
   * thousands of rows are about to land in a human queue that already holds
   * ~2,300. Stop and look rather than push through.
   */
  const v = await statusBreakdown(targetTable, 'ai_validation_status');
  console.log(`[drain] validation:`, JSON.stringify(v));
  const needsReview = Number(v.find((r) => r.k === 'needs_review')?.n ?? 0);
  const vTotal = v.reduce((a, r) => a + Number(r.n), 0);
  if (vTotal && needsReview / vTotal > 0.05) {
    console.warn(
      `[drain] ${needsReview}/${vTotal} ${targetTable} rows are needs_review (>5%). Stopping\n` +
        `        before dedup — diagnose the third warning first.`,
    );
    return 0;
  }

  if (
    !(await drainStage(
      'dedup',
      'pipeline-deduplicate',
      entityType,
      targetTable,
      "ai_validation_status = 'approved' and dedup_status = 'pending'",
      500,
    ))
  )
    return 0;

  /*
   * Expected to be substantial and that is not a fault: measured against prod
   * before any of this ran, 498 of 1,333 agendaq venues already name-match an
   * existing QG venue in the same country (ES 55%, DE 66%, NL 69% — spartacus
   * and patroc got there first; FR is only 18%). Staging carries no city_id, so
   * the text-keyed arms score 0.88, below the 0.90 auto bar, and those land as
   * review pairs by design. A few hundred is the expected shape; a few thousand
   * would mean the blocking key is too loose to scale past this cohort.
   */
  const d = await statusBreakdown(targetTable, 'dedup_status');
  console.log(`[drain] dedup:`, JSON.stringify(d));

  let committed = 0;
  for (;;) {
    const res = await sql<Array<{ n: number }>>(
      `select count(*)::int as n from public.${commitFn}(200);`,
    );
    const n = Number(res[0].n);
    if (!n) break;
    committed += n;
    console.log(`[drain] ${targetTable} committed ${committed}`);
  }
  console.log(`[drain] ${targetTable} done — ${committed} committed this pass`);
  return committed;
}

async function phaseDrain() {
  requireConsent('drain');

  const venuesCommitted = await drainEntity('venue', 'venues', 'commit_venue_staging_batch');
  const eventsCommitted = await drainEntity('event', 'events', 'commit_event_staging_batch');

  /*
   * LANE SEPARATION is the invariant this whole import rests on: an association
   * or a CeGIDD testing centre must never reach `venues`, because that is
   * precisely what putting clinics on the map beside bars and saunas means.
   * Checked on the staging side rather than the venue side so it holds whatever
   * commit chooses to persist.
   */
  /*
   * `?|` IS THE WRONG OPERATOR HERE and the first draft used it: the taxons are
   * stored as jsonb NUMBERS, and `?|` tests for string elements, so
   * `'[70]'::jsonb ?| array['70']` is FALSE. That check reported zero leaks by
   * construction — it could not have detected one. Measured on prod before
   * fixing, not reasoned about. `jsonb_array_elements_text` casts first.
   *
   * `probe_detects_leak` is a POSITIVE CONTROL against a synthetic org-taxon
   * array, because `org_rows_in_venues: 0` is equally what a blind predicate
   * returns. If that column is ever false the zero means nothing.
   */
  const lane = await sql<
    Array<{ org_rows_in_venues: number; venue_rows: number; probe_detects_leak: boolean }>
  >(`
with orgtax(t) as (values ('64'),('68'),('71'),('101')),
     flagged as (
       select s.id,
              exists (
                select 1
                  from jsonb_array_elements_text(
                         coalesce(s.normalized_data->'metadata'->'agendaq_category_taxons', '[]'::jsonb)
                       ) e
                  join orgtax on orgtax.t = e.value
              ) as is_org
         from public.ingestion_staging s
        where s.source_name = ${quote(SOURCE_NAME)} and s.target_table = 'venues'
     )
select count(*) filter (where is_org)::int as org_rows_in_venues,
       count(*)::int                       as venue_rows,
       ( select exists (
           select 1 from jsonb_array_elements_text('[64,178]'::jsonb) e
             join orgtax on orgtax.t = e.value
         ) )                               as probe_detects_leak
  from flagged;`);
  console.log('[drain] lane separation:', JSON.stringify(lane[0]));
  if (lane[0]?.probe_detects_leak !== true) {
    console.error(
      `[drain] LANE PROBE BLIND — the predicate failed its own positive control.` +
        ` org_rows_in_venues=${lane[0]?.org_rows_in_venues} proves nothing.`,
    );
  } else if (Number(lane[0]?.org_rows_in_venues) > 0) {
    console.error(
      `[drain] LANE LEAK — ${lane[0].org_rows_in_venues} org-taxon rows staged as venues.`,
    );
  }

  /*
   * Cruising venues must be safety_gated in EVERY country, not only
   * criminalizing ones: `venues.safety_gated` is
   * `location_is_high_risk(...) OR category = 'cruising'`, and publishing a
   * cruising location to anonymous visitors is an outing exposure on its own.
   *
   * `ungated: 0` is ALSO what an empty result set returns, so the TOTAL is
   * reported first and a zero-row corpus after a non-zero commit is a FAILURE,
   * not a pass — the trap the gays-cruising drain records measuring live.
   */
  const g = await sql<Array<{ ungated_cruising: number; cruising: number; total: number }>>(`
select count(*) filter (where v.category = 'cruising' and not v.safety_gated)::int as ungated_cruising,
       count(*) filter (where v.category = 'cruising')::int as cruising,
       count(*)::int as total
  from public.venues v
  join public.venue_sources vs on vs.venue_id = v.id
 where vs.source_slug = ${quote(SOURCE_NAME)};`);
  console.log('[drain] gate check:', JSON.stringify(g[0]));
  const gTotal = Number(g[0]?.total ?? 0);
  if (venuesCommitted > 0 && gTotal === 0) {
    console.error(
      `[drain] PROBE BROKEN — committed ${venuesCommitted} venues but venue_sources has 0 for` +
        ` source_slug='${SOURCE_NAME}'. The gate was NOT verified; do not read this as clean.`,
    );
  } else if (Number(g[0]?.ungated_cruising) > 0) {
    console.error(`[drain] ${g[0].ungated_cruising} cruising venues are NOT safety_gated.`);
  }

  console.log(
    `\n[drain] summary: ${venuesCommitted} venues, ${eventsCommitted} events committed.` +
      `\n        next: --phase schedule (applies events.schedule to the recurring ones)`,
  );
}

// ── phase: schedule ────────────────────────────────────────────────────────

/**
 * Apply `events.schedule` AFTER the pipeline has committed the event rows.
 *
 * `commit_event_staging_item` has no `schedule` slot, and widening that shared
 * function is a far larger blast radius than this needs — so the rule rides in
 * `normalized_data.metadata.schedule` and lands here, joined through
 * `ingestion_staging.target_record_id`, which commit sets to the created row.
 *
 * Writing the column is enough: `trg_events_schedule_dates` fires on insert or
 * update of `schedule` and rebuilds `event_dates` itself. Nothing here touches
 * event_dates directly.
 */
async function phaseSchedule() {
  requireConsent('schedule');
  const sel = `
select s.target_record_id::text as event_id,
       s.normalized_data->'metadata'->'schedule' as schedule
from public.ingestion_staging s
where s.source_name = ${quote(SOURCE_NAME)}
  and s.entity_type = 'event'
  and s.target_record_id is not null
  and s.normalized_data->'metadata'->'schedule' is not null
  and jsonb_typeof(s.normalized_data->'metadata'->'schedule') = 'object'
  and exists (
    select 1 from public.events e
    where e.id = s.target_record_id and e.schedule is distinct from s.normalized_data->'metadata'->'schedule'
  )
limit ${Number.isFinite(LIMIT) ? LIMIT : 100000};`;
  const rows = await sql<Array<{ event_id: string; schedule: unknown }>>(sel);
  console.log(`${DRY ? '[dry-run] ' : ''}${rows.length} events need a schedule`);
  if (DRY || !rows.length) return;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk.map((r) => `(${quote(r.event_id)}::uuid, ${jsonb(r.schedule)})`).join(',');
    await sql(`
update public.events e
set schedule = v.sched
from (values ${values}) as v(id, sched)
where e.id = v.id;`);
    console.log(`  schedule applied ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
}

// ── main ───────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true });
const PHASES: Record<string, () => void | Promise<void>> = {
  fetch: phaseFetch,
  report: phaseReport,
  stage: phaseStage,
  drain: phaseDrain,
  orgs: phaseOrgs,
  schedule: phaseSchedule,
};
if (!PHASES[PHASE]) {
  console.error(`unknown --phase ${PHASE}; one of: ${Object.keys(PHASES).join(', ')}`);
  process.exit(1);
}
await PHASES[PHASE]();
