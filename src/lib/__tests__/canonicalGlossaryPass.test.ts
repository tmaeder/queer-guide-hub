import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the eight-glossary comparison pass.
 *
 * Sources are the canonical LGBTQ+ terminology references named in
 * 50300101100000's header (Safe Zone Project, Wikipedia's LGBTQ slang article,
 * Stonewall, UH Hilo, UConn Rainbow Center, Florence Ashley, Studio Inclusie,
 * SLCC). UCSF was never read — Cloudflare refused every fetch path — and
 * nothing is attributed to it.
 *
 *   50300101100000  revives 48 deprecated terms. 43 of them were still
 *                   `seo_indexable=true` WHILE deprecated, so clearing status
 *                   without clearing that flag publishes unreviewed prose to
 *                   crawlers the moment the row goes active. That pairing is
 *                   what most of this file exists to hold down.
 *
 *   50300101100100  the links and the four genuine gaps. New rows must carry
 *                   all THREE category representations: neither category
 *                   trigger fires on INSERT (`trg_sync_tag_category` is BEFORE
 *                   UPDATE, `trg_sync_tag_category_after` is AFTER UPDATE OF
 *                   category_id), so a row created the obvious way is
 *                   uncategorised on its own page and categorised in search.
 *
 * Assertions run against COMMENT-STRIPPED SQL, and several are scoped to one
 * block rather than the whole file. Both headers quote the statements they
 * describe, and each migration's own `do $verify$` block restates the values
 * its `do $mig$` block writes — so an unscoped `toContain` passes with the
 * load-bearing statement deleted. That is the vacuous-assertion class
 * 29000101100000, 20360401100300 and 50100101100000 each hit in turn.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const REVIVALS = '50300101100000_canonical_glossary_revivals.sql';
const LINKS = '50300101100100_canonical_glossary_links_and_gaps.sql';

/** Line comments only; these files use no block comments. */
const statementsOf = (file: string): string =>
  readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

/** The writing half only — everything before the postcondition block. */
const applyBlockOf = (file: string): string => {
  const sql = statementsOf(file);
  const end = sql.indexOf('do $verify$');
  expect(end).toBeGreaterThan(0);
  return sql.slice(0, end);
};

const verifyBlockOf = (file: string): string => {
  const sql = statementsOf(file);
  const start = sql.indexOf('do $verify$');
  expect(start).toBeGreaterThan(0);
  return sql.slice(start);
};

/** The 48 slugs the revival migration names, read out of its VALUES list. */
const REVIVED_SLUGS = [
  'alloromantic',
  'androgynous',
  'androgyny',
  'assigned-sex',
  'batty-boy',
  'bi-curious',
  'bicon',
  'bull-dyke',
  'bulldagger',
  'cissexism',
  'copenhagen-capon',
  'cross-dressing',
  'dykon',
  'fag-hag',
  'flamer',
  'friend-of-dorothy',
  'gaydar',
  'gaymer',
  'gender-binary',
  'gender-incongruence',
  'gender-pronouns',
  'gender-variant',
  'gray-asexual',
  'graysexual',
  'hermaphrodite',
  'heterosexual-privilege',
  'horatian',
  'intergender',
  'intersexuality',
  'kinsey-scale',
  'lesbianism',
  'microaggression',
  'monosexism',
  'muff-diver',
  'pansexuality',
  'queerplatonic-relationship',
  'queerspawn',
  'romantic-attraction',
  'romantic-orientation',
  'same-gender-loving',
  'sexual-attraction',
  'sexual-preference',
  'skoliosexual',
  'soft-butch',
  'stone-butch',
  'straight-acting',
  'tranny',
  'transvestite',
];

describe('canonical glossary pass — 50300101100000 revivals', () => {
  it('names all 48 slugs in the revival list', () => {
    const values = applyBlockOf(REVIVALS);
    const list = values.slice(values.indexOf('insert into _revive'), values.indexOf('end loop'));
    for (const slug of REVIVED_SLUGS) {
      expect(list).toContain(`'${slug}'`);
    }
    expect(REVIVED_SLUGS).toHaveLength(48);
  });

  it('revives UNPUBLISHED — the flag 43 of these carried while deprecated', () => {
    const update = applyBlockOf(REVIVALS);
    const stmt = update.slice(
      update.indexOf('update public.unified_tags t set'),
      update.indexOf('where t.slug = rec.slug'),
    );
    expect(stmt).toMatch(/status\s*=\s*'active'/);
    expect(stmt).toMatch(/seo_indexable\s*=\s*false/);
    expect(stmt).toMatch(/human_reviewed\s*=\s*false/);
    expect(stmt).toMatch(/deprecated_at\s*=\s*null/);
    expect(stmt).toMatch(/deprecation_reason\s*=\s*null/);
    expect(stmt).toMatch(/verification_status\s*=\s*'unverified'/);
  });

  it('never writes prose — it revives bodies that already exist', () => {
    const apply = applyBlockOf(REVIVALS);
    expect(apply).not.toMatch(/set[\s\S]{0,400}long_description\s*=/);
    expect(apply).not.toMatch(/short_description\s*=/);
  });

  it('the loop skips rows it must not touch rather than aborting the push', () => {
    const apply = applyBlockOf(REVIVALS);
    const loop = apply.slice(apply.indexOf('for rec in'), apply.indexOf('loop\n'));
    expect(loop).toMatch(/t\.status\s*=\s*'deprecated'/);
    expect(loop).toMatch(/t\.merged_into_id is null/);
    expect(loop).toMatch(/coalesce\(t\.long_description, ''\) <> ''/);
    expect(loop).toMatch(
      /not exists \(select 1 from public\.tag_aliases a where a\.alias_slug = rv\.slug\)/,
    );
  });

  it('no precondition aborts except a category typo, which no later state repairs', () => {
    const apply = applyBlockOf(REVIVALS);
    const raises = apply.match(/raise exception/g) ?? [];
    expect(raises).toHaveLength(1);
    expect(apply).toMatch(
      /raise exception 'glossary revivals: % row\(s\) name a category that does not exist'/,
    );
  });

  it('the postcondition COUNTS the reached state instead of the absence of a bad one', () => {
    const verify = verifyBlockOf(REVIVALS);
    // Counting rows in a bad state passes vacuously for a slug that has gone
    // missing from the corpus — exactly what the softened guards let through.
    expect(verify).toMatch(/and status = 'active'/);
    expect(verify).toMatch(/and not seo_indexable/);
    expect(verify).toMatch(/and not human_reviewed/);
    expect(verify).toMatch(/and category_id is not null/);
    expect(verify).toMatch(/coalesce\(long_description, ''\) <> ''/);
    expect(verify).toMatch(/if v_bad <> 48 then/);
  });

  it('keeps the three alias-shadowed slugs deprecated', () => {
    const verify = verifyBlockOf(REVIVALS);
    expect(verify).toMatch(/'berdache','deadname','genderfluid'/);
    expect(verify).toMatch(
      /raise exception 'verify: an alias-shadowed slug was revived after all'/,
    );
    // And they are not in the revival list itself.
    const list = applyBlockOf(REVIVALS);
    for (const slug of ['berdache', 'deadname', 'genderfluid']) {
      expect(list).not.toContain(`'${slug}'`);
    }
  });

  it('declares an actor — log_unified_tag_change() RAISEs on a bare system: writer', () => {
    expect(statementsOf(REVIVALS)).toMatch(
      /set_config\('app\.actor', 'migration:canonical-glossary-revivals', true\)/,
    );
  });

  it('uses `rec`, not `r` — a variable named r shadows the _revive alias', () => {
    const apply = applyBlockOf(REVIVALS);
    expect(apply).toMatch(/^\s+rec\s+record;/m);
    expect(apply).not.toMatch(/^\s+r\s+record;/m);
  });
});

describe('canonical glossary pass — 50300101100100 links and gaps', () => {
  const ALIASES: ReadonlyArray<readonly [string, string, string]> = [
    ['trans-man', 'transgender-man', 'synonym'],
    ['trans-man', 'transman', 'spelling_variant'],
    ['trans-woman', 'transgender-woman', 'synonym'],
    ['trans-woman', 'transwoman', 'spelling_variant'],
    ['gender-transition', 'transitioning', 'synonym'],
    ['cross-dressing', 'crossdressing', 'spelling_variant'],
    ['hormone-therapy', 'hrt', 'abbreviation'],
    ['hormone-therapy', 'hormone-replacement-therapy', 'synonym'],
    ['gender-affirming-surgery', 'sex-reassignment-surgery', 'historical'],
    ['gender-affirming-surgery', 'gender-reassignment', 'synonym'],
    ['gender-affirming-care', 'gender-affirming', 'synonym'],
    ['assigned-sex', 'sex-assigned-at-birth', 'synonym'],
    ['assigned-sex', 'afab', 'covers'],
    ['assigned-sex', 'amab', 'covers'],
    ['intersexuality', 'hermaphroditism', 'historical'],
    ['lgbtq', 'lgbtqia', 'synonym'],
    ['bareback', 'bare-backing', 'spelling_variant'],
    ['latinx', 'latine', 'multilingual'],
  ];

  /** The _alias VALUES rows only — the verify block restates every slug. */
  const aliasTable = (): string => {
    const apply = applyBlockOf(LINKS);
    const start = apply.indexOf('insert into _alias values');
    const end = apply.indexOf('insert into public.tag_aliases', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    return apply.slice(start, end);
  };

  it('routes each variant onto the tag that already holds the concept', () => {
    const table = aliasTable();
    for (const [target, slug, type] of ALIASES) {
      expect(table).toMatch(new RegExp(`'${target}',\\s*'[^']*',\\s*'${slug}',\\s*'${type}'`));
    }
    expect(ALIASES).toHaveLength(18);
  });

  it('AFAB and AMAB are `covers`, not synonyms — they are values of assigned sex', () => {
    const table = aliasTable();
    expect(table).toMatch(/'afab',\s*'covers'/);
    expect(table).toMatch(/'amab',\s*'covers'/);
    expect(table).not.toMatch(/'afab',\s*'synonym'/);
    expect(table).not.toMatch(/'amab',\s*'synonym'/);
  });

  it('does NOT alias the derogatory diminutives — an approved alias is a tagging rule', () => {
    const table = aliasTable();
    expect(table).not.toContain('lezbo');
    expect(table).not.toContain('lezzie');
    // and the postcondition refuses them corpus-wide
    expect(verifyBlockOf(LINKS)).toMatch(/alias_slug in \('lezbo','lezzie'\)/);
  });

  it('only ever aliases onto an ACTIVE target', () => {
    const apply = applyBlockOf(LINKS);
    const insert = apply.slice(apply.indexOf('insert into public.tag_aliases'));
    expect(insert).toMatch(/where u\.status = 'active'/);
    expect(insert).toMatch(/on conflict \(alias_slug\) do nothing/);
    expect(insert).toMatch(/'approved'/);
  });

  it('creates the four gaps with ALL THREE category representations', () => {
    const apply = applyBlockOf(LINKS);
    const loop = apply.slice(apply.indexOf('for rec in'));
    // the lever
    expect(loop).toMatch(/insert into public\.unified_tags/);
    expect(loop).toMatch(/category_id, category, entity_kind/);
    expect(loop).toMatch(/select rec\.name, rec\.slug, c\.id, c\.name/);
    // and the junction row no trigger writes on INSERT
    expect(loop).toMatch(
      /insert into public\.tag_category_assignments \(tag_id, category_id, is_primary\)[\s\S]{0,200}true/,
    );
  });

  it('creates them UNPUBLISHED and unreviewed', () => {
    const apply = applyBlockOf(LINKS);
    const loop = apply.slice(apply.indexOf('for rec in'));
    expect(loop).toMatch(/'active', false, false, 'unverified'/);
  });

  it('skips a slug that already exists instead of aborting the push', () => {
    const apply = applyBlockOf(LINKS);
    const loop = apply.slice(
      apply.indexOf('for rec in'),
      apply.indexOf('insert into public.unified_tags'),
    );
    expect(loop).toMatch(
      /where not exists \(select 1 from public\.unified_tags u where u\.slug = n\.slug\)/,
    );
  });

  it('asserts all three representations AGREE, not merely that category_id is set', () => {
    const verify = verifyBlockOf(LINKS);
    expect(verify).toMatch(/coalesce\(t\.category, ''\) = ''/);
    expect(verify).toMatch(
      /tag_category_assignments a[\s\S]{0,160}a\.is_primary[\s\S]{0,80}a\.category_id = t\.category_id/,
    );
  });

  it('revives latinx softly — a notice, never an abort', () => {
    const apply = applyBlockOf(LINKS);
    const stmt = apply.slice(0, apply.indexOf('create temp table _new'));
    expect(stmt).toMatch(/where slug = 'latinx'/);
    expect(stmt).toMatch(/and status = 'deprecated'/);
    expect(stmt).toMatch(/seo_indexable\s*=\s*false/);
    expect(stmt).toMatch(/raise notice/);
    expect(stmt).not.toMatch(/raise exception/);
  });

  it('declares its own actor', () => {
    expect(statementsOf(LINKS)).toMatch(
      /set_config\('app\.actor', 'migration:canonical-glossary-links', true\)/,
    );
  });

  it('attributes nothing to UCSF, which was never reachable', () => {
    const apply = applyBlockOf(LINKS) + applyBlockOf(REVIVALS);
    expect(apply.toLowerCase()).not.toContain('ucsf');
  });
});
