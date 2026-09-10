import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `NewsArticle.publisher` must describe Queer Guide, never the originating
 * outlet.
 *
 * Until 2026-09-10 `newsDetail` in functions/_lib/detail.ts emitted
 * `news_articles.publisher_name` — the outlet the article came from — as the
 * publisher, and attached QUEER GUIDE'S OWN ICON as that outlet's logo:
 *
 *   "publisher": { "@type": "Organization", "name": "Variety",
 *                  "logo": { "url": "https://queer.guide/icons/icon-192.png" } }
 *
 * That is a false claim about a third party, served on up to 24,117 URLs, in
 * the property Google reads as a NewsArticle trust signal. It could not have
 * been right for a large share of rows in any case: the most common
 * `publisher_name` values include "Google News LGBT Rights", "NewsData.io" and
 * "Reddit LGBT", which are feeds rather than publishers and have no logo to
 * claim.
 *
 * The outlet is still credited, via `sourceOrganization` (plus the pre-existing
 * `isBasedOn` source URL) — with NO logo, because we do not hold theirs.
 *
 * These assertions run against COMMENT-STRIPPED source. The comment above the
 * fix in detail.ts quotes the old broken shape verbatim, so a naive substring
 * scan would happily match the explanation of the bug instead of the code and
 * pass while the fix was reverted.
 */

const SRC = readFileSync(join(process.cwd(), 'functions/_lib/detail.ts'), 'utf8');

/**
 * Drop whole-line comments.
 *
 * Deliberately LINE-BASED rather than a character scanner. The obvious
 * character-wise stripper is wrong on this file and fails in a way that looks
 * like a passing test: it does not understand regex literals, so
 * `.replace(/"/g, '&quot;')` in detail.ts opens a double-quote string state
 * that never closes, and every comment after it is retained as "string
 * content". That is what the first version of this file did — the explanatory
 * comment survived stripping and the position assertions read against it.
 *
 * Every comment this test must remove is on its own line, so matching the four
 * leading comment markers is sufficient and cannot be fooled by a regex or a
 * quote anywhere in the file.
 */
function stripComments(src: string): string {
  return src
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('/*') || t.startsWith('*/') || t.startsWith('*'));
    })
    .join('\n');
}

const CODE = stripComments(SRC);

/** The `articleLd` object literal inside newsDetail, comment-free. */
function articleLdBlock(): string {
  const start = CODE.indexOf("'@type': 'NewsArticle'");
  expect(start, "newsDetail's NewsArticle JSON-LD block not found").toBeGreaterThan(-1);
  const end = CODE.indexOf('isBasedOn', start);
  expect(end, 'isBasedOn not found after the NewsArticle block').toBeGreaterThan(start);
  return CODE.slice(start, end);
}

describe('NewsArticle publisher attribution', () => {
  it('the comment stripper does not eat code, and does remove comments', () => {
    // Positive control both ways: without this, every assertion below could be
    // passing against an empty string.
    expect(CODE).toContain("'@type': 'NewsArticle'");
    expect(CODE).toContain('sourceOrganization');
    expect(SRC).toContain('a false claim about a third party');
    expect(CODE).not.toContain('a false claim about a third party');
  });

  it('names Queer Guide as the publisher', () => {
    const block = articleLdBlock();
    expect(block).toMatch(/publisher:\s*\{[^}]*name:\s*'Queer Guide'/);
  });

  it("never uses the article row's publisher_name as the publisher", () => {
    const block = articleLdBlock();
    // The `publisher` local holds news_articles.publisher_name. It must not be
    // the value of the publisher property — that is exactly the old bug.
    const publisherProp = /publisher:\s*(\{[\s\S]*?\n {4}\}|[^,\n]+)/.exec(block);
    expect(publisherProp, 'no publisher property found').not.toBeNull();
    expect(publisherProp![1]).not.toMatch(/\bname:\s*publisher\b/);
    expect(publisherProp![1]).not.toMatch(/^\s*publisher\s*$/);
  });

  it('credits the originating outlet via sourceOrganization, with no logo', () => {
    const block = articleLdBlock();
    const src = /sourceOrganization:\s*([^\n]*\n?[^\n]*)/.exec(block);
    expect(src, 'sourceOrganization missing — the outlet lost its credit').not.toBeNull();
    expect(src![1]).toMatch(/\bpublisher\b/);
    // We do not hold third-party logos. Inventing one is how this bug started.
    expect(src![1]).not.toMatch(/logo/i);
  });

  it('attaches a logo only to the Queer Guide publisher object', () => {
    const block = articleLdBlock();
    const logoCount = (block.match(/logo:/g) ?? []).length;
    expect(logoCount).toBe(1);
    // …and that one logo sits inside the publisher object, before
    // sourceOrganization is introduced.
    const logoAt = block.indexOf('logo:');
    const sourceOrgAt = block.indexOf('sourceOrganization');
    expect(logoAt).toBeLessThan(sourceOrgAt);
  });
});
