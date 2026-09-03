import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the 296 glossary terms created from the Kinktionary term list.
 *
 * Two properties are load-bearing and neither is visible in a row count.
 *
 * (1) NOTHING IS PUBLISHED ON CREATION. Every row lands seo_indexable=false,
 *     human_reviewed=false, verification_status='unverified' — usable for
 *     tagging, browsing and site search, invisible to crawlers until a human
 *     reads it. This program has retracted machine-written prose from
 *     production twice (44 chimera bodies, then five wrong-sense revivals that
 *     passed six presence-shaped guards), and the lesson both times was that a
 *     presence check is not a sense check. An unread definition of an identity
 *     or role term is a draft and has to be stored as one.
 *
 * (2) THE MIGRATIONS AGREE WITH THE DEFINITIONS FILE. The SQL is generated from
 *     kinktionary-new-term-definitions.mjs so an editor can correct a definition
 *     without touching a migration. That only holds while the two cannot drift,
 *     so this parses the VALUES tuples back out of the SQL and compares them to
 *     the source objects field by field — which is also the only check that the
 *     quoting of ~90 KB of generated prose is right.
 *
 * The licence rules (no Kinktionary prose, in any form) are guarded separately
 * in kinktionaryLicence.test.ts.
 */

const ROOT = join(__dirname, '..', '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

const SOURCED_SQL = '20261211100000_kinktionary_new_terms_sourced.sql';
const INFERRED_SQL = '20261211100100_kinktionary_new_terms_inferred.sql';

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

const sql = (file: string) => readFileSync(join(MIGRATIONS, file), 'utf8');

/**
 * Tokenize the `(a, b, …)` tuples of a VALUES list. Written as a real scanner
 * rather than a regex because doubled '' inside a literal is exactly the case a
 * regex gets wrong, and that case is the one worth catching.
 */
function parseTuples(src: string): (string | boolean | null)[][] {
  const out: (string | boolean | null)[][] = [];
  let i = 0;
  const skip = () => {
    while (i < src.length && /[\s,]/.test(src[i])) i++;
  };
  for (;;) {
    skip();
    if (src[i] !== '(') break;
    i++;
    const row: (string | boolean | null)[] = [];
    for (;;) {
      skip();
      if (src[i] === ')') {
        i++;
        break;
      }
      if (src[i] === "'") {
        i++;
        let s = '';
        while (i < src.length) {
          if (src[i] === "'") {
            if (src[i + 1] === "'") {
              s += "'";
              i += 2;
              continue;
            }
            i++;
            break;
          }
          s += src[i++];
        }
        row.push(s);
      } else {
        let s = '';
        while (i < src.length && !/[,)]/.test(src[i])) s += src[i++];
        const t = s.trim();
        row.push(t === 'true' ? true : t === 'false' ? false : t === 'null' ? null : t);
      }
    }
    out.push(row);
  }
  return out;
}

const rowsOf = (file: string) => {
  const body = sql(file);
  const marker = 'sourced, descr, longd) values\n';
  const start = body.indexOf(marker);
  expect(start, `${file}: VALUES block not found`).toBeGreaterThan(-1);
  const end = body.indexOf(';\n', start);
  return parseTuples(body.slice(start + marker.length, end));
};

describe('kinktionary new terms — nothing is published on creation', () => {
  for (const file of [SOURCED_SQL, INFERRED_SQL]) {
    it(`${file} creates every row unreviewed and unindexed`, () => {
      const body = sql(file);
      // status, seo_indexable, human_reviewed, verification_status — in that order.
      expect(body).toContain("'active', false, false, 'unverified'");
      expect(body).not.toMatch(/seo_indexable\s*=\s*true/);
      expect(body).not.toMatch(/human_reviewed\s*=\s*true/);
    });

    it(`${file} asserts its own publishing posture at apply time`, () => {
      const body = sql(file);
      // A guard that only lives in the INSERT can be defeated by a later
      // statement in the same migration; the assertion re-reads the rows.
      expect(body).toMatch(/t\.seo_indexable or coalesce\(t\.human_reviewed, false\)/);
      expect(body).toContain('must be created unreviewed and unindexed');
    });

    it(`${file} refuses a live slug and revives a deprecated one`, () => {
      const body = sql(file);
      // A second row for one concept is how a glossary ends up with two pages
      // disagreeing about a term, so a collision is never simply inserted past.
      // But the two collision kinds are not the same problem: an ACTIVE row is
      // someone's live tag and a MERGED one is a redirect these migrations know
      // nothing about, so both stop the migration for a human. A DEPRECATED row
      // is this same concept, culled by the orphan sweep for having no entity
      // assignments — which a glossary term never has — so it is revived.
      expect(body).toContain('already exist and are not deprecated');
      expect(body).toMatch(/on conflict \(slug\) do update set/);
    });

    it(`${file} clears the whole deprecation state when it revives`, () => {
      const body = sql(file);
      // status, deprecated_at and deprecation_reason must move TOGETHER. An
      // upsert that set status='active' and left deprecated_at is what once
      // stranded 297 tags rendering-but-unindexable (lgbtiq, sauna, kink
      // unreachable for three months), so a revival that clears only the
      // status is the specific bug this asserts against.
      expect(body).toMatch(/status\s*=\s*'active'/);
      expect(body).toMatch(/deprecated_at\s*=\s*null/);
      expect(body).toMatch(/deprecation_reason\s*=\s*null/);
    });

    it(`${file} records provenance privately`, () => {
      const body = sql(file);
      expect(body).toContain('public.tag_sources');
      // is_public=false: available to a reviewer, never rendered on the page.
      expect(body).toMatch(/claim_summary, is_public/);
      expect(body).toContain('have no provenance record');
    });
  }
});

describe('kinktionary new terms — migrations match the definitions file', () => {
  it('every term appears in exactly one migration, with identical fields', async () => {
    const terms = await loadTerms();
    const expected = {
      [SOURCED_SQL]: terms.filter((t) => t.sourced),
      [INFERRED_SQL]: terms.filter((t) => !t.sourced),
    };

    for (const [file, want] of Object.entries(expected)) {
      const rows = rowsOf(file);
      expect(rows.length, `${file} row count`).toBe(want.length);
      want.forEach((t, n) => {
        expect(rows[n], `${file} row ${n} (${t.slug})`).toEqual([
          t.slug,
          t.name,
          t.cat,
          t.kind ?? 'concept',
          Boolean(t.adult),
          Boolean(t.sensitive),
          Boolean(t.sourced),
          t.desc,
          t.long,
        ]);
      });
    }
  });

  it('the two migrations partition the terms — no slug in both, none dropped', async () => {
    const terms = await loadTerms();
    const inSql = [...rowsOf(SOURCED_SQL), ...rowsOf(INFERRED_SQL)].map((r) => r[0] as string);
    expect(new Set(inSql).size, 'duplicate slug across migrations').toBe(inSql.length);
    expect([...inSql].sort()).toEqual(terms.map((t) => t.slug).sort());
  });

  it('the inferred tranche is filed as inferred, not as documented', () => {
    expect(sql(INFERRED_SQL)).toContain('editorial:inferred-from-name');
    expect(sql(SOURCED_SQL)).toContain('editorial:general-knowledge');
  });
});

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
