import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the polygon-based city/country repair (45000101100000).
 *
 * The defect being prevented is not "a wrong country" -- it is a SWEEP that
 * looks correct and corrupts the rows that matter. The raw test
 * "polygon disagrees with stored country" reports 50 contradictions, of which
 * only 27 are real; all six `seo_indexable` contradictions are FALSE POSITIVES
 * (Reunion and Martinique have no polygon of their own, Gibraltar / Podcetrtek /
 * Siebengewald / Niagara Falls sit within ~1 km of the border they appear to
 * cross). Every assertion below protects one of the narrowing rules that make
 * the difference, so deleting any of them fails loudly rather than quietly
 * widening the blast radius.
 *
 * Assertions run against COMMENT-STRIPPED sql: this migration's header explains
 * each rule in prose, so a `toContain` over the raw file passes even with the
 * statement deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

function migrationSource(): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => /_city_country_polygon_repair\.sql$/.test(f))
    .sort()
    .pop();
  if (!file) throw new Error('city_country_polygon_repair migration not found');
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

/** Drop `--` comments so prose in the header cannot satisfy an assertion. */
function statements(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');
}

const SRC = statements(migrationSource());

describe('city/country polygon repair', () => {
  it('abstains when we hold no polygon for the stored country', () => {
    // Reunion, Martinique, French Guiana and Bonaire sit inside their
    // SOVEREIGN's polygon. Without this branch the sweep "corrects" RE -> FR
    // and MQ -> FR, destroying the more specific and correct code on two
    // indexable, content-bearing rows.
    expect(SRC).toContain('abstain_no_polygon_for_stored');
    expect(SRC).toMatch(/stored_poly\s*=\s*0/);
  });

  it('abstains on border precision instead of repairing', () => {
    expect(SRC).toContain('abstain_border_precision');
    // The distance bar is the whole defence against class (b). A default of 0
    // would make every border artifact a conflict.
    expect(SRC).toMatch(/p_min_km\s+numeric\s+default\s+50/i);
  });

  it('keeps the name-corroboration arm, which is what rescues the border cases', () => {
    // Geneva 3.3 km, Antwerp 14.8, Luxembourg City 18.2, Basel 1.8 are real
    // defects inside the distance bar; only their own names identify them.
    expect(SRC).toContain('conflict_name_corroborated');
    expect(SRC).toMatch(/name\s+ilike\s+'%'\s*\|\|\s*s\.polygon_country/i);
  });

  it('resolves PostGIS by putting extensions on the search_path', () => {
    // A bare `set search_path to 'public'` makes st_contains unresolvable INSIDE
    // the function while the same query works from a normal session.
    const fnBody = SRC.slice(
      SRC.indexOf('create or replace function public.city_country_polygon_conflicts'),
      SRC.indexOf('$function$', SRC.indexOf('as $function$') + 5),
    );
    expect(fnBody).toMatch(/search_path\s+to\s+'public',\s*'extensions'/i);
  });

  it('writes through apply_city_country_repair, never a bare UPDATE', () => {
    // That function repropagates country_id to children AND recomputes
    // safety_gated. A direct UPDATE moves a city between countries while every
    // child's gate stays computed against the old one.
    expect(SRC).toContain('public.apply_city_country_repair(');
    expect(SRC).not.toMatch(/update\s+public\.cities\s+set\s+country_id/i);
  });

  it('skips a name collision rather than aborting the migration', () => {
    // uk_cities_country_name_active is UNIQUE (country_id, name_normalized)
    // WHERE duplicate_of_id IS NULL. The first dry run died on it. An aborted
    // migration on main blocks every migration queued behind it.
    expect(SRC).toMatch(/x\.name_normalized\s*=\s*v_norm/);
    expect(SRC).toMatch(/x\.duplicate_of_id\s+is\s+null/i);
  });

  it('re-verifies the polygon before writing instead of trusting the frozen list', () => {
    expect(SRC).toMatch(/v_poly_cc\s+is\s+distinct\s+from\s+rec\.to_cc/i);
  });

  it('retracts a stale timezone to NULL rather than guessing one', () => {
    expect(SRC).toMatch(/set\s+timezone\s*=\s*null/i);
    expect(SRC).toContain('retracted:country_repair');
  });

  it('queues same-town pairs as open, the only status the sweep remembers', () => {
    // Any other status is re-inserted as open by the next nightly run, because
    // the open-pair unique index only covers WHERE status='open'.
    expect(SRC).toContain("'city_country_polygon_repair'");
    expect(SRC).toMatch(/'city_country_polygon_repair',\s*'open'/);
  });

  it('looks the twin up through cities, not the live CTE', () => {
    // Joining the CTE loses the (country_id, name_normalized) index and times
    // the statement out -- measured.
    const queueBlock = SRC.slice(SRC.indexOf('do $queue$'), SRC.indexOf('$queue$;'));
    expect(queueBlock).toMatch(/join\s+public\.cities\s+t\s+on\s+t\.country_id\s*=\s*pco\.id/i);
    expect(queueBlock).not.toMatch(/join\s+live\s+t\b/i);
  });

  it('separates one-town-twice from two-cities-one-name by distance', () => {
    // Martigny 0.5 km / Lyss 1.6 / Les Trois-Ilets 2.8 are one town stored
    // twice; Concord is New Hampshire vs North Carolina at 1,164 km and must
    // never be queued as a duplicate.
    const queueBlock = SRC.slice(SRC.indexOf('do $queue$'), SRC.indexOf('$queue$;'));
    // \b is load-bearing: an unanchored /<=\s*5000/ also matches `<= 5000000`,
    // so widening the bar a thousandfold passed this assertion. Caught by
    // mutation testing, not by reading.
    expect(queueBlock).toMatch(/<=\s*5000\b/);
  });

  it('asserts postconditions, including a positive control on the abstentions', () => {
    const verify = SRC.slice(SRC.indexOf('do $verify$'));
    expect(verify).toMatch(/actionable conflicts remain/i);
    expect(verify).toMatch(/expected 25 repaired cities/i);
    // Without this, narrowing the detector to nothing would pass assertion 1.
    expect(verify).toMatch(/v_abstain_idx\s*=\s*0/);
    expect(verify).toMatch(/still carry a stale timezone/i);
    expect(verify).toMatch(/same-town pairs queued/i);
  });

  it('never grants the detector to anon or authenticated', () => {
    expect(SRC).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.city_country_polygon_conflicts\(numeric\)\s+from\s+public,\s*anon,\s*authenticated/i,
    );
    expect(SRC).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.city_country_polygon_conflicts\(numeric\)\s+to\s+service_role/i,
    );
  });
});
