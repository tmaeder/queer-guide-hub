/**
 * The client must not derive a tag slug. `normalize_tag_slug()` in Postgres is
 * the single implementation, reached through the '' escape hatch that
 * `normalize_tag_input()` honours.
 *
 * Measured against the live trigger chain (INSERT in a rolled-back transaction,
 * 2026-09-19) — the regex that used to sit in AdminTags.tsx STRIPPED every
 * character outside [a-z0-9-]:
 *
 *   name            client sent   stored      Postgres alone
 *   HIV/AIDS        hivaids       hivaids     hiv-aids
 *   D/s             ds            ds          d-s
 *   U=U             uu            uu          u-u
 *
 * A BENIGN pre-normalisation survives — the hook's old fallback replaced only
 * spaces, so `hiv/aids` was repaired to `hiv-aids` downstream. A LOSSY one
 * cannot be: the database turns "/" into a separator, but nothing can restore a
 * character the client already deleted. Accented names happened to escape only
 * because the non-ASCII seal in `unified_tags_normalize_slug()` overrides the
 * caller's slug outright (`Bühne` -> `buhne` either way), so the seal was
 * masking the defect for exactly the inputs most likely to be spot-checked.
 *
 * Sweeping for other writers found two more, and the sweep is why the claim
 * "the one surface that creates tags" was wrong:
 *
 *   useUnifiedTags.createTag   — identically lossy, but DORMANT: its only
 *     production consumer (useVenueFilters) takes { tags, loading, fetchTags }
 *     and never createTag. Fixed anyway; dormant is a reason to schedule the
 *     work last, not to leave it armed.
 *
 *   useTagAliases.createAlias  — LIVE, and worse than the tag path, because
 *     `tag_aliases.alias_slug` is NOT NULL with no default and NO BEFORE
 *     trigger deriving it, so '' is not an escape hatch there AND there is no
 *     non-ASCII seal to mask the damage. Measured against the live function:
 *     an accented alias yielded 'caf-society' / 'dominacin-...' where
 *     normalize_tag_slug gives 'cafe-society' / 'dominacion-...'. It now calls
 *     normalize_tag_slug over RPC — one implementation, no drift — and THROWS
 *     on failure rather than falling back to a local slugifier.
 *
 * Behavioural coverage of the hook lives in
 * `src/hooks/__tests__/useCentralizedTags.test.tsx`; this file guards the CALL
 * SITE, which no behavioural test of the hook can see.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..', '..');

/**
 * Strip comments before asserting. This file's own header quotes the deleted
 * regex verbatim, so an un-stripped search finds the PROSE and passes while the
 * statement is back — the vacuous-assertion class CLAUDE.md records repeatedly.
 */
const statementsOf = (rel: string): string =>
  readFileSync(join(repoRoot, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('no client-side tag slug derivation', () => {
  const ADMIN = 'src/pages/admin/AdminTags.tsx';
  const HOOK = 'src/hooks/useCentralizedTags.tsx';
  const UNIFIED = 'src/hooks/useUnifiedTags.tsx';
  const ALIASES = 'src/hooks/useTagAliases.ts';

  it('AdminTags.tsx does not strip characters out of a slug', () => {
    const src = statementsOf(ADMIN);
    // The exact lossy form, and the general shape of any replacement for it.
    expect(src).not.toMatch(/\[\^a-z0-9-\]/);
    expect(src).not.toMatch(/replace\([^)]*\\s\+[^)]*,\s*'-'/);
  });

  it('AdminTags.tsx sends no slug to createTag', () => {
    const src = statementsOf(ADMIN);
    const call = src.slice(src.indexOf('createTag('));
    expect(call).toContain('createTag(cleanData)');
    // Scoped to the call, not the file: `slug` legitimately appears elsewhere
    // (the table column, the search columns), so a file-wide assertion would
    // fail on correct code.
    expect(call.slice(0, call.indexOf(';'))).not.toContain('slug');
  });

  it('the hook forwards the slug rather than deriving one', () => {
    const src = statementsOf(HOOK);
    expect(src).toContain("slug: tagData.slug?.trim() || ''");
    // The deleted fallback, which built a slug out of the name.
    expect(src).not.toMatch(/slug:\s*tagData\.slug\s*\|\|\s*normalizedName/);
    expect(src).not.toMatch(/normalizedName\.toLowerCase\(\)\.replace/);
  });

  it('neither file reimplements normalize_tag_slug under another name', () => {
    for (const rel of [ADMIN, HOOK]) {
      // `toLowerCase()` piped straight into a `-` replacement is the signature
      // of a slugifier wherever it is written.
      expect(statementsOf(rel)).not.toMatch(/toLowerCase\(\)[\s\S]{0,80}?replace\([^)]*'-'\)/);
    }
  });

  it('the dormant useUnifiedTags.createTag derives nothing either', () => {
    const src = statementsOf(UNIFIED);
    expect(src).not.toMatch(/\[\^a-z0-9\\s-\]/);
    expect(src).not.toMatch(/toLowerCase\(\)[\s\S]{0,80}?replace\([^)]*'-'\)/);
    // Scoped to the insert, because `slug` is a legitimate read elsewhere.
    const insert = src.slice(src.indexOf("from('unified_tags')\n        .insert"));
    expect(insert.slice(0, 400)).toContain("slug: ''");
  });

  it('createAlias takes its slug from the database, not a regex', () => {
    const src = statementsOf(ALIASES);
    // Whitespace-tolerant: Prettier re-wraps this call across four lines, so
    // a single-line literal is a formatter-fragile assertion that fails on
    // correct code.
    expect(src).toMatch(/untypedRpc<string>\(\s*'normalize_tag_slug'/);
    // The lossy pair that used to build alias_slug.
    expect(src).not.toMatch(/\[\^a-z0-9-\]/);
    expect(src).not.toMatch(/toLowerCase\(\)[\s\S]{0,80}?replace\([^)]*'-'\)/);
  });

  it('createAlias fails loudly instead of falling back to a local slugifier', () => {
    const src = statementsOf(ALIASES);
    // A fallback is the whole defect: it would reintroduce a second
    // implementation free to drift, on the path where nothing downstream
    // repairs it.
    expect(src).toMatch(/if \(slugError\) throw new Error/);
    expect(src).toMatch(/if \(!alias_slug\) throw new Error/);
    expect(src).not.toMatch(/slugError[\s\S]{0,120}?\|\|\s*alias_name/);
  });
});
