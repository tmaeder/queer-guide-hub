import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `tag-enrichment-sweep` must write `unified_tags` only through
 * `tag_enrichment_apply`, which declares `app.actor`.
 *
 * PostgREST cannot set a session GUC, so a direct `.from('unified_tags')
 * .update()` lands in `tag_change_log` under `log_unified_tag_change()`'s
 * undeclared fallback actor, the literal 'system:trigger'. On 2026-08-30 the
 * sweep's two-hourly cron wrote Wikipedia extracts into nine tags at 08:00Z
 * — eight of them the wrong sense for a queer glossary (`darkroom` about
 * processing photographic film, `flint` about sedimentary rock, `villa` about
 * a type of house) — and because the writes logged as 'system:trigger', which
 * reads like a database trigger rather than a scheduled job, they were blamed
 * on a concurrent session twice before the timestamp matched the cron.
 *
 * Text checks against the repo, so they run in CI without credentials — same
 * pattern as citySafetyBackfill.test.ts and tagThinPageGate.test.ts.
 */

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const SWEEP = join(ROOT, 'supabase', 'functions', 'tag-enrichment-sweep', 'index.ts');

const sweep = readFileSync(SWEEP, 'utf8');

const rpcSql = (() => {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (/create\s+(or\s+replace\s+)?function\s+public\.tag_enrichment_apply\s*\(/i.test(sql))
      return sql;
  }
  throw new Error('no migration defines tag_enrichment_apply');
})();

/** The function body, so COMMENT ON / GRANT text cannot satisfy an assertion. */
const body = rpcSql.slice(
  rpcSql.search(/create\s+(or\s+replace\s+)?function\s+public\.tag_enrichment_apply/i),
  rpcSql.search(/comment\s+on\s+function\s+public\.tag_enrichment_apply/i),
);

describe('tag-enrichment-sweep writes through the attributed door', () => {
  it('makes no direct PostgREST update to unified_tags', () => {
    // Collapse whitespace so a reformat cannot smuggle one past the regex.
    const flat = sweep.replace(/\s+/g, ' ');
    const direct = [...flat.matchAll(/from\('unified_tags'\)\s*\.update\(/g)];
    expect(
      direct.length,
      'a direct .update() logs as the undeclared actor system:trigger — route it through tag_enrichment_apply',
    ).toBe(0);
  });

  it('calls tag_enrichment_apply for every write kind the RPC supports', () => {
    for (const kind of ['category', 'links', 'description', 'prose_cursor']) {
      expect(sweep, `no call site passes p_kind: '${kind}'`).toContain(`p_kind: '${kind}'`);
    }
  });

  it('gates its success counters on the RPC returning true, not merely on no error', () => {
    // tag_enrichment_apply returns false for a row it declined to write
    // (human_reviewed). Counting that as applied would report work not done.
    expect(sweep).toMatch(/!error\s*&&\s*applied/);
    expect(sweep).toMatch(/!e\s*&&\s*(linked|wrote)/);
  });
});

describe('tag_enrichment_apply', () => {
  it('declares an actor that is neither absent nor the system fallback', () => {
    expect(body).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'llm:tag-enrichment-sweep'/i);
    expect(body).not.toMatch(/'system:/);
  });

  it('refuses sensitive and adult rows on the CONTENT kinds', () => {
    expect(body).toMatch(/is_sensitive\s+or\s+v_row\.is_adult/i);
    expect(body).toMatch(/raise\s+exception[^;]*sensitive\/adult/i);
  });

  /**
   * The refusal must NOT cover `links`. This assertion is the whole reason the
   * test above is no longer phrased "outright": scoping the guard keeps the
   * old regex matching, so without this the suite would have gone on passing
   * while its name described the opposite of the behaviour.
   *
   * Measured on prod: 1,360 of 2,107 active sensitive/adult tags carry neither
   * `wikidata_id` nor `wikipedia_url`, 358 of them writable. They sort to the
   * head of the batch on `quality_score asc`, so refusing them does not merely
   * withhold identity — it pins the work list and re-fetches them forever.
   */
  it('exempts links from that refusal — identity is not content', () => {
    const guard = body.slice(
      body.search(/if[^;]*is_sensitive/i),
      body.search(/raise\s+exception[^;]*sensitive\/adult/i),
    );
    expect(guard, "the sensitive guard must exclude p_kind 'links'").toMatch(
      /p_kind\s*(<>|!=)\s*'links'/i,
    );
  });

  it('still lets a links write reach the human_reviewed refusal', () => {
    // Exempting links from the SENSITIVE guard must not also exempt it from
    // the human_reviewed one — that check is unconditional for every kind
    // below the prose_cursor early return, and it is what preserves the skip
    // the audit guard produces today.
    const sensitiveAt = body.search(/if[^;]*p_kind\s*(<>|!=)\s*'links'/i);
    const humanAt = body.search(/human_reviewed\s+then\s+return\s+false/i);
    expect(sensitiveAt, 'no scoped sensitive guard').toBeGreaterThan(-1);
    expect(humanAt, 'no human_reviewed refusal').toBeGreaterThan(sensitiveAt);
    const linksBranch = body.search(/p_kind\s*=\s*'links'/i);
    expect(
      humanAt,
      'human_reviewed must be checked BEFORE the links UPDATE branch',
    ).toBeLessThan(linksBranch);
  });

  it('logs an RPC refusal instead of swallowing it', () => {
    // `if (!e && x)` gates the counter correctly and discards `e`. That is how
    // the links narrowing would have shipped invisibly.
    expect(sweep).toMatch(/function\s+logRpcRefusal/);
    for (const kind of ['links', 'category', 'description']) {
      expect(sweep, `${kind} swallows its RPC error`).toContain(`logRpcRefusal('${kind}'`);
    }
  });

  it('declines human_reviewed rows instead of writing them', () => {
    // Declaring an actor pierces the audit guard that skips these today, so
    // without this check the sweep would silently gain reach it never had.
    expect(body).toMatch(/human_reviewed\s+then\s+return\s+false/i);
  });

  it('exempts the prose cursor from that refusal, or the queue head pins forever', () => {
    const cursorAt = body.search(/p_kind\s*=\s*'prose_cursor'/i);
    const humanAt = body.search(/human_reviewed/i);
    expect(cursorAt, "no 'prose_cursor' branch").toBeGreaterThan(-1);
    expect(humanAt, 'no human_reviewed check').toBeGreaterThan(-1);
    expect(
      cursorAt,
      'the prose_cursor branch must return BEFORE the human_reviewed refusal',
    ).toBeLessThan(humanAt);
  });

  it('uses per-kind UPDATEs so the column-scoped search trigger stays scoped', () => {
    // One coalesce-everything UPDATE would name every column and fire
    // trg_search_documents_tag on every cursor stamp.
    const updates = [...body.matchAll(/update\s+unified_tags\s+set/gi)];
    expect(updates.length, 'expected one UPDATE per kind').toBeGreaterThanOrEqual(4);
    // The category branch must name the TEXT column too — naming category_id
    // alone filed the tag and left the search facet blank (20261007163100).
    const catBranch = body.slice(body.search(/p_kind\s*=\s*'category'/i));
    const catUpdate = catBranch.slice(0, catBranch.search(/elsif|else\b/i));
    expect(catUpdate).toMatch(/category_id\s*=/);
    expect(catUpdate).toMatch(/\bcategory\s*=/);
  });
});
