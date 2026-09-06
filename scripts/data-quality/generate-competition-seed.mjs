#!/usr/bin/env node
// ============================================================
// generate-competition-seed.mjs
//
// Turns the scraped NDJSON into idempotent seed migrations for the competition
// spine. Reads BOTH corpora and emits one pair of migrations covering them:
//
//   out-dragrace-spine/seasons.ndjson   → kind='drag_race'  (88 seasons)
//   out-pageants/pageants.ndjson        → kind='pageant'    (optional)
//
// WHY A GENERATED MIGRATION RATHER THAN A LIVE IMPORT SCRIPT
//
// The corpus is static reference data — a season that aired in 2012 does not
// change — so it belongs in version control where it is diffable and reviewable,
// following `20260909172500_substance_interactions_tripsit_data.sql`. REFRESHING:
// re-run the scraper, re-run this generator, replace the files wholesale; every
// insert is idempotent.
//
// WHY THE DATA IS A jsonb LITERAL AND NOT A `values` LIST
//
// 7,490 episode results as a `values` tuple list is ~40k lines of SQL. One jsonb
// literal expanded through `jsonb_to_recordset` is a fraction of that, and the
// parent lookups become ordinary joins on the natural keys (slug, stage name,
// episode number) instead of thousands of hardcoded UUIDs that could never be
// re-generated identically.
//
// TWO MIGRATIONS, NOT ONE
//
// The structure (competitions/editions/entrants/episodes) is small and is what
// every surface needs. The per-episode results are ~85% of the bytes and only
// the grid needs them. Splitting them means a problem in the large file cannot
// block the rest of the feature, and each stays reviewable.
//
// Usage: node scripts/data-quality/generate-competition-seed.mjs [--version=NNNNNNNNNNNNNN]
// ============================================================

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, '../../supabase/migrations');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const BASE_VERSION = String(args.version ?? '20360101100100');
/**
 * `--sample=N` emits the SAME SQL template over the first N editions, to stdout
 * instead of to a migration file, and drops the corpus-wide ground-truth
 * assertions (which are false on a subset by construction).
 *
 * It exists because the real seed is ~960 KB — too large to paste into a
 * rolled-back transaction for verification — while the thing that actually
 * needs proving is the SQL SHAPE: every join, every conflict target, the
 * personality-link update. Those are identical at 3 editions and at 88.
 */
const SAMPLE = args.sample ? parseInt(String(args.sample), 10) : 0;

function readNdjson(p) {
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const seasons = readNdjson(join(__dirname, 'out-dragrace-spine/seasons.ndjson'));
const pageants = readNdjson(join(__dirname, 'out-pageants/pageants.ndjson'));

if (!seasons.length && !pageants.length) {
  console.error('No input NDJSON found. Run the importers first.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Normalise both corpora into one shape.
// ---------------------------------------------------------------------------
const editions = [];

for (const s of seasons) {
  editions.push({
    competition: {
      slug: s.franchise_slug,
      name: s.franchise_name,
      kind: 'drag_race',
      country: s.franchise_country ?? null,
      network: s.network ?? null,
      organizer: null,
    },
    slug: s.season_slug,
    number: s.season_number,
    title: s.title,
    page: s.page,
    network: s.network ?? null,
    first_aired: s.first_aired,
    last_aired: s.last_aired,
    episode_count: s.episode_count,
    host_city_text: null,
    host_country_text: null,
    entrants: s.contestants.map((c) => ({
      name: c.drag_name,
      qid: c.wikidata_qid ?? null,
      age: c.age_at_filming ?? null,
      hometown: c.hometown_text ?? null,
      placement: c.placement ?? null,
      placement_label: c.placement_label ?? null,
      winner: !!c.is_winner,
      runner_up: !!c.is_runner_up,
      miss_c: !!c.is_miss_congeniality,
      wins: c.challenge_wins ?? 0,
      lipsyncs: c.lip_syncs ?? 0,
    })),
    // The grid axis is the union of the episodes the episode TABLE listed and
    // every episode the PROGRESS TABLE refers to.
    //
    // These two disagree far more often than they look like they should:
    // `parseEpisodeTable` requires a parsed air date (that is what separates a
    // real episode row from the synopsis row beneath it), so a season whose
    // later episodes had not aired yet — or whose dates are formatted oddly —
    // yields a short episode list while its progress grid still covers every
    // week. The results insert joins through `competition_episodes`, so any
    // episode missing here silently DROPS its whole column: measured at 5,659
    // of 7,377 results (23% of the grid) before this union existed.
    //
    // A synthesised episode carries a number and nothing else. That is honest —
    // the grid is evidence the episode happened; we just have no metadata for it.
    episodes: (() => {
      const byNumber = new Map(
        s.episodes.map((e) => [e.episode_number, { n: e.episode_number, title: e.title ?? null, date: e.air_date ?? null }]),
      );
      for (const r of s.results) {
        if (!byNumber.has(r.episode_number)) {
          byNumber.set(r.episode_number, { n: r.episode_number, title: null, date: null });
        }
      }
      return [...byNumber.values()].sort((a, b) => a.n - b.n);
    })(),
    results: s.results.map((r) => {
      const c = s.contestants.find((x) => x.key === r.contestant_key);
      return { name: c ? c.drag_name : null, ep: r.episode_number, o: r.outcome, raw: r.outcome_raw };
    }).filter((r) => r.name),
  });
}

for (const p of pageants) {
  editions.push({
    competition: {
      slug: p.competition_slug,
      name: p.competition_name,
      kind: 'pageant',
      country: p.competition_country ?? null,
      network: null,
      organizer: p.organizer ?? null,
    },
    slug: p.edition_slug,
    number: p.edition_number,
    title: p.title,
    page: p.page,
    network: null,
    first_aired: p.first_aired ?? null,
    last_aired: p.last_aired ?? null,
    episode_count: null,
    host_city_text: p.host_city_text ?? null,
    host_country_text: p.host_country_text ?? null,
    entrants: (p.entrants ?? []).map((c) => ({
      name: c.stage_name,
      qid: c.wikidata_qid ?? null,
      age: c.age_at_filming ?? null,
      hometown: c.hometown_text ?? null,
      placement: c.placement ?? null,
      placement_label: c.placement_label ?? null,
      winner: !!c.is_winner,
      runner_up: !!c.is_runner_up,
      miss_c: !!c.is_miss_congeniality,
      wins: 0,
      lipsyncs: 0,
    })),
    episodes: [],
    results: [],
  });
}

// ---------------------------------------------------------------------------
// Guard: (competition, edition_number) is a UNIQUE index. A duplicate here fails
// the migration at apply time, which is a terrible place to find out.
// ---------------------------------------------------------------------------
const seenEdition = new Map();
const seenSlug = new Set();
const collisions = [];
for (const e of editions) {
  if (seenSlug.has(e.slug)) collisions.push(`duplicate edition slug: ${e.slug}`);
  seenSlug.add(e.slug);
  if (e.number == null) continue;
  const k = `${e.competition.slug}#${e.number}`;
  if (seenEdition.has(k)) collisions.push(`duplicate ${k}: ${seenEdition.get(k)} vs ${e.page}`);
  else seenEdition.set(k, e.page);
}
if (collisions.length) {
  console.error(`REFUSING TO GENERATE — ${collisions.length} key collision(s):`);
  collisions.slice(0, 20).forEach((c) => console.error('  ' + c));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------
if (SAMPLE > 0) editions.splice(SAMPLE);

const competitions = [];
const bySlug = new Map();
for (const e of editions) {
  if (!bySlug.has(e.competition.slug)) {
    bySlug.set(e.competition.slug, e.competition);
    competitions.push(e.competition);
  }
}

const jsonLit = (v, tag) => `$${tag}$${JSON.stringify(v)}$${tag}$`;

const structure = editions.map((e) => ({
  c: e.competition.slug,
  slug: e.slug,
  n: e.number,
  title: e.title,
  net: e.network,
  fa: e.first_aired,
  la: e.last_aired,
  ec: e.episode_count,
  hc: e.host_city_text,
  hco: e.host_country_text,
  entrants: e.entrants,
  episodes: e.episodes,
}));

const results = editions.flatMap((e) => e.results.map((r) => ({ e: e.slug, ...r })));

const head = `-- Competition spine seed: ${competitions.length} competitions, ${editions.length} editions,
-- ${editions.reduce((a, e) => a + e.entrants.length, 0)} entrants, ${editions.reduce((a, e) => a + e.episodes.length, 0)} episodes.
--
-- GENERATED by scripts/data-quality/generate-competition-seed.mjs from Wikipedia
-- (CC BY-SA, already covered by src/lib/attribution.ts). Do not hand-edit:
-- re-run the scraper and the generator and replace this file wholesale. Every
-- insert below is idempotent, so a re-run is safe.
--
-- Parents are resolved by NATURAL KEY (competition slug, edition slug, stage
-- name, episode number) rather than by hardcoded UUIDs, so a regenerated file
-- reconciles with rows that already exist instead of duplicating them.`;

// -- structure ---------------------------------------------------------------
const sql1 = `${head}

insert into public.competitions (slug, name, kind, network, organizer, country_id)
select c->>'slug', c->>'name', c->>'kind', c->>'network', c->>'organizer',
       (select id from public.countries co where co.name = c->>'country' limit 1)
  from jsonb_array_elements(${jsonLit(competitions, 'COMP')}::jsonb) c
on conflict (slug) do update
  set name = excluded.name, kind = excluded.kind,
      network = coalesce(excluded.network, public.competitions.network),
      organizer = coalesce(excluded.organizer, public.competitions.organizer),
      country_id = coalesce(excluded.country_id, public.competitions.country_id);

-- The column must be aliased explicitly: jsonb_array_elements names its output
-- column \`value\`, and a bare \`as doc\` would alias the TABLE, leaving every
-- later reference to \`doc\` unresolved.
create temporary table _seed_editions on commit drop as
select value as doc from jsonb_array_elements(${jsonLit(structure, 'EDN')}::jsonb);

insert into public.competition_editions
  (competition_id, edition_number, title, slug, network, first_aired, last_aired,
   episode_count, host_city_id, host_country_id)
select comp.id,
       nullif(doc->>'n','')::int,
       doc->>'title',
       doc->>'slug',
       doc->>'net',
       nullif(doc->>'fa','')::date,
       nullif(doc->>'la','')::date,
       nullif(doc->>'ec','')::int,
       -- Host city is resolved by name ONLY when it is unambiguous across the
       -- whole cities table. \`cities\` cannot represent same-name collisions
       -- (Portland ME vs Portland OR), so a name with several matches resolves
       -- to NULL rather than to the biggest one — resolving by population is
       -- exactly how \`geo-link-content\` once attached Portland ME events to
       -- Portland OR. A null host city is recoverable; a wrong one puts a
       -- pageant on the wrong continent.
       --
       -- \`(array_agg(...))[1]\` rather than \`max()\`: there is no max(uuid) in
       -- Postgres. The HAVING is what makes it unambiguous-only.
       (select (array_agg(c.id order by c.id))[1] from public.cities c
         where lower(c.name) = lower(doc->>'hc') and c.duplicate_of_id is null
        having count(*) = 1),
       (select co.id from public.countries co where co.name = doc->>'hco' limit 1)
  from _seed_editions
  join public.competitions comp on comp.slug = doc->>'c'
on conflict (slug) do update
  set title = excluded.title,
      edition_number = excluded.edition_number,
      network = coalesce(excluded.network, public.competition_editions.network),
      first_aired = coalesce(excluded.first_aired, public.competition_editions.first_aired),
      last_aired = coalesce(excluded.last_aired, public.competition_editions.last_aired),
      episode_count = coalesce(excluded.episode_count, public.competition_editions.episode_count),
      host_city_id = coalesce(excluded.host_city_id, public.competition_editions.host_city_id),
      host_country_id = coalesce(excluded.host_country_id, public.competition_editions.host_country_id);

insert into public.competition_entrants
  (edition_id, stage_name, age_at_filming, hometown_text, placement, placement_label,
   is_winner, is_runner_up, is_miss_congeniality, challenge_wins, lip_syncs)
select ed.id, e->>'name',
       nullif(e->>'age','')::int, e->>'hometown',
       nullif(e->>'placement','')::int, e->>'placement_label',
       (e->>'winner')::boolean, (e->>'runner_up')::boolean, (e->>'miss_c')::boolean,
       coalesce(nullif(e->>'wins','')::int, 0), coalesce(nullif(e->>'lipsyncs','')::int, 0)
  from _seed_editions
  join public.competition_editions ed on ed.slug = doc->>'slug'
  cross join lateral jsonb_array_elements(doc->'entrants') e
on conflict (edition_id, lower(stage_name)) do update
  set placement = coalesce(excluded.placement, public.competition_entrants.placement),
      placement_label = coalesce(excluded.placement_label, public.competition_entrants.placement_label),
      is_winner = excluded.is_winner,
      is_runner_up = excluded.is_runner_up,
      is_miss_congeniality = excluded.is_miss_congeniality,
      challenge_wins = excluded.challenge_wins,
      lip_syncs = excluded.lip_syncs,
      age_at_filming = coalesce(excluded.age_at_filming, public.competition_entrants.age_at_filming),
      hometown_text = coalesce(excluded.hometown_text, public.competition_entrants.hometown_text);

insert into public.competition_episodes (edition_id, episode_number, title, air_date)
select ed.id, (ep->>'n')::int, ep->>'title', nullif(ep->>'date','')::date
  from _seed_editions
  join public.competition_editions ed on ed.slug = doc->>'slug'
  cross join lateral jsonb_array_elements(doc->'episodes') ep
on conflict (edition_id, episode_number) do update
  set title = coalesce(excluded.title, public.competition_episodes.title),
      air_date = coalesce(excluded.air_date, public.competition_episodes.air_date);

-- Link entrants to the encyclopedia.
--
-- \`personalities.wikipedia_url\` is NULL on all 776 drag rows, so the QID is the
-- only exact key available. Measured on a 60-QID sample spread across the
-- corpus: 58 matched (96.7%). The join follows \`duplicate_of_id\` because 5 of
-- the drag personalities are merge targets, and a link that ignores the merge
-- pointer breaks on the next dedup sweep.
--
-- NO NAME FALLBACK HERE, DELIBERATELY. \`personalities\` holds 16k people and
-- drag names are short and collision-prone ("Venus", "Alaska", "Prince"); a
-- name-only match would publish the wrong biography under a queen's name, which
-- is exactly the namesake-chimera failure this repo has already had once. A null
-- link is recoverable and shows as plain text; a wrong one is not.
update public.competition_entrants ce
   set personality_id = p.id
  from _seed_editions
  cross join lateral jsonb_array_elements(doc->'entrants') e
  join public.competition_editions ed on ed.slug = doc->>'slug'
  join public.personalities p
    on p.wikidata_qid = e->>'qid' and p.duplicate_of_id is null
 where ce.edition_id = ed.id
   and lower(ce.stage_name) = lower(e->>'name')
   and e->>'qid' is not null
   and ce.personality_id is null;

do $verify$
declare v_c int; v_e int; v_n int; v_linked int;
begin
  select count(*) into v_c from public.competitions;
  select count(*) into v_e from public.competition_editions;
  select count(*) into v_n from public.competition_entrants;
  select count(*) into v_linked from public.competition_entrants where personality_id is not null;

  if v_c < ${competitions.length} then
    raise exception 'competitions: expected >= % got %', ${competitions.length}, v_c;
  end if;
  if v_e < ${editions.length} then
    raise exception 'competition_editions: expected >= % got %', ${editions.length}, v_e;
  end if;

${SAMPLE ? '/* ground-truth block omitted in --sample mode\n' : ''}  -- Ground truth, re-asserted at apply time rather than trusted from the
  -- scraper's own summary: the US main series is 18 seasons and 242 slots, and
  -- season 16 has TWO Miss Congeniality winners (the 2024 tie). If a future
  -- re-scrape silently drops rows, this is what catches it.
  select count(*) into v_n from public.competition_editions ed
    join public.competitions c on c.id = ed.competition_id
   where c.slug = 'rupauls-drag-race';
  if v_n <> 18 then raise exception 'US main series: expected 18 seasons, got %', v_n; end if;

  select count(*) into v_n from public.competition_entrants ce
    join public.competition_editions ed on ed.id = ce.edition_id
    join public.competitions c on c.id = ed.competition_id
   where c.slug = 'rupauls-drag-race';
  if v_n <> 242 then raise exception 'US main series: expected 242 slots, got %', v_n; end if;

  select count(*) into v_n from public.competition_entrants ce
    join public.competition_editions ed on ed.id = ce.edition_id
    join public.competitions c on c.id = ed.competition_id
   where c.slug = 'rupauls-drag-race' and ed.edition_number = 16 and ce.is_miss_congeniality;
  if v_n <> 2 then
    raise exception 'season 16 Miss Congeniality tie: expected 2, got %', v_n;
  end if;
${SAMPLE ? '*/\n' : ''}
  raise notice 'competition seed: % competitions, % editions, % entrants, % linked',
    v_c, v_e, (select count(*) from public.competition_entrants), v_linked;
end
$verify$;
`;

// -- results -----------------------------------------------------------------
const sql2 = `-- Competition spine seed, part 2: ${results.length} per-episode results.
--
-- GENERATED — see the part 1 header. Split from it because these rows are ~85%
-- of the seed's bytes and only the placement grid reads them.
--
-- \`outcome\` is the normalised vocabulary from src/lib/dragOutcome.ts and
-- \`outcome_raw\` is whatever the source cell actually said. Cells whose code the
-- normaliser does not recognise are ABSENT rather than guessed — 90 of 7,580
-- (1.2%) at time of generation, each counted and named in the scraper's
-- summary.json. Absence of a row means "not in that episode", which is at least
-- honest about the gap.

insert into public.competition_episode_results (entrant_id, episode_id, outcome, outcome_raw)
select ce.id, ep.id, r->>'o', r->>'raw'
  from jsonb_array_elements(${jsonLit(results, 'RES')}::jsonb) r
  join public.competition_editions ed on ed.slug = r->>'e'
  join public.competition_entrants ce
    on ce.edition_id = ed.id and lower(ce.stage_name) = lower(r->>'name')
  join public.competition_episodes ep
    on ep.edition_id = ed.id and ep.episode_number = (r->>'ep')::int
on conflict (entrant_id, episode_id) do update
  set outcome = excluded.outcome, outcome_raw = excluded.outcome_raw;

do $verify$
declare v_n int; v_bad int;
begin
  select count(*) into v_n from public.competition_episode_results;
  -- A TIGHT floor. Every result should land: its entrant is inserted from the
  -- same season object and its episode is now guaranteed to exist (the episode
  -- list is the union of the episode table and the grid).
  --
  -- This was 0.7 and that was useless — it happily passed while the join was
  -- silently dropping 1,718 rows (23% of the grid) because the episode row did
  -- not exist. A floor loose enough to absorb the bug it exists to catch is not
  -- a guard. 0.98 leaves room for a single malformed season, nothing more.
  if v_n < ${Math.floor(results.length * 0.98)} then
    raise exception 'episode results: expected >= %, got % — the join is dropping rows',
      ${Math.floor(results.length * 0.98)}, v_n;
  end if;

  -- Nothing may carry an outcome outside the ladder+guest vocabulary.
  select count(*) into v_bad from public.competition_episode_results
   where outcome not in ('win','high','safe','low','bottom','elim','guest');
  if v_bad <> 0 then raise exception '% result(s) with an unknown outcome', v_bad; end if;

  raise notice 'competition results: % rows', v_n;
end
$verify$;
`;

if (SAMPLE > 0) {
  // Emit both parts to stdout so they can be run as one rolled-back transaction.
  process.stdout.write(sql1 + '\n' + sql2 + '\n');
  process.exit(0);
}

const f1 = join(MIGRATIONS, `${BASE_VERSION}_competition_seed_structure.sql`);
const f2 = join(MIGRATIONS, `${String(BigInt(BASE_VERSION) + 100n)}_competition_seed_results.sql`);
writeFileSync(f1, sql1);
writeFileSync(f2, sql2);

console.log(
  JSON.stringify(
    {
      competitions: competitions.length,
      editions: editions.length,
      entrants: editions.reduce((a, e) => a + e.entrants.length, 0),
      entrants_with_qid: editions.reduce(
        (a, e) => a + e.entrants.filter((x) => x.qid).length,
        0,
      ),
      episodes: editions.reduce((a, e) => a + e.episodes.length, 0),
      results: results.length,
      pageant_editions: editions.filter((e) => e.competition.kind === 'pageant').length,
      files: [f1.replace(/.*\/supabase/, 'supabase'), f2.replace(/.*\/supabase/, 'supabase')],
      bytes: [sql1.length, sql2.length],
    },
    null,
    2,
  ),
);
