#!/usr/bin/env npx tsx
// ============================================================
// import-sf-drag-king.ts
//
// The San Francisco Drag King Contest (1994–2025) — the ONLY drag king
// competition besides King of Drag with a Wikipedia article.
//
// WHY IT NEEDS ITS OWN IMPORTER
//
// Every other competition in this corpus keeps its results in a wikitable, so
// `parseTables` handles it. This one keeps thirty years of winners in a flat
// BULLETED LIST, written by hand over three decades by different editors. There
// is no table to parse and no outcome legend — winners only, no rosters, no
// placements below first.
//
// That also bounds what can honestly be extracted: ~29 editions, every entrant
// flagged `is_winner`, and nothing else. An edition here is a year.
//
// THE TRAPS, ALL READ OFF THE LIVE PAGE RATHER THAN ASSUMED
//
//   "1995 and 1996 - no contests held"   one line, TWO years, NO winner
//   "2020"                               absent from the list entirely
//   "2005 - Jay Walker, The Momma's Boys (group)"
//                                        an individual AND a group winner
//   "2011 - Gender Queer Society (group) from San Jose."
//                                        group only, plus a trailing location
//   "2017 - El SeVan & Jota Mercury (two winners)"
//                                        two co-winners, joined by "&"
//   "2010 - Hamm Graham & the Wham Bamm Thank You Ma'ams"
//                                        ONE act whose NAME contains "&"
//   "2025- Misterrr"                     no space after the year
//   "2000 - Electro a.k.a. "The Pop n' Lock King""
//                                        an a.k.a. clause inside the name
//
// The 2010/2017 pair is the whole reason this is not a one-line split. An
// unconditional split on "&" invents a person called "the Wham Bamm Thank You
// Ma'ams"; never splitting loses a real co-winner in 2017. So "&" splits ONLY
// when the line says "(two winners)", and the comma — which is what actually
// separates the individual from the group prize — is the general separator.
//
// Network only, via the shared cache. Emits the same NDJSON contract as
// import-pageants.ts so the existing seed generator consumes it unchanged.
// ============================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { apiUrl, makeFetchCached, normKey, stripTags } from './lib/dragrace-wiki.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'out-sf-drag-king');
mkdirSync(join(OUT, 'cache'), { recursive: true });
const fetchCached = makeFetchCached(join(OUT, 'cache'));

const PAGE = 'San Francisco Drag King Contest';
const COMPETITION = {
  slug: 'san-francisco-drag-king-contest',
  name: 'San Francisco Drag King Contest',
  country: 'United States',
  // Its own framing: an annual drag king contest, not a pageant and not a
  // festival. Founded by Fudgie Frottage; venues have included the SF Eagle,
  // DNA Lounge and Klubstitute.
  format: 'Drag king title contest',
};

/** Strip the decorations that carry no name: citations, trailing punctuation. */
function tidy(s: string): string {
  return s
    .replace(/\[\d+\]/g, '')
    .replace(/\(group title\)|\(group\)|\(two winners\)/gi, '')
    .replace(/\bfrom\s+San\s+Jose\b/gi, '')
    .replace(/[.,;]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SfWinner {
  stage_name: string;
  is_group: boolean;
}

/**
 * Split one list line's winner text into entrants.
 *
 * Exported so the trap cases can be unit-tested without a network call.
 */
export function splitWinners(raw: string): SfWinner[] {
  const saysTwoWinners = /\(two winners\)/i.test(raw);
  const groupMarked = /\(group( title)?\)/i.test(raw);

  // The comma is the reliable separator: from 2005 the line lists the
  // individual winner, then the winning group.
  let parts = raw.split(',');

  // "&" is only a separator when the page SAYS there are two winners. In 2010
  // it is part of a single act's name.
  if (saysTwoWinners && parts.length === 1) {
    parts = raw.split(/\s+&\s+|\s+and\s+/i);
  }

  const out: SfWinner[] = [];
  for (const part of parts) {
    const isGroup = /\(group( title)?\)/i.test(part) || (groupMarked && parts.length === 1);
    const name = tidy(part);
    if (!name) continue;
    // A bare year or a "no contest" fragment is not a person.
    if (/^\d{4}$/.test(name)) continue;
    if (/^no contests?\b/i.test(name)) continue;
    out.push({ stage_name: name, is_group: isGroup });
  }
  return out;
}

export interface SfEdition {
  year: number;
  winners: SfWinner[];
}

/**
 * Parse the winners list.
 *
 * A line may carry TWO years ("1995 and 1996 - no contests held"), so a year is
 * not a key until the "no contest" case is excluded — otherwise 1995 and 1996
 * would both be minted as editions with no winner, asserting a contest that did
 * not happen.
 */
export function parseWinnerList(html: string): SfEdition[] {
  const items = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => stripTags(m[1]));
  const out: SfEdition[] = [];

  for (const line of items) {
    const m = line.match(/^(\d{4})\s*(?:and\s*(\d{4}))?\s*[-–—]\s*(.*)$/);
    if (!m) continue;
    const rest = m[3] ?? '';

    // "no contests held" — record nothing. An edition row would claim the
    // contest ran that year.
    if (/no contests?\s+(were\s+)?held|not held|cancell?ed/i.test(rest)) continue;

    const winners = splitWinners(rest);
    if (!winners.length) continue;
    out.push({ year: parseInt(m[1], 10), winners });
  }

  // Same year twice would collide on (competition_id, edition_number).
  const seen = new Set<number>();
  return out.filter((e) => (seen.has(e.year) ? false : (seen.add(e.year), true)));
}

async function main() {
  const j = await fetchCached(
    apiUrl({ action: 'parse', prop: 'text', page: PAGE, redirects: '1' }),
    'page_sf_drag_king',
  );
  const html = j?.parse?.text;
  if (!html) {
    console.error('No HTML for', PAGE);
    process.exit(1);
  }

  const editions = parseWinnerList(html);
  const rows = editions.map((e) => ({
    competition_slug: COMPETITION.slug,
    competition_name: COMPETITION.name,
    competition_kind: 'title',
    competition_country: COMPETITION.country,
    organizer: null,
    format: COMPETITION.format,
    edition_slug: `${COMPETITION.slug}-${e.year}`,
    edition_number: e.year,
    title: `${COMPETITION.name} ${e.year}`,
    page: PAGE,
    first_aired: null,
    last_aired: null,
    host_city_text: 'San Francisco',
    host_country_text: 'United States',
    entrants: e.winners.map((w) => ({
      key: normKey(w.stage_name),
      stage_name: w.stage_name,
      wikipedia_title: null,
      wikidata_qid: null,
      placement: 1,
      placement_label: w.is_group ? 'Winner (group)' : 'Winner',
      is_winner: true,
      is_runner_up: false,
      is_miss_congeniality: false,
      hometown_text: null,
      age_at_filming: null,
    })),
    episodes: [],
    results: [],
  }));

  const summary = {
    generated_for: 'San Francisco Drag King Contest',
    page: PAGE,
    editions: rows.length,
    entrants: rows.reduce((a, r) => a + r.entrants.length, 0),
    group_winners: rows.reduce((a, r) => a + r.entrants.filter((x) => /group/.test(x.placement_label ?? '')).length, 0),
    year_range: [Math.min(...editions.map((e) => e.year)), Math.max(...editions.map((e) => e.year))],
    // Stated so the gaps are a recorded finding rather than a silent absence.
    years_absent: (() => {
      const have = new Set(editions.map((e) => e.year));
      const gaps: number[] = [];
      for (let y = Math.min(...have); y <= Math.max(...have); y++) if (!have.has(y)) gaps.push(y);
      return gaps;
    })(),
    note: 'Winners only. This page has no roster and no placements below first, so every entrant is a winner by construction.',
  };

  writeFileSync(join(OUT, 'sfdk.ndjson'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
