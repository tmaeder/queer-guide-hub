#!/usr/bin/env node
// Retract (or restore) personality birth dates that are Wikidata
// coarse-precision artifacts rather than real dates.
//
// WHY
// ---
// 13 personalities carried birth_date = 1901-01-01, 10 carried 1970-01-01 and 2
// carried 1900-01-01 — all living contemporary artists and activists, and
// /personalities/zebra-katz published "Born 1 January 1901" as fact.
//
// They are not import sentinels and not Unix epoch. A Wikidata time value is
// always zero-padded to a full date and carries a SEPARATE `precision` field
// (11=day, 10=month, 9=year, 8=decade, 7=century). Measured live 2026-08-23:
//
//   Zebra Katz     Q16205945  P569 = "+1901-00-00T00:00:00Z"  precision 7
//   Cakes da Killa Q16205240  P569 = "+1990-10-12T00:00:00Z"  precision 11
//
// Precision 7 is "20th century"; the "00"s mean "not stated". Reading the claim
// without its precision and padding "00" → "01" turns that into 1 January 1901.
// Decade precision (8) does the same to the 1970s ("+1970-00-00") and the 1900s
// ("+1900-00-00"), which is all three observed values from one mechanism.
// The writer was supabase/functions/pipeline-enrich-personality (readClaim +
// a local formatDate); it is fixed to use readTimeClaim in the same change as
// this script. Run the repair only after that function is deployed, or the next
// enrichment pass writes the artifacts straight back.
//
// WHY A SCRIPT AND NOT A MIGRATION
// --------------------------------
// 1901-01-01 is ALSO a real birthday, and a year-precision snak legitimately
// stores as YYYY-01-01 throughout this corpus. Nothing in the row separates the
// artifact from the real value — only re-reading the source snak does, and a
// migration must not depend on the network. So the deterministic half (the
// is_living correction + an advisory needs_attention flag) ships as
// 20260919100000_personality_date_plausibility_guard.sql, and the half that
// needs evidence lives here.
//
// Per row this yields one of four verdicts:
//   restore      Wikidata has a BETTER date (precision 11) → write it
//   keep         Wikidata agrees with what is stored → no write, it was real
//   retract      Wikidata is coarser than year, or has no P569 → birth_date = NULL
//   unverifiable no QID, or the entity is gone → reported, never written
//
// A retraction preserves the old value under field_provenance.birth_date so the
// decision is auditable and reversible.
//
// Run:
//   GEOCODE_TOKEN=sbp_... node scripts/data-quality/repair-personality-sentinel-dates.mjs
//   GEOCODE_TOKEN=sbp_... node scripts/data-quality/repair-personality-sentinel-dates.mjs --apply
//
// Without a Management API token (Wikidata itself needs no auth):
//   node scripts/data-quality/repair-personality-sentinel-dates.mjs \
//     --rows rows.json --emit-sql repair.sql
//
// Flags:
//   --apply             execute the writes (default is a dry run)
//   --scope measured    default; only the three measured artifact values
//   --scope boundary    every 1-Jan date on a decade/century boundary (wider,
//                       mostly legitimate year-precision rows that verify clean)
//   --limit N           cap the number of rows
//   --verbose           print every verdict, not just the ones that change
//   --rows <file>       read target rows from JSON instead of the Management API
//   --emit-sql <file>   write the repair SQL to a file instead of executing it

import { writeFileSync, readFileSync } from 'node:fs';

import { wbGetEntities } from './verify-personality-wikidata.mjs';

const PROJECT = 'xqeacpakadqfxjxjcewc';
const MGMT = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;
const TOKEN = process.env.GEOCODE_TOKEN;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const VERBOSE = args.includes('--verbose');
const SCOPE = (args[args.indexOf('--scope') + 1] || 'measured').toLowerCase();
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const EMIT_SQL = args.includes('--emit-sql') ? args[args.indexOf('--emit-sql') + 1] : null;
const ROWS_FILE = args.includes('--rows') ? args[args.indexOf('--rows') + 1] : null;

// Wikidata allows 50 ids per wbgetentities call.
const WD_BATCH = 50;
// personalities feeds search_documents through a trigger; a large UPDATE is
// dominated by that sync and a statement timeout is a full rollback.
const WRITE_BATCH = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sq = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

async function mgmt(sql, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(MGMT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 QueerGuide/1.0',
        },
        body: JSON.stringify({ query: sql }),
      });
      const body = await res.text();
      if (res.ok) return body ? JSON.parse(body) : [];
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error(`mgmt ${res.status}: ${body.slice(0, 300)}`);
    } catch (e) { if (i === tries - 1) throw e; await sleep(2000 * (i + 1)); }
  }
}

// --- Wikidata time claims ---------------------------------------------------

const RANK_ORDER = { preferred: 2, normal: 1, deprecated: 0 };

/**
 * Rank- AND precision-aware read of a time claim — the same contract as
 * readTimeClaim() in supabase/functions/_shared/wikidata-resolve.ts, restated
 * here because that module is Deno TypeScript and this is plain node ESM.
 * Kept behaviourally identical on purpose: if the two ever disagree, the
 * repair would fight the enrichment function that writes the column.
 *
 * Returns null for anything coarser than YEAR precision. That refusal is the
 * entire point — rounding a century to its first January is what produced the
 * rows this script exists to clean up.
 */
export function readTimeClaim(entity, prop, minPrecision = 9) {
  const claims = entity?.claims?.[prop];
  if (!Array.isArray(claims)) return null;
  const ranked = claims
    .filter((c) => c.rank !== 'deprecated')
    .sort((a, b) => (RANK_ORDER[b.rank] ?? 1) - (RANK_ORDER[a.rank] ?? 1));

  for (const st of ranked) {
    // somevalue/novalue snaks carry no datavalue — "known to be unknown",
    // which is not the same as absent, and is never a date.
    const v = st.mainsnak?.datavalue?.value;
    const time = v?.time;
    if (!time) continue;

    const precision = typeof v.precision === 'number' ? v.precision : 0;
    if (precision < minPrecision) continue;

    // BCE ("-0500-…") and malformed values fall out here.
    const m = time.match(/^\+(\d{4,})-(\d{2})-(\d{2})/);
    if (!m) continue;

    const year = m[1].padStart(4, '0');
    if (year === '0000') continue;
    const month = precision >= 10 && m[2] !== '00' ? m[2] : '01';
    const day = precision >= 11 && m[3] !== '00' ? m[3] : '01';
    return { date: `${year}-${month}-${day}`, precision, exact: precision >= 11 };
  }
  return null;
}

// --- Candidate selection ----------------------------------------------------

// The three values measured on prod. Every one is a decade or century boundary
// rendered as 1 January, which is exactly what precision 7/8 degrades into.
const MEASURED = ["'1901-01-01'", "'1970-01-01'", "'1900-01-01'"];

// A 1-Jan date whose year ends a decade or opens a century is INDISTINGUISHABLE
// from a coarse-precision artifact by inspection — which is why every one of
// them has to be re-read from the source rather than pattern-matched.
const BOUNDARY_PREDICATE = `
      extract(month from birth_date) = 1
  and extract(day   from birth_date) = 1
  and (extract(year from birth_date)::int % 10 = 0
    or extract(year from birth_date)::int % 100 = 1)`;

function candidateSql() {
  const where = SCOPE === 'boundary'
    ? BOUNDARY_PREDICATE
    : `birth_date in (${MEASURED.join(', ')})`;
  return `
    select id, name, slug, birth_date::text as birth_date, death_date::text as death_date,
           is_living, wikidata_qid, visibility
      from public.personalities
     where birth_date is not null
       and duplicate_of_id is null
       and (${where})
     order by visibility = 'public' desc, name`;
}

// --- Verdict ----------------------------------------------------------------

function verdictFor(row, entity) {
  if (!row.wikidata_qid) {
    return { verdict: 'unverifiable', why: 'no wikidata_qid — nothing to re-read the date from' };
  }
  if (!entity || entity.missing !== undefined) {
    return { verdict: 'unverifiable', why: `entity ${row.wikidata_qid} missing or redirected` };
  }

  const birth = readTimeClaim(entity, 'P569');

  if (!birth) {
    const raw = entity.claims?.P569?.[0]?.mainsnak?.datavalue?.value;
    return {
      verdict: 'retract',
      why: raw?.time
        ? `P569 is "${raw.time}" at precision ${raw.precision} — coarser than year`
        : 'no usable P569 statement',
      newDate: null,
    };
  }
  if (birth.date === row.birth_date) {
    return { verdict: 'keep', why: `P569 precision ${birth.precision} agrees with the stored value` };
  }
  return {
    verdict: 'restore',
    why: `P569 precision ${birth.precision} gives ${birth.date}`,
    newDate: birth.date,
  };
}

/**
 * Death dates carry the identical defect, but retracting one silently changes
 * what `is_living` means on the row — every writer in the codebase derives it
 * from "no death date recorded". So this only REPORTS them; a death-date
 * retraction is a decision for a human, not a sweep.
 */
function deathNote(row, entity) {
  if (!row.death_date || !entity || entity.missing !== undefined) return null;
  const death = readTimeClaim(entity, 'P570');
  if (death && death.date === row.death_date) return null;
  const raw = entity.claims?.P570?.[0]?.mainsnak?.datavalue?.value;
  if (!raw?.time) return `death_date ${row.death_date} stored but Wikidata has no P570`;
  if (!death) return `death_date ${row.death_date} is precision ${raw.precision} — coarser than year`;
  return `death_date ${row.death_date} disagrees with P570 ${death.date}`;
}

// --- SQL --------------------------------------------------------------------

/**
 * The prior value is preserved under field_provenance.birth_date. Unpublishing
 * a claim should record what was removed and why — a bare `set birth_date =
 * null` throws away the only evidence that the row was ever wrong.
 *
 * needs_attention is deliberately NOT cleared: the advisory trigger may have
 * raised it, but so may half a dozen unrelated signals, and this sweep cannot
 * see them. run_needs_attention_recompute is the layer that clears it.
 */
function repairSql(row, v) {
  const prov = JSON.stringify({
    birth_date: {
      source: v.verdict === 'retract' ? 'retracted:wikidata_coarse_precision' : 'wikidata',
      previous: row.birth_date,
      applied: v.newDate,
      reason: v.why,
      wikidata_qid: row.wikidata_qid,
    },
  });
  return `update public.personalities
     set birth_date = ${v.newDate ? sq(v.newDate) : 'null'}::date,
         field_provenance = coalesce(field_provenance, '{}'::jsonb) || ${sq(prov)}::jsonb
   where id = ${sq(row.id)};`;
}

// --- Main -------------------------------------------------------------------

async function main() {
  const needsToken = !ROWS_FILE || (APPLY && !EMIT_SQL);
  if (needsToken && !TOKEN) {
    console.error('GEOCODE_TOKEN not set (or pass --rows <file> and --emit-sql <file>)');
    process.exit(1);
  }
  if (!['measured', 'boundary'].includes(SCOPE)) {
    console.error('--scope must be measured|boundary');
    process.exit(1);
  }

  const all = ROWS_FILE
    ? JSON.parse(readFileSync(ROWS_FILE, 'utf8'))
    : (await mgmt(candidateSql()))?.[0]?.result ?? [];
  const rows = all.slice(0, LIMIT);
  console.log(`scope=${SCOPE} candidates=${rows.length}${rows.length < all.length ? ` (of ${all.length})` : ''}`);
  if (!rows.length) return;

  const counts = { restore: 0, keep: 0, retract: 0, unverifiable: 0 };
  const writes = [];

  for (let i = 0; i < rows.length; i += WD_BATCH) {
    const batch = rows.slice(i, i + WD_BATCH);
    const qids = [...new Set(batch.map((r) => r.wikidata_qid).filter(Boolean))];
    const ents = qids.length ? await wbGetEntities(qids, 'claims|labels') : {};

    for (const row of batch) {
      const entity = row.wikidata_qid ? ents[row.wikidata_qid] : null;
      const v = verdictFor(row, entity);
      counts[v.verdict]++;

      const changes = v.verdict === 'retract' || v.verdict === 'restore';
      if (changes) writes.push(repairSql(row, v));

      if (changes || VERBOSE) {
        const arrow = v.verdict === 'retract' ? '→ NULL' : v.verdict === 'restore' ? `→ ${v.newDate}` : '';
        console.log(`  [${v.verdict}] ${row.name} (${row.slug}) ${row.birth_date} ${arrow}`);
        console.log(`      ${v.why}`);
      }
      const dn = deathNote(row, entity);
      if (dn) console.log(`      NOTE ${row.name}: ${dn} (report only — not written)`);
    }
    await sleep(300);
  }

  console.log(`\nverdicts: ${JSON.stringify(counts)} — ${writes.length} rows would change`);

  if (EMIT_SQL) {
    writeFileSync(EMIT_SQL, writes.join('\n') + '\n');
    console.log(`wrote ${writes.length} statements to ${EMIT_SQL}`);
    return;
  }
  if (!APPLY) {
    console.log('DRY RUN — re-run with --apply to write.');
    return;
  }
  for (let i = 0; i < writes.length; i += WRITE_BATCH) {
    await mgmt(writes.slice(i, i + WRITE_BATCH).join('\n'));
    console.log(`  applied ${Math.min(i + WRITE_BATCH, writes.length)}/${writes.length}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
