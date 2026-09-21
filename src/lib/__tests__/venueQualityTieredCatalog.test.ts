import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790011389_venue_quality_tiered_catalog.sql'),
  'utf8',
);

describe('venue quality tiered catalog migration', () => {
  it('starts in shadow mode and keeps hard blockers separate from the score', () => {
    expect(SQL).toContain('enforcement_enabled boolean not null default false');
    expect(SQL).toContain("quality_tier in ('suppressed', 'listed', 'guide_ready', 'verified')");
    expect(SQL).toContain("array_append(v_blockers, 'duplicate')");
    expect(SQL).toContain('v_is_listed := cardinality(v_blockers) = 0');
    expect(SQL).toContain("when not v_is_listed then 'suppressed'");
  });

  it('publishes only the safe score projection and handles nullable legacy status explicitly', () => {
    const publicProjection = SQL.slice(
      SQL.indexOf('create table if not exists public.venue_quality_public'),
      SQL.indexOf('alter table public.venue_quality_snapshots enable row level security'),
    );
    expect(publicProjection).not.toContain('blocker_codes');
    expect(publicProjection).not.toContain('description_score');
    expect(SQL).toContain('with (security_invoker = true)');
    expect(SQL).toContain("v.data_source is distinct from 'refuge-restrooms'");
    expect(SQL).toContain("v.review_status is distinct from 'archived'");
  });

  it('requires timestamped evidence for verification and evidence-backed guide descriptions', () => {
    expect(SQL).toContain('verification_source is required when verifying a venue');
    expect(SQL).toContain('verification_evidence is required when verifying a venue');
    expect(SQL).toContain('new.verified_at := now()');
    expect(SQL).toContain('v_description_evidenced');
    expect(SQL).toContain('public.venue_description_issue(v.description)');
    expect(SQL).toContain("v_description_issue := 'duplicated_boilerplate'");
  });

  it('invalidates snapshots for every authoritative input and exposes convergence', () => {
    expect(SQL).toContain('trg_venue_quality_enqueue_venue');
    expect(SQL).toContain('trg_venue_quality_enqueue_source');
    expect(SQL).toContain('trg_venue_quality_enqueue_provenance');
    expect(SQL).toContain('trg_venue_quality_enqueue_image_link');
    expect(SQL).toContain('trg_venue_quality_enqueue_image_asset');
    expect(SQL).toContain('trg_venue_quality_enqueue_tag');
    expect(SQL).toContain('trg_venue_quality_enqueue_event');
    expect(SQL).toContain("'pending', v_pending");
    expect(SQL).toContain("'converged', v_pending = 0");
  });

  it('makes controlled tags authoritative and provides an impact-prioritized cohort', () => {
    expect(SQL).toContain('create trigger trg_sync_venue_tag_assignment_graph');
    expect(SQL).toContain('update public.venues v\n  set tags = coalesce');
    expect(SQL).toContain('public.refresh_venue_image_projection');
    expect(SQL).toContain('set images = coalesce');
    expect(SQL).toContain('venue_quality_priority_cohort(p_limit integer default 1000)');
    expect(SQL).toContain("then 'upcoming_events'");
    expect(SQL).toContain("then 'priority_city'");
  });

  it('keeps safety gating independent in ranked discovery', () => {
    expect(
      SQL.match(/v_show_gated or v\.safety_gated is not true/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(SQL).toContain("when 'verified' then 3");
    expect(SQL).toContain("when 'guide_ready' then 2");
    expect(SQL).toContain("when 'listed' then 1");
  });
});
