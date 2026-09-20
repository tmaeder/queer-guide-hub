import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/99991789930799_glossary_publication_readiness_completion.sql',
  ),
  'utf8',
);
const healthCheck = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');

describe('glossary publication readiness completion', () => {
  it('migrates only corroborated legacy prose reviews', () => {
    expect(migration).toMatch(/human_reviewed\s*\n\s*and verification_status in \('reviewed', 'locked'\)/);
    expect(migration).toContain('prose_reviewed_at = coalesce(last_verified_at, updated_at, now())');
    expect(migration).not.toMatch(/set prose_reviewed_at\s*=\s*now\(\)\s*where status = 'active';/);
  });

  it('does not confuse adult display classification with evidentiary risk', () => {
    const requirement = migration.slice(
      migration.indexOf('create or replace function public.tag_source_requirement'),
      migration.indexOf('comment on function public.tag_source_requirement'),
    );
    expect(requirement).not.toContain('is_adult');
    expect(requirement).toContain('substances-harm-reduction');
    expect(requirement).toContain('legal-rights');
    expect(requirement).toContain('sexual-health');
  });

  it('keeps machine-era translations as candidates until target-language review', () => {
    expect(migration).toContain('description_i18n_candidates');
    expect(migration).toContain("description_i18n = '{}'::jsonb");
    expect(migration).toContain('review_tag_translation');
    expect(migration).toContain('English prose must be reviewed first');
  });

  it('gates publication on every required editorial decision', () => {
    for (const signal of [
      'article_indexable_without_prose_review',
      'article_indexable_without_source_review',
      'article_indexable_without_ontology_decision',
      'article_indexable_without_localisation_decision',
    ]) {
      expect(migration).toContain(signal);
      expect(healthCheck).toContain(signal);
    }
    expect(migration).toContain('top-500 publication cohort incomplete');
  });

  it('records an explicit none-applicable ontology decision instead of inventing links', () => {
    expect(migration).toMatch(/then 'reviewed' else 'none_applicable' end/);
    expect(migration).not.toMatch(/insert into public\.tag_relations/i);
  });

  it('dispositions unresolved candidates as non-publishing utility vocabulary', () => {
    expect(migration).toContain("set publication_role = 'utility'");
    expect(migration).toContain('correctness-first: prose not reviewed');
    expect(migration).toContain('correctness-first: authoritative source missing');
    expect(migration).toContain('reviewed article promoted from serial editorial queue');
  });
});
