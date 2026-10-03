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
    expect(humanAt, 'human_reviewed must be checked BEFORE the links UPDATE branch').toBeLessThan(
      linksBranch,
    );
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

/**
 * mode='prose' is REVIEW-ONLY, and the reason this needs a test rather than a
 * comment is that it HAD two comments and they disagreed.
 *
 * The file header has said "REVIEW-ONLY since 2026-08-29 — it applies nothing"
 * since that date, while the docblock over `prosePass` eighty lines below went on
 * describing the retired design: "At >=0.9 confidence the prose is RETRACTED (all
 * three fields) and the wiki identity cleared" and "Non-sensitive + confidence
 * >=0.8 auto-applies". A reader asking "does this cron write to published glossary
 * prose?" could land on either answer depending on which they opened — and
 * CLAUDE.md, which claimed the cron was DISABLED, was wrong about that for a
 * month partly because the code looked like it might need to be.
 *
 * Why it must stay review-only: the judge's first live batch (18 tags,
 * 2026-08-29) retracted 16 and 13 of those were WRONG, destroying correct
 * definitions of soft-limits, outing, deadnaming and anxiety among others. It
 * answers `wrong_subject` at HIGH confidence for prose that is merely SHORT, so
 * the confidence gate filters the broken part and bounds nothing. Only
 * `tag_change_log.before_data` made that recoverable.
 *
 * The cron is deliberately LEFT ENABLED (`33 3 * * *`): it advances a cursor and
 * fills `ai_suggestions` for a human, which is useful and cannot publish.
 */
describe('tag-enrichment-sweep mode=prose applies nothing', () => {
  /** `prosePass` only, so a write elsewhere in the file cannot satisfy these. */
  const prose = (() => {
    const start = sweep.indexOf('async function prosePass(');
    expect(start, 'prosePass is gone — re-point this guard').toBeGreaterThan(-1);
    // Up to the next top-level function declaration.
    const after = sweep.slice(start + 1);
    const next = after.search(/\n(?:async )?function \w+\(/);
    return next === -1 ? after : after.slice(0, next);
  })();

  /** The docblock immediately above it. */
  const docblock = (() => {
    const at = sweep.indexOf('async function prosePass(');
    const open = sweep.lastIndexOf('/**', at);
    return open === -1 ? '' : sweep.slice(open, at);
  })();

  it('writes unified_tags only through the prose_cursor kind', () => {
    const kinds = [...prose.matchAll(/p_kind:\s*'(\w+)'/g)].map((m) => m[1]);
    expect(kinds, 'prosePass must touch exactly one write kind').toEqual(['prose_cursor']);
  });

  it('makes no direct update and nulls no prose column', () => {
    const flat = prose.replace(/\s+/g, ' ');
    expect(flat).not.toMatch(/from\('unified_tags'\)\s*\.update\(/);
    // Retraction was `description: null` + the wiki identity cleared.
    for (const col of ['description', 'short_description', 'long_description', 'wikidata_id']) {
      expect(flat, `prosePass nulls ${col} — that is the retired retract branch`).not.toMatch(
        new RegExp(`${col}:\\s*null`),
      );
    }
  });

  it('queues the voice rewrite instead of applying it', () => {
    expect(prose).toContain("from('ai_suggestions')");
    expect(prose).toMatch(/status:\s*'pending'/);
  });

  it('counts the wrong-subject verdict without acting on it', () => {
    // The branch must increment, log, and `continue` — never write.
    const branch = prose.slice(
      prose.search(/if \(out\.verdict === 'wrong_subject'\)/),
      prose.search(/verdict === 'ok'/),
    );
    expect(branch.length, 'no wrong_subject branch found').toBeGreaterThan(0);
    expect(branch).toMatch(/stats\.prose_flagged\+\+/);
    expect(branch).toMatch(/\bcontinue\b/);
    expect(branch).not.toMatch(/\.rpc\(|\.update\(|ai_suggestions/);
  });

  it('has a docblock that does not contradict the file header', () => {
    // THE POINT OF THIS BLOCK. Both comments describe the same function; one
    // claiming retraction or auto-apply while the other says "applies nothing"
    // is how a reader concludes the cron is dangerous and CLAUDE.md concludes it
    // must be off.
    //
    // POSITIONAL, not a flat negative, and the first draft of this assertion
    // FAILED on correct code for exactly the documented reason: the corrected
    // docblock QUOTES the false claim in order to explain it, so "RETRACTED must
    // not appear" is unsatisfiable by any honest correction. A statement that
    // quotes its own defect breaks negative assertions in both directions —
    // scope them to the half of the structure they are about. This checks the
    // stale vocabulary appears ONLY below the correction marker, which proves
    // the fix AND that the history was preserved rather than deleted.
    expect(docblock.length, 'prosePass lost its docblock').toBeGreaterThan(0);

    const MARKER = 'DESCRIBED THE RETIRED DESIGN';
    const at = docblock.indexOf(MARKER);
    expect(
      at,
      'the docblock no longer records that it once described the retired design',
    ).toBeGreaterThan(-1);

    const describesNow = docblock.slice(0, at);
    for (const claim of [/\bRETRACTED\b/, /auto-applies/]) {
      expect(describesNow, `the docblock still claims ${claim} as CURRENT behaviour`).not.toMatch(
        claim,
      );
    }

    // And the historical half must still quote it — a correction that deletes
    // the claim leaves the next reader unable to tell what was fixed.
    expect(docblock.slice(at), 'the correction note must quote what it corrects').toMatch(
      /\bRETRACTED\b/,
    );

    // The header is everything above the first import, not a byte count: a 2000
    // char slice was the first draft and it FAILED on correct code, because
    // "REVIEW-ONLY since 2026-08-29" sits at line 36 of a dense 47-line header,
    // past 3,000 characters. A magic offset into a comment block is a guess that
    // rots the moment anyone edits the prose above it.
    const header = sweep.slice(0, sweep.indexOf('import '));
    expect(header.length, 'could not locate the file header').toBeGreaterThan(0);
    expect(header, 'the file header must still state review-only').toMatch(/REVIEW-ONLY/);
  });
});
