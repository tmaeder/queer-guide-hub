import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991789916000_glossary_quality_programme.sql'),
  'utf8',
);
const healthCheck = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');
const entityMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991789917000_separate_tags_from_entities.sql'),
  'utf8',
);
const restorationMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991789918000_repair_overdeprecated_tag_corpus.sql'),
  'utf8',
);

describe('systematic glossary quality programme', () => {
  it('assigns every publication role deterministically and prevents non-articles indexing', () => {
    expect(migration).toContain("in ('article', 'utility', 'entity_redirect')");
    expect(migration).toMatch(/p_entity_kind = 'attribute'.*then 'utility'/s);
    expect(migration).toMatch(/p_entity_kind in \('person'.*'place'.*then 'entity_redirect'/s);
    expect(migration).toMatch(/alter column publication_role set not null/i);
    expect(migration).toMatch(
      /if new\.publication_role <> 'article'.*new\.seo_indexable := false/s,
    );
  });

  it('moves entity content out of glossary publication without breaking tag assignments', () => {
    expect(entityMigration).toContain('canonical_entity_type');
    expect(entityMigration).toContain('canonical_entity_id');
    expect(entityMigration).toContain('canonical_entity_path');
    expect(entityMigration).toContain("publication_role='entity_redirect'");
    expect(entityMigration).toContain("entity_kind='descriptor', publication_role='utility'");
    expect(entityMigration).toContain('tag_entity_audit_queue');
    expect(entityMigration).toContain('review_tag_entity_candidate');
    expect(entityMigration).toContain('A slug collision is a candidate, not proof of identity');
    expect(entityMigration).toMatch(
      /entity_kind in \('person','place'\).*publication_role='article'/s,
    );
    expect(healthCheck).toContain('redirect_missing_canonical_target');
    expect(healthCheck).toContain('entity_kind_published_as_article');
  });

  it('makes description the only canonical published summary', () => {
    const proseBody = migration.slice(
      migration.indexOf('create or replace function public.tag_has_prose'),
      migration.indexOf('comment on function public.tag_has_prose'),
    );
    expect(proseBody).toContain("nullif(btrim(p_description), '') is not null");
    expect(proseBody).not.toContain('coalesce');
    expect(proseBody).not.toMatch(/btrim\(p_short_description\)/);
  });

  it('locks the known sense and category repairs', () => {
    expect(migration).toContain("where slug = 'men-only'");
    expect(migration).toContain('it does not describe a magazine');
    expect(migration).toContain("where slug = 'stage'");
    expect(migration).toContain("where slug = 'hindu'");
    expect(migration).toContain('It is not the name of a country');
    expect(migration).toContain("where slug = 'mullerian'");
    expect(migration).toContain("slug = 'physical-reproductive'");
    expect(migration).toContain("not a person''s gender");
  });

  it('rejects boilerplate and publishes only through a review RPC', () => {
    expect(migration).toContain('review_tag_description');
    expect(migration).toContain('Only article-role tags have publishable descriptions');
    expect(migration).toContain('Generic “X related to Y” boilerplate is not publishable');
    expect(migration).toContain('duplicates another active glossary entry');
    expect(migration).toMatch(
      /human_reviewed=true.*verification_status='reviewed'.*prose_reviewed_at=now\(\)/s,
    );
  });

  it('exposes role-aware interfaces and deploy-time hard counters', () => {
    expect(migration).toContain('tag_quality_scorecard_v2');
    expect(migration).toContain('tag_editorial_queue');
    expect(migration).toContain('tag_publication_signals');
    expect(migration).toContain('review_tag_ontology');
    expect(migration).toContain('none_applicable');
    expect(healthCheck).toContain('article_indexable_without_canonical_description');
    expect(healthCheck).toContain('article_without_primary_category');
  });

  it('restores unsupported bulk deprecations into a non-public review quarantine', () => {
    expect(restorationMigration).toContain('restoration_review_required');
    expect(restorationMigration).toContain('restoration_previous_reason');
    expect(restorationMigration).toContain("'auto: zero usage'");
    expect(restorationMigration).toContain('data-quality audit 2026-06-05: orphan tag');
    expect(restorationMigration).toMatch(
      /create or replace function public\.deprecate_unused_tags[\s\S]*return 0;/i,
    );
    expect(restorationMigration).toMatch(
      /search_documents_index_tags[\s\S]*not t\.restoration_review_required/i,
    );
    expect(restorationMigration).toMatch(
      /gated_entity_exists[\s\S]*not restoration_review_required/i,
    );
  });

  it('provides serial restoration decisions and migrates misplaced biographies', () => {
    expect(restorationMigration).toContain('tag_restoration_review_queue');
    expect(restorationMigration).toContain('review_tag_restoration');
    expect(restorationMigration).toContain("p_decision not in ('article','utility','retire')");
    expect(restorationMigration).toContain('insert into public.personalities');
    expect(restorationMigration).toContain('insert into public.organizations');
    expect(restorationMigration).toMatch(/canonical_entity_type\s*=\s*'personality'/);
    expect(restorationMigration).toContain('restoration_candidate_indexable');
    expect(restorationMigration).toContain('restoration_candidate_in_public_search');
    expect(restorationMigration).toMatch(/v_restored\s*<\s*3000/);
  });
});
