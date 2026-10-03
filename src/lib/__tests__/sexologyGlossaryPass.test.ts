import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guard for the sexology / trans / BDSM glossary comparison pass.
//
// Assertions run against the migration with ALL `--` COMMENT LINES STRIPPED.
// That is not tidiness: this file's header quotes the junk prose it removes, the
// slugs it refuses and the error messages it hit during development, verbatim.
// Asserting over the raw source would let the header satisfy a check while the
// statement it is about was deleted — the vacuous-assertion class this repo has
// recorded repeatedly. Every assertion below is therefore about SQL that runs.
const MIGRATION = '99991791039872_sexology_glossary_pass.sql';

const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** The migration's executable SQL, with comment lines removed. */
const sql = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/** Index of a needle in the executable SQL, or -1. */
const at = (needle: string) => sql.indexOf(needle);

// The `_new_tags` VALUES block — the ONLY place this file creates a tag.
// Refusal assertions must be scoped to it: the migration's own postcondition G
// legitimately quotes the refused slugs in an `IN (...)` list, so a check for
// "('pedophilia'," over the whole file matches the guard rather than a creation
// and fails on correct code. Scope the assertion to the half of the file it is
// about — the same rule the postconditions themselves follow.
const creations = (() => {
  const start = sql.indexOf('insert into _new_tags');
  const end = sql.indexOf('insert into unified_tags (', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
})();

describe('sexology glossary pass — migration shape', () => {
  it('the comment stripper leaves real SQL behind (positive control)', () => {
    // Without this, every assertion below is vacuously satisfiable by an empty
    // string if the stripper is ever broken.
    expect(sql).toContain('insert into unified_tags');
    expect(sql.length).toBeGreaterThan(3000);
    // And it really did strip: the header's refusal prose must be gone.
    expect(sql).not.toContain('MECHANICAL RESULT');
    expect(sql).not.toContain('THE 659 ABSENT ARE NOT 659 GAPS');
  });

  it('creates exactly the twelve reviewed terms, each with a category slug', () => {
    const created: Array<[string, string]> = [
      ['traffic-light-system', 'consent-negotiation'],
      ['play-collar', 'gear-aesthetics'],
      ['pulling-out', 'safer-sex'],
      ['gender-recognition-certificate', 'legal-rights'],
      ['gillick-competence', 'legal-rights'],
      ['gender-modality', 'gender-identity'],
      ['person-with-a-trans-history', 'gender-identity'],
      ['non-op', 'trans-health'],
      ['endosexism', 'violence-hate'],
      ['mvpfaff', 'questioning-labels'],
      ['antiretroviral', 'sexual-health'],
      ['tng', 'kink-community'],
    ];
    for (const [slug, cat] of created) {
      expect(sql, `${slug} must be inserted`).toContain(`('${slug}',`);
      expect(sql, `${slug} must carry category ${cat}`).toMatch(
        new RegExp(`'${slug}'[^\\n]*'${cat}'`),
      );
    }
    // The count is asserted by the migration's own postcondition, and that
    // postcondition must be the POSITIVE form: counting rows in a bad state
    // returns zero for a slug that has gone missing from the corpus entirely.
    expect(sql).toContain('if v_n <> 12 then');
  });

  it('creates rows UNPUBLISHED and human_reviewed, with usage 0', () => {
    // seo_indexable=false because the gap being closed is site search;
    // human_reviewed=true because deprecate_unused_tags() selects exactly
    // active + not-reviewed + usage 0, which all twelve are on day one.
    expect(sql).toMatch(/'active',\s*false,\s*true,\s*n\.adult,\s*n\.sensitive,\s*0/);
  });

  it('sets publication_role explicitly — a NULL there raises, it does not default', () => {
    // validate_tag_entity_target() opens with
    //   if new.publication_role <> 'entity_redirect' then ... return new
    // so a NULL skips the early return (NULL <> x is NULL) and the next branch
    // raises about a redirect this file never claimed. The column has no
    // default. Caught by the prod dry run, not by reading.
    const insertStart = at('insert into unified_tags (');
    expect(insertStart).toBeGreaterThan(-1);
    const insertStmt = sql.slice(insertStart, insertStart + 600);
    expect(insertStmt).toContain('publication_role');
    expect(insertStmt).toContain("'utility'");
  });

  it('wires all three category representations for new rows', () => {
    // Neither category trigger fires on INSERT, so category_id alone derives no
    // `category` text and mints no junction row — and /tags/:slug renders the
    // JUNCTION while the search facet renders the TEXT.
    expect(sql).toContain('insert into tag_category_assignments');
    expect(sql).toMatch(/c\.id,\s*c\.name/); // category_id AND category text
    expect(sql).toContain('is_primary');
  });
});

describe('sexology glossary pass — TERF revive ordering', () => {
  it('deletes the shadowing alias BEFORE reviving the tag', () => {
    // tag_reject_alias_shadow() fires on the TAG UPDATE as well as on alias
    // writes. Reviving first raises
    //   P0001 tag ... cannot be active: the slug terf is held as an alias
    // The trigger's name suggests it guards the alias table; it guards both
    // directions. This ordering is the fix and is load-bearing.
    const aliasDelete = at("delete from tag_aliases\nwhere alias_slug = 'terf'");
    const revive = at("where slug = 'terf'\n  and status = 'deprecated'");
    expect(aliasDelete, 'alias delete must be present').toBeGreaterThan(-1);
    expect(revive, 'terf revive must be present').toBeGreaterThan(-1);
    expect(aliasDelete).toBeLessThan(revive);
  });

  it('deletes the search_synonyms row before the alias it points at', () => {
    // That FK is ON DELETE SET NULL, not CASCADE, so deleting the alias alone
    // strands a row pointing at nothing. 0 such rows exist today — defensive,
    // and the order the trigger's own HINT asks for.
    const synDelete = at('delete from search_synonyms');
    const aliasDelete = at("delete from tag_aliases\nwhere alias_slug = 'terf'");
    expect(synDelete).toBeGreaterThan(-1);
    expect(synDelete).toBeLessThan(aliasDelete);
  });

  it('revives unpublished and clears the deprecation bookkeeping', () => {
    const revive = sql.slice(at("set status = 'active',"), at("where slug = 'terf'") + 80);
    expect(revive).toContain('seo_indexable = false');
    expect(revive).toContain('human_reviewed = true');
    expect(revive).toContain('deprecation_reason = null');
  });

  it('does not re-point the alias at the revived row (no self-alias)', () => {
    // Re-pointing would mint the corpus's first self-alias, which BOTH existing
    // guards miss: tag_reject_alias_shadow() excludes canonical_tag_id = NEW.id
    // and alias_equals_name compares NAMES.
    expect(sql).not.toMatch(/update tag_aliases[\s\S]{0,200}'terf'/);
  });
});

describe('sexology glossary pass — live-row repairs are content-guarded', () => {
  it('binder: replaces the namesake summary, guarded on the defect', () => {
    const stmt = sql.slice(
      at("set short_description = 'A compression garment"),
      at("= 'Family name';") + 20,
    );
    expect(stmt).toContain("slug = 'binder'");
    expect(stmt).toContain("status = 'active'");
    // Guarded, so a human who fixes it first keeps their wording.
    expect(stmt).toContain("btrim(short_description) = 'Family name'");
    // Only the WRONG field moves. `description` on this row is correct.
    expect(stmt).not.toMatch(/set[\s\S]*\bdescription\s*=/);
  });

  it('men-who-have-sex-with-men: replaces only the artifact description', () => {
    const stmt = sql.slice(
      at('set description = ' + "'A public-health category"),
      at("breakdown of the term%';") + 30,
    );
    expect(stmt).toContain("slug = 'men-who-have-sex-with-men'");
    expect(stmt).toContain("description like 'The term %breakdown of the term%'");
    expect(stmt).not.toContain('short_description =');
    expect(stmt).not.toContain('long_description');
  });

  it('never writes long_description anywhere — no body is authored or nulled', () => {
    expect(sql).not.toContain('long_description =');
  });

  it('fills only EMPTY summaries on the four thin rows', () => {
    for (const slug of ['ace', 'brat', 'latex', 'top']) {
      expect(sql, `${slug} fill must be guarded on emptiness`).toMatch(
        new RegExp(
          `slug = '${slug}' and status = 'active' and coalesce\\(btrim\\(short_description\\),''\\) = ''`,
        ),
      );
    }
  });
});

describe('sexology glossary pass — category moves', () => {
  it('writes category_id ALONE and lets both triggers reconcile', () => {
    // trg_sync_tag_category derives the text, trg_sync_tag_category_after moves
    // the primary junction. Both are guarded `category_id is distinct from
    // old.category_id`, so writing the text or the junction directly propagates
    // nothing and leaves page and facet disagreeing.
    for (const [slug, cat] of [
      ['pap-smear', 'sexual-health'],
      ['jizz', 'physical-reproductive'],
    ] as const) {
      // Whitespace-tolerant: the statement is formatted across three lines in
      // the file. A regex pinned to one line passes only by accident.
      const re = new RegExp(
        `update unified_tags\\s+set category_id = \\(select id from tag_categories where slug = '${cat}'\\)\\s+where slug = '${slug}'`,
      );
      expect(sql, `${slug} must move via category_id alone`).toMatch(re);
    }
    // Guarded on the WRONG current category, so a concurrent repair no-ops.
    expect(sql).toContain("category = 'Events & Parties'");
    expect(sql).toContain("category = 'Dynamics & Roles'");
  });

  it('asserts all three representations agree afterwards', () => {
    // Asserting category_id alone would pass while the page a reader gets still
    // showed the old category.
    expect(sql).toContain('t.category <> ');
    expect(sql).toContain('tag_category_assignments a');
    expect(sql).toContain('a.is_primary and a.category_id = t.category_id');
  });
});

describe('sexology glossary pass — aliases and refusals', () => {
  it('creates the twelve aliases as approved, onto ACTIVE canonicals', () => {
    // Display, auto-tagging and the search bridge have all been approved-only
    // since 20261012090000, so an `auto` alias here would route nothing.
    expect(sql).toMatch(/alias_type, review_status\)[\s\S]{0,200}'approved'/);
    expect(sql).toContain("t.status = 'active'");
    for (const a of [
      'grey-asexual',
      'endosex',
      'chest-surgery',
      'bilateral-mastectomy',
      'forced-feminization',
      'smear-test',
      'cervical-screening-tests',
      'crabs',
      'hepatitis-b-virus',
      'msm',
      'wlw',
      'erotic-sexual-denial',
    ]) {
      expect(sql, `alias ${a} must be present`).toContain(`('${a}',`);
    }
    expect(sql).toContain('if v_n <> 12 then');
  });

  it('refuses to alias pulling-out onto withdrawal (wrong sense)', () => {
    // `withdrawal` is filed under Substances & Recovery and is about a body
    // adapted to a substance. The contraceptive method gets its own row.
    expect(sql).not.toMatch(/'pulling-out'[^\n]*'withdrawal'/);
    expect(sql).toContain("('pulling-out','Pulling Out','safer-sex'");
  });

  it('refuses to alias the generic word "warts", and asserts both refusals hold', () => {
    // An approved alias is an auto-tagging RULE as well as a displayed synonym,
    // and "warts" covers plantar and common warts.
    expect(sql).not.toMatch(/'warts'[^\n]*'genital-warts'/);
    expect(sql).toMatch(/from tag_aliases\s+where alias_slug in \('pulling-out','warts'\)/);
  });

  it('skips an alias whose slug is held by a tag row or another alias', () => {
    expect(sql).toMatch(
      /not exists \(select 1 from tag_aliases x where x\.alias_slug = a\.alias_slug\)/,
    );
    expect(sql).toMatch(
      /not exists \(select 1 from unified_tags u where u\.slug = a\.alias_slug\)/,
    );
  });
});

describe('sexology glossary pass — the refused classes stay refused', () => {
  it('mints no term naming child sexual abuse or sexual homicide', () => {
    // The ffzg dictionary is Money's 1970s vocabulary and a large part of its
    // -philia cohort names exactly this. Creating a tag mints a page AND an
    // auto-tagging rule. This is the most important call in the pass.
    for (const slug of [
      'pedophilia',
      'nepiophilia',
      'hebephilia',
      'biastophilia',
      'raptophilia',
      'erotophonophilia',
      'homicidophilia',
      'lust-murder',
      'necrophilia',
    ]) {
      expect(creations, `${slug} must not be created`).not.toContain(`('${slug}',`);
    }
  });

  it('carries a postcondition that fails if a later pass imports them', () => {
    const guard = sql.slice(at("slug in ('pedophilia'"));
    expect(guard).toContain("status = 'active'");
    expect(guard).toContain('if v_bad <> 0 then');
    expect(guard).toContain('postcondition G');
  });

  it('mints no US policy vocabulary and no single studio’s equipment list', () => {
    for (const slug of [
      'comstock-act',
      'hyde-amendment',
      'abortion-funds',
      'ultra-chair',
      'gyno-chair',
      'scrotum-stretcher',
    ]) {
      expect(creations, `${slug} must not be created`).not.toContain(`('${slug}',`);
    }
  });

  it('revives none of the sixteen correctly-deprecated duplicate rows', () => {
    // Every one carries `deprecation_reason: "canonical alias of X; duplicate
    // vocabulary row retired"` with a named target — the OPPOSITE of the
    // orphan-audit cohort earlier passes kept finding. A blanket revive would
    // have minted 16 duplicates. `terf` is the sole exception and is reviewed
    // separately above, because ITS target is itself deprecated.
    for (const slug of [
      'blow-job',
      'butt-plug',
      'contraception',
      'dom',
      'enema',
      'genderfluid',
      'kinbaku',
      'pre-exposure-prophylaxis',
      'semen',
      'sex',
      'stereotype',
      'transexual',
      'transition',
      'berdache',
    ]) {
      expect(sql, `${slug} must not be revived`).not.toMatch(
        new RegExp(`slug = '${slug}'[\\s\\S]{0,120}status = 'deprecated'`),
      );
    }
  });
});

describe('sexology glossary pass — postcondition discipline', () => {
  it('is soft on preconditions: no statement aborts on pre-existing state', () => {
    // A concurrent session that legitimately repairs one of these rows between
    // authoring and CI must not turn this file into a `db push` failure on main,
    // which takes every migration queued behind it.
    const beforeVerify = sql.slice(0, at('do $verify$'));
    expect(beforeVerify).not.toContain('raise exception');
  });

  it('anchors every check on the CONDITION, not on the message it prints', () => {
    // Neutering `if v_bad <> 0` to `if false` leaves every string-anchored
    // assertion green while the check has stopped checking.
    const conditions = sql.match(/if v_bad <> 0 then/g) ?? [];
    const positives = sql.match(/if v_n <> 12 then/g) ?? [];
    expect(conditions.length).toBeGreaterThanOrEqual(10);
    expect(positives.length).toBe(2); // creations, aliases
    // No loosened comparison anywhere in the verify block.
    const verify = sql.slice(at('do $verify$'));
    expect(verify).not.toMatch(/if\s+false/);
    expect(verify).not.toMatch(/v_bad\s*<\s*0/);
    expect(verify).not.toMatch(/v_n\s*<\s*0/);
  });

  it('calls tag_has_prose rather than restating the thin-page gate', () => {
    // The gate is an OR, not an AND — `coalesce(nullif(btrim(description),''),
    // short_description) is not null` — so a hand-rolled "both present" form
    // would fail on rows that are legitimately publishable.
    expect(sql).toContain('public.tag_has_prose(');
    expect(sql).not.toMatch(/description is not null and short_description is not null/);
  });

  it('attributes nothing to the source that could not be read', () => {
    // The Make UK PDF sits in ~/Downloads, which macOS TCC denies to this
    // process — the denial survived disabling the sandbox, which is what
    // identifies it as an OS privacy control rather than a tooling gap. A
    // source that could not be read is recorded as unread rather than quietly
    // dropped from the list, and nothing may be credited to it. Same discipline
    // as the canonical pass's `ucsf` assertion and the HIV/STI pass's three
    // Internet-Archive hosts.
    expect(raw).toContain('Make UK');
    expect(raw.toLowerCase()).toContain('sandboxed');
    // ...and no term may cite it as provenance.
    expect(sql.toLowerCase()).not.toContain('make-uk');
    expect(sql.toLowerCase()).not.toContain('make uk');
  });

  it('declares an attributed actor', () => {
    // log_unified_tag_change() RAISEs when an undeclared system actor modifies a
    // human_reviewed row, and several rows this file touches carry that flag.
    expect(sql).toMatch(/set_config\('app\.actor',\s*'migration:sexology_glossary_pass'/);
  });
});
