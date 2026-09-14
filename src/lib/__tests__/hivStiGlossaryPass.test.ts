import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the seven-source HIV/STI comparison.
 *
 * Sources: the CDC HIV glossary and the CDC STI-treatment term list, the
 * clinicalinfo.hiv.gov HIV/AIDS glossary, aidsmap, the UNAIDS 2024 Terminology
 * Guidelines, the PHAC STI booklet and the WHO STI fact sheet. Three of the
 * seven are only reachable through the Internet Archive from this egress —
 * see 50400101100000's header, which records the snapshot form and why the
 * block is theirs rather than ours.
 *
 *   50400101100000  CORRECTIONS. Every row it touches is already LIVE, so each
 *                   assertion here is about a page a reader can open today. The
 *                   two that matter most: an active, indexable STI page must
 *                   not be filed under `Fetishes`, and a row filled with a body
 *                   must not thereby become selectable by deprecate_unused_tags.
 *
 *   50400101100100  REVIVALS + the merge-target repair. A merge mints a
 *                   redirect, so a merge whose target is deprecated or itself
 *                   merged is a redirect to a page that does not render — which
 *                   is why HPV had no live page at all.
 *
 *   50400101100200  The UNAIDS language rules, into `styleguide_terms`. The
 *                   load-bearing part is the PUBLISH: rows without a publish are
 *                   inert, and an assertion over `styleguide_terms` passes in
 *                   exactly that state.
 *
 * Assertions run against COMMENT-STRIPPED SQL, and most are scoped to one
 * block. Each header quotes the statements it describes and each migration's
 * own `do $verify$` restates the values its `do $mig$` writes, so an unscoped
 * `toContain` passes with the load-bearing statement deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const CORRECTIONS = '50400101100000_hiv_sti_glossary_corrections.sql';
const REVIVALS = '50400101100100_hiv_sti_vocabulary_revivals.sql';
const STYLEGUIDE = '50400101100200_unaids_terminology_into_styleguide.sql';
const SENTINEL = '50400101100300_tag_merge_graph_signals.sql';
const AIDS = '50400101100400_aids_defines_hiv_correction.sql';

/** Line comments only; these files use no block comments. */
const statementsOf = (file: string): string =>
  readFileSync(join(MIGRATIONS, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

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

describe('HIV/STI pass — 50400101100000 corrections', () => {
  it('moves the two misfiled STI pages by writing category_id, the only lever', () => {
    const apply = applyBlockOf(CORRECTIONS);
    const stmt = apply.slice(
      apply.indexOf('update public.unified_tags t'),
      apply.indexOf('get diagnostics'),
    );
    expect(stmt).toMatch(/set category_id = v_sexual/);
    expect(stmt).toMatch(/'pelvic-inflammatory-disease', 'lymphogranuloma-venereum'/);
    // Writing the TEXT column by hand fires no trigger and moves no page.
    expect(stmt).not.toMatch(/set[\s\S]{0,80}\bcategory\s*=/);
  });

  it('asserts all THREE category representations, not just the lever', () => {
    const verify = verifyBlockOf(CORRECTIONS);
    expect(verify).toMatch(/c\.slug <> 'sexual-health'/);
    expect(verify).toMatch(/coalesce\(t\.category, ''\) <> c\.name/);
    expect(verify).toMatch(
      /tag_category_assignments a[\s\S]{0,160}a\.is_primary[\s\S]{0,80}a\.category_id = t\.category_id/,
    );
  });

  it('refuses to leave an STI page published as a fetish', () => {
    expect(verifyBlockOf(CORRECTIONS)).toMatch(/category = 'Fetishes'/);
  });

  it('fills a body only where one is EMPTY — never overwriting prose', () => {
    const apply = applyBlockOf(CORRECTIONS);
    for (const slug of ['mpox', 'shigella', 'hepatitis-a']) {
      const i = apply.indexOf(`where slug = '${slug}'`);
      expect(i).toBeGreaterThan(0);
      expect(apply.slice(i, i + 200)).toMatch(/coalesce\(long_description, ''\) = ''/);
    }
  });

  it('never sets human_reviewed=false on a filled row — that queues it for deletion', () => {
    const apply = applyBlockOf(CORRECTIONS);
    expect(apply).not.toMatch(/human_reviewed\s*=\s*false/);
    // and the postcondition proves it, rather than trusting the absence
    expect(verifyBlockOf(CORRECTIONS)).toMatch(
      /not human_reviewed and usage_count = 0[\s\S]{0,200}deprecate_unused_tags/,
    );
  });

  it('does not lift the merged monkeypox body across', () => {
    // WHO renamed the disease; the old row's prose is generic zoonosis text
    // that never mentions sex. Recovering it would re-import both.
    const apply = applyBlockOf(CORRECTIONS);
    expect(apply).not.toMatch(/from public\.unified_tags[\s\S]{0,120}slug = 'monkeypox'/);
  });

  it('substitutes the UNAIDS do-not-use phrases in place', () => {
    const apply = applyBlockOf(CORRECTIONS);
    expect(apply).toMatch(
      /replace\(short_description, 'Sexually transmitted disease', 'Sexually transmitted infection'\)/,
    );
    expect(apply).toMatch(/replace\(long_description, 'the HIV virus', 'HIV'\)/);
    expect(apply).toMatch(
      /replace\(long_description,\s*\n?\s*'an infection of the female reproductive organs',\s*\n?\s*'an infection of the uterus, fallopian tubes and ovaries'\)/,
    );
  });

  it('declares an actor — log_unified_tag_change() RAISEs on a bare system: writer', () => {
    expect(statementsOf(CORRECTIONS)).toMatch(
      /set_config\('app\.actor', 'migration:hiv-sti-glossary-corrections', true\)/,
    );
  });
});

describe('HIV/STI pass — 50400101100100 revivals', () => {
  const REVIVED = [
    'anal-cancer-screening',
    'anal-warts',
    'candidiasis',
    'chancroid',
    'condom-external',
    'condom-internal',
    'condom-negotiation',
    'condomless',
    'dental-dam',
    'drug-substitution-therapy',
    'early-syphilis',
    'epididymitis',
    'herpes',
    'hpv',
    'hpv-vaccination',
    'late-syphilis',
    'molluscum-contagiosum',
    'needle-exchange-program-nep',
    'opportunistic-infections',
    'oral-candidiasis-thrush',
    'papanicolaou-test-pap-test',
    'prep-adherence',
    'prep-resistant-hiv',
    'primary-syphilis',
    'pubic-lice',
    'resistance-testing',
    'secondary-syphilis',
    'serodiscordant',
    'serological-test',
    'seroconversion',
    'seroprevalence',
    'sexual-health-screening',
    'sti-testing',
    'supervised-injection-site',
    'tertiary-syphilis',
    'test-of-cure',
    'test-of-reinfection',
    'treponemal-test',
    'viral-load',
    'viral-suppression',
  ];

  it('names all 40 slugs in the revival list', () => {
    const apply = applyBlockOf(REVIVALS);
    const list = apply.slice(apply.indexOf('insert into _revive'), apply.indexOf('guards'));
    for (const slug of REVIVED) expect(list).toContain(`'${slug}'`);
    expect(REVIVED).toHaveLength(40);
  });

  it('revives UNPUBLISHED — 41 of the 43 were indexable while deprecated', () => {
    const apply = applyBlockOf(REVIVALS);
    const stmt = apply.slice(
      apply.indexOf('update public.unified_tags t set'),
      apply.indexOf('where t.slug = rec.slug'),
    );
    expect(stmt).toMatch(/status\s*=\s*'active'/);
    expect(stmt).toMatch(/seo_indexable\s*=\s*false/);
    expect(stmt).toMatch(/human_reviewed\s*=\s*false/);
    expect(stmt).toMatch(/deprecated_at\s*=\s*null/);
  });

  it('never writes prose — it revives bodies that already exist', () => {
    const apply = applyBlockOf(REVIVALS);
    expect(apply).not.toMatch(/set[\s\S]{0,400}long_description\s*=/);
  });

  it('the loop skips rows it must not touch rather than aborting the push', () => {
    const apply = applyBlockOf(REVIVALS);
    const loop = apply.slice(apply.indexOf('for rec in'), apply.indexOf('loop\n'));
    expect(loop).toMatch(/t\.status = 'deprecated'/);
    expect(loop).toMatch(/t\.merged_into_id is null/);
    expect(loop).toMatch(/coalesce\(t\.long_description, ''\) <> ''/);
    expect(loop).toMatch(
      /not exists \(select 1 from public\.tag_aliases a where a\.alias_slug = rv\.slug\)/,
    );
  });

  it('only a category typo aborts — no other precondition does', () => {
    const apply = applyBlockOf(REVIVALS);
    expect(apply.match(/raise exception/g) ?? []).toHaveLength(1);
    expect(apply).toMatch(/name a category that does not exist/);
  });

  it('collapses merge chains onto an ACTIVE terminal, never onto another merged row', () => {
    const apply = applyBlockOf(REVIVALS);
    const stmt = apply.slice(apply.indexOf('set merged_into_id = m2.id'));
    expect(stmt).toMatch(/m\.status = 'merged'/);
    expect(stmt).toMatch(/m2\.status = 'active'/);
  });

  it('repoints the STI spelled-out form onto the live `sti`, not the deprecated row', () => {
    const apply = applyBlockOf(REVIVALS);
    // Anchored on the ASSIGNMENT, not merely on the statement: the same
    // `slug = 'sti' and status = 'active'` string also appears in this
    // statement's own guard clause, so a slice taken from the WHERE matches
    // there and passes with the target repointed at the deprecated row.
    const assign = apply.slice(
      apply.indexOf('set merged_into_id = (select id'),
      apply.indexOf("where t.slug = 'sexually-transmitted-infections-stis'"),
    );
    expect(assign).toMatch(/slug = 'sti' and status = 'active'/);
    expect(assign).not.toMatch(/'sexually-transmitted-infection'/);

    const stmt = apply.slice(
      apply.indexOf("where t.slug = 'sexually-transmitted-infections-stis'"),
    );
    expect(stmt).toMatch(/m\.id = t\.merged_into_id and m\.status <> 'active'/);
  });

  it('the postcondition COUNTS the reached state instead of the absence of a bad one', () => {
    const verify = verifyBlockOf(REVIVALS);
    expect(verify).toMatch(/and status = 'active'/);
    expect(verify).toMatch(/and not seo_indexable/);
    expect(verify).toMatch(/coalesce\(long_description, ''\) <> ''/);
    expect(verify).toMatch(/if v_bad <> 40 then/);
  });

  it('proves HPV renders, which is the whole point of reviving it', () => {
    const verify = verifyBlockOf(REVIVALS);
    expect(verify).toMatch(/t\.slug = 'hpv-human-papillomavirus' and m\.status <> 'active'/);
    expect(verify).toMatch(/m\.status = 'merged'/);
  });

  it('keeps the alias-shadowed slug deprecated', () => {
    expect(verifyBlockOf(REVIVALS)).toMatch(/slug = 'serosorting' and status = 'active'/);
    const list = applyBlockOf(REVIVALS);
    expect(list).not.toContain("('serosorting'");
    // female-condom is outdated terminology; condom-internal is the revived pair
    expect(list).not.toContain("('female-condom'");
  });
});

describe('HIV/STI pass — 50400101100200 UNAIDS terminology', () => {
  it('adds the five rules the standard lacked', () => {
    const apply = applyBlockOf(STYLEGUIDE);
    for (const slug of [
      'safer-sex',
      'sti-not-std',
      'hiv-not-hiv-virus',
      'vertical-transmission',
      'key-populations',
    ]) {
      expect(apply).toContain(`'${slug}'`);
    }
    expect(apply).toMatch(/array\['safe sex'\]/);
    expect(apply).toMatch(/array\['sexually transmitted disease', 'venereal disease'\]/);
  });

  it('leaves bare "STD" and "target" out — they are noise in this corpus', () => {
    const apply = applyBlockOf(STYLEGUIDE);
    expect(apply).not.toMatch(/array\[[^\]]*'STD'/);
    expect(apply).not.toMatch(/array\[[^\]]*'target'/);
    expect(apply).not.toMatch(/array\[[^\]]*'intervention'/);
  });

  it('PUBLISHES — rows alone are inert, and the gated function cannot be called here', () => {
    const apply = applyBlockOf(STYLEGUIDE);
    expect(apply).toMatch(/_styleguide_publish_core\(\s*\n?\s*'minor'/);
    expect(apply).not.toMatch(/select public\.styleguide_publish\(/);
  });

  it('asserts the PUBLISHED TEXT and both profiles, not the rows', () => {
    const verify = verifyBlockOf(STYLEGUIDE);
    expect(verify).toMatch(/select compiled_prompt into v_txt/);
    expect(verify).toMatch(/doc->'prompts'->>'compact'/);
    expect(verify).toMatch(/publish did not take/);
  });

  it('proves the six rules UNAIDS corroborates were not replaced', () => {
    expect(verifyBlockOf(STYLEGUIDE)).toMatch(
      /'living-with-hiv','hiv-negative','people-who-use-drugs','sex-worker','condomless','u-equals-u'/,
    );
  });
});

describe('HIV/STI pass — 50400101100300 the merge-graph sentinel', () => {
  it('is a STANDALONE function, not a key restated onto tag_hygiene_stats()', () => {
    const sql = statementsOf(SENTINEL);
    expect(sql).toMatch(/create or replace function public\.tag_merge_graph_signals\(\)/);
    expect(sql).not.toMatch(/create or replace function public\.tag_hygiene_stats/);
  });

  it('reports coverage, so four zeroes from an empty corpus cannot read as clean', () => {
    const sql = applyBlockOf(SENTINEL);
    const shape = sql.slice(sql.indexOf('jsonb_build_object'), sql.indexOf('comment on function'));
    expect(shape).toMatch(/'merges_total',\s*\(select count\(\*\) from m\)/);
  });

  it('separates the structural zero-invariants from the editorial one', () => {
    // Scoped to the jsonb_build_object, NOT the whole file: every one of these
    // keys is also named in this migration's own verify block, so an unscoped
    // toContain passes with the key deleted from the function that reports it.
    const sql = applyBlockOf(SENTINEL);
    const shape = sql.slice(sql.indexOf('jsonb_build_object'), sql.indexOf('comment on function'));
    expect(shape.length).toBeGreaterThan(200);
    for (const key of ['target_merged', 'target_missing', 'self_merged', 'target_deprecated']) {
      expect(shape).toContain(`'${key}'`);
    }
    // Collapsing them into one number would make the gate red on arrival.
    expect(sql).not.toMatch(/'merge_target_not_active'/);
  });

  it('names the residue instead of only counting it', () => {
    expect(statementsOf(SENTINEL)).toMatch(/'deprecated_examples'/);
  });

  it('is service_role only — a DEFINER aggregate granted to authenticated is granted to everyone', () => {
    const sql = statementsOf(SENTINEL);
    expect(sql).toMatch(/revoke all on function public\.tag_merge_graph_signals\(\) from public/);
    expect(sql).toMatch(
      /grant execute on function public\.tag_merge_graph_signals\(\) to service_role/,
    );
    expect(sql).not.toMatch(/to authenticated/);
  });

  it('exercises itself at deploy time rather than first running in CI on real drift', () => {
    const verify = verifyBlockOf(SENTINEL);
    expect(verify).toMatch(/select public\.tag_merge_graph_signals\(\) into v/);
    expect(verify).toMatch(/merges_total.*disagrees with a direct count/s);
  });

  it('the health script gates the structural keys and only warns on the editorial one', () => {
    const js = readFileSync(join(process.cwd(), 'scripts', 'check-pipeline-health.mjs'), 'utf8');
    const i = js.indexOf('tag_merge_graph_signals');
    expect(i).toBeGreaterThan(0);
    const section = js.slice(i, i + 3600);
    // The structural keys are listed as zero-invariants and that loop is the
    // one that sets FAILED. Scoped to the span between the array and the
    // advisory branch, so it cannot be satisfied by some later `FAILED = true`.
    const structural = section.slice(
      section.indexOf('const zeroInvariants'),
      section.indexOf('target_deprecated ?? 0'),
    );
    expect(structural).toContain("'target_merged'");
    expect(structural).toContain("'target_missing'");
    expect(structural).toContain("'self_merged'");
    expect(structural).toMatch(/FAILED = true/);
    // editorial -> console.log, never FAILED
    const dep = section.slice(section.indexOf('target_deprecated ?? 0'));
    expect(dep.slice(0, 600)).toMatch(/console\.log/);
    expect(dep.slice(0, 600)).not.toMatch(/FAILED = true/);
    // A failed probe must say so — and asserted on the PROBE branch's own
    // wording, because the per-key warn inside the loop also says
    // "measured NOTHING" and satisfies a bare match with this branch deleted.
    expect(section).toMatch(/50400101100300 not applied\?[\s\S]{0,80}measured NOTHING/);
  });
});

describe('HIV/STI pass — 50400101100400 the AIDS page defined HIV', () => {
  it('is CONTENT-guarded, so a human who fixes it first keeps their work', () => {
    const apply = applyBlockOf(AIDS);
    // Both UPDATEs fire only while the row still carries the defect's signature.
    expect(apply).toMatch(
      /where slug = 'aids'[\s\S]{0,120}description like 'The human immunodeficiency virus \(HIV\) is a retrovirus%'/,
    );
    expect(apply).toMatch(
      /where slug = 'hiv-aids-crisis'[\s\S]{0,120}description like 'AIDS is caused by a human immunodeficiency virus%'/,
    );
  });

  it('replaces rather than retracts — the row is live and rendering to 106 uses', () => {
    const apply = applyBlockOf(AIDS);
    const aidsUpdate = apply.slice(
      apply.indexOf('update public.unified_tags set'),
      apply.indexOf("where slug = 'aids'"),
    );
    expect(aidsUpdate).toMatch(/description\s*=\s*\n?'AIDS \(acquired immunodeficiency syndrome\)/);
    expect(aidsUpdate).not.toMatch(/=\s*null/);
  });

  it('touches only the WRONG field on the crisis row', () => {
    const apply = applyBlockOf(AIDS);
    // Anchored on the STATEMENT, never on a comment: applyBlockOf strips
    // comments, so a comment anchor yields indexOf === -1 and slices the last
    // character, which matches nothing and passes every `not.toMatch`.
    const crisisWhere = apply.indexOf("where slug = 'hiv-aids-crisis'");
    expect(crisisWhere).toBeGreaterThan(0);
    const crisis = apply.slice(
      apply.lastIndexOf('update public.unified_tags set', crisisWhere),
      crisisWhere,
    );
    expect(crisis.length).toBeGreaterThan(40);
    expect(crisis).toMatch(/set\s*\n?\s*description =/);
    expect(crisis).not.toMatch(/short_description\s*=/);
    expect(crisis).not.toMatch(/long_description\s*=/);
    expect(crisis).not.toMatch(/wikipedia_url\s*=/);
  });

  it('checks BOTH prose fields for the defect, not just the one read first', () => {
    const verify = verifyBlockOf(AIDS);
    const block = verify.slice(0, verify.indexOf('still opens by defining HIV'));
    expect(block).toMatch(/coalesce\(description, ''\) like 'The human immunodeficiency virus/);
    expect(block).toMatch(
      /coalesce\(long_description, ''\) like 'The human immunodeficiency virus/,
    );
  });

  it('proves the replacement teaches the distinction, not merely that it changed', () => {
    const verify = verifyBlockOf(AIDS);
    expect(verify).toMatch(/like '%CD4 count%'/);
    expect(verify).toMatch(/like '%200 cells%'/);
    expect(verify).toMatch(/like '%most advanced stage%'/);
  });

  it('proves the HIV row keeps the virus definition it is entitled to', () => {
    expect(verifyBlockOf(AIDS)).toMatch(
      /slug = 'hiv' and status = 'active' and coalesce\(long_description, ''\) <> ''/,
    );
  });

  it('refuses to leave either corrected row with an empty field', () => {
    expect(verifyBlockOf(AIDS)).toMatch(
      /coalesce\(description, ''\) = '' or coalesce\(long_description, ''\) = ''/,
    );
  });

  it('declares its own actor, so tag_change_log keeps the prior text', () => {
    expect(statementsOf(AIDS)).toMatch(
      /set_config\('app\.actor', 'migration:aids-defines-hiv-correction', true\)/,
    );
  });
});
