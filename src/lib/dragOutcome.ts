/**
 * Drag Race per-episode outcome vocabulary.
 *
 * WHY THIS FILE EXISTS
 *
 * The progress table on a Drag Race season article does not use a stable set of
 * codes. Season 17 of the US series alone emits WIN, TOP2, SAFE, BDT (Badonka
 * Dunk Tank), BTM, ELIM, LOSS (LaLaPaRuza) and Guest. Across ~24 franchises —
 * each with its own format, its own twists and its own translators — there is no
 * closed set to rely on.
 *
 * So the database stores OUR vocabulary in `drag_episode_results.outcome` and
 * the source's own string in `outcome_raw`. This module owns the mapping between
 * them, and it is the single source of truth for both the importer and the UI.
 *
 * THE LADDER
 *
 * Six ordinal states, best first: win > high > safe > low > bottom > elim.
 * Plus `guest`, which is deliberately OFF the ladder — a queen returning to
 * judge or cameo is present in the episode but not competing in it, which is a
 * different fact from placing badly. `outcomeRank('guest')` is null so it can
 * never be averaged into a placement statistic. The SQL twin
 * `public.drag_outcome_rank()` returns NULL for the same reason.
 *
 * AN UNRECOGNISED CODE RETURNS null, AND THAT IS THE WHOLE POINT
 *
 * The tempting default is to bucket anything unknown as `safe`, because most
 * cells in most seasons are safe. That would be silent corruption: a new twist
 * code would be recorded as "nothing happened to her that week" and would look
 * identical to a real SAFE for ever after, with no way to find it later.
 *
 * Instead an unknown code yields null, the importer counts it, names it, and
 * refuses to write that cell. Absence of a row already means "not in this
 * episode", which is at least honest about our ignorance. Extending the map
 * below is a deliberate act with a test attached, which is what it should be.
 *
 * NOTHING HERE CARRIES A COLOUR. Presentation (tint/ink/glyph) lives in
 * `src/lib/dragPlacement.ts`, which is ESLint-allowlisted for raw HSL. Keeping
 * the vocabulary colour-free keeps this file out of that allowlist.
 */

export const DRAG_OUTCOMES = ['win', 'high', 'safe', 'low', 'bottom', 'elim', 'guest'] as const;

export type DragOutcome = (typeof DRAG_OUTCOMES)[number];

/** The six competing states, best first. `guest` is not among them. */
export const DRAG_OUTCOME_LADDER: readonly DragOutcome[] = [
  'win',
  'high',
  'safe',
  'low',
  'bottom',
  'elim',
];

/**
 * Ordinal position on the ladder, 1 = best. Null for `guest` (not competing)
 * and for anything unrecognised. Mirrors `public.drag_outcome_rank()`.
 */
export function outcomeRank(outcome: string | null | undefined): number | null {
  const i = DRAG_OUTCOME_LADDER.indexOf(outcome as DragOutcome);
  return i === -1 ? null : i + 1;
}

/**
 * Source code → our vocabulary.
 *
 * Keys are normalised by `canonicalise()` below (uppercased, punctuation and
 * whitespace stripped), so `BTM 2`, `btm2` and `Btm-2` all hit `BTM2`.
 *
 * Grouping notes, because several of these are judgement calls rather than
 * transcription:
 *
 *  - `RUNNERUP` is `high`, not `win`. The finale runner-up did not win, and the
 *    fact that she placed second is already on `drag_contestants.placement`.
 *  - `TOP2` is `high`, not `win`. In the season 13+ format the top two lip sync
 *    for the win; being one of them is not itself the win.
 *  - `WDR` (withdrew) and `DISQ` are `elim`. On the grid they mean "this is the
 *    episode she left", which is what the reader needs. `outcome_raw` keeps the
 *    distinction for anyone who cares why.
 *  - `IMMUNE`, `SAVED` and `ADV` are `safe`. They are format-specific routes to
 *    the same outcome — she continued and was not judged at either extreme.
 *
 * THE FORMAT-SPECIFIC CODES WERE READ OFF THE SOURCE'S OWN LEGEND, NOT INFERRED.
 * Every Drag Race season article carries a prose key above the progress table.
 * Reading it changed two answers that "sounded obviously right":
 *
 *  - `BDT` (Badonka Dunk Tank, US season 17) is `safe`, NOT `bottom`. The legend
 *    says it "indicates that the contestant was SAVED from elimination by the
 *    Badonka Dunk Tank". It reads like a danger marker and it is the opposite —
 *    it is the mechanism that rescued her.
 *  - `SDADHH` ("She Done Already Done Had Herses", US seasons 17-18) is `win`.
 *    The queen is "declared Queen of SDADHH after WINNING the final lip sync in
 *    the LaLaPaRuza / RuPaul-A-Paruza Smackdown".
 *  - `LOSS` is `bottom`: an already-eliminated queen who returned for the
 *    Smackdown and lost one of its lip syncs. Not `guest` — she was competing.
 *  - `TOP2` is confirmed `high` by the legend: "one of the two best performing
 *    in the challenge, but LOST the lip sync to win it".
 *
 * When a new code appears, read that legend before extending this map.
 */
const OUTCOME_ALIASES: Readonly<Record<string, DragOutcome>> = {
  // — win —
  WIN: 'win',
  WINS: 'win',
  WINNER: 'win',
  WINNERS: 'win',
  WINNNER: 'win', // observed typo upstream
  SDADHH: 'win', // won the final Smackdown lip sync — see the legend note above
  TOP: 'win', // Drag Race Thailand: "won the maxi challenge"
  RW: 'win', // Drag Race Germany: "(Runway Winner) ... won the runway challenge"
  BTOP: 'win', // All Stars: "(Blocked Top All Star) ... WON the challenge, lost
  // the Lip Sync for Your Legacy and did not earn a star due to being blocked".
  // The block costs her the star, not the challenge win.
  BWIN: 'win', // All Stars: "(Blocked Win) ... won the challenge and the Lip Sync".
  // — high —
  HIGH: 'high',
  HIGHEST: 'high',
  TOP2: 'high',
  TOP3: 'high',
  TOPALLSTARS: 'high',
  RUNNERUP: 'high',
  RUNNERSUP: 'high',
  RUP: 'high', // "R-up" — canonicalise() strips the hyphen, not the letters.
  TSW: 'high', // All Stars: "(Talent Show Winner) ... the ELIMINATED contestant
  // WON the Fame Games Variety Extravaganza". The mirror of FAME (same side
  // game, lost). `high` rather than `win`, because a Fame Games victory is not
  // a maxi-challenge win and must not be counted as one.
  // — safe —
  SAFE: 'safe',
  IMMUNE: 'safe',
  IMM: 'safe',
  SAVED: 'safe',
  ADV: 'safe',
  ADVANCED: 'safe',
  RTRN: 'safe',
  RETURNED: 'safe',
  BDT: 'safe', // "saved from elimination by the Badonka Dunk Tank" — reads like
  // danger, is the opposite. Confirmed against the season 17 legend.
  STAY: 'safe', // Canada s2: "won a lip sync to advance to the finale". Safe,
  // deliberately NOT win — counting it as a challenge win would inflate the
  // derived `challenge_wins` on every queen who survived a lip sync.
  BLK: 'safe', // All Stars: "blocked by the lip sync winner from earning a star" —
  // a twist penalty, not a placement. She competed normally that week.
  CUT: 'safe', // All Stars: same shape as BLK, different badge.
  BVR: 'safe', // Canada vs the World: "(Beaver) received the Golden Beaver and
  // was saved from the bottom three".
  // The "saved from the bottom" family. Every one of these is a format-specific
  // token whose legend says the queen was RESCUED, so they land on `safe` for
  // the same reason BDT does — the mark reads like danger and means the
  // opposite.
  BGT: 'safe', // España: "(Baguette) ... saved from the bottom two"
  CT: 'safe', // UK: "(Chippy Tea) ... saved from the bottom two"
  HRT: 'safe', // "(Heart) ... saved themself or was saved from the bottom"
  GB: 'safe', // Philippines: "Golden Balut ... saved from participating in the
  // final LaLaPaRuZa lip sync"
  SAVE: 'safe', // "saved from participating in the final lip sync"
  RSU: 'safe', // México: "(Reina de la Suerte) ... was up for elimination ...
  // and was saved from lip syncing"
  // RE-ENTRY. Measured across the ELEVEN pages that define it, `IN` always
  // means the queen came back into the competition — but the mechanism varies
  // and three of those legends involve no win at all ("was chosen to re-enter",
  // All Stars 3 and The Switch). So it is `safe`, NOT `win`: mapping it to a
  // win would invent a challenge victory for a queen who was simply brought
  // back, and would inflate every derived `challenge_wins` in those seasons.
  IN: 'safe',
  // — low —
  LOW: 'low',
  LOWEST: 'low',
  // — bottom —
  BTM: 'bottom',
  BTM2: 'bottom',
  BTM3: 'bottom',
  BTM4: 'bottom',
  BTM5: 'bottom',
  BTM6: 'bottom',
  BOTTOM: 'bottom',
  BOTTOM2: 'bottom',
  BOTTOM3: 'bottom',
  LOSS: 'bottom', // eliminated queen who returned for the Smackdown and lost a
  // lip sync. Not `guest`: she was competing.
  DUEL: 'bottom', // The Switch: "up for elimination" — the same words BTM uses.
  NOM: 'bottom', // The Switch: "nominated to compete in the next elimination duel".
  FAME: 'bottom', // All Stars: eliminated queen who "performed in the Fame Games
  // ... but did not win". Same shape as LOSS.
  // — elim —
  ELIM: 'elim',
  ELIM2: 'elim',
  ELIMINATED: 'elim',
  OUT: 'elim',
  WDR: 'elim',
  WITHDREW: 'elim',
  WITHDREW2: 'elim',
  DISQ: 'elim',
  DQ: 'elim',
  DISQUALIFIED: 'elim',
  DEPART: 'elim',
  DEPARTED: 'elim',
  QUIT: 'elim',
  WDN: 'elim',
  WEL: 'elim', // Germany: "(Winner eliminated) ... although the contestant WON
  // the maxi challenge, they were the worst in the runway challenge and were
  // subsequently eliminated". The terminal fact for that episode is that she
  // went home; `outcome_raw` keeps the rest of the story.
  // — guest (present, not competing) —
  GUEST: 'guest',
  GST: 'guest',
  JUROR: 'guest',
  // Miss Congeniality markers. They resolve to `guest` on the GRID (the award is
  // announced at the finale, she is not competing in that cell) — the award
  // itself is a first-class flag on competition_entrants, set by the importer
  // from these same raw codes. See MISS_CONGENIALITY_RE below.
  MISSC: 'guest',
  MC: 'guest',
  MISSDS: 'guest',
  MISSCONGENIALITY: 'guest',
};

/**
 * Raw grid codes that additionally mark the entrant as Miss Congeniality.
 *
 * This is deliberately separate from the outcome map: the cell's OUTCOME is
 * `guest`, but the cell is also the only place several seasons record the award
 * at all — the contestants table's outcome column does not mention it, which is
 * why a first pass over 113 seasons found the award on exactly zero of them.
 */
export const MISS_CONGENIALITY_RE = /^\s*(miss\s*c(ongeniality)?|mc|miss\s*ds)\s*$/i;

/**
 * Reduce a raw cell to a lookup key: drop footnote markers, punctuation,
 * accents and whitespace, then uppercase. `Btm 2` → `BTM2`, `Elim.` → `ELIM`.
 */
function canonicalise(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\[[^\]]*\]/g, '') // [1], [a] footnote markers
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

/**
 * Map a source progress-table cell onto our vocabulary.
 * Returns null for an empty cell or an unrecognised code — never a guess.
 */
export function normalizeOutcome(raw: string | null | undefined): DragOutcome | null {
  if (!raw) return null;
  const key = canonicalise(raw);
  if (!key) return null;
  return OUTCOME_ALIASES[key] ?? null;
}

/** Every source code the map recognises. Used by the importer's coverage report. */
export function knownOutcomeCodes(): string[] {
  return Object.keys(OUTCOME_ALIASES).sort();
}
