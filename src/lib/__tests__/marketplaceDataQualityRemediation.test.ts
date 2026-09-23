import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { marketplaceDescriptionFromRaw } from '../../../supabase/functions/_shared/marketplace-description';
import { extractShopifyVariants } from '../../../supabase/functions/_shared/marketplace-attributes';
import { readImageDimensions } from '../../../supabase/functions/_shared/image-dimensions';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/99991790012000_marketplace_data_quality_remediation.sql',
  ),
  'utf8',
);
const completionMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991790053301_marketplace_quality_completion.sql'),
  'utf8',
);
const taxonomyTerminalMigration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/99991790070959_marketplace_taxonomy_terminal_cleanup.sql',
  ),
  'utf8',
);
const inactiveReasonMigration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/99991790102309_marketplace_inactive_reason_invariant.sql',
  ),
  'utf8',
);
const structuredAdultMigration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/99991790109521_marketplace_structured_adult_categories.sql',
  ),
  'utf8',
);
const variantWorker = readFileSync(
  join(process.cwd(), 'supabase/functions/marketplace-variant-backfill/index.ts'),
  'utf8',
);
const linkWorker = readFileSync(
  join(process.cwd(), 'supabase/functions/marketplace-link-checker/index.ts'),
  'utf8',
);

describe('marketplace data-quality remediation contracts', () => {
  it('uses indexed, expiring claims and skip-locked concurrency', () => {
    expect(migration).toContain('marketplace_listings_variant_work_idx');
    expect(migration).toContain('marketplace_listing_sources_listing_seen_idx');
    expect(migration).toMatch(
      /marketplace_claim_variant_extract[\s\S]*FOR UPDATE OF l SKIP LOCKED/,
    );
    expect(migration).toMatch(/marketplace_claim_link_checks[\s\S]*FOR UPDATE OF l SKIP LOCKED/);
    expect(migration).toMatch(
      /marketplace_claim_link_checks[\s\S]*preeligible AS MATERIALIZED[\s\S]*LIMIT greatest\(500,least\(p_limit\*20,4000\)\)[\s\S]*eligible AS MATERIALIZED/,
    );
    expect(variantWorker).toContain("rpc('marketplace_claim_variant_extract'");
    expect(variantWorker).toContain("rpc('marketplace_release_variant_extract_claims'");
    expect(variantWorker).toContain('recentRuns?.length === 3');
    expect(variantWorker).toContain('lastSize + 25');
    expect(variantWorker).not.toContain('< 90_000');
    expect(variantWorker).toContain(".order('last_seen_at', { ascending: false })");
    expect(variantWorker).toContain('if (variantKeys.has(variantKey)) continue');
  });

  it('makes backfills idempotent and preserves an auditable rollback ledger', () => {
    expect(migration).toContain('ON CONFLICT DO NOTHING');
    expect(migration).toContain('marketplace_quality_events');
    expect(migration).toContain('rollback_of');
    expect(migration).toContain("'marketplace-taxonomy-v4'");
    expect(migration).not.toMatch(/DELETE FROM public\.marketplace_listings/);
  });

  it('requires explicit inactive reasons without weakening dead-link confirmation', () => {
    expect(inactiveReasonMigration).toContain('marketplace_require_inactive_reason_trg');
    expect(inactiveReasonMigration).toContain("NEW.link_health='broken'");
    expect(inactiveReasonMigration).toContain('coalesce(NEW.link_broken_streak,0)>=2');
    expect(inactiveReasonMigration).toContain("THEN 'source_feed_stale'");
  });

  it('rates explicit structured source categories at ingest time', () => {
    expect(structuredAdultMigration).toContain("slug ~ '(^|_)(dildos?|ovipositors?)$'");
    expect(structuredAdultMigration).toContain("'marketplace-content-rating-v4.2'");
    expect(structuredAdultMigration).toContain('DELETE FROM public.search_documents');
  });

  it('requires two confirmed dead-link results and limits concurrency by domain', () => {
    expect(linkWorker).toContain('nextBrokenStreak >= 2');
    expect(linkWorker).toContain("archived_reason = 'link_broken_confirmed'");
    expect(linkWorker).toContain('const byHost = new Map');
    expect(linkWorker).toContain('marketplace_release_link_check_claims');
    expect(migration).toContain("'X-Internal-Secret'");
    expect(migration).not.toContain("name='SUPABASE_SERVICE_ROLE_KEY'");
  });

  it('keeps operational tables private and image alt text source-factual', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON public\.marketplace_variant_extract_claims FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON public\.marketplace_quality_events FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toContain("'derived:listing_context'");
    expect(migration).toContain('marketplace_retry_failed_images');
    expect(migration).toContain('marketplace_claim_image_assets');
    expect(migration).toContain("'marketplace_image_optimize'");
    expect(migration).toContain('marketplace_backfill_gallery_assets');
    expect(migration).toContain("CASE WHEN v_position=0 THEN 'cover' ELSE 'gallery' END");
  });

  it('gates taxonomy automation with corpus accuracy, canary, and rollback', () => {
    expect(migration).toContain('marketplace_validate_taxonomy_corpus');
    expect(migration).toContain("'department_pass'");
    expect(migration).toContain('>=0.95');
    expect(migration).toContain('>=0.90');
    expect(migration).toContain("phase='expanding'");
    expect(migration).toContain("phase='rolled_back'");
    expect(migration).toContain('rolled_back_at=now()');
    expect(migration).toContain("VALUES('marketplace-taxonomy-v4','paused',1.00)");
    expect(migration).toContain('marketplace_rollback_quality_events');
    expect(migration).toContain("set_config('app.marketplace_quality_rollback_of'");
    expect(migration).toContain("'human_review:prod_2026_09_21'");
    expect(migration.match(/'human_review:prod_2026_09_21'/g)?.length).toBeGreaterThanOrEqual(50);
  });

  it('samples real image dimensions and exposes reversible events to admins', () => {
    expect(migration).toContain('pixel_sample AS');
    expect(migration).toContain("'image_under_600px_pct'");
    expect(migration).toContain("'recent_events'");
    expect(migration).toMatch(/marketplace_rollback_quality_events[\s\S]*has_role_jwt\('admin'/);
  });

  it('persists all three required alert classes', () => {
    expect(migration).toContain("'backlog_growth'");
    expect(migration).toContain("'worker_stalled'");
    expect(migration).toContain("'source_defect_spike'");
  });

  it('does not count an examined but nonproductive HTTP dispatch as success', () => {
    expect(migration).toContain('worker examined rows but made no changed or terminal progress');
    expect(migration).toContain("'marketplace_image_optimize'");
  });

  it('registers a bounded taxonomy drain instead of assuming a legacy row exists', () => {
    expect(migration).toContain(
      "'marketplace_taxonomy_v3_backfill','Marketplace taxonomy v4 rollout'",
    );
    expect(migration).toContain("marketplace_taxonomy_v3_backfill'',100");
    expect(migration).toContain("'* * * * *',3");
  });

  it('gives the variant backlog enough scheduled throughput for the 48-hour target', () => {
    expect(migration).toContain("schedule='*/2 * * * *'");
    expect(migration).toContain('body := \'{"batch_limit":50}\'::jsonb');
  });

  it('makes missing descriptions claimable and budget deferral non-fatal', () => {
    expect(completionMigration).toContain('Priority zero visits each missing row once');
    expect(completionMigration).toContain("? '_recovery_checked_at'");
    expect(completionMigration).toContain("slug='marketplace_description_enhance'");
    expect(completionMigration).toContain("name='internal_invoke_secret'");
  });

  it('makes the repaired taxonomy group part of the canonical safety rating', () => {
    expect(completionMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.marketplace_content_rating(',
    );
    expect(completionMigration).toContain("'dildos','vibrators','anal_toys','cock_rings'");
    expect(completionMigration).toContain('subcategory=ml.subcategory_group');
    expect(completionMigration).toContain("'_quality_original_subcategory'");
    expect(completionMigration).toContain('DELETE FROM public.search_documents');
  });

  it('accounts for every rollout change and every protected marketplace worker', () => {
    expect(completionMigration).toContain('marketplace_rollout_count_event');
    expect(completionMigration).toContain('marketplace_normalize_quality_snapshot');
    expect(completionMigration).toContain('variant_observed_hourly_rate');
    expect(completionMigration).toContain("'marketplace_taxonomy_classify'");
    expect(completionMigration).toContain("'marketplace_image_optimize'");
  });

  it('keeps packing accessories out of sex toys and stops an exhausted model drain', () => {
    expect(taxonomyTerminalMigration).toContain("THEN 'accessories'");
    expect(taxonomyTerminalMigration).toContain("'marketplace-taxonomy-v4.1'");
    expect(taxonomyTerminalMigration).toContain('taxonomy_model_attempts<3');
    expect(taxonomyTerminalMigration).toContain('IF v_model_pending=0 THEN');
  });
});

describe('image metadata fixtures', () => {
  it('reads PNG dimensions without decoding pixels', () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    png.set([0, 0, 0x04, 0xb0], 16); // 1200
    png.set([0, 0, 0x03, 0x20], 20); // 800
    expect(readImageDimensions(png)).toEqual({ width: 1200, height: 800, format: 'png' });
  });

  it('rejects malformed/unsupported image bytes', () => {
    expect(readImageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('source-first description fixtures', () => {
  it('recovers multilingual HTML while retaining factual material and care text', () => {
    const recovered = marketplaceDescriptionFromRaw({
      product: {
        body_html: '<p>Weiches Shirt aus 100% Bio-Baumwolle.</p><p>Pflege: bei 30 °C waschen.</p>',
      },
    });
    expect(recovered).toBe('Weiches Shirt aus 100% Bio-Baumwolle. Pflege: bei 30 °C waschen.');
  });

  it('does not synthesize a description when no source fact exists', () => {
    expect(
      marketplaceDescriptionFromRaw({ title: 'Rainbow Tee', body_html: '<b>Sale</b>' }),
    ).toBeNull();
  });
});

describe('variant and taxonomy boundary fixtures', () => {
  it('extracts multilingual size/color axes, price, and availability', () => {
    const { variants, attributes } = extractShopifyVariants(
      {
        options: [
          { name: 'Größe', position: 1 },
          { name: 'Farbe', position: 2 },
        ],
        variants: [
          {
            id: 42,
            title: 'M / Schwarz',
            option1: 'M',
            option2: 'Schwarz',
            price: '29.90',
            available: true,
          },
        ],
      },
      'EUR',
    );
    expect(variants[0]).toMatchObject({
      option_size: 'm',
      option_color: 'black',
      price: 29.9,
      currency: 'EUR',
      available: true,
    });
    expect(attributes).toMatchObject({ size: ['m'], color: ['black'] });
  });

  it('puts high-confidence product nouns before noisy source categories', () => {
    const wrapper = migration.slice(
      migration.indexOf(
        'CREATE OR REPLACE FUNCTION public.marketplace_subcategory_group(p_subcategory text',
      ),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.marketplace_department_for_group'),
    );
    const apparel = wrapper.indexOf('t-?shirts?|tees?');
    const fallback = wrapper.indexOf('marketplace_subcategory_group_v3(p_subcategory, p_title)');
    expect(apparel).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(apparel);
    expect(migration).toContain('marketplace_department_for_group');
    expect(wrapper.indexOf('cycling kit|cycle kit')).toBeLessThan(
      wrapper.indexOf('dildo|vibrator|masturbator'),
    );
    expect(wrapper).toContain("THEN 'bottoms'");
  });
});
