import type { CompetitionCategory } from '@/lib/competitionCategories';
import type { DragOutcome } from '@/lib/dragOutcome';

/**
 * Row shapes returned by the competition RPCs
 * (`competition_overview`, `competition_roster`, `competition_grid`,
 * `competition_history_for_personality`).
 *
 * `personality_slug` is present ONLY when the linked personality is public and
 * not a duplicate — the RPC filters it, so a null here means "render plain
 * text", never "look it up yourself".
 */

/**
 * STRUCTURE, not identity.
 *
 * `series` runs as episodes and therefore has a placement grid; `title` is
 * decided at a single event and has none. That is the only thing any code here
 * branches on.
 *
 * It used to be `drag_race | pageant`, which defined eleven independent
 * competitions by what they were NOT and then named the residue — wrongly, for
 * at least three of them. International Mr. Leather calls itself "a multi-day
 * convention and competition", MIR "a convention and contest", Mr Gay Europe "a
 * male competition ... about important LGBTQIA+ themes". What a competition IS
 * now lives in `Competition.format`, in its own source's words.
 */
export type CompetitionKind = 'series' | 'title';

export interface CompetitionEdition {
  slug: string;
  /** Season number for a franchise; the YEAR for a pageant. */
  number: number | null;
  title: string;
  episode_count: number | null;
  episodes: number;
  first_aired: string | null;
  last_aired: string | null;
  network: string | null;
  status: 'aired' | 'airing' | 'announced';
  host_city: string | null;
  host_country: string | null;
  entrants: number;
  results: number;
  /** Arrays, never scalars — several seasons have two runners-up, and US
   *  season 16 has a Miss Congeniality tie. */
  winners: string[];
  runners_up: string[];
  miss_congeniality: string[];
}

export interface Competition {
  slug: string;
  name: string;
  kind: CompetitionKind;
  /**
   * Which of the six comparable types this competition belongs to, and
   * therefore which page it appears on. Distinct from `kind`, which is
   * structure only: `drag_pageant`, `trans_pageant`, `gay_title` and
   * `leather_title` are all `kind: 'title'` and are not comparable with each
   * other. See src/lib/competitionCategories.ts.
   */
  category: CompetitionCategory;
  /** What this competition IS, in its own source's words. Identity, not structure. */
  format: string | null;
  network: string | null;
  organizer: string | null;
  country: string | null;
  country_code: string | null;
  editions: CompetitionEdition[];
}

export interface CompetitionOverview {
  competitions: Competition[];
}

export interface RosterEntry {
  name: string;
  competition: string;
  competition_slug: string;
  kind: CompetitionKind;
  /** The competition's category, denormalised onto the entry so a category
   *  page can filter the roster without joining it back to the overview. */
  category?: CompetitionCategory;
  format?: string;
  edition: string;
  edition_slug: string;
  edition_number: number | null;
  year: number | null;
  placement: number | null;
  placement_label: string | null;
  winner: boolean;
  runner_up: boolean;
  miss_congeniality: boolean;
  challenge_wins?: number;
  lip_syncs?: number;
  age?: number;
  hometown?: string;
  personality_slug?: string;
  image_url?: string;
  lat?: number;
  lng?: number;
  city?: string;
  country?: string;
}

export interface GridEpisode {
  n: number;
  title: string | null;
  date: string | null;
}

export interface GridEntrant {
  name: string;
  placement: number | null;
  placement_label?: string;
  winner: boolean;
  runner_up: boolean;
  miss_congeniality: boolean;
  personality_slug?: string;
}

export interface GridCell {
  name: string;
  n: number;
  o: DragOutcome;
  raw: string | null;
}

export interface CompetitionGrid {
  edition: {
    slug: string;
    title: string;
    number: number | null;
    competition: string;
    competition_slug: string;
  };
  axis: GridEpisode[];
  entrants: GridEntrant[];
  cells: GridCell[];
}

export interface CompetitionHistoryEntry {
  name: string;
  competition: string;
  competition_slug: string;
  kind: CompetitionKind;
  format?: string;
  edition: string;
  edition_slug: string;
  edition_number: number | null;
  year: number | null;
  placement: number | null;
  placement_label: string | null;
  winner: boolean;
  runner_up: boolean;
  miss_congeniality: boolean;
  challenge_wins?: number;
  lip_syncs?: number;
}
