import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

/**
 * Guards the 296 glossary terms drafted from the Kinktionary term list.
 *
 * WHAT THIS FILE USED TO ALSO GUARD, and why those tests are gone.
 *
 * Until 2026-09-03 it additionally asserted that the two generated migrations
 * agreed with this definitions file field by field, and that every row they
 * created was unreviewed and unindexed. Both properties were real and worth
 * guarding. Both are now unreachable: `20261211100000` and `20261211100100`
 * were NEUTRALISED — their bodies emptied, their versions kept — because the
 * sourced one aborted `db push` on its own duplicate-slug guard and stranded
 * every migration merged behind it for seven consecutive deploys.
 *
 * A test that reads those files now asserts things about a comment block. It
 * would pass while proving nothing, which is worse than not existing.
 *
 * RESTORE THEM WITH THE MIGRATIONS, not before. When the import is re-landed at
 * a new version, the SQL-parity test and the publishing-posture test should come
 * back in the same commit and be repointed at the new filenames. See the header
 * of supabase/migrations/20261211100000_kinktionary_new_terms_sourced.sql.
 *
 * What remains here needs no migration: the definitions file is the source of
 * truth for the prose, and these checks are about the prose. This program has
 * retracted machine-written prose from production twice — 44 chimera bodies,
 * then five wrong-sense revivals that passed six presence-shaped guards — and
 * the lesson both times was that a presence check is not a sense check.
 *
 * The licence rules (no Kinktionary prose, in any form) are guarded separately
 * in kinktionaryLicence.test.ts.
 */

const ROOT = join(__dirname, '..', '..', '..');

type Term = {
  slug: string;
  name: string;
  cat: string;
  kind?: string;
  adult?: boolean;
  sensitive?: boolean;
  sourced: boolean;
  desc: string;
  long: string;
};

const loadTerms = async (): Promise<Term[]> => {
  const mod = await import(
    /* @vite-ignore */ join(ROOT, 'scripts', 'data-quality', 'kinktionary-new-term-definitions.mjs')
  );
  return mod.TERMS as Term[];
};

describe('kinktionary new terms — every definition is a definition', () => {
  it('has a short and a long body, and the long one says more', async () => {
    const terms = await loadTerms();
    for (const t of terms) {
      expect(t.desc.trim().length, `${t.slug} desc`).toBeGreaterThan(20);
      expect(t.long.trim().length, `${t.slug} long`).toBeGreaterThan(t.desc.length);
    }
  });

  it('no body is the term name restated, and none is a refusal artifact', async () => {
    const terms = await loadTerms();
    // The three shapes this corpus has actually had to retract: a stub header,
    // a title repeated back, and an LLM declining the request in prose.
    for (const t of terms) {
      expect(t.desc.toLowerCase(), t.slug).not.toContain('may refer to:');
      expect(t.long.toLowerCase(), t.slug).not.toContain('may refer to:');
      expect(t.desc.trim().toLowerCase(), t.slug).not.toBe(t.name.trim().toLowerCase());
      expect(t.long.toLowerCase(), t.slug).not.toMatch(
        /\b(as an ai|i cannot|i'm not able to|no information available)\b/,
      );
    }
  });

  it('an inferred definition says on the page that it is inferred', async () => {
    const terms = await loadTerms();
    // The provenance row is private, so the honesty has to survive in the prose
    // a reader sees. Every guessed definition marks itself as a guess.
    const hedges =
      /\b(inferred|reads as|appears to|not (?:otherwise |independently )?documented|reasoned guess|not attested|awaits confirmation|left open|definition is unknown)\b/i;
    const bare = terms.filter((t) => !t.sourced && !hedges.test(t.long));
    expect(bare.map((t) => t.slug)).toEqual([]);
  });
});
