import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The other ten merge cores must be reversible too, pinned.
 *
 * `venueMergeReversibility.test.ts` and `eventMergeReversibility.test.ts` cover the
 * two types that already recorded moved rows. This covers the ten that did not:
 * marketplace, personality, organization, milestone, hotel, news, queer_village,
 * country, group (all `entity_merge_audit`) plus city (`city_merge_audit`).
 *
 * Measured on prod 2026-09-12 before the fix — `entity_merge_audit` rows with
 * `details.moved`: marketplace 0 of 2965, news 0 of 139, organization 0 of 86,
 * personality 0 of 5, city 0 of 335. `unmerge_entities` returned
 * `{"undone": true, "reparenting_restored": null}` for all of them while every
 * reparented child stayed on the survivor.
 *
 * The event suite's weak spot is deliberately not copied here: it asserts the nine
 * non-event branches merely EXIST (`r.entity_type = '<t>'`) without asserting they
 * restore anything, which is exactly the vacuous shape that let this survive. Every
 * relation below is asserted on BOTH sides from ONE array, so a relation added to a
 * merge core but forgotten in unmerge fails.
 *
 * Assertions run against comment-stripped SQL: these migrations carry long headers
 * that quote the very strings being asserted, and a text scan that matches the
 * header passes while the statement is gone.
 *
 * Text check against the migrations directory — no credentials.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/**
 * Everything before the migration's own `do $verify$` block.
 *
 * Load-bearing, and it cost three vacuous assertions to find out. These migrations
 * end with a deploy-time guard that RAISEs on the same strings the statements
 * contain — `position('jsonb_populate_recordset' in v_src)`,
 * `position('where article_id = r.keep_id' in v_src)`,
 * `position('v_pre_schema and not p_force' in v_src)`. A `toContain` over the whole
 * file is therefore satisfied by the GUARD's copy of the string even when the
 * statement it guards has been deleted. Mutation testing caught all three: deleting
 * the real statement left the test green.
 *
 * Stripping comments is not enough for the same reason — the verify block is code.
 */
function statementsOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return stripSqlComments(sql).split(/do\s+\$verify\$/i)[0];
  }
  throw new Error(`no migration defines ${fn}`);
}

/** The full comment-stripped migration, verify block included. */
function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return stripSqlComments(sql);
  }
  throw new Error(`no migration defines ${fn}`);
}

/**
 * Every relation each core reparents. ONE source of truth for the record side and
 * the replay side — the two cannot drift.
 *
 * The six entries marked ID-LESS have no `id` column, so the core records the half
 * of the composite key the merge does not rewrite. Getting that wrong is the
 * `venue_personal_visits` trap from 20350101100000, and it recurs six times here.
 */
const CORES: Record<string, readonly string[]> = {
  _marketplace_merge_core: [
    'marketplace_collection_items',
    'marketplace_favorites',
    'guide_picks',
    'marketplace_reviews',
    'wishlist_items',
    'marketplace_listing_sources',
    'trip_packing_items',
    'wishlists',
    'dup_children',
  ],
  _personality_merge_core: [
    'personality_internal_notes', // ID-LESS: PK (personality_id)
    'personality_sources',
    'personality_coverage_gaps',
    'personality_relationships_src',
    'personality_relationships_tgt',
    'dup_children',
  ],
  _organization_merge_core: ['venues', 'marketplace_merchants', 'news_sources'],
  _milestone_merge_core: ['milestone_links', 'milestone_link_proposals'],
  _hotel_merge_core: ['trip_places'],
  _news_merge_core: [
    'news_article_cities',
    'news_article_countries',
    'news_article_entities',
    'news_story_articles', // ID-LESS: PK (story_id, article_id)
    'user_news_reads', // ID-LESS: PK (user_id, article_id)
    'news_stories_hero',
    'guides_recap',
  ],
  _queer_village_merge_core: ['venues', 'events', 'hotels', 'trip_destinations'],
  _group_merge_core: [
    'group_memberships',
    'group_collections',
    'trip_group_links', // ID-LESS: PK (trip_id, group_id)
    'events',
    'group_posts',
    'group_invites',
    'group_join_requests',
    'group_notifications',
  ],
};

describe('the nine entity_merge_audit merge cores record which rows moved', () => {
  for (const [core, relations] of Object.entries(CORES)) {
    it(`${core} stamps details.schema and records every relation`, () => {
      const sql = latestDefinitionOf(core);
      expect(sql).toMatch(/'schema',\s*1/);
      for (const rel of relations) {
        expect(
          sql.includes(`v_moved  := v_moved  || jsonb_build_object('${rel}'`),
          `${core} never records moved ids for ${rel}`,
        ).toBe(true);
      }
    });
  }

  it('_country_merge_core carries the id-less key mapping through its dynamic loop', () => {
    const sql = latestDefinitionOf('_country_merge_core');
    expect(sql).toMatch(/'schema',\s*1/);
    // The loop must write v_moved, not only v_counts.
    expect(sql).toContain('v_moved  := v_moved  || jsonb_build_object(v_triples[i]');
    // Four of its 21 tables have no `id`; a (table, column) pair array would make
    // `returning id` fail to compile for them.
    expect(sql).toContain("'user_travel_preferences','home_country_id','user_id'");
    expect(sql).toContain("'user_presence_location','country_id','user_id'");
  });
});

describe('unmerge_entities replays the reparenting instead of reporting success', () => {
  const sql = () => statementsOf('unmerge_entities');

  it('reports the real reparenting_restored for every type, not just events', () => {
    // The specific defect: `case when r.entity_type = 'event' then v_restored else null end`
    // made "not applicable" and "did not happen" indistinguishable for nine types.
    expect(sql()).not.toMatch(/case\s+when\s+r\.entity_type\s*=\s*'event'\s+then\s+v_restored/i);
    expect(sql()).toContain("'reparenting_restored', v_restored");
  });

  it('refuses a pre-schema audit unless forced', () => {
    // Nested rather than hoisted into one condition, matching the shape
    // 20270822093412 established — `eventMergeReversibility.test.ts` pins the inner
    // `if not p_force then` and now reads THIS migration, since it is the latest
    // definition of unmerge_entities.
    expect(sql()).toMatch(/if v_pre_schema then\s*\n\s*if not p_force then/);
  });

  it('keeps the overload drop and the grants with the definition', () => {
    // CREATE OR REPLACE preserves the ACL, so losing these is silent. A surviving
    // 1-arg form makes a named PostgREST call ambiguous (42725).
    const whole = latestDefinitionOf('unmerge_entities');
    expect(whole).toMatch(/DROP FUNCTION IF EXISTS public\.unmerge_entities\(uuid\)/i);
    expect(whole).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.unmerge_entities\(uuid, boolean\) TO authenticated, service_role/,
    );
    expect(whole).not.toMatch(/TO anon/);
  });

  it('replays every relation each core records', () => {
    const src = sql();
    for (const relations of Object.values(CORES)) {
      for (const rel of relations) {
        // dup_children/guide_picks/events/venues/trip_places are shared across types;
        // one occurrence is enough to prove the replay exists.
        expect(src.includes(`v_moved->'${rel}'`), `unmerge_entities never replays ${rel}`).toBe(
          true,
        );
      }
    }
  });

  it('scopes the three composite-key restores to the surviving id', () => {
    // Without `= r.keep_id` these would drag back rows that were always on the
    // survivor, because the recorded key alone does not identify the moved row.
    const src = sql();
    expect(src).toContain('where article_id = r.keep_id');
    expect(src).toContain('where group_id = r.keep_id');
  });
});

describe('city merges are reversible', () => {
  it('city_merge_audit gains a details column', () => {
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const added = files.some((f) =>
      /alter\s+table\s+public\.city_merge_audit\s+add\s+column\s+if\s+not\s+exists\s+details/i.test(
        stripSqlComments(readFileSync(join(MIGRATIONS, f), 'utf8')),
      ),
    );
    expect(added, 'city_merge_audit.details is never added').toBe(true);
  });

  it('merge_cities records the four things a row id cannot reverse', () => {
    const sql = statementsOf('merge_cities');
    expect(sql).toMatch(/'schema',\s*1/);
    // 1+2. the denormalized city TEXT, overwritten before the ids move
    // `, v_ids)` is the RECORD side. Asserting the bare key is satisfied by
    // unmerge_cities' `jsonb_build_object('venues_city_text', n)` COUNT line in the
    // same file, which mutation testing caught: deleting the recording left it green.
    expect(sql).toContain("jsonb_build_object('venues_city_text', v_ids)");
    expect(sql).toContain("jsonb_build_object('events_city_text', v_ids)");
    // 3. the ARRAY, whose array_agg(distinct) collapses an article carrying both
    expect(sql).toContain("jsonb_build_object('news_articles_city_ids', v_ids)");
    // 4. the DELETE, which destroys rows outright
    expect(sql).toContain(
      'delete from public.news_article_cities a where a.city_id = p_drop_id returning a.*',
    );
    expect(sql).toContain("jsonb_build_object('news_article_cities_deleted_rows'");
  });

  it('unmerge_cities re-inserts the deleted rows and reports honestly', () => {
    const sql = statementsOf('unmerge_cities');
    expect(sql).toContain('jsonb_populate_recordset');
    expect(sql).toContain("'reparenting_restored', v_restored");
    expect(sql).toContain('v_pre_schema and not p_force');
    // Restoring the array must write the STORED original, not swap keep->drop,
    // which cannot recover a collapsed pair.
    expect(sql).toContain("v_rec->'city_ids'");
  });

  it('drops the 1-arg unmerge_cities overload', () => {
    // PostgREST resolves overloads BY ARGUMENT NAME; leaving both installed makes a
    // named call ambiguous (42725) rather than picking the new one.
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const dropped = files.some((f) =>
      /drop\s+function\s+if\s+exists\s+public\.unmerge_cities\(uuid\)/i.test(
        stripSqlComments(readFileSync(join(MIGRATIONS, f), 'utf8')),
      ),
    );
    expect(dropped, 'the old 1-arg unmerge_cities is never dropped').toBe(true);
  });
});

/**
 * The merchant FK is NOT asserted here any more.
 *
 * This branch originally carried its own repoint (20810101095000), because
 * `marketplace_listings_merchant_id_fkey` referenced `affiliate_partners` while
 * 69,737 of 69,737 rows resolve in `marketplace_merchants`, and that made
 * `unmerge_entities` throw 23503 on 2,925 of the 2,965 marketplace merges on record.
 *
 * PR #3644 — the follow-up this work spawned — landed 20800301100000 first, and it
 * does the same repoint better: idempotent (already-correct is a notice, not an
 * abort), refusing to guess if the constraint points at a third table, and fixing
 * `commit_marketplace_staging_item` to resolve merchants rather than affiliate
 * partners, which was the actual root cause. Two migrations owning one constraint is
 * the drift this repo keeps paying for, so the duplicate was deleted rather than
 * kept "just in case".
 *
 * That FK is covered by `marketplaceMerchantLookup.test.ts`, which pins the
 * idempotence and the refusal. Do not re-add an assertion here: its finder takes the
 * LATEST migration naming the constraint, so a second one in this branch silently
 * redirects that test at the wrong file — which is exactly how this collision
 * surfaced (CI, not review).
 */
