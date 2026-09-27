import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const file = join(process.cwd(), 'supabase/migrations/99991790501396_cruising_glossary.sql');
const raw = readFileSync(file, 'utf8');

function statementsOf(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const at = line.indexOf('--');
      return at === -1 ? line : line.slice(0, at);
    })
    .join('\n');
}

const statements = statementsOf(raw);
const verifyAt = statements.indexOf('do $verify$');
const writes = statements.slice(0, verifyAt);
const verify = statements.slice(verifyAt);

describe('cruising glossary pass', () => {
  it('creates the missing place concept without creating advice-shaped pages', () => {
    expect(writes).toMatch(/\(\s*'cruising-ground'/);

    for (const slug of ['cruising-etiquette', 'cruising-safety', 'cruising-signals']) {
      expect(writes).not.toMatch(new RegExp(`^\\s*\\('${slug}'`, 'm'));
      expect(verify).toContain(`'${slug}'`);
    }
  });

  it('keeps the new place reviewed, sensitive and outside the crawler index', () => {
    expect(writes).toMatch(
      /c\.id, c\.name, 'active', false, true, 'reviewed',\s*\n\s*n\.is_sensitive/,
    );
    expect(verify).toContain('not t.seo_indexable');
    expect(verify).toContain('t.is_sensitive');
    expect(verify).toContain("t.verification_status in ('reviewed', 'locked')");
  });

  it('protects the new concept against name, slug and alias collisions', () => {
    expect(writes).toContain('lower(btrim(t.name)) = lower(btrim(n.name))');
    expect(writes).toContain('a.alias_slug = n.slug');
    expect(writes).toContain('join public.unified_tags t on t.slug = a.alias_slug');
    expect(writes).toContain('join public.tag_aliases x on x.alias_slug = a.alias_slug');
  });

  it('writes every category representation for cruising-ground', () => {
    expect(writes).toContain("'venues-nightlife'");
    expect(writes).toMatch(/category_id, category, status/);
    expect(writes).toContain('insert into public.tag_category_assignments');
    expect(verify).toContain('t.category_id = c.id');
    expect(verify).toContain('t.category = c.name');
    expect(verify).toContain('a.is_primary');
  });

  it('content-guards all six existing-page prose changes', () => {
    const existingUpdates = writes
      .split(/\n(?=update public\.unified_tags)/)
      .filter((part) => part.startsWith('update public.unified_tags'));

    expect(existingUpdates).toHaveLength(6);
    for (const update of existingUpdates) {
      expect(update).toMatch(/where slug = '/);
      expect(update).toMatch(/and description (?:=|is null)/);
      expect(update).toMatch(/and short_description = '/);
      expect(update).toMatch(/and long_description = '/);
    }
  });

  it('repairs the concrete defects found in the live rows', () => {
    expect(writes).toContain('People who are simply using a park');
    expect(writes).toContain('no later than 72 hours');
    expect(writes).toContain('not the kind of sex, whether money or drugs are involved');
    expect(writes).toContain('does not make an uninvolved person a consenting audience');
    expect(writes).toContain('gay bathhouse or gay sauna');
    expect(writes).toContain('Being near or looking through one is not automatic consent');
    expect(verify).toContain('unsupported prostitution/drugs association');
  });

  it('does not publish a directory of cruising locations', () => {
    expect(writes).toContain('without publishing directions');
    expect(verify).toContain(
      "'(latitude|longitude|coordinates|turn left|street address|exact location)'",
    );
  });

  it('records every supplied article and authoritative health corroboration', () => {
    for (const domain of [
      'grindr.com',
      'out.com',
      'gaycities.com',
      'pride.com',
      'cdc.gov/hiv/prevention/',
      'cdc.gov/sti/prevention/',
    ]) {
      expect(writes).toContain(domain);
    }
    expect(writes).toMatch(
      /not exists \([\s\S]*x\.tag_id = t\.id and x\.source_url = s\.source_url/,
    );
    expect(verify).toContain('only % of 6 cruising sources landed');
    expect(verify).toContain('cruising-ground has fewer than two sources');
  });

  it('adds only the specific, reviewed search alias', () => {
    expect(writes).toContain("('cruising-ground', 'Cruising Spot', 'cruising-spot', 'synonym')");
    expect(writes).toMatch(/a\.alias_type, 'approved'/);
    expect(verify).toContain('cruising-spot alias did not land');
  });
});
