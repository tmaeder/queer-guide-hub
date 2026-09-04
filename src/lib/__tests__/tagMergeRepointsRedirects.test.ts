import { describe, it, expect } from 'vitest';
import { functionBody } from './helpers/migrations';

/**
 * A tag merge used to strand every redirect that pointed at the retired row.
 *
 * `log_unified_tag_merge_redirect()` mints ONE redirect on merge — the
 * duplicate's own slug -> the canonical. It never carried forward the redirects
 * that already pointed at the duplicate, so those kept `tag_id` = a row that is
 * now `status='merged'`. The edge filters redirect targets on `status='active'`,
 * so they resolve to nothing: /tags/m-nchen 404s instead of reaching
 * /tags/munich.
 *
 * Measured on prod 2026-09-03: three such rows, all German diacritic-repair
 * artifacts (`m-nchen`, `nonbin-r`, `b-hne`).
 *
 * What is asserted here is the repoint UPDATE and its two load-bearing parts,
 * not merely that the function mentions redirects:
 *
 *  - it must select rows by `tag_id = NEW.id` (the retired row's inbound
 *    redirects). Widen that and it rewrites unrelated redirects;
 *  - it must carry the `old_slug <> v_target` guard. Drop it and a merge mints
 *    a redirect from a slug to itself, which is a loop the edge cannot resolve;
 *  - the target must be the TERMINAL canonical, not `NEW.merged_into_id`
 *    directly, or an A -> B -> C chain repoints onto a row that is itself
 *    merged and the redirect stays dead.
 */
describe('log_unified_tag_merge_redirect repoints inbound redirects', () => {
  const body = functionBody('log_unified_tag_merge_redirect');

  /** The repoint statement, whitespace-normalised. */
  const repoint = (() => {
    const m = body.match(/update\s+public\.tag_slug_redirects[\s\S]*?;/i);
    expect(m, 'the trigger has no UPDATE on tag_slug_redirects — redirects are still stranded').not.toBeNull();
    return m![0].replace(/\s+/g, ' ');
  })();

  it('selects the retired row’s inbound redirects', () => {
    expect(repoint).toMatch(/where\s+tag_id\s*=\s*NEW\.id/i);
  });

  it('keeps the self-redirect guard', () => {
    // Without this a merge can write old_slug -> old_slug.
    expect(repoint).toMatch(/old_slug\s*<>\s*v_target/i);
  });

  it('repoints onto the terminal canonical, not a possibly-merged parent', () => {
    expect(repoint).toMatch(/tag_id\s*=\s*v_terminal/i);
    expect(body).toMatch(/v_terminal\s*:=\s*public\.tag_terminal_canonical\(/i);
  });

  it('still mints the duplicate’s own redirect (pre-existing behaviour)', () => {
    expect(body).toMatch(/insert\s+into\s+public\.tag_slug_redirects/i);
    expect(body).toMatch(/on\s+conflict\s*\(\s*old_slug\s*\)\s*do\s+update/i);
  });

  it('only fires for a live canonical', () => {
    // A merge into a non-active row must not repoint anything, or the redirect
    // moves from one dead target to another.
    expect(body).toMatch(/status\s*=\s*'active'/i);
  });
});

describe('tag_terminal_canonical', () => {
  const body = functionBody('tag_terminal_canonical');

  it('is bounded, so a merge cycle cannot spin forever', () => {
    expect(body).toMatch(/v_hops\s*<\s*10/i);
  });

  it('only follows rows that are actually merged', () => {
    expect(body).toMatch(/status\s*=\s*'merged'/i);
    expect(body).toMatch(/merged_into_id\s+is\s+not\s+null/i);
  });
});
