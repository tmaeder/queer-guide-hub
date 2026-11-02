import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard for `99991793650522_nonplace_city_name_guard.sql`.
 *
 * /admin/geography listed "Carrera 13 # 8-34, Barrio el Estero." as a city. The migration deletes
 * the unlinked non-place rows and refuses new ones in two places: `city_resolve_or_create` (every
 * creator's door) and a BEFORE trigger on `cities` as backstop.
 *
 * The classifier is exercised here by translating its own regexes out of the SQL (PostgreSQL ARE
 * `\m`/`\M` word anchors become JS `\b`), so the fixtures test the patterns that ship rather than
 * a hand-copied twin. The real-city negatives are the ones a broader rule would break: a
 * Portuguese town named "...do Hospital", a commune "10 - La Candelaria", "Road Town", "St. Gallen".
 */

const MIGRATION = '99991793650522_nonplace_city_name_guard';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', `${MIGRATION}.sql`), 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const fnBody = sql.slice(
  sql.indexOf('create or replace function public.city_name_nonplace_reason'),
  sql.indexOf('$fn$;'),
);

const rules: Array<{ re: RegExp; reason: string }> = [
  ...fnBody.matchAll(/when p_name (~\*?) '((?:[^']|'')*)' then '([a-z_]+)'/g),
].map(([, op, pattern, reason]) => ({
  re: new RegExp(pattern.replace(/''/g, "'").replace(/\\m|\\M/g, '\\b'), op === '~*' ? 'iu' : 'u'),
  reason,
}));

const classify = (name: string): string | null => rules.find((r) => r.re.test(name))?.reason ?? null;

describe('city_name_nonplace_reason', () => {
  it('parses every rule out of the migration', () => {
    expect(rules.length).toBeGreaterThanOrEqual(10);
  });

  it.each([
    ['Carrera 13 # 8-34, Barrio el Estero.', 'symbol'],
    ['Calle 5 3-2', 'street_address'],
    ['RT 14', 'neighbourhood_unit'],
    ['Lenox Hill Hospital', 'building'],
    ['St. Joseph Medical Center', 'building'],
    ['South Woodford tube station', 'building'],
    ['Season 2', 'media_label'],
    ['Season 3', 'media_label'],
    ['7th place', 'media_label'],
    ['—N/a', 'placeholder'],
    ['Unknown', 'placeholder'],
    ['Lyss (CH) (https://www.notion.so/x)', 'url'],
  ])('refuses %s', (name, reason) => {
    expect(classify(name)).toBe(reason);
  });

  it.each([
    'Oliveira do Hospital',
    'Oliveira do Hospital e São Paio de Gramaços',
    'Road Town',
    'St. Gallen',
    'St. John\'s',
    'Comuna 10 - La Candelaria',
    'Chester-le-Street',
    'Steinau an der Straße',
    'Weiden i.d.OPf.',
    'Huntington Station',
    'Praha 8',
    '26 de Octubre',
    'Bar Harbor',
    'Rua',
    'Hospital',
    'Villa del Hospital',
  ])('accepts real city %s', (name) => {
    expect(classify(name)).toBeNull();
  });
});

describe('resolver guard', () => {
  it('patches by exactly-once anchor before the 2 km proximity check and create path', () => {
    expect(sql).toContain("v_anchor text := E'  -- No identity hit. Refuse near a different city (< 2 km).\\n'");
    expect(sql).toContain('execute replace(v_src, v_anchor, v_guard || v_anchor)');
    expect(sql).toMatch(/if coalesce\(v_n, 0\) <> 1 then\s+raise exception/);
    expect(sql).toContain("''nonplace_name:''");
  });

  it('checks both the raw name and the comma-split base', () => {
    expect(sql).toContain('public.city_name_nonplace_reason(v_base), public.city_name_nonplace_reason(p_name)');
  });
});

describe('backstop trigger', () => {
  it('fires before the name splitter', () => {
    const name = 'trg_cities_a0_reject_nonplace_name';
    expect(sql).toMatch(new RegExp(`create trigger ${name}\\s+before insert or update of name on public\\.cities`));
    expect([name, 'trg_cities_aa_split_name'].sort()[0]).toBe(name);
  });

  it('raises rather than returning NULL, so a bypassing writer fails loudly', () => {
    expect(sql).toMatch(/raise exception 'city name % is not a place[\s\S]*errcode = '22023'/);
  });

  it('is created AFTER the repair, so the repair cannot trip it', () => {
    expect(sql.indexOf('create trigger trg_cities_a0')).toBeGreaterThan(
      sql.indexOf('delete from public.cities where id in (select id from _nonplace_names)'),
    );
  });
});

describe('repair', () => {
  it('skips rows still linked to real content instead of raising', () => {
    const skip = sql.slice(sql.indexOf('delete from _nonplace_names t'), sql.indexOf('insert into public.nonplace_city_deletion_audit'));
    for (const t of ['venues', 'events', 'hotels', 'organizations', 'personalities', 'queer_villages', 'news_article_cities']) {
      expect(skip).toContain(`public.${t}`);
    }
  });

  it('only clears a birth place whose text IS the garbage city name', () => {
    expect(sql).toMatch(/birth_place = case when p\.birth_place = t\.name then null else p\.birth_place end/);
    expect(sql).toMatch(/and \(p\.birth_place is null or p\.birth_place = t\.name\)/);
  });

  it('snapshots before deleting', () => {
    expect(sql.indexOf('insert into public.nonplace_city_deletion_audit')).toBeLessThan(
      sql.indexOf('delete from public.cities where id in'),
    );
  });

  it('postconditions assert unlinked survivors, real-name acceptance, resolver refusal and the trigger', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(/if v_bad <> 0 then\s+raise exception 'P1 failed/);
    expect(verify).toContain("city_name_nonplace_reason('Oliveira do Hospital')");
    expect(verify).toMatch(/v_r\.reason not like 'nonplace_name:%'/);
    expect(verify).toContain("tgname = 'trg_cities_a0_reject_nonplace_name'");
  });
});
