#!/usr/bin/env npx tsx
// ============================================================
// import-dragrace-spine.ts
//
// Acquires the Drag Race COMPETITION structure — franchises, seasons,
// contestants, episodes and per-episode placements — and writes it to
// out-dragrace-spine/ as NDJSON plus a coverage report.
//
// This is the half that `import-dragrace-contestants.mjs` throws away. That
// script parses `{ franchise, season, outcome }` per queen and then flattens it
// into a prose bio string. Both now share one parser
// (`lib/dragrace-wiki.mjs`); this one keeps the structure.
//
// Scope is EVERY franchise including the celebrity spin-offs. The personality
// importer skips those to avoid mislabelling non-LGBTQ guests as community
// members; the spine records a television credit, which carries no such claim.
//
// Network only — no DB credentials. Matching to `personalities` and emitting the
// seed migration is a separate step (link-dragrace-spine.ts), because that one
// needs live lookups and this one must stay re-runnable offline.
//
// Usage:
//   npx tsx scripts/data-quality/import-dragrace-spine.ts
//   npx tsx scripts/data-quality/import-dragrace-spine.ts --franchise="España"
//   npx tsx scripts/data-quality/import-dragrace-spine.ts --max-pages=5
// ============================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  discoverSeasonPages,
  fetchSeasonHtml,
  franchiseCountry,
  makeFetchCached,
  normKey,
  parseContestantRows,
  parseEpisodeTable,
  parseProgressTable,
  parseSeasonMeta,
  parseTables,
  pickProgressTable,
  resolveQids,
  seasonLabel,
  seasonNumber,
} from './lib/dragrace-wiki.mjs';
import {
  MISS_CONGENIALITY_RE,
  normalizeOutcome,
  type DragOutcome,
} from '../../src/lib/dragOutcome';

/**
 * `Untucked!` is the backstage companion show, not a competition. Its season
 * pages carry a COPY of the parent season's progress table, so importing them
 * yields a second edition with the same queens and the same placements —
 * measured: 25 of them, every one colliding with its parent on
 * (competition_id, edition_number), which the unique index would reject at
 * migration time.
 *
 * Every collision was checked and in all 25 cases the parent page is also
 * present, so excluding these loses nothing at all.
 */
const COMPANION_PAGE_RE = /untucked/i;

/**
 * Drag competition series that are NOT Drag Race.
 *
 * These cannot come from `discoverSeasonPages`, which walks
 * `Category:Drag Race (franchise) seasons` — Dragula is an independent show and
 * is not in that category. They are listed here rather than added to the shared
 * `EXTRA_PAGES` so that `import-dragrace-contestants.mjs`, which also calls
 * discovery, keeps its behaviour exactly as it was.
 *
 * Measured before adding: all six Dragula seasons parse fully through the same
 * parser — contestants, a progress grid, an episode table and a network. Its
 * outcome vocabulary is its own (EXT = Exterminated, WUE = Winner up for
 * extermination, KEY) and was read off the show's own legend, not inferred.
 */
const EXTRA_SERIES: { title: string; franchise: string }[] = [
  // Dragula and its Titans spin-off.
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    title: `The Boulet Brothers' Dragula season ${n}`,
    franchise: "The Boulet Brothers' Dragula",
  })),
  ...[1, 2].map((n) => ({
    title: `The Boulet Brothers' Dragula: Titans season ${n}`,
    franchise: "The Boulet Brothers' Dragula: Titans",
  })),
  // La Mas Draga (Mexico, YouTube).
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({
    title: `La Más Draga season ${n}`,
    franchise: 'La Más Draga',
  })),
  // Titles use FOUR different conventions and must not be pattern-generated:
  // `X season N`, `X (season N)`, a capital-S `Season 2`, and shows whose
  // seasons all live on one page. Every one below was read off the article.
  { title: 'Call Me Mother (season 1)', franchise: 'Call Me Mother' },
  { title: 'Call Me Mother (season 2)', franchise: 'Call Me Mother' },
  { title: 'Queen of the Universe season 1', franchise: 'Queen of the Universe' },
  { title: 'Queen of the Universe season 2', franchise: 'Queen of the Universe' },
  { title: 'King of Drag', franchise: 'King of Drag' },
  { title: 'King of Drag Season 2', franchise: 'King of Drag' },
  { title: 'Drag Den season 1', franchise: 'Drag Den' },
  { title: 'Drag Den season 2', franchise: 'Drag Den' },
  { title: 'House of Drag', franchise: 'House of Drag' },
  { title: 'Drag Latina', franchise: 'Drag Latina' },
  { title: 'Queen of Drags', franchise: 'Queen of Drags' },
  { title: 'Love for the Arts', franchise: 'Love for the Arts' },
  { title: 'Academia de Drags season 1', franchise: 'Academia de Drags' },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'out-dragrace-spine');
const CACHE = join(OUT, 'cache');
mkdirSync(CACHE, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
) as Record<string, string | boolean | undefined>;

const FRANCHISE_FILTER = args.franchise ? String(args.franchise).toLowerCase() : null;
const MAX_PAGES = args['max-pages'] ? parseInt(String(args['max-pages']), 10) : Infinity;

const fetchCached = makeFetchCached(CACHE);

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------
function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Placement parsing
//
// The contestant table's outcome column is free text: "Winner", "Runner-up",
// "3rd place", "4th/5th place", "Eliminated", "Guest", "Miss Congeniality".
// Returns the ordinal where one is stated, plus the three flags.
//
// A range ("4th/5th place") takes the FIRST number: it is the best position the
// queen is credited with, and inventing a tiebreak we do not have would be worse
// than being slightly generous consistently.
// ---------------------------------------------------------------------------
export interface Placement {
  placement: number | null;
  placement_label: string | null;
  is_winner: boolean;
  is_runner_up: boolean;
  is_miss_congeniality: boolean;
}

export function parsePlacement(raw: string | null | undefined): Placement {
  const label = raw?.trim() || null;
  const t = (label ?? '').toLowerCase();

  const is_miss_congeniality = /congeniality|miss congeniality/.test(t);
  // "Runner-up" must be tested before the winner test, because "runner-up" does
  // not contain "winner" but some pages write "Winner runner-up" orderings in
  // combined cells; keeping them separate avoids the ambiguity entirely.
  const is_runner_up = /runner[-\s]?up|runners[-\s]?up/.test(t);
  const is_winner = !is_runner_up && /\bwinner\b|\bwins\b|^won$/.test(t);

  let placement: number | null = null;
  if (is_winner) {
    placement = 1;
  } else {
    const ord = t.match(/(\d+)\s*(?:st|nd|rd|th)\b/);
    if (ord) placement = parseInt(ord[1], 10);
    else if (is_runner_up) placement = 2;
  }

  return { placement, placement_label: label, is_winner, is_runner_up, is_miss_congeniality };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SpineSeason {
  franchise_slug: string;
  franchise_name: string;
  franchise_country: string;
  season_slug: string;
  season_number: number | null;
  title: string;
  page: string;
  network: string | null;
  first_aired: string | null;
  last_aired: string | null;
  episode_count: number | null;
  contestants: SpineContestant[];
  episodes: { episode_number: number; title: string | null; air_date: string | null }[];
  results: { contestant_key: string; episode_number: number; outcome: DragOutcome; outcome_raw: string }[];
}

interface SpineContestant extends Placement {
  key: string;
  drag_name: string;
  wikipedia_title: string | null;
  /**
   * Resolved from `wikipedia_title` in one batched pass. This is the JOIN KEY
   * against `personalities.wikidata_qid` (521 of the 776 drag personalities
   * carry one), and it is the difference between an exact link and a
   * name-similarity guess. `personalities.wikipedia_url` is null on all 776
   * rows, so it cannot be used instead.
   */
  wikidata_qid: string | null;
  age_at_filming: number | null;
  hometown_text: string | null;
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('Discovering franchise season pages (all franchises, incl. spin-offs)…');
  const discovered = await discoverSeasonPages(fetchCached, {
    skipFranchises: [],
    franchiseFilter: FRANCHISE_FILTER,
  });
  const companions = discovered.filter((p) => COMPANION_PAGE_RE.test(p.title));
  const extra = EXTRA_SERIES.filter(
    (e) =>
      !discovered.some((d) => d.title === e.title) &&
      (!FRANCHISE_FILTER || e.franchise.toLowerCase().includes(FRANCHISE_FILTER)),
  );
  const pages = [...discovered.filter((p) => !COMPANION_PAGE_RE.test(p.title)), ...extra].slice(
    0,
    MAX_PAGES,
  );
  console.log(
    `  ${pages.length} season pages across ${new Set(pages.map((p) => p.franchise)).size} franchises` +
      ` (+${extra.length} non-Drag-Race series pages, ${companions.length} Untucked companion pages excluded)`,
  );

  const seasons: SpineSeason[] = [];
  const unknownCodes = new Map<string, number>();
  let pagesWithProgress = 0;
  let pagesWithEpisodes = 0;
  let n = 0;

  for (const pg of pages) {
    const html = await fetchSeasonHtml(fetchCached, pg.title);
    if (++n % 10 === 0) console.log(`  parsed ${n}/${pages.length} pages`);
    if (!html) continue;

    const rows = parseContestantRows(html, pg);
    if (!rows.length) continue;

    const label = seasonLabel(pg.title, pg.franchise);
    const meta = parseSeasonMeta(html);
    const tables = parseTables(html);

    // Contestants, deduped within the season (the page sometimes repeats a
    // queen across a contestants table and a returning-queens table).
    const byKey = new Map<string, SpineContestant>();
    for (const r of rows) {
      const key = normKey(r.stage_name);
      if (!key) continue;
      const ageNum = r.age ? parseInt((r.age.match(/\d+/) ?? [])[0] ?? '', 10) : NaN;
      const placement = parsePlacement(r.outcome);
      const existing = byKey.get(key);
      if (existing) {
        // Keep the richer row rather than the first one seen.
        if (!existing.hometown_text && r.hometown) existing.hometown_text = r.hometown;
        if (existing.age_at_filming == null && Number.isFinite(ageNum)) existing.age_at_filming = ageNum;
        if (!existing.wikipedia_title && r.wikipedia_title) existing.wikipedia_title = r.wikipedia_title;
        if (!existing.placement && placement.placement) {
          existing.placement = placement.placement;
          existing.placement_label = placement.placement_label;
        }
        existing.is_winner ||= placement.is_winner;
        existing.is_runner_up ||= placement.is_runner_up;
        existing.is_miss_congeniality ||= placement.is_miss_congeniality;
        continue;
      }
      byKey.set(key, {
        key,
        drag_name: r.stage_name,
        wikipedia_title: r.wikipedia_title,
        wikidata_qid: null, // filled in one batched pass after every page is parsed
        age_at_filming: Number.isFinite(ageNum) && ageNum >= 15 && ageNum <= 99 ? ageNum : null,
        hometown_text: r.hometown || null,
        ...placement,
      });
    }

    // Episodes
    const episodes = parseEpisodeTable(tables);
    if (episodes.length) pagesWithEpisodes++;

    // Progress grid
    const results: SpineSeason['results'] = [];
    const progress = pickProgressTable(tables);
    if (progress) {
      const parsed = parseProgressTable(progress);
      if (parsed.length) pagesWithProgress++;
      for (const p of parsed) {
        const key = normKey(p.stage_name);
        const entrant = byKey.get(key);
        if (!entrant) continue; // progress row we cannot tie to a contestant
        for (const cell of p.cells) {
          // The grid is the ONLY place most seasons record Miss Congeniality —
          // the contestants table's outcome column never mentions it, which is
          // why a first pass over 113 seasons found the award on zero of them.
          if (MISS_CONGENIALITY_RE.test(cell.raw)) entrant.is_miss_congeniality = true;

          const outcome = normalizeOutcome(cell.raw);
          if (!outcome) {
            const k = cell.raw.slice(0, 24);
            unknownCodes.set(k, (unknownCodes.get(k) ?? 0) + 1);
            continue; // never guess — absence is honest, a wrong bucket is not
          }
          results.push({
            contestant_key: key,
            episode_number: cell.episode_number,
            outcome,
            outcome_raw: cell.raw,
          });
        }
      }
    }

    // Derive challenge wins from the grid where we have one.
    const winCounts = new Map<string, number>();
    const lipsyncCounts = new Map<string, number>();
    for (const r of results) {
      if (r.outcome === 'win') winCounts.set(r.contestant_key, (winCounts.get(r.contestant_key) ?? 0) + 1);
      if (r.outcome === 'bottom' || r.outcome === 'elim')
        lipsyncCounts.set(r.contestant_key, (lipsyncCounts.get(r.contestant_key) ?? 0) + 1);
    }

    const franchiseName = pg.franchise;
    const franchiseSlug = slugify(franchiseName);
    const seasonTitle = label ? `${franchiseName} ${label}` : pg.title;

    seasons.push({
      franchise_slug: franchiseSlug,
      franchise_name: franchiseName,
      franchise_country: franchiseCountry(franchiseName),
      season_slug: slugify(pg.title),
      season_number: seasonNumber(label),
      title: seasonTitle,
      page: pg.title,
      network: meta.network,
      first_aired: meta.first_aired,
      last_aired: meta.last_aired,
      episode_count: meta.episode_count ?? (episodes.length || null),
      contestants: [...byKey.values()].map((c) => ({
        ...c,
        challenge_wins: winCounts.get(c.key) ?? 0,
        lip_syncs: lipsyncCounts.get(c.key) ?? 0,
      })) as SpineContestant[],
      episodes,
      results,
    });
  }

  // -------------------------------------------------------------------------
  // Resolve Wikidata QIDs in one batched pass (50 titles per request).
  //
  // This is the join key against `personalities.wikidata_qid`. It runs here, at
  // the end, rather than per page, because the same queen appears across several
  // seasons and resolving per page would repeat the same lookups.
  // -------------------------------------------------------------------------
  const titles = [
    ...new Set(
      seasons.flatMap((s) => s.contestants.map((c) => c.wikipedia_title).filter(Boolean)),
    ),
  ] as string[];
  console.log(`Resolving ${titles.length} Wikidata QIDs…`);
  const qidMap = await resolveQids(fetchCached, titles);
  for (const s of seasons) {
    for (const c of s.contestants) {
      c.wikidata_qid = c.wikipedia_title ? (qidMap.get(c.wikipedia_title) ?? null) : null;
    }
  }
  const withQid = seasons.reduce(
    (a, s) => a + s.contestants.filter((c) => c.wikidata_qid).length,
    0,
  );

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------
  const totalContestants = seasons.reduce((a, s) => a + s.contestants.length, 0);
  const totalResults = seasons.reduce((a, s) => a + s.results.length, 0);
  const totalEpisodes = seasons.reduce((a, s) => a + s.episodes.length, 0);
  const withWinner = seasons.filter((s) => s.contestants.some((c) => c.is_winner)).length;
  const withMC = seasons.filter((s) => s.contestants.some((c) => c.is_miss_congeniality)).length;
  const withDates = seasons.filter((s) => s.first_aired).length;
  const withNetwork = seasons.filter((s) => s.network).length;

  const summary = {
    generated_for: 'drag_race spine',
    pages: pages.length,
    seasons: seasons.length,
    franchises: [...new Set(seasons.map((s) => s.franchise_name))].sort(),
    franchise_count: new Set(seasons.map((s) => s.franchise_slug)).size,
    contestant_appearances: totalContestants,
    distinct_queens: new Set(seasons.flatMap((s) => s.contestants.map((c) => c.key))).size,
    appearances_with_qid: withQid,
    distinct_qids: new Set(
      seasons.flatMap((s) => s.contestants.map((c) => c.wikidata_qid).filter(Boolean)),
    ).size,
    episodes: totalEpisodes,
    episode_results: totalResults,
    seasons_with_progress_grid: pagesWithProgress,
    seasons_with_episode_table: pagesWithEpisodes,
    seasons_with_winner: withWinner,
    seasons_with_miss_congeniality: withMC,
    seasons_with_air_dates: withDates,
    seasons_with_network: withNetwork,
    // The whole point of returning null from normalizeOutcome: the gap is
    // countable and named instead of silently bucketed as "safe".
    unknown_outcome_codes: [...unknownCodes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([code, count]) => ({ code, count })),
    unknown_outcome_cells: [...unknownCodes.values()].reduce((a, b) => a + b, 0),
  };

  writeFileSync(join(OUT, 'seasons.ndjson'), seasons.map((s) => JSON.stringify(s)).join('\n'));
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log('\n=== SPINE SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote seasons.ndjson + summary.json to ${OUT}`);
}

// Only run when invoked directly, so the pure helpers above stay importable
// from a test without triggering a network sweep.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
