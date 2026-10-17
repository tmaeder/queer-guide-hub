import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991792248721_marketplace_search_trigger_column_scope.sql';
const SQL = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// pg_get_functiondef returns bodies WITH their comments, and this migration's header
// quotes the very strings the assertions look for (`views_count`, `increment_listing_views`,
// `content_rating`). Asserting over the raw file would pass against a gutted statement,
// so every check below runs on comment-stripped SQL.
const statements = SQL.replace(/^\s*--.*$/gm, '').replace(/\n{2,}/g, '\n');

// The UPDATE trigger's column list, as written in the migration.
const updTrigger =
  statements.match(
    /create trigger trg_search_documents_marketplace_upd[\s\S]*?execute function search_documents_sync\('marketplace'\);/i,
  )?.[0] ?? '';
const columnList = updTrigger.match(/after update of([\s\S]*?)\n\s*on public\.marketplace_listings/i)?.[1] ?? '';
const columns = columnList
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);

describe('marketplace search trigger is column-scoped', () => {
  it('drops the unscoped trigger and creates exactly three replacements', () => {
    expect(statements).toMatch(
      /drop trigger if exists trg_search_documents_marketplace on public\.marketplace_listings/i,
    );
    for (const suffix of ['ins', 'del', 'upd']) {
      expect(statements).toMatch(new RegExp(`create trigger trg_search_documents_marketplace_${suffix}\\b`, 'i'));
    }
  });

  it('keeps INSERT and DELETE unscoped — a new row always indexes, a removed row always evicts', () => {
    expect(statements).toMatch(
      /create trigger trg_search_documents_marketplace_ins\s+after insert on public\.marketplace_listings/i,
    );
    expect(statements).toMatch(
      /create trigger trg_search_documents_marketplace_del\s+after delete on public\.marketplace_listings/i,
    );
  });

  // THE POINT OF THE MIGRATION. views_count is bumped by increment_listing_views() on
  // every product page view and is read nowhere in search_documents_index_marketplace,
  // so including it would make user traffic rebuild search documents.
  it('does NOT list views_count', () => {
    expect(updTrigger).not.toMatch(/\bviews_count\b/);
    expect(columns).not.toContain('views_count');
  });

  // UPDATE OF fires on SET-list membership alone, even when the value is unchanged —
  // which is exactly the `views_count = coalesce(views_count,0)+1` shape. Without the
  // WHEN clause, a no-op write to any listed column still enqueues.
  it('carries a WHEN clause with IS DISTINCT FROM for every listed column', () => {
    expect(updTrigger).toMatch(/\bwhen\s*\(/i);
    for (const col of columns) {
      expect(
        updTrigger,
        `column ${col} is in the UPDATE OF list but has no IS DISTINCT FROM guard`,
      ).toMatch(new RegExp(`old\\.${col}\\s+is distinct from\\s+new\\.${col}`, 'i'));
    }
  });

  // content_rating gates search inclusion but is GENERATED, so UPDATE OF content_rating
  // can never fire. Listing it would read as coverage while providing none; its three
  // base columns must carry it instead.
  it('relies on content_rating’s base columns, not on content_rating itself', () => {
    expect(columns).not.toContain('content_rating');
    for (const base of ['subcategory', 'title', 'description']) {
      expect(columns).toContain(base);
    }
  });

  it('lists the columns the indexer reads, plus the two visibility gates', () => {
    for (const col of [
      'title',
      'description',
      'business_name',
      'brand',
      'category',
      'subcategory',
      'title_i18n',
      'description_i18n',
      'department',
      'subcategory_group',
      'subcategory_fine',
      'sizes',
      'colors',
      'attributes',
      'business_type',
      'merchant_domain',
      'featured',
      'quality_score',
      'deprecated_at',
      'price_usd',
      'price',
      'slug',
      'overview_image_asset_id',
      'overview_eligible',
      // not read by the indexer, but they gate visibility through derived state:
      // marketplace_refresh_overview_eligibility() and _marketplace_merge_core().
      'status',
      'duplicate_of_id',
    ]) {
      expect(columns, `${col} must be in the UPDATE OF list`).toContain(col);
    }
  });

  describe('the drift guard', () => {
    const verify = statements.match(/do \$verify\$[\s\S]*?end \$verify\$;/)?.[0] ?? '';

    it('fails when the indexer reads a column the trigger does not cover', () => {
      expect(verify).toMatch(
        /indexer reads marketplace_listings column\(s\) % that the UPDATE trigger does not cover/i,
      );
      expect(verify).toMatch(/attgenerated/);
      // the uncovered set must exclude generated columns, or content_rating reports forever
      expect(verify).toMatch(/not \(c = any\(v_generated\)\)/);
    });

    // Found by running it: [a-z_] truncates title_i18n to title_i and description_i18n
    // to description_i, so the guard reported its own regex as uncovered columns.
    it('matches digits in column names so title_i18n is not truncated', () => {
      expect(verify).toMatch(/\[a-z0-9_\]\+/);
      expect(verify).not.toMatch(/m\\\.\(\[a-z_\]\+\)/);
    });

    it('asserts views_count stays out and a WHEN clause stays present', () => {
      expect(verify).toMatch(/views_count' = any\(v_cols\)/);
      expect(verify).toMatch(/position\(' WHEN \(' in v_def\)/);
    });
  });
});
