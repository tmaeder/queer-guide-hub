#!/usr/bin/env node
/**
 * Vector-arm relevance gate for `search_hybrid`.
 *
 * WHY THIS EXISTS SEPARATELY FROM run.mjs. `run.mjs` calls the RPC with
 * `p_query_vec = null` on purpose, so it is deterministic in CI — which also means
 * it exercises the keyword leg ONLY and is structurally blind to every defect that
 * lives in the vector leg or in the RRF fusion between the two. That blindness is
 * how prod shipped a `/search?q=fentanyl test strips` that returned 66 hits, all of
 * them apparel, while the golden set stayed green (see
 * 20260823225808_search_hybrid_keyword_precedence.sql).
 *
 * THE PROBLEM THIS SOLVES. A real gate needs a real query embedding, and bge-m3
 * lives in the CF worker, not in Postgres — there is no way to embed a query from
 * here. So the vector arm is simulated ADVERSARIALLY: `p_query_vec` is set to the
 * stored embedding of a document that is NOT a keyword match for the query. That is
 * precisely the shape of the live defect, and unlike a single captured vector it
 * holds for any corpus, so this is a property test rather than an anecdote.
 *
 * THE INVARIANT. In a hybrid call, a hit that fails the keyword predicate
 * (`search_tsv @@ q` OR `title % q`) must not rank above a hit that satisfies it.
 * Semantic proximity is allowed to ADD recall; it is not allowed to displace a
 * lexical match. Violations are counted as ordering inversions in the top-K.
 *
 * The candidate function is installed in `pg_temp` for the duration of ONE
 * Management-API request, so nothing is written to the public schema and nothing
 * has to be cleaned up. This endpoint is for reads and ad-hoc measurement only —
 * migrations ship through CI `db push` (see raw_mgmt_api_sql_blocks_all_migrations).
 *
 * Usage:
 *   node scripts/search-eval/vector-arm.mjs                       # gate the LIVE function
 *   node scripts/search-eval/vector-arm.mjs --candidate <mig.sql> # A/B live vs candidate
 *   node scripts/search-eval/vector-arm.mjs --detail "leather bar"
 *
 * Needs SUPABASE_ACCESS_TOKEN (env, .env.local or .env) — same as the migration checks.
 * Without it: prints a skip notice and exits 0, so an opt-in workflow stays green.
 */
import { readFileSync } from 'node:fs';
import { PROJECT_REF, resolveToken } from '../lib/remote-migrations.mjs';

const TOKEN = resolveToken();
if (!TOKEN) {
  console.log('[vector-arm] SUPABASE_ACCESS_TOKEN not set — skipping (exit 0).');
  process.exit(0);
}

const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
};
const CANDIDATE = argOf('--candidate');
const DETAIL = argOf('--detail');
const TOPK = Number(argOf('--topk') ?? 20);

/** Probe set: queries whose right answer is lexical, plus broad ones where it is not. */
const QUERIES = [
  ['fentanyl test strips', ['marketplace']],
  ['naloxone', ['marketplace']],
  ['harm reduction', null],
  ['binder', ['marketplace']],
  ['berghain berlin', ['venue']],
  ['leather bar', ['venue']],
  ['sauna', ['venue']],
  ['drag show', null],
  ['harvey milk', ['personality']],
  ['pride', null],
  ['trans friendly', null],
  ['wheelchair accessible venue', null],
];

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      // A bare fetch UA gets a Cloudflare 1010 on this endpoint.
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 2000)}`);
  return JSON.parse(text);
}

/**
 * Lift the candidate `search_hybrid` body out of a migration file and rebind it as
 * a pg_temp function, so the candidate under test is byte-identical to the one that
 * will ship rather than a hand-copy that can drift from it.
 */
function candidateDdl(path) {
  const src = readFileSync(path, 'utf8');
  const start = src.indexOf('CREATE OR REPLACE FUNCTION public.search_hybrid(');
  if (start < 0) throw new Error(`no search_hybrid definition in ${path}`);
  const end = src.indexOf('$function$;', start);
  if (end < 0) throw new Error(`unterminated $function$ block in ${path}`);
  return (
    src
      .slice(start, end + '$function$;'.length)
      .replace(
        'CREATE OR REPLACE FUNCTION public.search_hybrid(',
        'CREATE FUNCTION pg_temp.search_hybrid_ab(',
      )
      // SECURITY DEFINER is meaningless on a temp function and the API role is postgres.
      .replace(/\n\s*STABLE SECURITY DEFINER/, '\n STABLE')
  );
}

const QVALUES = QUERIES.map(
  ([q, t]) => `(${lit(q)}, ${t ? `array[${t.map(lit).join(',')}]::text[]` : 'null::text[]'})`,
).join(',\n    ');

function lit(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/**
 * One self-contained script: install the candidate (if any) into pg_temp, then
 * probe every (query, variant) pair and return one row per pair. A single request
 * is a single session, which is what makes pg_temp viable here.
 */
function buildScript() {
  const variants = CANDIDATE
    ? `('live','public.search_hybrid'),('candidate','pg_temp.search_hybrid_ab')`
    : `('live','public.search_hybrid')`;

  return `
${CANDIDATE ? candidateDdl(CANDIDATE) : ''}

-- Deterministic adversarial vector: the embedding of a document that is NOT a
-- keyword match for the query. Same vector for both variants, so the comparison
-- isolates the ranking change.
create or replace function pg_temp.adv_vec(p_q text) returns extensions.vector
language sql stable as $ADV$
  select se.embedding
  from public.search_embeddings se
  join public.search_documents sd on sd.doc_id = se.doc_id
  where se.embedding is not null
    and not (sd.search_tsv @@ websearch_to_tsquery('simple', unaccent(p_q)) or sd.title % p_q)
  order by md5(sd.doc_id::text || p_q)
  limit 1
$ADV$;

create or replace function pg_temp.probe(p_fn text, p_q text, p_types text[], p_n int)
returns table(rk int, kw_hit boolean, entity_type text, title text, score numeric, ms numeric)
language plpgsql stable as $PROBE$
declare t0 timestamptz; payload jsonb; v extensions.vector; elapsed numeric;
begin
  v := pg_temp.adv_vec(p_q);
  t0 := clock_timestamp();
  execute format(
    'select %s($1,$2,$3,''{}''::jsonb,null,null,null,now(),$4,0,null,null,null,null,null)', p_fn)
    into payload using p_q, v, p_types, p_n;
  elapsed := extract(epoch from (clock_timestamp() - t0)) * 1000;
  return query
    select h.ord::int,
           (sd.search_tsv @@ websearch_to_tsquery('simple', unaccent(p_q)) or sd.title % p_q),
           h.hit->>'type', h.hit->>'title', (h.hit->>'_rankingScore')::numeric, elapsed
    from (select hit, row_number() over () ord
          from jsonb_array_elements(payload->'hits') hit) h
    join public.search_documents sd
      on sd.entity_id = (h.hit->>'objectID')::uuid and sd.entity_type = h.hit->>'type';
end $PROBE$;

create or replace function pg_temp.total(p_fn text, p_q text, p_types text[]) returns int
language plpgsql stable as $TOT$
declare payload jsonb;
begin
  execute format(
    'select %s($1,$2,$3,''{}''::jsonb,null,null,null,now(),1,0,null,null,null,null,null)', p_fn)
    into payload using p_q, pg_temp.adv_vec(p_q), p_types;
  return (payload->>'total')::int;
end $TOT$;

with v(variant, fn) as (values ${variants}),
     q(query, types) as (values
    ${QVALUES}
  ),
  probed as (
    select v.variant, q.query, q.types, p.*
    from v cross join q, lateral pg_temp.probe(v.fn, q.query, q.types, ${TOPK}) p
  )
select
  p.query,
  p.variant,
  pg_temp.total(v.fn, p.query, p.types) as total,
  count(*) filter (where p.kw_hit)                          as kw_in_topk,
  min(p.rk) filter (where p.kw_hit)                         as first_kw_rank,
  -- Inversions: (non-match ranked above match) pairs inside the top-K. 0 = invariant holds.
  (select count(*)
     from probed a join probed b
       on a.variant = p.variant and b.variant = p.variant
      and a.query = p.query and b.query = p.query
      and a.rk < b.rk and not a.kw_hit and b.kw_hit)        as inversions,
  round(max(p.ms))                                          as ms
from probed p join v on v.variant = p.variant
group by p.query, p.variant, p.types, v.fn
order by p.query, p.variant desc;
`;
}

/** Per-hit listing for one query — what actually moved, not just how much. */
function detailScript(q) {
  const entry = QUERIES.find(([x]) => x === q);
  if (!entry)
    throw new Error(
      `--detail must be one of the probe queries: ${QUERIES.map(([x]) => x).join(', ')}`,
    );
  const types = entry[1];
  const variants = CANDIDATE
    ? `('live','public.search_hybrid'),('candidate','pg_temp.search_hybrid_ab')`
    : `('live','public.search_hybrid')`;
  const head = buildScript().split('with v(variant, fn) as')[0];
  return `${head}
with v(variant, fn) as (values ${variants})
select v.variant, p.rk, p.kw_hit, p.entity_type, left(p.title, 60) as title, p.score
from v, lateral pg_temp.probe(v.fn, ${lit(q)},
       ${types ? `array[${types.map(lit).join(',')}]::text[]` : 'null::text[]'}, ${TOPK}) p
order by v.variant desc, p.rk;
`;
}

function fmt(rows) {
  if (!rows.length) return '(no rows)';
  const cols = Object.keys(rows[0]);
  const s = (x) => (x === null || x === undefined ? '' : String(x));
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => s(r[c]).length)));
  return [
    cols.map((c, i) => c.padEnd(w[i])).join('  '),
    w.map((x) => '-'.repeat(x)).join('  '),
    ...rows.map((r) => cols.map((c, i) => s(r[c]).padEnd(w[i])).join('  ')),
  ].join('\n');
}

const rows = await sql(DETAIL ? detailScript(DETAIL) : buildScript());
console.log(fmt(rows));
if (DETAIL) process.exit(0);

const bad = rows.filter((r) => Number(r.inversions) > 0);
if (CANDIDATE) {
  const live = new Map(rows.filter((r) => r.variant === 'live').map((r) => [r.query, r]));
  console.log('\nDelta (candidate vs live):');
  for (const r of rows.filter((x) => x.variant === 'candidate')) {
    const l = live.get(r.query);
    const dTotal = Number(r.total) - Number(l.total);
    console.log(
      `  ${r.query.padEnd(28)} inversions ${l.inversions} -> ${r.inversions}` +
        `   first_kw_rank ${l.first_kw_rank ?? '-'} -> ${r.first_kw_rank ?? '-'}` +
        `   total ${dTotal === 0 ? 'unchanged' : `CHANGED ${l.total} -> ${r.total}`}` +
        `   ${l.ms}ms -> ${r.ms}ms`,
    );
  }
  const recallLoss = rows
    .filter((x) => x.variant === 'candidate')
    .filter((r) => Number(r.total) !== Number(live.get(r.query).total));
  if (recallLoss.length) {
    console.error(
      `\nFAIL: candidate changed the result SET on ${recallLoss.length} queries — this change must be ordering-only.`,
    );
    process.exit(1);
  }
  const stillBad = rows.filter((r) => r.variant === 'candidate' && Number(r.inversions) > 0);
  if (stillBad.length) {
    console.error(
      `\nFAIL: candidate still lets ${stillBad.length} queries rank a non-match above a match.`,
    );
    process.exit(1);
  }
  console.log('\nPASS: no ordering inversions under the candidate, result sets unchanged.');
} else if (bad.length) {
  console.error(
    `\n${bad.length} of ${rows.length} queries rank a non-keyword-match above a keyword match.`,
  );
  process.exit(1);
} else {
  console.log('\nPASS: no ordering inversions.');
}
