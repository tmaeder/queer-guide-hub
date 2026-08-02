#!/usr/bin/env node
// Verify every personality that carries a real Wikidata QID against that
// entity's actual occupation, and repair the ones bound to the wrong human.
//
// WHY
// ---
// Four edge functions used to resolve a QID with `wbsearchentities&limit=1` and
// take search[0] — no P31=Q5 check, no occupation check. A large share of this
// corpus are stage names, so those lookups bound performers to their famous
// namesakes and copied the stranger's birth date, death date and social handles
// onto the record: "Carl Sagan" → Q410, "Thomas Jefferson" → Q11812,
// "Alex Morgan" → Q233510 (the footballer). A 2026-08 sample of 134 adult-cohort
// QIDs measured 59.7% wrong.
//
// WHAT IT TOUCHES
// ---------------
// Only the namesake-inherited fields: wikidata_qid, birth_date, death_date,
// is_living, external_ids, and the row's `wikidata` personality_sources record.
// It NEVER writes name, bio, image_url, nationality or visibility — those
// describe the performer correctly and are not Wikidata-derived (exactly 1 of
// 2,534 adult rows carries a Commons image; the rest are the performers' own
// photos).
//
// SAFETY: auto-repair is restricted to the adult cohort. ~2,600 of the 4,676
// non-adult QID rows carry German professions and the 59.7% rate was never
// measured for them, so their conflicts are queued for a human instead. A false
// strip on a real historical LGBTQ+ figure is worse than a stale date.
//
// Run:
//   GEOCODE_TOKEN=sbp_... node scripts/data-quality/verify-personality-wikidata.mjs            # dry run, all
//   GEOCODE_TOKEN=sbp_... node scripts/data-quality/verify-personality-wikidata.mjs --apply --cohort adult
//
// Without a Management API token (Wikidata itself needs no auth):
//   node scripts/data-quality/verify-personality-wikidata.mjs \
//     --cohort all --rows rows.json --emit-sql repair.sql
//
// Flags:
//   --apply            execute the writes (default is a dry run)
//   --cohort adult|all which rows to verify
//   --limit N          cap the number of rows
//   --verbose          print every verdict, not just conflicts
//   --rows <file>      read target rows from JSON instead of the Management API
//   --emit-sql <file>  write the repair SQL to a file instead of executing it

import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';

import { keywordsFor, hasProfessionMapping, scoreOccupationMatch }
  from '../../supabase/functions/_shared/profession-keywords.js';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const MGMT = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const TOKEN = process.env.GEOCODE_TOKEN;
const UA = 'QueerGuide/1.0 (https://queer.guide; contact@queer.guide) personality-wikidata-verify';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose');
const COHORT = (args[args.indexOf('--cohort') + 1] || 'all').toLowerCase();
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
// Write the repair SQL to a file instead of executing it. Lets the sweep run
// with no Management API token (Wikidata itself needs no auth) so the SQL can be
// reviewed and applied through whatever channel the operator already has.
const EMIT_SQL = args.includes('--emit-sql') ? args[args.indexOf('--emit-sql') + 1] : null;
// Row source override, for the same reason: `--rows <file>` reads the target
// rows from JSON rather than querying via the Management API.
const ROWS_FILE = args.includes('--rows') ? args[args.indexOf('--rows') + 1] : null;

// Wikidata allows 50 ids per wbgetentities call.
const WD_BATCH = 50;
// personalities feeds search_documents through a trigger; a large UPDATE is
// dominated by that sync and a statement timeout is a full rollback.
const WRITE_BATCH = 200;

// Executed directly vs imported. The verdict logic is exported so it can be
// exercised against known QIDs without a Management API token — see the
// dry-run instructions above and the tests in
// src/lib/__tests__/personalityWikidataResolve.test.ts.
const IS_MAIN = import.meta.url === `file://${process.argv[1]}`;

if (IS_MAIN) {
  // A token is only needed for the paths that actually talk to the Management
  // API: reading rows (unless --rows) and writing (unless --emit-sql).
  const needsToken = !ROWS_FILE || (APPLY && !EMIT_SQL);
  if (needsToken && !TOKEN) {
    console.error('GEOCODE_TOKEN not set (or pass --rows <file> and --emit-sql <file>)');
    process.exit(1);
  }
  if (!['all', 'adult'].includes(COHORT)) { console.error('--cohort must be all|adult'); process.exit(1); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sq = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

async function fetchT(url, opts = {}, timeoutMs = 30000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

async function mgmt(sql, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchT(MGMT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 QueerGuide/1.0',
        },
        body: JSON.stringify({ query: sql }),
      }, 60000);
      const body = await res.text();
      if (res.ok) return body ? JSON.parse(body) : [];
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error(`mgmt ${res.status}: ${body.slice(0, 300)}`);
    } catch (e) { if (i === tries - 1) throw e; await sleep(2000 * (i + 1)); }
  }
}

// --- Wikidata ---------------------------------------------------------------

const labelCache = new Map();

export async function wbGetEntities(ids, props) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}`
    + `&props=${props}&languages=en&format=json`;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetchT(url, { headers: { 'User-Agent': UA } }, 40000);
      if (res.ok) return (await res.json()).entities ?? {};
      await sleep(1500 * (i + 1));
    } catch { await sleep(1500 * (i + 1)); }
  }
  return {};
}

/** Resolve P106 occupation QIDs → lowercased English labels, batched + cached. */
async function resolveOccupationLabels(qids) {
  const missing = [...new Set(qids)].filter((q) => !labelCache.has(q));
  for (let i = 0; i < missing.length; i += WD_BATCH) {
    const batch = missing.slice(i, i + WD_BATCH);
    const ents = await wbGetEntities(batch, 'labels');
    for (const q of batch) {
      labelCache.set(q, (ents[q]?.labels?.en?.value ?? '').toLowerCase());
    }
    await sleep(300);
  }
  return qids.map((q) => labelCache.get(q)).filter(Boolean);
}

const RANK_ORDER = { preferred: 2, normal: 1, deprecated: 0 };
function claimIds(entity, prop) {
  const claims = entity?.claims?.[prop];
  if (!Array.isArray(claims)) return [];
  return claims
    .filter((c) => c.rank !== 'deprecated')
    .sort((a, b) => (RANK_ORDER[b.rank] ?? 1) - (RANK_ORDER[a.rank] ?? 1))
    .map((c) => c.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
}

// --- Verdict ----------------------------------------------------------------

/**
 * confirmed    — human, and the entity's occupation overlaps the local profession
 * conflict     — human, but occupations are disjoint from the profession
 * unverifiable — entity missing/redirected, not a human, or profession unmappable
 */
export async function verdictFor(row, entity) {
  const label = entity?.labels?.en?.value ?? null;
  const description = entity?.descriptions?.en?.value ?? '';

  // Decisive on its own, checked BEFORE any occupation reasoning: commercial
  // adult film does not predate 1900, so an is_adult row with a pre-1900 birth
  // date is a namesake match no matter what the entity's occupations say.
  //
  // This is not redundant with the occupation check — it is what that check
  // cannot see. In the 2026-08 sweep, 22 such rows survived as "unverifiable"
  // because 21 of them carry NO P106 at all (a Mayflower passenger, a Count of
  // Lippe-Detmold, two Holocaust victims, a Baltimore merchant, an American
  // judge) and one, Q60665 "Cole Turner", is a fictional character from Charmed
  // and so failed the P31=Q5 human test. Every one was plainly wrong, and the
  // conservative branches spared all of them.
  if (row.is_adult && row.birth_date && row.birth_date < '1900-01-01') {
    return {
      verdict: 'conflict',
      reason: 'impossible_birthdate_for_adult_cohort',
      label, description, occupations: [],
    };
  }

  if (!entity || entity.missing !== undefined) {
    return { verdict: 'unverifiable', reason: 'entity_missing', label: null, occupations: [] };
  }

  if (!claimIds(entity, 'P31').includes('Q5')) {
    return { verdict: 'unverifiable', reason: 'not_human', label, description, occupations: [] };
  }
  // No usable profession → we cannot judge the match either way. Refusing to
  // score here is what keeps the German cohort out of the destructive path.
  if (!hasProfessionMapping(row.profession)) {
    return { verdict: 'unverifiable', reason: 'profession_unmapped', label, description, occupations: [] };
  }

  const occupations = await resolveOccupationLabels(claimIds(entity, 'P106'));
  const keywords = keywordsFor(row.profession);
  const score = scoreOccupationMatch(occupations, keywords);

  // The English description is a second corroboration channel, and it matters:
  // P106 is frequently sparse or uses a narrower term than the description.
  // "Brandan Robertson" (local profession "LGBTQ+ rights activist") carries P106
  // writer/blogger/pastor but is described as "Christian writer, activist, and
  // speaker" — occupation-only scoring called that a namesake conflict when it
  // is plainly the same person.
  //
  // This only ever RESCUES a match, never creates one: it requires the same
  // profession keywords. Carl Sagan ("American astrophysicist, cosmologist and
  // author") still fails every adult-performer keyword, so the conflicts that
  // motivated this sweep are unaffected.
  const desc = (description ?? '').toLowerCase();
  const descHit = keywords.some((k) => desc.includes(k));

  if (score > 0 || descHit) {
    return { verdict: 'confirmed', reason: 'occupation_match', label, description, occupations, score };
  }
  if (!occupations.length) {
    // Human with no occupation recorded at all — cannot prove a conflict.
    return { verdict: 'unverifiable', reason: 'no_occupation', label, description, occupations };
  }
  return { verdict: 'conflict', reason: 'occupation_disjoint', label, description, occupations, score };
}

// --- Repair -----------------------------------------------------------------

function repairSql(row, v) {
  const details = JSON.stringify({
    previous_qid: row.wikidata_qid,
    wikidata_label: v.label,
    wikidata_description: v.description,
    wikidata_occupations: v.occupations,
    local_profession: row.profession,
    cleared: ['birth_date', 'death_date', 'is_living', 'external_ids', 'wikidata_qid'],
    reason: 'namesake_conflict',
  });
  return `
-- ${row.name} :: ${row.wikidata_qid} (${v.label ?? '?'})
update public.personalities set
  wikidata_qid = 'SKIP_' || gen_random_uuid()::text,
  birth_date   = null,
  death_date   = null,
  is_living    = null,
  external_ids = '{}'::jsonb,
  field_provenance = coalesce(field_provenance, '{}'::jsonb) || jsonb_build_object(
    'wikidata_qid', jsonb_build_object(
      'source', 'verify-personality-wikidata',
      'verdict', 'namesake_conflict',
      'cleared_at', now(),
      'previous_qid', ${sq(row.wikidata_qid)}
    )),
  needs_attention = true,
  updated_at = now()
where id = ${sq(row.id)};

delete from public.personality_sources
 where personality_id = ${sq(row.id)} and source_slug = 'wikidata';

insert into public.personality_quality_signals (personality_id, signal_type, value, weight, source, details)
values (${sq(row.id)}, 'verification', 0, 1.0, 'verify-personality-wikidata', ${sq(details)}::jsonb);
`;
}

function queueSql(row, v) {
  // `value` is the scalar approve_entity_review() will write into
  // personalities.wikidata_qid via review_field_registry
  // ('personality','wikidata_qid', apply_mode='text_required'). Everything else
  // is evidence for the reviewer and is ignored by the apply step.
  //
  // A descriptor object here instead of a scalar would make approval write JSON
  // into the column; an unregistered field would make it raise 22023. Both were
  // true before migration 20260807180000.
  const proposed = JSON.stringify({
    value: `SKIP_${randomUUID()}`,
    action: 'clear_wikidata_link',
    current_qid: row.wikidata_qid,
    wikidata_label: v.label,
    wikidata_description: v.description,
    wikidata_occupations: v.occupations,
    local_profession: row.profession,
    local_birth_date: row.birth_date,
    reason: v.reason,
  });
  const citations = JSON.stringify([{ url: `https://www.wikidata.org/wiki/${row.wikidata_qid}` }]);
  return `
insert into public.entity_review_queue (entity_type, entity_id, field, proposed_value, citations, confidence, model, status)
select 'personality', ${sq(row.id)}, 'wikidata_qid', ${sq(proposed)}::jsonb, ${sq(citations)}::jsonb, 0.8, 'verify-personality-wikidata', 'open'
where not exists (
  select 1 from public.entity_review_queue
   where entity_type = 'personality' and entity_id = ${sq(row.id)}
     and field = 'wikidata_qid' and status = 'open'
);
`;
}

// --- Main -------------------------------------------------------------------

async function main() {
  const cohortFilter = COHORT === 'adult' ? 'and is_adult' : '';
  console.log(`[${new Date().toISOString()}] cohort=${COHORT} apply=${APPLY}`);

  const rows = ROWS_FILE
    ? JSON.parse(readFileSync(ROWS_FILE, 'utf8'))
    : await mgmt(`
    select id::text, name, profession, is_adult, wikidata_qid,
           birth_date::text, death_date::text
      from public.personalities
     where wikidata_qid like 'Q%' ${cohortFilter}
     order by is_adult desc, name
  `);
  const targets = rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT);
  console.log(`rows to verify: ${targets.length}`);

  const stats = { confirmed: 0, conflict: 0, unverifiable: 0, repaired: 0, queued: 0 };
  const reasons = {};
  const repairs = [];
  const queues = [];

  for (let i = 0; i < targets.length; i += WD_BATCH) {
    const batch = targets.slice(i, i + WD_BATCH);
    const entities = await wbGetEntities(batch.map((r) => r.wikidata_qid), 'labels|descriptions|claims');

    for (const row of batch) {
      const v = await verdictFor(row, entities[row.wikidata_qid]);
      stats[v.verdict]++;
      reasons[v.reason] = (reasons[v.reason] ?? 0) + 1;

      if (VERBOSE || v.verdict === 'conflict') {
        console.log(`  ${v.verdict.padEnd(12)} ${row.name} [${row.profession ?? '—'}] `
          + `→ ${row.wikidata_qid} ${v.label ?? ''} (${v.description ?? ''})`);
      }

      if (v.verdict !== 'conflict') continue;
      // Auto-repair ONLY the adult cohort — see the safety note at the top.
      if (row.is_adult) { repairs.push(repairSql(row, v)); stats.repaired++; }
      else { queues.push(queueSql(row, v)); stats.queued++; }
    }
    await sleep(400);
    if ((i / WD_BATCH) % 10 === 0) {
      console.log(`  …${Math.min(i + WD_BATCH, targets.length)}/${targets.length}`);
    }
  }

  console.log('\n--- verdicts ---');
  console.table(stats);
  console.log('reasons:', reasons);

  const writes = [...repairs, ...queues];

  // --emit-sql writes the statements out instead of executing them, so the
  // sweep is usable without a Management API token and the SQL can be reviewed
  // before it touches anything.
  if (EMIT_SQL) {
    writeFileSync(EMIT_SQL, writes.join('\n'));
    console.log(`\nWrote ${writes.length} statements to ${EMIT_SQL} `
      + `(${repairs.length} adult repairs, ${queues.length} review-queue inserts).`);
    return;
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — would repair ${repairs.length} adult rows, queue ${queues.length} for review.`);
    console.log('Re-run with --apply to write.');
    return;
  }

  for (let i = 0; i < writes.length; i += WRITE_BATCH) {
    const chunk = writes.slice(i, i + WRITE_BATCH);
    const started = Date.now();
    await mgmt(`begin;\n${chunk.join('\n')}\ncommit;`);
    console.log(`  wrote ${Math.min(i + WRITE_BATCH, writes.length)}/${writes.length} `
      + `(${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
  console.log(`\nDone. repaired=${stats.repaired} queued=${stats.queued}`);
}

if (IS_MAIN) main().catch((e) => { console.error(e); process.exit(1); });
