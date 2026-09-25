import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/99991790271091_event_data_quality_programme.sql',
  'utf8',
).toLowerCase();
const repairRescanFix = readFileSync(
  'supabase/migrations/99991790272380_event_quality_repair_rescan_fix.sql',
  'utf8',
).toLowerCase();
const operationsCompletion = readFileSync(
  'supabase/migrations/99991790275000_event_quality_operations_completion.sql',
  'utf8',
).toLowerCase();
const snapshotTimeoutFix = readFileSync(
  'supabase/migrations/99991790275100_event_quality_snapshot_timeout_fix.sql',
  'utf8',
).toLowerCase();
const gates = readFileSync('scripts/check-data-quality-gates.mjs', 'utf8');
const queues = readFileSync('src/config/adminQueues.ts', 'utf8');
const qualityPage = readFileSync('src/pages/admin/AdminEventQuality.tsx', 'utf8');
const sourceAdapter = readFileSync('supabase/functions/_shared/source-adapter.ts', 'utf8');
const pipelineValidate = readFileSync('supabase/functions/pipeline-validate/index.ts', 'utf8');
const imageAudit = readFileSync('supabase/functions/event-image-quality/index.ts', 'utf8');
const ticketmaster = readFileSync('supabase/functions/source-ticketmaster/index.ts', 'utf8');
const eventbrite = readFileSync('supabase/functions/source-eventbrite/index.ts', 'utf8');
const gaycities = readFileSync('supabase/functions/source-gaycities/index.ts', 'utf8');

describe('event data quality programme', () => {
  it('keeps legacy completeness separate from the versioned assessment', () => {
    expect(migration).toContain('create table if not exists public.event_quality_current');
    expect(migration).toContain('create table if not exists public.event_quality_issues');
    expect(migration).not.toContain('alter table public.events add column quality_score');
    expect(migration).toContain("quality_tier in ('pass','warn','fail')");
  });

  it('ships a shadow scanner and a separate dry-run-first repair operation', () => {
    expect(migration).toContain('enforcement_enabled boolean not null default false');
    expect(migration).toContain('run_event_quality_scan');
    expect(migration).toContain('p_dry_run boolean default true');
    expect(migration).toContain('run_event_quality_repairs');
    expect(repairRescanFix).toContain('updated_at=now()');
    expect(migration).toContain("values('event_quality_repairs'");
    expect(migration).toContain("'system',false");
  });

  it('makes critical integrity defects independent of aggregate completeness', () => {
    for (const code of [
      'GEO_NULL_ISLAND',
      'GEO_PARTIAL',
      'DATE_ORDER_INVALID',
      'CITY_COUNTRY_CONFLICT',
      'VENUE_CITY_CONFLICT',
      'WEBSITE_INVALID',
      'IMAGE_PLACEHOLDER',
    ]) {
      expect(migration).toContain(code.toLowerCase());
    }
    expect(migration).toContain("when cardinality(v_blockers)>0 or v_overall<70 then 'fail'");
  });

  it('connects the programme to CI and the real admin review surfaces', () => {
    expect(gates).toContain('event_quality_gate_checks');
    expect(queues).toContain("countKey: 'quality_event'");
    expect(queues).toContain("slaKey: 'quality_event'");
    expect(qualityPage).toContain('<EventQualityIssuesPanel');
    expect(operationsCompletion).toContain('event_quality_issue_page');
    expect(operationsCompletion).toContain('e.duplicate_of_id is null');
    expect(operationsCompletion).toContain('event_became_duplicate');
    expect(snapshotTimeoutFix).toContain('canonical_quality as materialized');
    expect(snapshotTimeoutFix).toContain('canonical_issues as materialized');
    expect(snapshotTimeoutFix).not.toContain('select q.*');
    expect(snapshotTimeoutFix).not.toContain('select i.*');
  });

  it('records adapter contract failures and rejects them per item at validation', () => {
    expect(sourceAdapter).toContain('validateEventSourceContract(normalized)');
    expect(sourceAdapter).toContain('errors: contract.errors');
    expect(pipelineValidate).toContain('sourceContract.errors');
    expect(pipelineValidate).toContain('errors.push(...contractErrors)');
  });

  it('audits image reachability, dimensions, MIME type and exact content reuse', () => {
    expect(migration).toContain('event_image_quality_observations');
    expect(migration).toContain('claim_event_image_quality_candidates');
    expect(migration).toContain('event_quality_worker_leases');
    expect(imageAudit).toContain('p_claim_token: claimToken');
    expect(imageAudit).toContain('release_event_quality_worker_lease');
    expect(imageAudit).toContain("probeForRole(imageUrl, 'cover'");
    expect(imageAudit).toContain('content_hash: contentHash');
    expect(imageAudit).toContain('IMAGE_CONTENT_REUSED');
    expect(imageAudit).toContain('detector: DETECTOR');
    expect(imageAudit).not.toContain("from('event_quality_current')");
  });

  it('persists source-level quality budgets and daily defect-rate evidence', () => {
    expect(migration).toContain('event_source_quality_budgets');
    expect(migration).toContain('event_source_quality_daily');
    expect(migration).toContain('refresh_event_source_quality_snapshot');
    expect(migration).toContain("'source_quality_budgets','high'");
  });

  it('removes timestamp identities from the highest-volume event adapters', () => {
    expect(ticketmaster).not.toMatch(/sourceId:.*Date\.now/);
    expect(eventbrite).not.toMatch(/sourceId:.*Date\.now/);
    expect(gaycities).not.toMatch(/sourceId:.*Date\.now/);
  });
});
