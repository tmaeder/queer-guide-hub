import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790011389_venue_quality_tiered_catalog.sql'),
  'utf8',
);
const OPERATIONAL_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790011920_venue_quality_operational_hardening.sql'),
  'utf8',
);
const GEO_RELATIONSHIP_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790011930_venue_catalog_geo_relationship.sql'),
  'utf8',
);
const PHASH_SAFETY_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790011940_venue_phash_memory_guard.sql'),
  'utf8',
);
const EVIDENCE_COMPLETION_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790054000_venue_source_evidence_completion.sql'),
  'utf8',
);
const PHASH_WORKER = readFileSync(
  join(process.cwd(), 'supabase/functions/image-phash-backfill/index.ts'),
  'utf8',
);
const REVIEW_SCOPE_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790054010_venue_review_queue_live_scope.sql'),
  'utf8',
);
const SOURCE_BLOCKER_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790054020_venue_source_blocker_review.sql'),
  'utf8',
);
const SOURCE_EVIDENCE_SQL = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/99991790072000_venue_source_description_and_country_evidence.sql',
  ),
  'utf8',
);
const GEO_EVIDENCE_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790072010_venue_deterministic_geo_evidence.sql'),
  'utf8',
);
const IMAGE_METADATA_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790072020_venue_image_metadata_completion.sql'),
  'utf8',
);
const IMAGE_OPTIMIZER = readFileSync(
  join(process.cwd(), 'supabase/functions/optimize-images-batch/index.ts'),
  'utf8',
);
const DEAD_IMAGE_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790072030_venue_dead_image_quarantine.sql'),
  'utf8',
);
const QUEUE_CLOSEOUT_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790072040_venue_quality_queue_closeout.sql'),
  'utf8',
);
const EVENT_RECONCILE_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790072050_event_venue_review_reconciliation.sql'),
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

  it('operationalizes venue-first media, accessibility, and unresolved event review', () => {
    expect(OPERATIONAL_SQL).toContain('venue_image_assets_due_phash');
    expect(OPERATIONAL_SQL).toContain("where l.asset_id = ia.id and l.entity_type = 'venue'");
    expect(OPERATIONAL_SQL).toContain("lower(btrim(license)) not in ('unknown'");
    expect(OPERATIONAL_SQL).toContain("where slug = 'venue_accessibility_osm'");
    expect(OPERATIONAL_SQL).toContain("'resolution', 'no_precision_match'");
  });

  it('keeps the catalog view embeddable for venue detail geo metadata', () => {
    expect(GEO_RELATIONSHIP_SQL).toContain('function public.cities(v public.venue_catalog_public)');
    expect(GEO_RELATIONSHIP_SQL).toContain('where c.id = v.city_id');
    expect(GEO_RELATIONSHIP_SQL).toContain("notify pgrst, 'reload schema'");
  });

  it('resumes perceptual hashing with bounded edge-memory usage', () => {
    expect(PHASH_SAFETY_SQL).toContain('consecutive_failures = 0');
    expect(PHASH_SAFETY_SQL).toContain('body := \'{"limit":1}\'::jsonb');
  });

  it('finishes only evidence-backed fields and queues irreducible gaps', () => {
    expect(EVIDENCE_COMPLETION_SQL).toContain('venue_description_evidence_candidates');
    expect(EVIDENCE_COMPLETION_SQL).toContain(
      'public.venue_description_issue(v.description) is null',
    );
    expect(EVIDENCE_COMPLETION_SQL).toContain("'kind', 'legacy_venue_snapshot'");
    expect(EVIDENCE_COMPLETION_SQL).toContain(
      "lower(btrim(v.data_source)) not in ('unknown', 'manual')",
    );
    expect(EVIDENCE_COMPLETION_SQL).toContain('having count(distinct category) = 1');
    expect(EVIDENCE_COMPLETION_SQL).toContain("'venue_missing_country'");
    expect(EVIDENCE_COMPLETION_SQL).toContain("'licensed_relevant_cover_required'");
    expect(EVIDENCE_COMPLETION_SQL).toContain("cron.schedule('image_phash_backfill', '7 * * * *'");
  });

  it('keeps perceptual hashing scoped to venue-linked assets after convergence', () => {
    expect(PHASH_WORKER).toContain("rpc('venue_image_assets_due_phash'");
    expect(PHASH_WORKER).not.toContain(".select('id, url, optimized_url')");
  });

  it('keeps remediation queues limited to live venues and accounts for new events', () => {
    expect(REVIEW_SCOPE_SQL).toContain("r.review_type = 'venue_missing_country'");
    expect(REVIEW_SCOPE_SQL).toContain('v.duplicate_of_id is not null');
    expect(REVIEW_SCOPE_SQL).toContain('v.closed_at is not null');
    expect(REVIEW_SCOPE_SQL).toContain("v.review_status = 'archived'");
    expect(REVIEW_SCOPE_SQL).toContain("'non_live_venue_removed_from_queue'");
    expect(REVIEW_SCOPE_SQL).toContain("'venue_link_candidate'");
  });

  it('routes irreducible live source blockers to evidence review', () => {
    expect(SOURCE_BLOCKER_SQL).toContain("'venue_source_evidence'");
    expect(SOURCE_BLOCKER_SQL).toContain("array['no_source']::text[]");
    expect(SOURCE_BLOCKER_SQL).toContain('v.duplicate_of_id is null');
    expect(SOURCE_BLOCKER_SQL).toContain('v.closed_at is null');
    expect(SOURCE_BLOCKER_SQL).toContain("v.review_status is distinct from 'archived'");
    expect(SOURCE_BLOCKER_SQL).toContain("'source_observation_required'");
  });

  it('fills only recent source descriptions and unanimous explicit countries', () => {
    expect(SOURCE_EVIDENCE_SQL).toContain('venue_description_fill_candidates');
    expect(SOURCE_EVIDENCE_SQL).toContain('length(src.description) >= 120');
    expect(SOURCE_EVIDENCE_SQL).toContain(
      'public.venue_description_issue(src.description) is null',
    );
    expect(SOURCE_EVIDENCE_SQL).toContain("s.last_seen_at >= now() - interval '180 days'");
    expect(SOURCE_EVIDENCE_SQL).toContain('venue_country_link_candidates');
    expect(SOURCE_EVIDENCE_SQL).toContain('having count(distinct country_id) = 1');
    expect(SOURCE_EVIDENCE_SQL).toContain("lower(o.country_signal) <> 'various locations'");
    expect(SOURCE_EVIDENCE_SQL).toContain("'source_country_linked'");
    expect(SOURCE_EVIDENCE_SQL).toContain('venue_category_provenance_candidates');
    expect(SOURCE_EVIDENCE_SQL).toContain(
      'venue evidence remediation created multiple winning provenance rows',
    );
  });

  it('limits further geo repair to unique cities or terminal source countries', () => {
    expect(GEO_EVIDENCE_SQL).toContain('venue_unique_city_geo_candidates');
    expect(GEO_EVIDENCE_SQL).toContain('where m.match_count = 1');
    expect(GEO_EVIDENCE_SQL).toContain('venue_address_country_geo_candidates');
    expect(GEO_EVIDENCE_SQL).toContain('having count(distinct country_id) = 1');
    expect(GEO_EVIDENCE_SQL).toContain("'source_address_country_suffix'");
    expect(GEO_EVIDENCE_SQL).toContain('venue_deterministic_geo_candidates');
    expect(GEO_EVIDENCE_SQL).toContain('deterministic venue geo candidate did not persist');
  });

  it('completes factual venue image metadata without fabricating editorial evidence', () => {
    expect(IMAGE_METADATA_SQL).toContain('venue_claim_image_assets_for_metadata');
    expect(IMAGE_METADATA_SQL).toContain("l.entity_type = 'venue'");
    expect(IMAGE_METADATA_SQL).toContain('ia.width is null or ia.height is null');
    expect(IMAGE_METADATA_SQL).toContain("'venue_image_metadata'");
    expect(IMAGE_METADATA_SQL).not.toMatch(/set\s+(license|alt_text|attribution)\s*=/i);
    expect(IMAGE_OPTIMIZER).toContain("entityType === 'venue'");
    expect(IMAGE_OPTIMIZER).toContain("rpc('venue_claim_image_assets_for_metadata'");
    expect(IMAGE_OPTIMIZER).toContain("reason === 'http_404'");
    expect(IMAGE_OPTIMIZER).toContain("flagged_reason: 'source_http_404_after_3_attempts'");
    expect(DEAD_IMAGE_SQL).toContain("flagged_reason = 'source_http_404_after_3_attempts'");
    expect(DEAD_IMAGE_SQL).toContain('terminal 404 venue image remained active');
  });

  it('closes stale event reviews and retains only evidence-backed venue source repairs', () => {
    expect(QUEUE_CLOSEOUT_SQL).toContain("'https://www.electrowerkz.co.uk/'");
    expect(QUEUE_CLOSEOUT_SQL).toContain("'official_venue_website'");
    expect(QUEUE_CLOSEOUT_SQL).toContain('resolve_event_venue_link_reviews');
    expect(QUEUE_CLOSEOUT_SQL).toContain("'event_no_longer_actionable'");
    expect(QUEUE_CLOSEOUT_SQL).toContain("schedule = '17 * * * *'");
    expect(QUEUE_CLOSEOUT_SQL).not.toMatch(/verified\s*=\s*true/i);
  });

  it('keeps every upcoming named event linked or explicitly reviewable', () => {
    expect(EVENT_RECONCILE_SQL).toContain('reconcile_event_venue_link_reviews');
    expect(EVENT_RECONCILE_SQL).toContain('uq_event_venue_link_review_pending');
    expect(EVENT_RECONCILE_SQL).toContain("'no_precision_match'");
    expect(EVENT_RECONCILE_SQL).toContain("'unaccounted', v_unaccounted");
    expect(EVENT_RECONCILE_SQL).toContain("schedule = '25 * * * *'");
    expect(EVENT_RECONCILE_SQL).toContain('upcoming named event is neither linked nor reviewable');
  });
});
