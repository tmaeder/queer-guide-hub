import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790059688_business_brand_quality_completion.sql'),
  'utf8',
);
const businessPage = readFileSync(join(process.cwd(), 'src/pages/admin/AdminBusiness.tsx'), 'utf8');
const verifiedBrandsHook = readFileSync(
  join(process.cwd(), 'src/hooks/useMarketplaceBrands.ts'),
  'utf8',
);

describe('business and brand data-quality contracts', () => {
  it('uses explicit outcome states and admin-only findings', () => {
    for (const state of ['pass', 'fail', 'pending', 'not_applicable', 'source_unavailable']) {
      expect(migration).toContain(`'${state}'`);
    }
    expect(migration).toContain('entity_quality_findings_admin_read');
    expect(migration).toContain("has_role_jwt('admin'::public.app_role)");
    expect(migration).toContain('waiver note required');
    expect(migration).toContain("p_resolution text default 'open'");
    expect(migration).toContain("p_resolution='waived'");
  });

  it('separates publication from ownership verification without dropping legacy status', () => {
    expect(migration).toContain('publication_status');
    expect(migration).toContain('ownership_review_status');
    expect(migration).toContain('marketplace_brands_sync_legacy_status');
    expect(migration).toContain(
      "new.status in('approved','rejected') and new.publication_status='draft'",
    );
    expect(migration).toContain("ownership_review_status='verified'");
    expect(verifiedBrandsHook).toContain(".eq('ownership_review_status', 'verified')");
  });

  it('requires evidence and review provenance for a verified ownership claim', () => {
    expect(migration).toContain('ownership claim requires evidence');
    expect(migration).toMatch(
      /ownership_review_status='verified'[\s\S]*cardinality\(ownership_tags\)=0[\s\S]*evidence[\s\S]*reviewer_id[\s\S]*reviewed_at/,
    );
  });

  it('keeps the privileged ownership review queue admin-only', () => {
    expect(migration).toMatch(
      /marketplace_brands_pending[\s\S]*public\.has_role_jwt\('admin'::app_role\)/,
    );
  });

  it('supports safe brand identity moves with redirects and reversible events', () => {
    expect(migration).toContain('marketplace_brand_slug_redirects');
    expect(migration).toContain('business_brand_quality_events');
    expect(migration).toContain('rollback_of');
    expect(migration).toMatch(/get_marketplace_brand[\s\S]*old_slug=p_slug/);
  });

  it('preserves the current public brand RPC return signatures', () => {
    expect(migration).toMatch(
      /get_marketplace_brand\(p_slug text\)[\s\S]*logo_url text,logo_on_ink boolean,story text/,
    );
    expect(migration).toMatch(
      /get_marketplace_spotlight_brands\(p_limit int default 8\)[\s\S]*logo_on_ink boolean,ownership_tags text\[\]/,
    );
  });

  it('computes role-aware organization dimensions and reconciles linked roles', () => {
    for (const dimension of [
      'identity',
      'editorial',
      'contact',
      'location',
      'media',
      'categorization',
      'linkage',
      'provenance',
      'freshness',
    ]) {
      expect(migration).toContain(`('${dimension}'`);
    }
    expect(migration).toContain('reconcile_organization_link_roles');
    expect(migration).toContain("array['support','advocacy','community']");
  });

  it('exposes every supported organization role in the Business filters', () => {
    expect(businessPage).toContain("'advocacy'");
    expect(businessPage).toContain("'community'");
    expect(businessPage).toContain("'organizer'");
  });

  it('schedules a measured refresh and asserts full dimension coverage', () => {
    expect(migration).toContain('business_brand_quality_refresh');
    expect(migration).toContain('alter table public.marketplace_quality_snapshots');
    expect(migration).toContain('business_brand_stats');
    expect(migration).not.toContain(
      'create table if not exists public.business_brand_quality_snapshots',
    );
    expect(migration).toContain('business_brand_backlog_growth');
    expect(migration).toContain("a.alert_type='business_brand_backlog_growth'");
    expect(migration).toContain('findings_by_reason');
    expect(migration).toContain('brands_by_source');
    expect(migration).toContain('<>9');
    expect(migration).toContain('<>8');
    expect(migration).toContain('verified ownership claims lack evidence/review provenance');
    expect(migration).toContain("not('venue'=any(o.roles))");
  });
});
