#!/usr/bin/env npx tsx
// ============================================================
// import-pageants.ts
//
// Acquires the LGBTQ+ titleholder circuit — 11 pageants, their editions and
// their placing entrants — and writes it to out-pageants/ as NDJSON plus a
// coverage report.
//
// WHY THIS EXISTS
//
// `20360101100000_competition_spine.sql` is deliberately ONE schema for two
// domains: `kind='drag_race'` (a television season with an episode grid) and
// `kind='pageant'` (a titleholder year decided in one night). Its own header
// says so, and says why: "The pageants are OLDER than the television — IML
// since 1979, Miss Gay America since 1972 — and modelling them as a lesser
// sibling of a TV show would invert the actual history."
//
// So this importer emits the SAME NDJSON envelope as
// `import-dragrace-spine.ts`. One object per EDITION, `episodes: []` and
// `results: []` always empty, so a single downstream seed generator handles
// both corpora with no branch. The empty arrays are written rather than
// omitted precisely so the contract is one shape, not two.
//
// WHY THERE IS A SPEC PER PAGEANT INSTEAD OF ONE HEURISTIC
//
// The Drag Race corpus is 113 pages emitted by the SAME MediaWiki templates, so
// a shape heuristic works there. These 11 pages share no template at all — they
// were measured before this file was written, and the shapes are:
//
//   * winner-per-year tables with structural runner-up columns   (Mr Gay World,
//     Miss International Queen, Miss Star International, Miss Fabulous Thailand)
//   * winner-per-year tables with no runners-up at all           (IML, MIR,
//     Miss T World, Mr Gay Europe's "Previous winners")
//   * SIX PARALLEL TITLES in one row                             (Miss Continental)
//   * a caption row masquerading as the header, real headers in a second row,
//     and a REAL-NAME column that must never be emitted           (Miss Gay America)
//   * per-year contestant tables whose year lives only in the section heading
//                                                                 (Mr Gay Europe)
//   * a delegate list to a DIFFERENT pageant, whose "placement" column is the
//     placement at Mister Gay World and therefore not this pageant's placement
//                                                                 (Mr. Gay India)
//
// A heuristic wide enough to cover all six would also swallow the "most titles
// by country" tables, the International Mr. BOOTBLACK winners (a different
// contest sharing the IML page), and Miss Fabulous Thailand's Junior/Teenager
// sub-pageants — every one of which collides on (competition, year) with the
// real edition. So selection is explicit and auditable: a table is read only
// when its section heading and its header columns both match the spec.
//
// HARD RULES OBSERVED HERE
//
//  1. Never guess. An unrecognised placement string keeps its raw text in
//     `placement_label` and leaves `placement` null; the counts are reported.
//  2. A year is the edition key. `(competition_id, edition_number)` is a unique
//     index, so a second row for a year is DROPPED and reported, never merged.
//  3. No real names. `Miss_Gay_America` publishes a "Given name" column beside
//     every titleholder. It is not mapped, there is no field for it, and
//     `FORBIDDEN_COLUMNS` fails the run loudly if a future spec reaches for it.
//  4. Wikipedia CC BY-SA is already covered by `src/lib/attribution.ts`.
//
// Network only — no DB credentials, no writes outside out-pageants/.
//
// Usage:
//   npx tsx scripts/data-quality/import-pageants.ts
//   npx tsx scripts/data-quality/import-pageants.ts --pageant=miss-continental
//   npx tsx scripts/data-quality/import-pageants.ts --limit=3
//   npx tsx scripts/data-quality/import-pageants.ts --print-headers   # inspect only
// ============================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  apiUrl,
  firstLinkTitle,
  makeFetchCached,
  normKey,
  parseInfobox,
  parseTables,
  parseWikiDate,
  stripTags,
} from './lib/dragrace-wiki.mjs';
import { parsePlacement, type Placement } from './import-dragrace-spine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'out-pageants');
const CACHE = join(OUT, 'cache');
mkdirSync(CACHE, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
) as Record<string, string | boolean | undefined>;

const PAGEANT_FILTER = args.pageant ? String(args.pageant).toLowerCase() : null;
const LIMIT = args.limit ? parseInt(String(args.limit), 10) : Infinity;
const PRINT_HEADERS = Boolean(args['print-headers']);

const fetchCached = makeFetchCached(CACHE);

// ---------------------------------------------------------------------------
// Slugs — identical to import-dragrace-spine.ts so both corpora slug the same
// way and a pageant can never collide with a franchise by accident of casing.
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
// Output contract — ONE object per EDITION.
//
// `episodes` and `results` are ALWAYS EMPTY. A pageant is decided in one night;
// the migration's comment on competition_episodes says the rows simply do not
// exist for a pageant rather than the schema growing a parallel set of tables.
// ---------------------------------------------------------------------------
export interface PageantEntrant extends Placement {
  key: string;
  stage_name: string;
  wikipedia_title: string | null;
  hometown_text: string | null;
  age_at_filming: number | null;
  /**
   * The regional/state preliminary this entrant arrived from — "Miss Gay Texas
   * America 2016" — which Miss Gay America appends to the alternate's name
   * after a comma. It is stripped OFF `stage_name` (68 of 104 alternate cells
   * carry one, and none of them would ever match a `personalities` row with the
   * title still glued on) and kept here rather than discarded.
   *
   * `competition_entrants` has no column for it today; the field exists so the
   * fact survives the scrape and a later column costs no re-scrape. It is
   * absent from the Drag Race spine's objects, which is fine — the seed
   * generator reads a fixed set of keys.
   */
  qualifying_title?: string | null;
}

export interface PageantEdition {
  competition_slug: string;
  competition_name: string;
  competition_kind: 'pageant';
  competition_country: string | null;
  organizer: string | null;
  edition_slug: string;
  edition_number: number;
  title: string;
  page: string;
  first_aired: string | null;
  last_aired: string | null;
  host_city_text: string | null;
  host_country_text: string | null;
  entrants: PageantEntrant[];
  episodes: never[];
  results: never[];
}

// ---------------------------------------------------------------------------
// Cells that are NOT a person.
//
// Every one of these was observed in a winner column: IML 2020/2021 ("Contest
// cancelled due to COVID-19 pandemic"), Miss Continental 2020 ("canceled due to
// the COVID-19 pandemic"), Mr Gay World's 4th/5th runner-up ("Not awarded"),
// MIR 2020 ("Contest was virtual and no MIR titleholder was crowned"), Miss
// Fabulous Thailand 2025 ("TBA"), Mr. Gay India 2009 ("Did not compete").
//
// Rejecting them is not a judgement call — each is the page saying in prose
// that no person holds the slot. Inventing an entrant from one would be worse
// than the gap.
// ---------------------------------------------------------------------------
const NOT_A_PERSON_RE =
  /^(n\/?a|tba|tbd|tbc|—|–|-|\?+)$|cancell?ed|not held|no contest|no pageant|not awarded|no winner|did not compete|was virtual|postponed|vacant|unknown|pandemic/i;

/**
 * Columns a spec may never map. `given name` is Miss Gay America's REAL-NAME
 * column, sitting immediately beside the titleholder — the single easiest way
 * to out 56 performers by copying one more index. There is no field for it in
 * the contract and no column for it in `competition_entrants`; this list is the
 * third layer, and it throws rather than warns.
 */
const FORBIDDEN_COLUMNS = [/given name/, /legal name/, /real name|birth name/];

// ---------------------------------------------------------------------------
// Place vocabulary.
//
// Used ONLY to recognise the tail of a venue string, never to invent one. A
// venue whose tail matches nothing yields host_city_text = host_country_text =
// null and is TALLIED in `unparsed_venue_text`, so the gap is countable and the
// list can be extended from a measurement instead of a guess.
//
// The alternative — "last comma segment is the country" — was measured against
// these 11 pages and produces `Tennessee`, `Arkansas`, `Congress Plaza Hotel`
// and `Riviera Theatre` as countries. IML's column is literally named "Contest
// location & host hotel" and on most rows carries only the theatre.
// ---------------------------------------------------------------------------
const COUNTRIES = new Set(
  [
    'Angola', 'Argentina', 'Australia', 'Austria', 'Belarus', 'Belgium', 'Bolivia', 'Brazil',
    'Bulgaria', 'Canada', 'Chile', 'China', 'Colombia', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus',
    'Czech Republic', 'Czechia', 'Denmark', 'Ecuador', 'Egypt', 'England', 'Estonia', 'Finland',
    'France', 'Germany', 'Great Britain', 'Greece', 'Hong Kong', 'Hungary', 'Iceland', 'India',
    'Indonesia', 'Ireland', 'Israel', 'Italy', 'Japan', 'Latvia', 'Lebanon', 'Lithuania',
    'Luxembourg', 'Malta', 'Mexico', 'Moldova', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua',
    'Nigeria', 'Northern Ireland', 'Norway', 'Panama', 'Paraguay', 'Peru', 'Philippines', 'Poland',
    'Portugal', 'Puerto Rico', 'Romania', 'Russia', 'Scotland', 'Serbia', 'Singapore', 'Slovakia',
    'Slovenia', 'South Africa', 'South Korea', 'Spain', 'Sweden', 'Switzerland', 'Taiwan',
    'Thailand', 'Turkey', 'Ukraine', 'United Kingdom', 'United States', 'Uruguay', 'Venezuela',
    'Vietnam', 'Wales',
  ].map((c) => c.toLowerCase()),
);

/**
 * US states + DC. A pageant held in "Nashville, Tennessee" states no country,
 * and every page carrying that form (Miss Gay America, Miss Continental, IML)
 * is a US pageant. Mapping the state to "United States" is a fact about the
 * state, not an inference about the pageant.
 */
const US_STATES = new Set(
  [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
    'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas',
    'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
    'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah',
    'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
    'District of Columbia', 'D.C.', 'Washington, D.C.',
    // USPS codes. Miss Gay America writes "Robinson Center Auditorium, Little
    // Rock, AR" four times; without these that venue is unparsed. Two-letter
    // codes are matched ONLY as the last segment of a venue string, never in
    // prose, so the "ME"/"OR"/"IN" ambiguity that bit the news geo linker
    // (see CLAUDE.md, guard C) cannot arise here.
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
    'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH',
    'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA',
    'VT', 'WA', 'WI', 'WV', 'WY', 'DC',
  ].map((s) => s.toLowerCase()),
);

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------
interface RoleSpec {
  /** Matched against the column's EFFECTIVE header (see effectiveHeaders). */
  col: RegExp;
  /** placement_label written when the cell holds a person. The source's own words. */
  label: string;
  placement: number | null;
  is_winner?: boolean;
  is_runner_up?: boolean;
  /** Column carrying THIS entrant's hometown / represented country. */
  hometownCol?: RegExp;
}

/** A "one row = one edition" winners table. */
interface TitleholderTable {
  /** Nearest preceding section heading. Omit when the headers alone are decisive. */
  section?: RegExp;
  /** Every regex must match some effective header, or the table is skipped. */
  require: RegExp[];
  /** Any match disqualifies the table. */
  reject?: RegExp[];
  yearCol: RegExp;
  dateCol?: RegExp;
  venueCol?: RegExp;
  /**
   * Where the city sits inside the venue string.
   *  'first'          "Pattaya, Chonburi, Thailand" -> Pattaya
   *  'before-country' "Watch Your Hat & Coat Saloon, Nashville, Tennessee" -> Nashville
   * Miss Gay America's column is a VENUE plus a city; everyone else's is a city
   * plus optional region. One flag rather than a heuristic, because both forms
   * are three comma segments and nothing in the text distinguishes them.
   */
  cityFrom?: 'first' | 'before-country';
  roles: RoleSpec[];
}

/** A per-year contestant table whose year lives only in its section heading. */
interface EntrantTable {
  /** Must match the nearest preceding heading AND yield a 4-digit year from it. */
  section: RegExp;
  require: RegExp[];
  nameCol: RegExp;
  hometownCol?: RegExp;
  ageCol?: RegExp;
  /** Free-text outcome column ("1st Runner-Up", "Mr Gay Europe 2016"). */
  placementCol: RegExp;
  /** A cell matching this names the pageant itself, i.e. this entrant WON. */
  winnerTitleRe: RegExp;
}

/** A per-year special-awards table. Only Miss International Queen has one. */
interface AwardTable {
  section?: RegExp;
  require: RegExp[];
  reject?: RegExp[];
  yearCol: RegExp;
  congenialityCol: RegExp;
}

interface PageantSpec {
  page: string;
  slug: string;
  name: string;
  /**
   * `competitions.country_id` is where the pageant is BASED, not where an
   * edition is held. Each value below is the page's own infobox: IML/MIR
   * `country`, Miss Fabulous Thailand / Miss International Queen / Miss Star
   * International / Miss T World / Miss Gay America `headquarters`, Mr. Gay
   * India `national director` + `headquarters: Pune`. Mr Gay World and Mr Gay
   * Europe are deliberately null — an international pageant has no home
   * country and picking its current owner's would be a claim the page does not
   * make.
   */
  country: string | null;
  /** Infobox keys to read `organizer` from, in priority order. */
  organizerKeys?: RegExp[];
  titleholders?: TitleholderTable;
  entrantTables?: EntrantTable;
  awardTable?: AwardTable;
  /** Anything worth carrying into the report about this page specifically. */
  note?: string;
}

const YEAR_COL = /(^|\s)year(\s|$)/;

const SPECS: PageantSpec[] = [
  {
    page: 'International Mr. Leather',
    slug: 'international-mr-leather',
    name: 'International Mr. Leather',
    country: 'United States',
    organizerKeys: [/organi[sz]ed by/],
    // The page also carries International Mr. BOOTBLACK under "IMBB Winners" —
    // a different contest with the same year|winner|winner's city columns,
    // 34 rows from 1993 that would collide on (competition, year) with 33 IML
    // editions. The section gate is the only thing that separates them.
    titleholders: {
      section: /^winners$/,
      require: [YEAR_COL, /winner/, /winner's city/],
      yearCol: YEAR_COL,
      venueCol: /contest location/,
      roles: [
        {
          col: /^winner$/,
          label: 'International Mr. Leather',
          placement: 1,
          is_winner: true,
          hometownCol: /winner's city/,
        },
      ],
    },
    note:
      "The venue column is 'Contest location & host hotel' and on most rows holds only a theatre and hotel with no city, so host_city_text stays null there by design — the infobox says Chicago but the table never does.",
  },
  {
    page: 'Mr Gay World',
    slug: 'mr-gay-world',
    name: 'Mr Gay World',
    country: null,
    organizerKeys: [/organi[sz]ed by/, /parent organi[sz]ation/, /^owner$/],
    titleholders: {
      require: [YEAR_COL, /mr gay world/, /runner-?up first/],
      yearCol: YEAR_COL,
      dateCol: /^date$/,
      venueCol: /location/,
      roles: [
        { col: /^mr gay world$/, label: 'Mr Gay World', placement: 1, is_winner: true },
        // Introduced by the 2025 header block, which is also why headerSegments
        // exists — under the pre-2025 headers these two columns sat where
        // "Runner-up / First" and "Second" used to, and their holders were
        // published as runners-up they are not. Parallel titles, so placement
        // stays null exactly as with Miss Continental's five sibling crowns.
        {
          col: /^mr gay world intercontinental$/,
          label: 'Mr Gay World Intercontinental',
          placement: null,
        },
        { col: /^mr gay world tourism$/, label: 'Mr Gay World Tourism', placement: null },
        { col: /runner-?ups? first/, label: '1st Runner-Up', placement: 2, is_runner_up: true },
        { col: /runner-?ups? second/, label: '2nd Runner-Up', placement: 3, is_runner_up: true },
        { col: /runner-?ups? third/, label: '3rd Runner-Up', placement: 4, is_runner_up: true },
        { col: /runner-?ups? fourth/, label: '4th Runner-Up', placement: 5, is_runner_up: true },
        { col: /runner-?ups? fifth/, label: '5th Runner-Up', placement: 6, is_runner_up: true },
      ],
    },
  },
  {
    page: 'Mr Gay Europe',
    slug: 'mr-gay-europe',
    name: 'Mr Gay Europe',
    country: null,
    // This page has no infobox at all, so organizer is null and says so.
    organizerKeys: [/organi[sz]ed by/, /parent organi[sz]ation/, /^owner$/],
    titleholders: {
      section: /previous winners/,
      require: [YEAR_COL, /delegate/, /venue/],
      yearCol: YEAR_COL,
      venueCol: /venue/,
      roles: [
        {
          col: /^delegate$/,
          label: 'Mr Gay Europe',
          placement: 1,
          is_winner: true,
          hometownCol: /^from$/,
        },
      ],
    },
    // 16 further tables, one per edition, under "2005 in Oslo", "2025 in
    // Amsterdam" and so on. They are the ONLY source of non-winning entrants
    // anywhere in this corpus, and of the 2025 edition, which the winners table
    // does not reach.
    entrantTables: {
      section: /^\d{4}\b.*\bin\b/,
      require: [/contestant/, /^title$/],
      nameCol: /contestant/,
      hometownCol: /^country$/,
      ageCol: /^age$/,
      placementCol: /^title$/,
      winnerTitleRe: /^mr gay europe\b/i,
    },
  },
  {
    page: 'MIR contest',
    slug: 'mister-international-rubber',
    name: 'Mister International Rubber',
    country: 'United States',
    organizerKeys: [/organi[sz]ed by/],
    titleholders: {
      require: [YEAR_COL, /winner/, /winner's country/],
      yearCol: YEAR_COL,
      roles: [
        {
          col: /^winner$/,
          label: 'Mister International Rubber',
          placement: 1,
          is_winner: true,
          hometownCol: /winner's country/,
        },
      ],
    },
  },
  {
    page: 'Miss Fabulous Thailand',
    slug: 'miss-fabulous-thailand',
    name: 'Miss Fabulous Thailand',
    country: 'Thailand',
    organizerKeys: [/parent organi[sz]ation/, /organi[sz]ed by/],
    // `reject: /category/` drops the two Junior / Teenager / Boy / Junior Miss
    // sub-pageant tables, which are 7 rows over the years 2024 and 2025 and
    // would supply four different "winners" for 2024 alone.
    titleholders: {
      section: /titleholders/,
      require: [YEAR_COL, /titleholder/, /venue/],
      reject: [/category/],
      yearCol: YEAR_COL,
      venueCol: /venue/,
      roles: [
        { col: /^titleholder$/, label: 'Miss Fabulous Thailand', placement: 1, is_winner: true },
        { col: /runners? up first/, label: '1st Runner-Up', placement: 2, is_runner_up: true },
        { col: /runners? up second/, label: '2nd Runner-Up', placement: 3, is_runner_up: true },
      ],
    },
  },
  {
    page: 'Mr. Gay India',
    slug: 'mr-gay-india',
    name: 'Mr. Gay India',
    country: 'India',
    organizerKeys: [/parent organi[sz]ation/, /organi[sz]ed by/, /national director/],
    // The ONLY table on this page sits under the heading "Representatives to
    // Mister Gay World", and its `placement` column is that person's placement
    // AT MISTER GAY WORLD ("Top 10", "2nd Runner up", "Unplaced") — not their
    // placement in Mr. Gay India. Copying it here would publish an
    // international result as a national one, so it is not mapped at all:
    // placement stays null and placement_label is the section's own words.
    // is_winner is likewise NOT set — the table never says these people won
    // anything, only that they were sent.
    titleholders: {
      section: /representatives/,
      require: [YEAR_COL, /delegate/],
      yearCol: YEAR_COL,
      roles: [
        {
          col: /^delegate$/,
          label: 'Representative to Mister Gay World',
          placement: null,
          hometownCol: /^state$/,
        },
      ],
    },
    note:
      "The page's only table is a delegate list to Mister Gay World; its `placement` column is the placement at THAT pageant, so no placement and no winner flag is derived here.",
  },
  {
    page: 'Miss International Queen',
    slug: 'miss-international-queen',
    name: 'Miss International Queen',
    country: 'Thailand',
    organizerKeys: [/parent organi[sz]ation/, /organi[sz]ed by/],
    titleholders: {
      require: [YEAR_COL, /miss international queen/, /runners?-?ups? first/],
      yearCol: YEAR_COL,
      // "November 6" with no year — combined with the year column below.
      dateCol: /^date$/,
      venueCol: /location/,
      roles: [
        {
          col: /^miss international queen$/,
          label: 'Miss International Queen',
          placement: 1,
          is_winner: true,
        },
        { col: /runners?-?ups? first/, label: '1st Runner-Up', placement: 2, is_runner_up: true },
        { col: /runners?-?ups? second/, label: '2nd Runner-Up', placement: 3, is_runner_up: true },
      ],
    },
    awardTable: {
      section: /special awards/,
      require: [YEAR_COL, /miss congeniality/],
      yearCol: YEAR_COL,
      congenialityCol: /miss congeniality/,
    },
  },
  {
    page: 'Miss Star International',
    slug: 'miss-star-international',
    name: 'Miss Star International',
    country: 'United States',
    organizerKeys: [/parent organi[sz]ation/, /organi[sz]ed by/, /^founder$/],
    titleholders: {
      require: [YEAR_COL, /miss star international/, /runners? up first/],
      yearCol: YEAR_COL,
      venueCol: /venue/,
      roles: [
        {
          col: /^miss star international$/,
          label: 'Miss Star International',
          placement: 1,
          is_winner: true,
        },
        { col: /runners? up first/, label: '1st Runner-Up', placement: 2, is_runner_up: true },
        { col: /runners? up second/, label: '2nd Runner-Up', placement: 3, is_runner_up: true },
      ],
    },
  },
  {
    page: 'Miss T World',
    slug: 'miss-t-world',
    name: 'Miss T World',
    country: 'Italy',
    organizerKeys: [/parent organi[sz]ation/, /organi[sz]ed by/],
    titleholders: {
      require: [YEAR_COL, /titleholder/, /national title/],
      yearCol: YEAR_COL,
      venueCol: /venue/,
      roles: [
        {
          col: /^titleholder$/,
          label: 'Miss T World',
          placement: 1,
          is_winner: true,
          hometownCol: /^country$/,
        },
      ],
    },
  },
  {
    page: 'Miss Gay America',
    slug: 'miss-gay-america',
    name: 'Miss Gay America',
    country: 'United States',
    organizerKeys: [/^owner$/, /parent organi[sz]ation/, /organi[sz]ed by/],
    // The section gate matters twice here. It excludes the four sibling-title
    // tables (Mr. Gay All-American, Mr. Gay America, Gay America Esquire, Miss
    // Gay America Femme) which are separate competitions carrying the same
    // year|titleholder shape and would collide on 2017, 2018, 2025 and 2026.
    //
    // The header row of this table is a CAPTION repeated across all seven
    // columns; the real headers are the second row. effectiveHeaders() joins
    // both, which is why the regexes below read "... titleholder".
    //
    // Column 2 is "Given name" — the performer's REAL NAME. It is not mapped
    // and FORBIDDEN_COLUMNS makes reaching for it a hard failure.
    titleholders: {
      section: /list of winners/,
      require: [YEAR_COL, /titleholder/, /first alternate/],
      yearCol: YEAR_COL,
      venueCol: /crowning venue/,
      cityFrom: 'before-country',
      roles: [
        { col: /\btitleholder$/, label: 'Miss Gay America', placement: 1, is_winner: true },
        { col: /first alternate/, label: 'First Alternate', placement: 2, is_runner_up: true },
        { col: /second alternate/, label: 'Second Alternate', placement: 3, is_runner_up: true },
      ],
    },
  },
  {
    page: 'Miss Continental',
    slug: 'miss-continental',
    name: 'Miss Continental',
    country: 'United States',
    organizerKeys: [/^owner$/, /parent organi[sz]ation/, /organi[sz]ed by/],
    // Six PARALLEL titles are awarded on one night and the page gives each its
    // own column. All six people are entrants of the same edition. Only the
    // headline title sets is_winner — "who won Miss Continental 2024" must have
    // one answer — and the other five carry their own title as
    // placement_label with placement null, which is exactly what the source
    // says and no more.
    titleholders: {
      require: [YEAR_COL, /^miss continental$/],
      yearCol: YEAR_COL,
      roles: [
        { col: /^miss continental$/, label: 'Miss Continental', placement: 1, is_winner: true },
        { col: /^miss continental plus$/, label: 'Miss Continental Plus', placement: null },
        { col: /^miss continental elite$/, label: 'Miss Continental Elite', placement: null },
        { col: /^mister continental$/, label: 'Mister Continental', placement: null },
        { col: /^miss continental newcomer$/, label: 'Miss Continental Newcomer', placement: null },
        { col: /^mr\.? continental newcomer$/, label: 'Mr. Continental Newcomer', placement: null },
      ],
    },
    note:
      'Six parallel titles per night; only "Miss Continental" sets is_winner. A cell holding two names separated by <br /> keeps the first and the drop is counted in dropped_extra_names.',
  },
];

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

/**
 * The nearest preceding section heading of each wikitable, index-aligned with
 * `parseTables`.
 *
 * The table regex is a deliberate DUPLICATE of the one inside `parseTables`,
 * because that function returns parsed tables and not their offsets. Alignment
 * is therefore an assumption, so `readPage` ASSERTS the two counts match and
 * disables section gating loudly if they ever diverge — a silently misaligned
 * heading would let the International Mr. Bootblack table in under the IML
 * spec, which is the exact failure the gate exists to prevent.
 */
function tableHeadings(html: string): string[] {
  const tableRe = /<table\b[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  const offsets: number[] = [];
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(html))) offsets.push(tm.index);

  const headRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const heads: { index: number; text: string }[] = [];
  let hm: RegExpExecArray | null;
  while ((hm = headRe.exec(html))) heads.push({ index: hm.index, text: stripTags(hm[2]) });

  return offsets.map((off) => {
    let best = '';
    for (const h of heads) {
      if (h.index >= off) break;
      if (h.text) best = h.text;
    }
    return best;
  });
}

type Table = ReturnType<typeof parseTables>[number];
/** One expanded cell as `parseTables` emits it (the module is untyped .mjs). */
interface Cell {
  tag: 'th' | 'td';
  html: string;
  colspan: number;
  rowspan: number;
}

/**
 * One header string per column, joining the header row and every sub-header row
 * at that index.
 *
 * This is what lets ONE role regex address every page shape: a structural
 * runner-up column is `<th rowspan>Runners up</th>` over `<th>First</th>`, so
 * neither row alone identifies it, but "runners up first" does. It equally
 * rescues Miss Gay America, whose header row is a caption repeated seven times
 * and whose real headers are the sub-row ("miss gay america winners titleholder").
 * Duplicates are collapsed so a caption repeated across a colspan does not
 * appear once per column it spans.
 */
function effectiveHeaders(t: Table): string[] {
  const rows: string[][] = [t.headers ?? [], ...(t.subHeaders ?? [])];
  const width = Math.max(0, ...rows.map((r) => r.length));
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const parts: string[] = [];
    for (const r of rows) {
      const v = (r[i] ?? '').replace(/\s+/g, ' ').trim();
      if (v && !parts.includes(v)) parts.push(v);
    }
    out.push(parts.join(' ').toLowerCase());
  }
  return out;
}

const colIndexBy = (headers: string[], re: RegExp) => headers.findIndex((h) => re.test(h));

/**
 * Split a table at every MID-TABLE header row, returning each run of data rows
 * beside the headers that actually describe it.
 *
 * `parseTables` collects only LEADING all-`th` rows into `subHeaders`, which is
 * right for the progress grids it was written for. Mr Gay World breaks that
 * assumption: after 16 editions the page inserts a fresh two-row header block
 * because the 2025 edition added two new titles, so the columns shift —
 * "Runner-up / First" moves from index 4 to index 6.
 *
 * THIS WAS NOT A CRASH, IT WAS SILENTLY WRONG. Read under the first block's
 * headers, the 2025 row published Mr Gay World Intercontinental as the 1st
 * Runner-Up, Mr Gay World Tourism as the 2nd, and the real 1st Runner-Up as the
 * 3rd. Nothing about the output looked malformed. A table that changes shape
 * mid-way must be re-read from its own header row, not from the first one.
 */
function headerSegments(t: Table): { headers: string[]; rows: Table['rows'] }[] {
  const segs: { headers: string[]; rows: Table['rows'] }[] = [
    { headers: effectiveHeaders(t), rows: [] },
  ];
  const labels = (row: Cell[]) => row.map((c) => (c ? stripTags(c.html).toLowerCase() : ''));
  let pending: string[][] | null = null;
  for (const row of t.rows as Cell[][]) {
    const present = row.filter(Boolean);
    const allTh = present.length > 1 && present.every((c) => c.tag === 'th');
    if (allTh) {
      // Consecutive all-th rows are one block (label row + sub-label row),
      // bounded at two exactly as parseTables bounds its own leading block.
      if (pending && pending.length < 2) pending.push(labels(row));
      else pending = [labels(row)];
      continue;
    }
    if (pending) {
      segs.push({ headers: effectiveHeaders({ headers: pending[0], subHeaders: pending.slice(1), rows: [] } as Table), rows: [] });
      pending = null;
    }
    segs[segs.length - 1].rows.push(row);
  }
  return segs.filter((s) => s.rows.length);
}

/**
 * A colspan note row — "2008 No contest due to Political Turmoil" stretched
 * across all nine columns of the Miss International Queen table.
 *
 * `expandRow` in the shared parser puts the SAME cell OBJECT at every index it
 * spans, so identity across the whole row is an exact test rather than a string
 * heuristic. It matters because such a row DOES carry a parseable year (2008,
 * 2017, 2021) and would otherwise mint an edition whose every entrant is the
 * sentence explaining that no edition happened.
 */
function isNoteRow(row: Table['rows'][number]): boolean {
  const present = row.filter(Boolean);
  return present.length > 1 && new Set(present).size === 1;
}

/**
 * Split a person cell into the name and, where the source qualifies it, a
 * hometown or represented country.
 *
 * The name is the text BEFORE the first `<br />`. Every international page uses
 * `NAME<br /><span class="flagicon">…</span> <a>Country</a>`, so a plain
 * stripTags yields "Treechada Petcharat Thailand" — a name that exists nowhere,
 * and one that would then fail to match the personality it should link to.
 *
 * The trailing segment becomes `hometown_text` ONLY when the source marks it as
 * a place: inside a `flagicon` span, or parenthesised (Miss Fabulous Thailand
 * writes "Chutikarn Suwannakhot<br />(Bangkok)"). Otherwise it is dropped and
 * counted — Miss Continental uses the same `<br />` for a SECOND PERSON
 * ("Whitney Paige †<br />Farra N. Hyte"), and filing a co-titleholder as a
 * hometown would be a fabricated place and a lost person at once.
 */
const FLAGICON_RE = /class="[^"]*flagicon/i;

/**
 * Preliminary titles the source appends to an alternate's name, comma-separated
 * — "Dani Daletto, Miss Gay Michigan America". Measured on Miss Gay America:
 * 68 of 104 alternate cells carry one, and every single remainder starts with
 * one of these tokens, so the split is decided by what FOLLOWS the comma rather
 * than by assuming a drag name never contains one.
 */
const PRELIM_TITLE_RE = /^(miss|mr\.?|mister|1st|2nd|first|second)\b/i;

function personCell(html: string): {
  name: string;
  qualifier: string | null;
  /** A preliminary title stripped off the name. Counted, not published. */
  prelim: string | null;
  /** A SECOND PERSON we could not represent. Counted; this one is a real loss. */
  extra: string | null;
  /**
   * The half of the cell holding the NAME. Callers must read `wikipedia_title`
   * from this and never from the whole cell: the other half is a flag icon
   * whose link is the COUNTRY, so `firstLinkTitle(cell)` returned "Italy" for
   * Giulio Spatola, "Japan" for Daisuke Kawarada and so on — an entrant pointed
   * at a country article, which is exactly the wrong-entity class the tag
   * repair spent a whole migration undoing.
   */
  nameHtml: string;
} {
  const br = html.search(/<br\s*\/?>/i);
  const headHtml = br < 0 ? html : html.slice(0, br);
  const tailHtml = br < 0 ? '' : html.slice(br);

  const clean = (s: string) => s.replace(/[†‡*]+/g, '').replace(/\s+/g, ' ').trim();

  // The two halves can arrive in EITHER order. The winners tables write
  // "NAME<br /><flagicon>Country", the Miss International Queen special-awards
  // table writes "<flagicon>Country<br />NAME". Whichever half carries the flag
  // is the place; deciding by position instead would name 18 award winners
  // "Thailand", "Vietnam" and "Honduras".
  const flagInHead = FLAGICON_RE.test(headHtml);
  const flagInTail = FLAGICON_RE.test(tailHtml);
  const nameHtml = flagInHead && !flagInTail && tailHtml ? tailHtml : headHtml;
  const otherHtml = nameHtml === headHtml ? tailHtml : headHtml;

  // A dagger marks a deceased titleholder on Miss Continental. It is a
  // typographic annotation, not part of the name.
  let name = clean(stripTags(nameHtml));
  let prelim: string | null = null;
  let extra: string | null = null;

  const comma = name.indexOf(',');
  if (comma > 0 && PRELIM_TITLE_RE.test(name.slice(comma + 1).trim())) {
    prelim = name.slice(comma + 1).trim();
    name = name.slice(0, comma).trim();
  }

  let qualifier: string | null = null;
  if (otherHtml) {
    const otherText = clean(stripTags(otherHtml));
    const paren = otherText.match(/^\(([^)]+)\)$/);
    if (FLAGICON_RE.test(otherHtml)) {
      // "Germany(Resigned)" — the succession note is not part of the country.
      qualifier = otherText.replace(/\s*\([^)]*\)\s*$/, '').trim() || null;
    } else if (paren) qualifier = paren[1].trim() || null;
    else if (otherText) extra = otherText;
  }
  return { name, qualifier, prelim, extra, nameHtml };
}

/**
 * The linked article for an entrant, or null.
 *
 * `firstLinkTitle` already rejects File:/Category:/season articles. The extra
 * gate here is the place vocabulary: even inside the name half, a cell can link
 * a country or a US state, and a null link is recoverable while a link to
 * "Italy" publishes a country's article as a person's biography.
 */
function entrantLink(nameHtml: string): string | null {
  const t = firstLinkTitle(nameHtml);
  if (!t) return null;
  const k = t.toLowerCase();
  if (COUNTRIES.has(k) || US_STATES.has(k)) return null;
  return t;
}

const isPerson = (name: string) =>
  Boolean(name) && /[a-z]/i.test(name) && !NOT_A_PERSON_RE.test(name.trim());

/**
 * "Chiang Mai, Thailand" -> { city: 'Chiang Mai', country: 'Thailand' }
 * "Watch Your Hat & Coat Saloon, Nashville, Tennessee" -> Nashville / United States
 * "Auditorium Theatre & Congress Plaza Hotel" -> null / null, tallied
 */
function parseVenue(
  raw: string,
  mode: 'first' | 'before-country',
): { city: string | null; country: string | null; unparsed: string | null } {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return { city: null, country: null, unparsed: null };

  // Mr Gay World writes the pandemic years as "Virtual contest(Cape Town, South
  // Africa)". The place is INSIDE the parentheses; stripping them instead glues
  // the prose onto the city and yields "Virtual contestCape Town".
  const inner = text.match(/\(([^)]*,[^)]*)\)/);
  const attempt = (s: string) => {
    const segs = s
      .split(',')
      .map((x) => x.replace(/[()[\]]/g, '').trim())
      .filter(Boolean);
    if (!segs.length) return null;
    const tail = segs[segs.length - 1];
    const key = tail.toLowerCase();
    let country: string | null = null;
    if (COUNTRIES.has(key)) country = tail;
    else if (US_STATES.has(key)) country = 'United States';
    if (!country) return null;
    const city = mode === 'before-country' ? (segs[segs.length - 2] ?? null) : segs[0];
    // A one-segment string that IS a country names no city.
    return { city: city && city !== tail ? city : null, country, unparsed: null };
  };

  return attempt(inner ? inner[1] : text) ?? attempt(text) ?? { city: null, country: null, unparsed: text };
}

/**
 * `parsePlacement` from the spine importer, plus ONE pageant-domain correction.
 *
 * The flags and the label parse identically — that is why it is reused rather
 * than reimplemented. But in a pageant "1st Runner-Up" is SECOND place, and the
 * spine's ordinal reader returns 1, which would give an edition two entrants at
 * placement 1: the winner and the person who lost to them. In drag-race prose
 * "1st" is a finishing position and the shared function is right; here the
 * ordinal counts runners-up, so it shifts by one. The correction fires ONLY
 * when the source explicitly said "runner-up" AND stated an ordinal.
 *
 * "Top 10", "Unplaced", "Did not compete" all leave placement null and keep
 * their raw text — the ordinal regex needs an st/nd/rd/th suffix, so a "top N"
 * band can never be mistaken for an Nth-place finish.
 */
export function parsePageantPlacement(raw: string | null | undefined, winnerTitleRe?: RegExp): Placement {
  const base = parsePlacement(raw);
  const label = base.placement_label;

  if (winnerTitleRe && label && winnerTitleRe.test(label)) {
    return { ...base, placement: 1, is_winner: true, is_runner_up: false };
  }
  if (base.is_runner_up && base.placement != null && /\d+\s*(?:st|nd|rd|th)\b/i.test(label ?? '')) {
    return { ...base, placement: base.placement + 1 };
  }
  return base;
}

// ---------------------------------------------------------------------------
// Page acquisition
// ---------------------------------------------------------------------------
interface Page {
  title: string;
  tables: Table[];
  headings: string[];
  infobox: ReturnType<typeof parseInfobox>;
  sectionsAligned: boolean;
}

async function readPage(title: string): Promise<Page | null> {
  const j = await fetchCached(
    apiUrl({ action: 'parse', prop: 'text', page: title, redirects: '1' }),
    'page_' + title,
  );
  if (!j || j.__notfound || !j?.parse?.text) return null;
  const html: string = j.parse.text;
  const tables = parseTables(html);
  const headings = tableHeadings(html);
  const sectionsAligned = headings.length === tables.length;
  if (!sectionsAligned) {
    console.warn(
      `  ! ${title}: ${tables.length} tables but ${headings.length} heading anchors — section gating DISABLED for this page`,
    );
  }
  return { title: j.parse.title ?? title, tables, headings, infobox: parseInfobox(html), sectionsAligned };
}

function pickInfobox(page: Page, keys: RegExp[] | undefined): string | null {
  if (!keys) return null;
  for (const re of keys) {
    const k = Object.keys(page.infobox).find((x) => re.test(x));
    if (!k) continue;
    // Infobox cells routinely carry an inlined `.mw-parser-output{...}` style
    // block ahead of the value; anything that long is markup, not an organizer.
    const v = page.infobox[k].text.replace(/\.mw-parser-output[\s\S]*?\}/g, '').trim();
    if (v && v.length <= 120) return v;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-pageant parse
// ---------------------------------------------------------------------------
interface PageantReport {
  slug: string;
  page: string;
  resolved_page: string | null;
  parsed: boolean;
  editions: number;
  entrants: number;
  winners: number;
  editions_with_date: number;
  editions_with_host_city: number;
  tables_on_page: number;
  tables_read: number;
  tables_skipped: { headers: string; heading: string; why: string }[];
  /** >0 only where a table changes column layout mid-way (Mr Gay World). */
  header_blocks: number;
  /**
   * Rows the source split within one year ("2010-A" / "2010-B", a dethroning).
   * They are MERGED into one edition carrying both titleholders — never
   * dropped — and listed here so the merge is visible rather than silent.
   */
  sub_editions: { year: number; marker: string; stage_name: string; role: string }[];
  rows_skipped_note: number;
  rows_skipped_no_year: number;
  cells_not_a_person: number;
  /** A SECOND PERSON in one cell that the edition/name grain cannot hold. */
  dropped_extra_names: number;
  /** ", Miss Gay Texas America" removed from a name. Not a lost person. */
  stripped_prelim_titles: number;
  miss_congeniality_matched: number;
  miss_congeniality_added: number;
  unparsed_placement_labels: { label: string; count: number }[];
  unparsed_venue_text: { text: string; count: number }[];
  organizer: string | null;
  country: string | null;
  note?: string;
  failure?: string;
}

function tableMatches(
  t: Table,
  headers: string[],
  heading: string,
  sectionsAligned: boolean,
  spec: { section?: RegExp; require: RegExp[]; reject?: RegExp[] },
): string | null {
  if (spec.section && sectionsAligned && !spec.section.test(heading.toLowerCase())) {
    return `section "${heading}" does not match ${spec.section}`;
  }
  for (const re of spec.require) {
    if (colIndexBy(headers, re) < 0) return `no column matching ${re}`;
  }
  for (const re of spec.reject ?? []) {
    if (colIndexBy(headers, re) >= 0) return `rejected: column matching ${re}`;
  }
  if (!t.rows.length) return 'no data rows';
  return null;
}

async function importPageant(spec: PageantSpec): Promise<{
  editions: PageantEdition[];
  report: PageantReport;
}> {
  const report: PageantReport = {
    slug: spec.slug,
    page: spec.page,
    resolved_page: null,
    parsed: false,
    editions: 0,
    entrants: 0,
    winners: 0,
    editions_with_date: 0,
    editions_with_host_city: 0,
    tables_on_page: 0,
    tables_read: 0,
    tables_skipped: [],
    header_blocks: 0,
    sub_editions: [],
    rows_skipped_note: 0,
    rows_skipped_no_year: 0,
    cells_not_a_person: 0,
    dropped_extra_names: 0,
    stripped_prelim_titles: 0,
    miss_congeniality_matched: 0,
    miss_congeniality_added: 0,
    unparsed_placement_labels: [],
    unparsed_venue_text: [],
    organizer: null,
    country: spec.country,
    note: spec.note,
  };

  const page = await readPage(spec.page);
  if (!page) {
    report.failure = 'page not found';
    return { editions: [], report };
  }
  report.resolved_page = page.title;
  report.tables_on_page = page.tables.length;
  report.organizer = pickInfobox(page, spec.organizerKeys);

  const unparsedLabels = new Map<string, number>();
  const unparsedVenues = new Map<string, number>();

  // year -> edition under construction
  const byYear = new Map<number, { edition: PageantEdition; source: string }>();

  const ensureEdition = (year: number, source: string): PageantEdition | null => {
    const existing = byYear.get(year);
    if (existing) {
      if (existing.source !== source) {
        // A second SOURCE for a year is a merge (Mr Gay Europe's winners table
        // plus its per-year contestant table), not a collision.
        return existing.edition;
      }
      return existing.edition;
    }
    const edition: PageantEdition = {
      competition_slug: spec.slug,
      competition_name: spec.name,
      competition_kind: 'pageant',
      competition_country: spec.country,
      organizer: report.organizer,
      edition_slug: `${spec.slug}-${year}`,
      edition_number: year,
      title: `${spec.name} ${year}`,
      page: page.title,
      first_aired: null,
      last_aired: null,
      host_city_text: null,
      host_country_text: null,
      entrants: [],
      episodes: [],
      results: [],
    };
    byYear.set(year, { edition, source });
    return edition;
  };

  /** Add an entrant, keeping the better-placed row when a name repeats. */
  const addEntrant = (edition: PageantEdition, e: PageantEntrant) => {
    const existing = edition.entrants.find((x) => x.key === e.key);
    if (!existing) {
      edition.entrants.push(e);
      return;
    }
    if (!existing.hometown_text && e.hometown_text) existing.hometown_text = e.hometown_text;
    if (existing.age_at_filming == null) existing.age_at_filming = e.age_at_filming;
    if (!existing.wikipedia_title) existing.wikipedia_title = e.wikipedia_title;
    if (!existing.qualifying_title && e.qualifying_title) existing.qualifying_title = e.qualifying_title;
    // Take the BETTER placement and the label that goes with it, not merely the
    // first non-null one. Dani Daletto is the 1976-A Second Alternate AND the
    // 1976-B titleholder; Patti Le Plae Safe and Coco Montrese are the same
    // shape in 1995 and 2010. Keeping the first placement while OR-ing
    // `is_winner` produced `is_winner=true, placement=3`, which the migration's
    // `competition_entrants_winner_is_first` CHECK rejects outright — a merge
    // that reads fine in NDJSON and fails at seed time.
    if (e.placement != null && (existing.placement == null || e.placement < existing.placement)) {
      existing.placement = e.placement;
      existing.placement_label = e.placement_label;
    }
    existing.is_winner ||= e.is_winner;
    existing.is_runner_up ||= e.is_runner_up;
    existing.is_miss_congeniality ||= e.is_miss_congeniality;
  };

  // ---- titleholder tables -------------------------------------------------
  if (spec.titleholders) {
    const ts = spec.titleholders;
    for (const re of ts.roles.map((r) => r.col).concat(ts.venueCol ? [ts.venueCol] : [])) {
      for (const bad of FORBIDDEN_COLUMNS) {
        if (bad.test(re.source.toLowerCase())) {
          throw new Error(`${spec.slug}: spec maps a forbidden real-name column (${re})`);
        }
      }
    }

    let matched = 0;
    page.tables.forEach((t, i) => {
      const tableHeaders = effectiveHeaders(t);
      const heading = page.headings[i] ?? '';
      const why = tableMatches(t, tableHeaders, heading, page.sectionsAligned, ts);
      if (why) {
        report.tables_skipped.push({ headers: tableHeaders.join(' | '), heading, why });
        return;
      }
      matched++;
      report.tables_read++;

      // A table can change shape mid-way (see headerSegments); each run of data
      // rows is read under the headers that describe IT.
      const segments = headerSegments(t);
      if (segments.length > 1) report.header_blocks += segments.length;
      for (const seg of segments) {
      const headers = seg.headers;

      // The forbidden-column guard again, this time against the LIVE page: a
      // spec regex that is innocent in isolation can still land on a real-name
      // column if Wikipedia reorders. Assert on what we are about to read.
      for (const role of ts.roles) {
        const ci = colIndexBy(headers, role.col);
        if (ci < 0) continue;
        for (const bad of FORBIDDEN_COLUMNS) {
          if (bad.test(headers[ci])) {
            throw new Error(
              `${spec.slug}: role ${role.col} resolved to real-name column "${headers[ci]}"`,
            );
          }
        }
      }

      const yi = colIndexBy(headers, ts.yearCol);
      const di = ts.dateCol ? colIndexBy(headers, ts.dateCol) : -1;
      const vi = ts.venueCol ? colIndexBy(headers, ts.venueCol) : -1;

      for (const row of seg.rows) {
        if (isNoteRow(row)) {
          report.rows_skipped_note++;
          continue;
        }
        const yearRaw = yi >= 0 && row[yi] ? stripTags(row[yi].html) : '';
        const ym = yearRaw.match(/\b(1[89]\d{2}|20\d{2})\b/);
        if (!ym) {
          report.rows_skipped_no_year++;
          continue;
        }
        const year = parseInt(ym[1], 10);

        // A SECOND ROW FOR A YEAR IS A SECOND TITLEHOLDER, NOT A SECOND EDITION.
        //
        // `(competition_id, edition_number)` is unique, so two editions cannot
        // exist — but an edition holds MANY entrants, and that is the shape the
        // source is describing. All three occurrences in this corpus are Miss
        // Gay America dethronings, written as "1976-A"/"1976-B", "1995-A"/"-B",
        // "2010-A"/"-B": Alyssa Edwards was stripped of the 2010 title and Coco
        // Montrese succeeded her, and BOTH genuinely held it. Dropping the
        // second row would delete a real titleholder from the record; merging
        // them into one edition with two `is_winner` entrants loses nothing.
        //
        // The sub-edition marker the source itself writes ("1976-B") goes into
        // `placement_label`, so the two are distinguishable without inventing
        // any wording.
        // The marker is read off the row itself, not off "is this the second row
        // I have seen", so BOTH halves of a split year are labelled — "Miss Gay
        // America (2010-A)" and "(2010-B)". Labelling only the later one would
        // make the first look like the sole titleholder. Bounded in length so a
        // prose year cell can never become a placement label.
        const yearCell = yearRaw.trim();
        const subLabel =
          yearCell !== String(year) && yearCell.length <= 20 && yearCell.includes(String(year))
            ? yearCell
            : null;
        const edition = ensureEdition(year, 'titleholders')!;

        if (di >= 0 && row[di]) {
          const dateRaw = stripTags(row[di].html);
          // "November 6" carries no year on the Miss International Queen page;
          // the year column is the only place it exists.
          const iso =
            parseWikiDate(dateRaw) ?? parseWikiDate(/\d{4}/.test(dateRaw) ? dateRaw : `${dateRaw} ${year}`);
          if (iso && !edition.first_aired) {
            // A pageant is decided in one night, so the edition opens and closes
            // on the same date. Both columns are filled rather than leaving
            // last_aired null, because "ran on one day" is a fact the source
            // states and "we do not know when it ended" is not.
            //
            // Fill-if-empty, never overwrite: a dethroning's successor row
            // carries the SPECIAL CEREMONY's date and venue, and the edition
            // holds one of each. The originally crowned night is the edition's.
            edition.first_aired = iso;
            edition.last_aired = iso;
          }
        }

        if (vi >= 0 && row[vi]) {
          const venueText = stripTags(row[vi].html.replace(/<br\s*\/?>/gi, ', '));
          const v = parseVenue(venueText, ts.cityFrom ?? 'first');
          if (v.city && !edition.host_city_text) edition.host_city_text = v.city;
          if (v.country && !edition.host_country_text) edition.host_country_text = v.country;
          if (v.unparsed) unparsedVenues.set(v.unparsed, (unparsedVenues.get(v.unparsed) ?? 0) + 1);
        }

        for (const role of ts.roles) {
          const ci = colIndexBy(headers, role.col);
          if (ci < 0 || !row[ci]) continue;
          const { name, qualifier, prelim, extra, nameHtml } = personCell(row[ci].html);
          if (!isPerson(name)) {
            if (name) report.cells_not_a_person++;
            continue;
          }
          if (extra) report.dropped_extra_names++;
          if (prelim) report.stripped_prelim_titles++;
          if (subLabel) {
            report.sub_editions.push({ year, marker: subLabel, stage_name: name, role: role.label });
          }

          let hometown = qualifier;
          if (!hometown && role.hometownCol) {
            const hi = colIndexBy(headers, role.hometownCol);
            if (hi >= 0 && row[hi]) {
              const h = stripTags(row[hi].html).trim();
              if (h && !NOT_A_PERSON_RE.test(h)) hometown = h;
            }
          }

          addEntrant(edition, {
            key: normKey(name),
            stage_name: name,
            wikipedia_title: entrantLink(nameHtml),
            placement: role.placement,
            placement_label: subLabel ? `${role.label} (${subLabel})` : role.label,
            is_winner: Boolean(role.is_winner),
            is_runner_up: Boolean(role.is_runner_up),
            is_miss_congeniality: false,
            hometown_text: hometown,
            age_at_filming: null,
            qualifying_title: prelim,
          });
        }
      }
      }
    });

    if (!matched) report.failure = 'no table matched the titleholder spec';
  }

  // ---- award tables (Miss Congeniality) -----------------------------------
  //
  // `is_miss_congeniality` is in the contract because the Drag Race spine needs
  // it, and it would otherwise be uniformly false across all 260 pageant
  // editions. Exactly one page in this corpus states the award as a column:
  // Miss International Queen's "List of special awards winners". Reading it is
  // the difference between a field that carries a fact and a field that carries
  // a default.
  //
  // The award winner is USUALLY already an entrant (2024's is that year's 1st
  // Runner-Up). When she is not, she is added with placement null — she
  // competed, the source says so, and we do not know where she placed.
  if (spec.awardTable) {
    const aw = spec.awardTable;
    page.tables.forEach((t, i) => {
      const headers = effectiveHeaders(t);
      const heading = page.headings[i] ?? '';
      if (tableMatches(t, headers, heading, page.sectionsAligned, aw)) return;
      report.tables_read++;
      const yi = colIndexBy(headers, aw.yearCol);
      const ci = colIndexBy(headers, aw.congenialityCol);
      if (yi < 0 || ci < 0) return;
      for (const row of t.rows) {
        if (isNoteRow(row) || !row[yi] || !row[ci]) continue;
        const ym = stripTags(row[yi].html).match(/\b(19\d{2}|20\d{2})\b/);
        if (!ym) continue;
        const edition = byYear.get(parseInt(ym[1], 10))?.edition;
        if (!edition) continue;
        const { name, qualifier, nameHtml } = personCell(row[ci].html);
        if (!isPerson(name)) continue;
        const key = normKey(name);
        const existing = edition.entrants.find((x) => x.key === key);
        if (existing) {
          existing.is_miss_congeniality = true;
          report.miss_congeniality_matched++;
        } else {
          addEntrant(edition, {
            key,
            stage_name: name,
            wikipedia_title: entrantLink(nameHtml),
            placement: null,
            placement_label: 'Miss Congeniality',
            is_winner: false,
            is_runner_up: false,
            is_miss_congeniality: true,
            hometown_text: qualifier,
            age_at_filming: null,
          });
          report.miss_congeniality_added++;
        }
      }
    });
  }

  // ---- per-year entrant tables (Mr Gay Europe) ----------------------------
  if (spec.entrantTables) {
    const es = spec.entrantTables;
    page.tables.forEach((t, i) => {
      const headers = effectiveHeaders(t);
      const heading = page.headings[i] ?? '';
      const why = tableMatches(t, headers, heading, page.sectionsAligned, es);
      if (why) {
        // Already reported by the titleholder pass on this page; only add rows
        // the titleholder spec did not itself explain.
        if (!report.tables_skipped.some((s) => s.headers === headers.join(' | ') && s.heading === heading)) {
          report.tables_skipped.push({ headers: headers.join(' | '), heading, why });
        }
        return;
      }
      const ym = heading.match(/\b(19\d{2}|20\d{2})\b/);
      if (!ym) {
        report.tables_skipped.push({ headers: headers.join(' | '), heading, why: 'no year in heading' });
        return;
      }
      report.tables_read++;
      const year = parseInt(ym[1], 10);
      const edition = ensureEdition(year, 'entrants')!;

      const ni = colIndexBy(headers, es.nameCol);
      const hi = es.hometownCol ? colIndexBy(headers, es.hometownCol) : -1;
      const ai = es.ageCol ? colIndexBy(headers, es.ageCol) : -1;
      const pi = colIndexBy(headers, es.placementCol);

      for (const row of t.rows) {
        if (isNoteRow(row) || ni < 0 || !row[ni]) continue;
        const { name, nameHtml } = personCell(row[ni].html);
        if (!isPerson(name)) {
          if (name) report.cells_not_a_person++;
          continue;
        }
        const raw = pi >= 0 && row[pi] ? stripTags(row[pi].html).trim() : '';
        const placement = parsePageantPlacement(raw || null, es.winnerTitleRe);
        if (raw && placement.placement == null && !placement.is_winner) {
          // RULE 1: an unrecognised outcome keeps its words and is COUNTED,
          // never bucketed into a placement we did not read.
          unparsedLabels.set(raw, (unparsedLabels.get(raw) ?? 0) + 1);
        }
        const ageRaw = ai >= 0 && row[ai] ? stripTags(row[ai].html) : '';
        const age = parseInt((ageRaw.match(/\d+/) ?? [])[0] ?? '', 10);

        addEntrant(edition, {
          key: normKey(name),
          stage_name: name,
          wikipedia_title: entrantLink(nameHtml),
          ...placement,
          is_miss_congeniality: false,
          hometown_text: hi >= 0 && row[hi] ? stripTags(row[hi].html).trim() || null : null,
          age_at_filming: Number.isFinite(age) && age >= 15 && age <= 99 ? age : null,
        });
      }
    });
  }

  const editions = [...byYear.values()]
    .map((v) => v.edition)
    .filter((e) => e.entrants.length > 0)
    .sort((a, b) => a.edition_number - b.edition_number);

  report.parsed = editions.length > 0;
  report.editions = editions.length;
  report.entrants = editions.reduce((a, e) => a + e.entrants.length, 0);
  report.winners = editions.filter((e) => e.entrants.some((x) => x.is_winner)).length;
  report.editions_with_date = editions.filter((e) => e.first_aired).length;
  report.editions_with_host_city = editions.filter((e) => e.host_city_text).length;
  report.unparsed_placement_labels = [...unparsedLabels.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
  report.unparsed_venue_text = [...unparsedVenues.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([text, count]) => ({ text, count }));

  return { editions, report };
}

// ---------------------------------------------------------------------------
async function main() {
  // Spec slugs are hand-written because a page title is a poor slug ("MIR
  // contest" -> mister-international-rubber), but they must still be canonical
  // under the SAME slugifier the Drag Race spine uses — `competitions.slug` is
  // unique across both kinds and carries a format CHECK, so a spec slug that
  // does not round-trip would fail at seed time rather than here.
  for (const s of SPECS) {
    if (slugify(s.slug) !== s.slug) throw new Error(`spec slug is not canonical: ${s.slug}`);
  }

  const specs = SPECS.filter((s) => !PAGEANT_FILTER || s.slug.includes(PAGEANT_FILTER)).slice(0, LIMIT);
  console.log(`Importing ${specs.length} pageant page(s)…`);

  if (PRINT_HEADERS) {
    // Inspection mode. The shapes here are NOT uniform and this is how the
    // specs above were derived — print before believing anything.
    for (const spec of specs) {
      const page = await readPage(spec.page);
      console.log(`\n### ${spec.page} -> ${page?.title ?? 'NOT FOUND'} (${page?.tables.length ?? 0} tables)`);
      page?.tables.forEach((t, i) => {
        console.log(`  [${i}] rows=${t.rows.length} heading="${page.headings[i] ?? ''}"`);
        console.log(`       ${JSON.stringify(effectiveHeaders(t))}`);
      });
    }
    return;
  }

  const all: PageantEdition[] = [];
  const reports: PageantReport[] = [];
  for (const spec of specs) {
    const { editions, report } = await importPageant(spec);
    all.push(...editions);
    reports.push(report);
    console.log(
      `  ${spec.slug.padEnd(28)} editions=${String(report.editions).padStart(3)}` +
        ` entrants=${String(report.entrants).padStart(4)}` +
        ` winners=${String(report.winners).padStart(3)}` +
        (report.failure ? `  !! ${report.failure}` : ''),
    );
  }

  // ---- schema pre-flight --------------------------------------------------
  //
  // Every check below mirrors a constraint in
  // `20360101100000_competition_spine.sql`. They run here because the
  // alternative is discovering them when the seed migration aborts, with no
  // access to the row that caused it. The `winner_is_first` one is not
  // hypothetical: merging a dethroned edition produced `is_winner` with
  // `placement = 3` on first attempt.
  const slugs = new Set<string>();
  const dupSlugs: string[] = [];
  for (const e of all) {
    if (slugs.has(e.edition_slug)) dupSlugs.push(e.edition_slug);
    slugs.add(e.edition_slug);
  }

  const violations: string[] = [];
  const editionKeys = new Set<string>();
  for (const e of all) {
    const ek = `${e.competition_slug}|${e.edition_number}`;
    if (editionKeys.has(ek)) violations.push(`competition_editions_number_uniq: ${ek}`);
    editionKeys.add(ek);
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(e.edition_slug)) {
      violations.push(`competition_editions_slug_format: ${e.edition_slug}`);
    }
    if (e.last_aired && e.first_aired && e.last_aired < e.first_aired) {
      violations.push(`competition_editions_dates_ordered: ${e.edition_slug}`);
    }
    const names = new Set<string>();
    for (const x of e.entrants) {
      const nk = x.stage_name.toLowerCase();
      if (names.has(nk)) violations.push(`competition_entrants_season_name_uniq: ${e.edition_slug} / ${nk}`);
      names.add(nk);
      if (x.is_winner && x.placement != null && x.placement !== 1) {
        violations.push(`competition_entrants_winner_is_first: ${e.edition_slug} / ${x.stage_name} @ ${x.placement}`);
      }
      if (x.placement != null && x.placement < 1) {
        violations.push(`competition_entrants_placement_sane: ${e.edition_slug} / ${x.stage_name}`);
      }
      if (x.age_at_filming != null && (x.age_at_filming < 15 || x.age_at_filming > 99)) {
        violations.push(`competition_entrants_age_sane: ${e.edition_slug} / ${x.stage_name}`);
      }
    }
  }

  const summary = {
    generated_for: 'competition spine — kind=pageant',
    generated_at: new Date().toISOString(),
    pageants: reports.length,
    pageants_parsed: reports.filter((r) => r.parsed).length,
    pageants_empty: reports.filter((r) => !r.parsed).map((r) => ({ slug: r.slug, why: r.failure ?? 'no rows' })),
    editions: all.length,
    entrants: all.reduce((a, e) => a + e.entrants.length, 0),
    distinct_entrant_keys: new Set(all.flatMap((e) => e.entrants.map((x) => x.key))).size,
    editions_with_winner: all.filter((e) => e.entrants.some((x) => x.is_winner)).length,
    editions_with_date: all.filter((e) => e.first_aired).length,
    editions_with_host_city: all.filter((e) => e.host_city_text).length,
    entrants_with_wikipedia_title: all.reduce(
      (a, e) => a + e.entrants.filter((x) => x.wikipedia_title).length,
      0,
    ),
    // Always zero by construction; asserted so a future edit that starts
    // emitting an episode grid for a pageant is caught here.
    episode_rows: all.reduce((a, e) => a + e.episodes.length + e.results.length, 0),
    year_range: all.length
      ? [Math.min(...all.map((e) => e.edition_number)), Math.max(...all.map((e) => e.edition_number))]
      : null,
    duplicate_edition_slugs: dupSlugs,
    // Must be empty. Each entry names the constraint in the competition-spine
    // migration that the offending row would violate at seed time.
    schema_violations: violations,
    // Rows the source split inside one year, merged into a single edition with
    // every titleholder kept. A non-empty list records a MERGE, not a loss.
    sub_editions_merged: reports.flatMap((r) => r.sub_editions.map((c) => ({ slug: r.slug, ...c }))),
    // Editions carrying more than one is_winner — a dethroning and its
    // successor. Reported because "one winner per edition" is the reader's
    // default assumption and this corpus breaks it three times, legitimately.
    editions_with_multiple_winners: all
      .filter((e) => e.entrants.filter((x) => x.is_winner).length > 1)
      .map((e) => ({
        edition: e.edition_slug,
        winners: e.entrants
          .filter((x) => x.is_winner)
          .map((x) => `${x.stage_name} — ${x.placement_label}`),
      })),
    names_split_from_qualifying_title: reports.reduce((a, r) => a + r.stripped_prelim_titles, 0),
    per_pageant: reports,
  };

  writeFileSync(join(OUT, 'pageants.ndjson'), all.map((e) => JSON.stringify(e)).join('\n') + '\n');
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log('\n=== PAGEANT SUMMARY ===');
  console.log(
    JSON.stringify(
      { ...summary, per_pageant: `${reports.length} entries — see summary.json` },
      null,
      2,
    ),
  );
  if (dupSlugs.length) console.error(`\n!! duplicate edition slugs: ${dupSlugs.join(', ')}`);
  if (summary.episode_rows) console.error('\n!! a pageant emitted episode/result rows — contract violated');
  console.log(`\nWrote pageants.ndjson + summary.json to ${OUT}`);
  if (violations.length) {
    // Non-zero exit: the file on disk would fail the seed migration, and a run
    // that exits 0 having written it invites exactly that discovery later.
    console.error(`\n!! ${violations.length} schema violation(s):`);
    for (const v of violations.slice(0, 20)) console.error(`   ${v}`);
    process.exitCode = 1;
  }
}

// Only run when invoked directly, so the pure helpers above stay importable
// from a test without triggering a network sweep.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
