import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `marketplace_content_rating()` matched several short tokens as bare
 * SUBSTRINGS, so any word merely ending in the token carried the listing into
 * `explicit` — hidden from every Safe Mode reader. Measured on prod
 * 2026-08-23: 176 misrated active listings, 152 of them from `e-?stim`
 * matching "Estimated total length" / "estimated shipping" / German
 * "bestimmt", and 5 from `g[- ]?spot` matching "Parking Spot".
 *
 * The opposite mistake is just as easy and was measured too: a blanket left
 * boundary drops German compounds ("Silikonvibrator", "Klitorisstimulator",
 * "Lederhandschellen"), which is why the fix is four tokens and not fifty. So
 * this suite pins BOTH directions.
 *
 * It reads the regexes out of the latest migration that defines the function
 * and evaluates them in JS — `\m` / `\M` are Postgres word-boundary escapes
 * with exact JS lookaround equivalents. That translation was validated against
 * all 26,299 non-sfw rows on prod: the JS replica reproduced every stored
 * `content_rating` with zero mismatches.
 *
 * Text check against supabase/migrations, not a database one, so it runs in CI
 * without credentials — same pattern as `citySafetyBackfill.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FN = 'marketplace_content_rating';

function latestDefinition(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${FN}\\s*\\(`, 'i').test(sql))
      return sql;
  }
  throw new Error(`no migration defines ${FN}`);
}

const sql = latestDefinition();

/** The three `WHEN txt ~ '...' THEN <n>` alternations, highest rank first. */
const rankPatterns: Array<{ rank: number; source: string }> = [
  ...sql.matchAll(/WHEN txt ~ '(.+?)'\s*\n?\s*THEN (\d)/g),
].map((m) => ({ rank: Number(m[2]), source: m[1] }));

/** Postgres `\m` = start of word, `\M` = end of word. */
function toJs(pgPattern: string): RegExp {
  return new RegExp(
    pgPattern
      .replaceAll('\\m', '(?<![\\p{L}\\p{N}_])')
      .replaceAll('\\M', '(?![\\p{L}\\p{N}_])'),
    'u',
  );
}

const SLUG_RANK: Array<[Set<string>, number]> = [
  ...sql.matchAll(/WHEN slug IN \(([^)]+)\)[\s\n]*THEN (\d)/g),
].map((m) => [new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])), Number(m[2])]);

const NAME = ['', 'sfw', 'suggestive', 'adult', 'explicit'];

/** Faithful JS port of the SQL function, driven by the migration's own regexes. */
function rate(subcategory: string | null, title: string, description = ''): string {
  const slug = (subcategory ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  const txt = `${title} ${description}`.toLowerCase();
  let rank = 1;
  for (const [set, r] of SLUG_RANK) if (set.has(slug)) { rank = Math.max(rank, r); break; }
  for (const { rank: r, source } of rankPatterns) {
    if (toJs(source).test(txt)) { rank = Math.max(rank, r); break; }
  }
  return NAME[rank];
}

describe('marketplace_content_rating — the migration parses', () => {
  it('exposes all three text ranks and the slug tiers', () => {
    expect(rankPatterns.map((p) => p.rank)).toEqual([4, 3, 2]);
    expect(SLUG_RANK.length).toBeGreaterThanOrEqual(3);
  });
});

describe('short tokens need a word boundary (the 2026-08-23 Safe Mode defect)', () => {
  // Every string here is a real title or description fragment from a listing
  // that prod rated `explicit` solely because of the missing boundary.
  // `expected` is the rating the row's OWN vocabulary earns once the accident
  // is gone — 'suggestive' for the jockstrap, because "jockstrap" is genuine
  // rank-2 vocabulary and only the "strap on" inside it was the bug.
  it.each([
    ['g-spot: the reported case', 'Reagent Testing Spot Plate', 'sfw'],
    ['g-spot: parking', 'Parking Spot', 'sfw'],
    ['g-spot: spot clean', 'Care & cleaning spot clean. Do not bleach.', 'sfw'],
    ['e-stim: estimated length', 'Estimated total length, tip to base: 7"', 'sfw'],
    ['e-stim: estimated shipping', 'Ribbed Cuff. Estimated shipping 3-5 days.', 'sfw'],
    ['e-stim: german bestimmt', 'Intensität selbst bestimmen', 'sfw'],
    ['e-stim: underestimate', 'Never Underestimate A Granny On A Recumbent Tricycle', 'sfw'],
    ['e-stim: testimonials', 'Candid and poignant testimonials', 'sfw'],
    ['strap-on: jockstrap only', 'Breedwell Reflector Jockstrap (jockstrap only)', 'suggestive'],
    ['strap-on: strap only', 'Calf/Arm Clip-on Strap. Strap only, pouch sold separately.', 'sfw'],
    ['ball gag: mirrorball', 'Disco Daddy T-Shirt. Leather cap. Mirrorball gag.', 'sfw'],
    ['enema: daenemark', 'Handgefertigt in Daenemark', 'sfw'],
  ])('%s is no longer explicit', (_label, text, expected) => {
    expect(rate(null, text)).toBe(expected);
  });

  it.each([
    ['g-spot', 'Tickling Truman eStim G-Spot Semi-Realistic Vibrator'],
    ['g spot', 'Perfect for g spot and p spot play'],
    ['g-punkt (german compound)', 'Swish - G-Punkt-Vibrator'],
    ['e-stim hyphenated', 'Welcome to the e-stim Magnum range'],
    ['estim as a bare word', 'Mystim Hop Hop Bob eStim Rabbit Vibrator'],
    ['estim before a hyphen', 'Achte darauf, die estim-Geräte auszuschalten'],
    ['strap-on', 'Compatible with double strap-ons and standard dildos'],
    ['strapon', 'Light texture strapon ring'],
    ['ball gag', 'Breathable ball gag with PVC ball'],
  ])('%s still rates explicit', (_label, text) => {
    expect(rate(null, text)).toBe('explicit');
  });
});

describe('German compounds must survive — a blanket \\m would break these', () => {
  it.each([
    'Silikonvibrator mit Klitorisstimulator',
    'Vegane Lederhandschellen mit Neopren',
    'Doppeldildo mit Vibration',
    'Wasserbasiertes Analgleitmittel',
    'Shibari-Seilbondage im Stil',
    'Lederbrustharness für Männer',
    'Kettenharness aus Leder',
  ])('%s is still caught', (text) => {
    expect(rate(null, text)).not.toBe('sfw');
  });
});

describe('what the boundary fix unmasks stays covered', () => {
  it('chastity cages keep their rating through the subcategory slug', () => {
    // kink3d's blurb reads "Estimated production time…" — the ONLY reason
    // these were explicit before the fix.
    expect(rate('cage', 'On Demand - Viper - No Bottom Crossbar (Arctic White)')).toBe('explicit');
  });

  it('silicone plugs are caught by name, not by an accident', () => {
    expect(rate(null, '4" Orchid Bulb Silicone Plug | Vault Sample')).toBe('explicit');
    expect(rate(null, 'Avant Kaleido Silicone Plug')).toBe('explicit');
  });

  it('"silicone ear plugs" is not a silicone plug', () => {
    expect(rate(null, 'DanceSafe Earpeace Earplugs — silicone ear plugs')).toBe('sfw');
  });

  it('penis extenders are caught in every spelling', () => {
    for (const t of ['Jes-Extender - Titanium - Penis-Extender', 'Alien Nation Komodo Penis Extender'])
      expect(rate(null, t)).toBe('explicit');
  });
});
