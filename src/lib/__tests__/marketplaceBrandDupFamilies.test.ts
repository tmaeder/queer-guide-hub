import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Brand duplicate families + the stale `no_domain` logo stamp.
 *
 * Context measured on prod 2026-10-04, because CLAUDE.md's own entry says to re-measure
 * before believing any claim in it: the "no defensible domain" residue is 733 (not
 * 775/766), ALL of them carry `logo_source='no_domain'` at a 0% hit rate, and the brand
 * name corroborates none of their 732 merchant domains. So there is no bulk logo fix. What
 * IS available is that part of the cohort is a DUPLICATE-ROW problem — merging a family
 * carries a sibling's logo over for free.
 *
 * This guards the SHAPE of that merge. Every assertion runs against comment-stripped SQL:
 * the migration's header quotes its own predicates, brand names and even the rejected
 * token arm verbatim, so a whole-file `toMatch` would pass with the real statement gone.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const VERSION = '99991791111093';
const FILENAME = `${VERSION}_marketplace_brand_dup_families_and_stale_logo_stamp.sql`;

function raw(): string {
  const files = readdirSync(MIGRATIONS).filter((f) => f.startsWith(VERSION));
  expect(files, `no migration found at version ${VERSION}`).toContain(FILENAME);
  return readFileSync(join(MIGRATIONS, FILENAME), 'utf8');
}

const SRC = raw();
const SQL = SRC.split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');

/** The 12 artifact keys the file undertakes to retire. */
const ARTIFACTS = [
  'mr s leather',
  'charlie by matthew zink',
  'charliebymz',
  'charlie by mz',
  'vilain garcon',
  'j.k. ansell ltd.',
  'hünkyjunk',
  'man cage',
  'kink lab',
  'banana pants',
  'rssc sports',
  'backroom gear',
];

describe('the comment stripper', () => {
  it('removes the header, so assertions cannot pass against prose', () => {
    expect(SRC).toContain('LENGTH IS NOT DISTINCTIVENESS');
    expect(SQL).not.toContain('LENGTH IS NOT DISTINCTIVENESS');
  });

  it('leaves the statements', () => {
    expect(SQL).toMatch(/create\s+temp\s+table\s+_fam/i);
    expect(SQL).toMatch(/end\s+\$verify\$/i);
  });

  it('every double dash starts a comment, so no literal is truncated', () => {
    const lines = SRC.split('\n');
    const offenders: string[] = [];
    let checked = 0;
    lines.forEach((line, i) => {
      const at = line.indexOf('--');
      if (at === -1) return;
      checked += 1;
      if ((line.slice(0, at).match(/'/g) ?? []).length % 2 !== 0) {
        offenders.push(`line ${i + 1}: ${line.trim()}`);
      }
    });
    expect(checked, 'the scan examined nothing').toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });
});

describe('the families', () => {
  it('names all 12 artifact rows', () => {
    for (const key of ARTIFACTS) {
      expect(SQL, `artifact ${key} missing`).toContain(`'${key}'`);
    }
  });

  it('leaves realrock deferred rather than guessing a canonical styling', () => {
    // 16 vs 14 listings, no logo at stake, genuinely ambiguous. A wrong merge is worse
    // than a deferred one — and the deferral is only honest if the row is absent.
    expect(SQL).not.toMatch(/'real rock'/i);
    expect(SQL).not.toMatch(/'realrock'/i);
    expect(SRC).toMatch(/realrock.{0,80}defer/is);
  });

  it('requires every canonical target to already be a slugged row', () => {
    // Without this a typo re-keys listings onto a brand page that does not exist.
    expect(SQL).toMatch(
      /not\s+exists[\s\S]{0,200}marketplace_normalize_brand\(f\.canonical_name\)[\s\S]{0,80}slug\s+is\s+not\s+null/i,
    );
    expect(SQL).toMatch(
      /raise\s+exception\s+'brand families: % canonical target\(s\) are not a slugged row/i,
    );
  });
});

describe('the merge mechanism', () => {
  it('re-keys by writing brand, never brand_key', () => {
    // brand_key is GENERATED over marketplace_listings.brand; writing it is an error.
    expect(SQL).toMatch(/update\s+marketplace_listings\s+l\s*\n?\s*set\s+brand\s*=/i);
    expect(SQL).not.toMatch(/update\s+marketplace_listings[\s\S]{0,120}set\s+brand_key\s*=/i);
  });

  it('carries the logo only onto a survivor that lacks one', () => {
    const carry = SQL.match(
      /update\s+marketplace_brands\s+c\s+set\s+logo_url[\s\S]{0,600}?c\.logo_url\s+is\s+null[\s\S]{0,120}?b\.artifact_logo_url\s+is\s+not\s+null/i,
    );
    expect(carry, 'the logo carry is not guarded on survivor-lacks-logo').not.toBeNull();
  });

  it('inserts the redirect BEFORE the slug is dropped', () => {
    // The trigger only fires non-null -> non-null, so slug=NULL creates no redirect. The
    // insert must therefore happen while artifact_slug is still readable.
    const insertAt = SQL.search(/insert\s+into\s+public\.marketplace_brand_slug_redirects/i);
    const retireAt = SQL.search(/set\s+status\s*=\s*'rejected'/i);
    expect(insertAt).toBeGreaterThan(-1);
    expect(retireAt).toBeGreaterThan(-1);
    expect(insertAt).toBeLessThan(retireAt);
  });

  it('points the redirect at the survivor, not at the row being retired', () => {
    expect(SQL).toMatch(/marketplace_brand_slug_redirects[\s\S]{0,200}b\.canonical_id/i);
  });

  it('retires the artifact fully', () => {
    expect(SQL).toMatch(
      /set\s+status\s*=\s*'rejected'[\s\S]{0,200}product_count\s*=\s*0[\s\S]{0,120}slug\s*=\s*NULL/i,
    );
  });

  it('never deletes a brand or a listing', () => {
    expect(SQL).not.toMatch(/delete\s+from\s+(public\.)?marketplace_brands/i);
    expect(SQL).not.toMatch(/delete\s+from\s+(public\.)?marketplace_listings/i);
  });
});

describe('the stale no_domain stamp', () => {
  it('clears only a stamp that records the absence of a URL', () => {
    const clear = SQL.match(
      /set\s+logo_fetched_at\s*=\s*NULL[\s\S]{0,400}?logo_source\s*=\s*'no_domain'[\s\S]{0,300}?website/i,
    );
    expect(clear, 'the stamp clear is not guarded on no_domain + a present website').not.toBeNull();
    // Must not clear a stamp that records a real probe.
    expect(SQL).toMatch(/logo_url\s+is\s+null[\s\S]{0,120}logo_source\s*=\s*'no_domain'/i);
  });

  it('makes the stamp self-invalidating rather than shipping a one-shot', () => {
    expect(SQL).toMatch(
      /create\s+or\s+replace\s+function\s+public\.marketplace_brands_clear_stale_logo_stamp/i,
    );
    expect(SQL).toMatch(/create\s+trigger\s+trg_marketplace_brands_clear_stale_logo_stamp/i);
    expect(SQL).toMatch(/before\s+update\s+of\s+website\s+on\s+public\.marketplace_brands/i);
  });

  it('fires only when a website arrives, not on every website edit', () => {
    // old.website null -> new.website present. Without the old-is-null half it would
    // re-clear a stamp every time a URL is corrected, re-probing forever.
    expect(SQL).toMatch(/old\.website[^;]{0,60}is\s+null/i);
  });
});

describe('postconditions', () => {
  it('leads with positive controls, so no zero is vacuous', () => {
    expect(SQL).toMatch(/v_rows\s*<\s*1/i);
    expect(SQL).toMatch(/raise\s+exception\s+'brand families: _before is empty/i);
    expect(SQL).toMatch(/v_listings,\s*0\)\s*<\s*1/i);
  });

  it('asserts the redirect through get_marketplace_brand, not by counting rows', () => {
    // A redirect row that resolves to nothing satisfies a row count.
    expect(SQL).toMatch(/get_marketplace_brand\(b\.artifact_slug\)/i);
    expect(SQL).toMatch(/g\.brand_key\s*=\s*b\.canonical_key/i);
  });

  it('asserts no listing was lost, both halves', () => {
    expect(SQL).toMatch(/moved\s*\+\s*t\.kept/i);
    expect(SQL).toMatch(/listing\(s\) still on an artifact brand_key/i);
  });

  it('asserts the duplicate invariant WITHOUT the now-stale exclusion', () => {
    // 20260919194058 excluded 'Fort Troff' and 'MR. Riegillio'; both were already merged
    // on 2026-07-04, so carrying that exclusion forward would hide a regression.
    expect(SQL).toMatch(/group\s+by\s+display_name\s+having\s+count\(\*\)\s*>\s*1/i);
    expect(SQL).not.toMatch(/Fort Troff/);
    expect(SQL).not.toMatch(/MR\. Riegillio/);
  });

  it('asserts the free-logo half actually landed', () => {
    expect(SQL).toMatch(/survivor\(s\) in a logo-bearing family still have no logo/i);
  });

  it('asserts the trigger is attached, not merely created', () => {
    expect(SQL).toMatch(
      /from\s+pg_trigger[\s\S]{0,200}trg_marketplace_brands_clear_stale_logo_stamp/i,
    );
  });

  it('cannot be neutered by short-circuiting a check', () => {
    // Every assertion above anchors on a needle — a RAISE message, a column, a join. All of
    // them survive `if v_lost <> 0` becoming `if false`, which leaves the needle intact and
    // stops the check checking. Mutation testing caught exactly that twice here, so the
    // CONDITIONS are counted rather than the strings inside them.
    const verify = SQL.slice(SQL.indexOf('do $verify$'));
    expect(verify.length, 'verify block not found').toBeGreaterThan(200);
    expect(verify).not.toMatch(/\bif\s+(not\s+)?false\b/i);
    expect(verify).not.toMatch(/\bwhere\s+false\b/i);
    expect(verify).not.toMatch(/\band\s+false\b/i);
    // Each postcondition must branch on a variable it actually counted.
    const conditions = verify.match(/if\s+(?:not\s+)?(?:coalesce\()?v_\w+/gi) ?? [];
    expect(conditions.length).toBeGreaterThanOrEqual(8);
    // And no counter may be pre-seeded to a passing value.
    expect(verify).not.toMatch(/v_(lost|live|open|dup|carried|cleared)\s+int\s*:=\s*0/i);
  });
});
