import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guards for the phone-format migration (99991790877996): every stored phone on
 * venues / organizations / hotels is E.164, enforced by one BEFORE trigger.
 *
 * Asserted over comment-stripped SQL: the migration header quotes several of
 * the shapes below in prose, and a match there would pass with the statement gone.
 */
const MIGRATION = '99991790877996_phone_canonical_e164.sql';
const raw = readFileSync(resolve(__dirname, '../../../supabase/migrations', MIGRATION), 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

function body(fn: string): string {
  const start = sql.indexOf(`create or replace function public.${fn}`);
  expect(start, `${fn} is defined`).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf('$fn$', start);
  const close = sql.indexOf('$fn$', open + 4);
  return sql.slice(open, close);
}

describe('phone format guard', () => {
  it('attaches an UNSCOPED before-insert-or-update trigger to all three tables', () => {
    // Unscoped is load-bearing: country_id is often set by trg_*_geo_derive, which
    // is not named in the UPDATE statement, and a column-scoped trigger fires on
    // the statement's columns only.
    for (const t of ['venues', 'organizations', 'hotels']) {
      const re = new RegExp(
        `create trigger trg_${t}_zz_phone_canonical\\s+before insert or update on public\\.${t}\\s+for each row`,
      );
      expect(sql).toMatch(re);
    }
    expect(sql).not.toMatch(/phone_canonical\s+before insert or update of/);
  });

  it('sorts after the geo-derivation and normalisation triggers (BEFORE triggers fire in name order)', () => {
    const guard = 'trg_venues_zz_phone_canonical';
    for (const earlier of [
      'trg_venues_geo_derive',
      'trg_venues_normalized',
      'trg_venues_safety_gated',
    ]) {
      expect(guard > earlier).toBe(true);
    }
    expect('trg_organizations_zz_phone_canonical' > 'trg_organizations_geo_derive').toBe(true);
    expect('trg_hotels_zz_phone_canonical' > 'trg_hotels_geo_derive').toBe(true);
  });

  it('keeps the original before clearing an unconvertible number', () => {
    const g = body('phone_canonical_guard');
    const keep = g.indexOf("'phone_rejected'");
    const clear = g.indexOf('new.phone := null;\n    end if;');
    expect(keep).toBeGreaterThan(0);
    expect(clear).toBeGreaterThan(keep);
    expect(g).toMatch(/'raw', new\.phone/);
  });

  it('does not raise needs_attention (a bad phone is no reason to unpublish)', () => {
    expect(body('phone_canonical_guard')).not.toMatch(/needs_attention/);
  });

  it('keeps venues.phone_e164 in step with the canonical phone', () => {
    expect(body('phone_canonical_guard')).toMatch(/new\.phone_e164 := new\.phone/);
  });

  it('lets the backfill through the unchanged-row early return', () => {
    // A self-assignment changes no column; without this flag every backfilled row
    // returned early and the runner reported work it never did (first prod dry run).
    const g = body('phone_canonical_guard');
    expect(g).toMatch(/current_setting\('app\.phone_recanonicalize', true\)/);
    const b = body('run_phone_canonical_backfill');
    const on = b.indexOf("set_config('app.phone_recanonicalize', 'on', true)");
    const upd = b.indexOf('update public.%1$I t set phone = t.phone');
    expect(on).toBeGreaterThan(0);
    expect(upd).toBeGreaterThan(on);
  });

  it('selects backfill work by canonical difference, not by E.164 shape', () => {
    // "+66026370507" is E.164-shaped and wrong; a shape filter would skip it.
    expect(body('run_phone_canonical_backfill')).toMatch(
      /is distinct from coalesce\(public\.canonicalize_phone/,
    );
  });

  it('seeds the generated rules for every libphonenumber country', () => {
    const rows = sql.match(/^\s+\('[A-Z]{2}', '\d{1,3}', '\{/gm) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(240);
  });

  it('pins the conversions it was validated on', () => {
    for (const pair of [
      "'+66026370507|TH|+6626370507'",
      "'02 805 8051|IT|+39028058051'",
      "'(415) 551-2500|US|+14155512500'",
      "'773-743-5772|DE|+17737435772'",
    ]) {
      expect(sql).toContain(pair);
    }
  });
});
