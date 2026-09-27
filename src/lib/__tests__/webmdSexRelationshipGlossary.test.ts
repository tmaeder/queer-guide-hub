import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const file = join(
  process.cwd(),
  'supabase/migrations/20260927092900_webmd_sex_relationship_glossary.sql',
);
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

describe('WebMD sex and relationship glossary pass', () => {
  it('creates the seven concept-led pages rather than article-shaped umbrellas', () => {
    for (const slug of [
      'sexual-response-cycle',
      'refractory-period',
      'vulval-self-exam',
      'fear-of-intimacy',
      'fear-of-commitment',
      'possessiveness',
      'pde5-inhibitor',
    ]) {
      expect(writes).toMatch(new RegExp(`\\('${slug}'|\\n  '${slug}'`));
    }

    for (const slug of [
      'sex-and-health',
      'male-reproductive-system',
      'female-reproductive-system',
      'risky-sex',
    ]) {
      expect(writes).not.toMatch(new RegExp(`^\\s*\\('${slug}'`, 'm'));
      expect(verify).toContain(`'${slug}'`);
    }
    expect(writes).toContain('create temporary table _webmd_rejected_before');
    expect(verify).toContain('except select slug, id from _webmd_rejected_before');
  });

  it('creates reviewed pages for site search without publishing them to crawlers', () => {
    expect(writes).toMatch(/c\.id, c\.name, 'active', false, true,\s*\n\s*'reviewed', 'article'/);
    expect(writes).toMatch(/verification_status, publication_role, is_sensitive/);
    expect(verify).toContain('not t.seo_indexable');
    expect(verify).toContain("t.verification_status in ('reviewed', 'locked')");
    expect(verify).toContain('tag_has_prose');
  });

  it('writes all three category representations', () => {
    expect(writes).toMatch(/category_id, category, status/);
    expect(writes).toMatch(/c\.id, c\.name/);
    expect(writes).toMatch(/insert into public\.tag_category_assignments/);
    expect(verify).toContain('t.category_id is distinct from c.id');
    expect(verify).toContain('t.category is distinct from c.name');
    expect(verify).toContain('a.is_primary');
  });

  it('content-guards every existing-page prose change', () => {
    // Do not split on semicolons: the sperm body deliberately contains one
    // inside its SQL string literal. A statement parser based on `;` would
    // truncate correct SQL and report the WHERE guard as missing.
    const existingUpdates = writes
      .split(/\n(?=update public\.unified_tags)/)
      .filter((part) => part.startsWith('update public.unified_tags'));
    expect(existingUpdates).toHaveLength(4);

    for (const update of existingUpdates) {
      expect(update).toMatch(/where slug = '/);
      const guarded =
        /description = 'Persistent difficulty/.test(update) ||
        /description = 'One of the pair/.test(update) ||
        /description = 'The reproductive cell/.test(update) ||
        /description like '%Regular testing, safe sex practices/.test(update);
      expect(guarded, `unguarded update:\n${update.slice(0, 260)}`).toBe(true);
    }
  });

  it('corrects the supplied sources instead of importing their weak framing', () => {
    expect(writes).toContain('It is a map, not a required sequence.');
    expect(writes).toContain('It is not a measure of attraction or willingness.');
    expect(writes).toContain('Most of what a person can see with a mirror is the vulva');
    expect(writes).toContain('description rather than a standalone diagnosis');
    expect(writes).toContain('control, not proof of love');
    expect(writes).not.toContain('male reproductive system');
    expect(writes).not.toContain('female reproductive system');
    expect(verify).toContain('STI still contradicts the safer-sex terminology rule');
  });

  it('uses specific aliases without creating generic auto-tagging rules', () => {
    expect(writes).toContain("('vulval-self-exam', 'Vaginal Self-Exam'");
    expect(writes).toContain("('fear-of-commitment', 'Commitment Phobia'");
    expect(writes).toContain("('pde5-inhibitor', 'PDE-5 Inhibitor'");
    expect(writes).toMatch(/a\.alias_type, 'approved'/);
    expect(writes).not.toMatch(/\('(?:commitment|medication|intimacy)',/);
    expect(writes).toContain('lower(btrim(u.name)) = lower(btrim(a.alias_name))');
  });

  it('requires two independent citations for every new page', () => {
    for (const domain of [
      'webmd.com',
      'clevelandclinic.org',
      'acog.org',
      'apa.org',
      'thehotline.org',
      'dailymed.nlm.nih.gov',
    ]) {
      expect(writes).toContain(domain);
    }
    expect(writes).toMatch(
      /not exists \([\s\S]*x\.tag_id = t\.id and x\.source_url = s\.source_url/,
    );
    expect(verify).toContain('count(distinct s.source_url)');
    expect(verify).toContain('fewer than two sources');
  });

  it('asserts positive safety content on the improved existing pages', () => {
    expect(verify).toContain("slug = 'testicle'");
    expect(verify).toContain("long_description ilike '%sudden severe pain%'");
    expect(verify).toContain("slug = 'erectile-dysfunction'");
    expect(verify).toContain("long_description ilike '%poppers%'");
    expect(verify).toContain("slug = 'sperm'");
    expect(verify).toContain("long_description ilike '%semen analysis%'");
  });
});
