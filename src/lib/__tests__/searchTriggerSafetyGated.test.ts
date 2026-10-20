import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 99991791966722 value-scoped the organizations search trigger and dropped a
 * SAFETY signal doing it. search_documents mirrors safety_gated from the
 * entity, but only when a search row is WRITTEN
 * (trg_search_documents_safety_gated -> set_search_document_safety_gated()).
 * recompute_safety_gated_for_country() — fired when a country's
 * criminalization changes — writes organizations.safety_gated and nothing
 * else. With safety_gated missing from the value-scoped WHEN, that flip never
 * reindexed, so an organization in a newly-criminalizing country would have
 * stayed visible to ANONYMOUS search. Measured armed but not fired: 0 drifted
 * of 104,347 search documents on 2026-10-17.
 *
 * The old guard derived its required columns from the indexer only. The
 * indexer does not read safety_gated; a second reader does. So the guard
 * passed with the hole open. These assertions pin both the fix and the
 * replacement guard, which derives its table list from the second reader.
 *
 * Text check against the migration so it runs in CI without credentials.
 */

const FILE = '99991792259936_search_trigger_safety_gated_and_events.sql';
const raw = readFileSync(join(process.cwd(), 'supabase', 'migrations', FILE), 'utf8');

/** Strip `--` comments: the header quotes every column and the word
 *  "unscoped", so an unstripped toContain passes with the statement gone. */
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');

/** The slice of one CREATE TRIGGER statement, start to its EXECUTE. */
function triggerStmt(name: string): string {
  const start = sql.indexOf(`create trigger ${name}`);
  expect(start, `create trigger ${name} not found`).toBeGreaterThan(-1);
  const end = sql.indexOf('execute function', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

const ORG_UPD = triggerStmt('trg_search_documents_organization_upd');
const EV_UPD = triggerStmt('trg_search_documents_event_upd');

/** The 29 columns search_documents_index_events reads besides id, derived
 *  live from its `e.<col>` references (44 refs, one table mention). */
const EVENTS_INDEXER_COLS = [
  'accessibility_attributes',
  'city',
  'content_language',
  'country',
  'description',
  'description_i18n',
  'duplicate_of_id',
  'end_date',
  'event_type',
  'images',
  'is_featured',
  'is_free',
  'latitude',
  'liveness_status',
  'logo_url',
  'longitude',
  'price_max',
  'price_min',
  'quality_score',
  'seo_indexable',
  'slug',
  'start_date',
  'status',
  'tags',
  'target_groups',
  'title',
  'title_i18n',
  'trust_score',
  'venue_name',
];

describe('the comment stripper is load-bearing', () => {
  it('removes a substantial header, or every negative check is vacuous', () => {
    expect(raw.length).toBeGreaterThan(sql.length + 2000);
  });
});

describe('the safety fix: organizations propagates safety_gated again', () => {
  it('compares safety_gated in the WHEN', () => {
    expect(ORG_UPD).toMatch(/old\.safety_gated\s+is distinct from\s+new\.safety_gated/);
  });

  it('names safety_gated in UPDATE OF, or a safety_gated-only write never reaches the WHEN', () => {
    const updateOf = ORG_UPD.slice(0, ORG_UPD.indexOf('on public.organizations'));
    expect(updateOf).toMatch(/\bsafety_gated\b/);
  });

  it('keeps every column the previous trigger compared — the fix must only ADD', () => {
    for (const c of [
      'name',
      'editorial_hook',
      'description',
      'website_domain',
      'roles',
      'tags',
      'latitude',
      'longitude',
      'primary_venue_id',
      'trust_score',
      'is_defunct',
      'completeness_score',
      'slug',
      'logo_url',
      'cover_image_url',
      'city_id',
      'country_id',
      'status',
      'duplicate_of_id',
      'field_provenance',
    ]) {
      expect(ORG_UPD, `lost ${c}`).toMatch(
        new RegExp(`old\\.${c}\\s+is distinct from\\s+new\\.${c}\\b`),
      );
    }
  });
});

describe('events: the bare trigger becomes _ins / _del / _upd', () => {
  it('drops the bare trigger', () => {
    expect(sql).toMatch(/drop trigger if exists trg_search_documents_event on public\.events/);
  });

  it('creates unconditional INSERT and DELETE triggers', () => {
    const ins = triggerStmt('trg_search_documents_event_ins');
    const del = triggerStmt('trg_search_documents_event_del');
    expect(ins).toMatch(/after insert on public\.events/);
    expect(del).toMatch(/after delete on public\.events/);
    expect(ins).not.toMatch(/\bwhen\b/);
    expect(del).not.toMatch(/\bwhen\b/);
  });

  it('compares safety_gated, for the same reason as organizations', () => {
    expect(EV_UPD).toMatch(/old\.safety_gated\s+is distinct from\s+new\.safety_gated/);
  });

  it('compares every column the events indexer reads', () => {
    for (const c of EVENTS_INDEXER_COLS) {
      expect(EV_UPD, `missing ${c}`).toMatch(
        new RegExp(`old\\.${c}\\s+is distinct from\\s+new\\.${c}\\b`),
      );
    }
  });

  it('compares exactly the indexer columns plus safety_gated — nothing silently dropped or padded', () => {
    expect(EV_UPD.match(/is distinct from/g)?.length).toBe(EVENTS_INDEXER_COLS.length + 1);
  });

  it('has no bare TRUE/FALSE that would short-circuit the WHEN', () => {
    for (const stmt of [ORG_UPD, EV_UPD]) {
      const when = stmt.slice(stmt.indexOf('when ('));
      expect(when).not.toMatch(/\b(true|false)\b/i);
    }
  });
});

describe('the replacement guard (P1) derives its tables, so it cannot miss the next one', () => {
  const verify = sql.slice(sql.indexOf('do $verify$'));

  it('reads the table list out of set_search_document_safety_gated() rather than hardcoding it', () => {
    expect(verify).toMatch(/p\.proname = 'set_search_document_safety_gated'/);
    expect(verify).toMatch(/regexp_matches\(d\.def, 'from\\s\+public\\\.\(\[a-z_\]\+\)'/);
  });

  it('checks only VALUE-SCOPED triggers, since a bare one cannot drop the signal', () => {
    expect(verify).toMatch(/t\.tgqual is not null/);
  });

  it('RAISES when a scoped trigger omits safety_gated', () => {
    const p1 = verify.slice(verify.indexOf("position('new.safety_gated'"));
    expect(p1).toMatch(/raise exception 'P1 failed/);
  });

  it('refuses a vacuous pass when the mirror function yields too few tables', () => {
    expect(verify).toMatch(/cardinality\(v_mirror\), 0\) < 5/);
    expect(verify).toMatch(/raise exception 'P1b failed/);
  });
});

describe('lock discipline', () => {
  it('retries under a bounded lock_timeout instead of waiting or failing outright', () => {
    expect(sql).toMatch(/set local lock_timeout = '2s'/);
    expect(sql).toMatch(/exception when lock_not_available then/);
    expect(sql).toMatch(/pg_sleep\(2\)/);
  });
});
