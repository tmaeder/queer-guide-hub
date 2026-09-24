import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790194100_city_quality_contract.sql'),
  'utf8',
).toLowerCase();
const SCORECARD_AUTH = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790272400_city_quality_scorecard_staff_access.sql'),
  'utf8',
).toLowerCase();
const RELATIONSHIPS = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790194000_city_relationship_integrity.sql'),
  'utf8',
).toLowerCase();
const FACTUAL_PRODUCER = readFileSync(
  join(process.cwd(), 'supabase/functions/city-factual-backfill/index.ts'),
  'utf8',
).toLowerCase();
const IMAGE_PRODUCER = readFileSync(
  join(process.cwd(), 'supabase/functions/backfill-cities-images/index.ts'),
  'utf8',
).toLowerCase();
const CI_GATE = readFileSync(join(process.cwd(), 'scripts/check-city-quality.mjs'), 'utf8');

describe('city quality contract migration', () => {
  it('keeps dimensions separate from publication readiness', () => {
    expect(MIGRATION).toContain('create or replace view public.city_quality_profile');
    for (const dimension of [
      'lifecycle_score',
      'identity_score',
      'geo_score',
      'content_score',
      'editorial_score',
      'imagery_score',
      'relationships_score',
      'taxonomy_score',
      'provenance_score',
      'freshness_score',
      'translation_score',
    ]) {
      expect(MIGRATION).toContain(dimension);
    }
    expect(MIGRATION).toMatch(
      /a\.seo_indexable[\s\S]{0,160}cardinality\(a\.blockers\)\s*=\s*0\)\s+as\s+publication_ready/,
    );
  });

  it('defines stable hard-defect and workflow issue codes', () => {
    for (const code of [
      'city_identity_ambiguous',
      'city_description_wrong_subject',
      'city_image_reused',
      'city_link_namesake',
      'city_category_unclassified',
    ]) {
      expect(MIGRATION).toContain(`'${code}'`);
    }
  });

  it('only credits verified, adequately sized, unique image assets', () => {
    const start = MIGRATION.lastIndexOf(
      'create or replace function public.compute_city_completeness',
    );
    const body = MIGRATION.slice(start);
    expect(body).toMatch(/ia\.status\s*=\s*'active'/);
    expect(body).toMatch(/not\s+ia\.is_flagged/);
    expect(body).toMatch(/ia\.format\s+is\s+not\s+null/);
    expect(body).toMatch(/ia\.width\s*>=\s*800/);
    expect(body).toMatch(/ia\.height\s*>=\s*450/);
    expect(body).toMatch(/ia\.phash\s+is\s+not\s+null/);
    expect(body).toMatch(/not exists\s*\([\s\S]*l2\.asset_id\s*=\s*ia\.id/);
  });

  it('fails closed and snapshots scorecard probe health', () => {
    expect(MIGRATION).toContain("'probe_ok', true");
    expect(MIGRATION).toContain('city_quality_snapshots_probe_ok');
    expect(MIGRATION).toMatch(/last_run_status[\s\S]{0,120}'missing'[\s\S]{0,80}'fresh', false/);
    expect(MIGRATION).toContain('create or replace function public._city_quality_scorecard()');
    expect(SCORECARD_AUTH).toMatch(
      /create or replace function public\.city_quality_scorecard\(\)[\s\S]{0,220}security definer/,
    );
    expect(SCORECARD_AUTH).toMatch(
      /session_user <> 'postgres'[\s\S]{0,180}auth\.role\(\)[\s\S]{0,180}has_any_role_jwt/,
    );
    expect(SCORECARD_AUTH).toContain('from public.city_quality_snapshots');
    expect(MIGRATION).toMatch(
      /revoke all on function public\._city_quality_scorecard\(\) from public, anon, authenticated/,
    );
    expect(CI_GATE).toMatch(/if \(!baseUrl \|\| !serviceKey\)[\s\S]{0,180}process\.exit\(1\)/);
    expect(CI_GATE).toMatch(/if \(!response\.ok\)[\s\S]{0,180}process\.exit\(1\)/);
  });

  it('routes actionable findings through stable review types', () => {
    expect(MIGRATION).toContain('uq_review_queue_city_quality_pending');
    expect(MIGRATION).toContain('run_city_quality_issue_sync');
    expect(MIGRATION).toMatch(/cross join lateral unnest\(q\.issue_codes\)/);
  });

  it('requires source identity and hashes from factual description producers', () => {
    expect(FACTUAL_PRODUCER).toContain('source_identity');
    expect(FACTUAL_PRODUCER).toContain('retrieved_at');
    expect(FACTUAL_PRODUCER).toContain('source_hash');
    expect(FACTUAL_PRODUCER).toContain('await sha256text(extract)');
    expect(FACTUAL_PRODUCER).toMatch(
      /prov\.description\s*=\s*\{[\s\S]{0,160}source:\s*'wikipedia'/,
    );
    expect(FACTUAL_PRODUCER).not.toMatch(
      /if \(!c\.image_url && !c\.curated_image_url\)[\s\S]{0,120}update\.image_url = summary\.thumbnail/,
    );
  });

  it('ranks and validates multiple image candidates and queues ambiguity', () => {
    expect(IMAGE_PRODUCER).toContain('requireinternaloradmin');
    expect(IMAGE_PRODUCER).toContain('&per_page=8');
    expect(IMAGE_PRODUCER).toContain('rankcandidate(candidate, city)');
    expect(IMAGE_PRODUCER).toContain('insufficient_identity_margin');
    expect(IMAGE_PRODUCER).toContain("startsWith('image/')".toLowerCase());
    expect(IMAGE_PRODUCER).toContain('city_image_ambiguous');
    expect(IMAGE_PRODUCER).toContain(
      ".or('and(image_url.is.null,curated_image_url.is.null),image_flagged.eq.true')",
    );
  });
});

describe('city relationship integrity migration', () => {
  it('uses stable IDs in both event and ranked venue RPCs', () => {
    expect(RELATIONSHIPS).toMatch(/e\.city_id\s*=\s*p_city_id/);
    expect(RELATIONSHIPS).toMatch(/v\.city_id\s*=\s*v_city_id/);
    expect(RELATIONSHIPS).toContain("p_filters->>'cityid'");
  });

  it('requires exact normalized name and country for legacy fallback', () => {
    expect(RELATIONSHIPS).toMatch(/e\.country_id\s*=\s*p_country_id/);
    expect(RELATIONSHIPS).toMatch(/v\.country_id\s*=\s*v_country_id/);
    expect(RELATIONSHIPS).toMatch(/immutable_unaccent\(lower\(btrim\(e\.city\)\)\)\s*=/);
    expect(RELATIONSHIPS).toMatch(/immutable_unaccent\(lower\(btrim\(v\.city\)\)\)\s*=/);
  });
});
