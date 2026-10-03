import { describe, it, expect } from 'vitest';
import {
  TOY_GROUP_META,
  TOY_FINE_BLURBS,
  toyGroupMeta,
  toyFineBlurb,
} from '@/lib/marketplaceCategoryMeta';
import {
  ADULT_DEPARTMENTS,
  DEPARTMENT_GROUPS,
  GROUP_FINE,
  GROUP_LABELS,
  FINE_LABELS,
} from '@/lib/marketplaceTaxonomy';
import { TRANSIT_ICON_PATHS } from '@/components/transit/transitIconPaths';

/**
 * These are presentation maps with no SQL twin, so the drift that matters is
 * against the TAXONOMY, not against a migration: a renamed group silently
 * loses its mark and its blurb, and the tile falls back to bare text — which
 * looks deliberate and is how the `apparel` group sat orphaned for a release.
 */
describe('marketplace toy category meta', () => {
  const adultGroups = [...ADULT_DEPARTMENTS].flatMap((d) => DEPARTMENT_GROUPS[d] ?? []);

  it('covers every group in both adult departments', () => {
    expect(adultGroups.length).toBeGreaterThan(0); // guards a vacuous pass
    for (const g of adultGroups) {
      expect(TOY_GROUP_META[g], `no meta for adult group ${g}`).toBeDefined();
    }
  });

  it('every meta key is a real routed group', () => {
    const routed = new Set(Object.values(DEPARTMENT_GROUPS).flat());
    for (const g of Object.keys(TOY_GROUP_META)) {
      expect(routed.has(g), `meta for ${g}, which no department routes`).toBe(true);
      expect(GROUP_LABELS[g], `meta for ${g}, which has no label`).toBeDefined();
    }
  });

  it('every icon resolves to a real glyph', () => {
    for (const [g, meta] of Object.entries(TOY_GROUP_META)) {
      expect(
        TRANSIT_ICON_PATHS[meta.icon],
        `${g} points at missing glyph ${meta.icon}`,
      ).toBeDefined();
    }
  });

  it('every fine blurb key is a real fine bucket', () => {
    const known = new Set(Object.values(GROUP_FINE).flat());
    for (const f of Object.keys(TOY_FINE_BLURBS)) {
      expect(known.has(f), `blurb for ${f}, which no group lists`).toBe(true);
      expect(FINE_LABELS[f], `blurb for ${f}, which has no label`).toBeDefined();
    }
  });

  it('covers every fine bucket under an adult group, plus the two grooming ones', () => {
    // The glossary pass put aphrodisiacs/edible_massage under `grooming`
    // (hygiene department) — they came from the toy glossary, so they get a
    // blurb even though their group is not adult.
    const adultFine = adultGroups.flatMap((g) => GROUP_FINE[g] ?? []);
    for (const f of [...adultFine, 'aphrodisiacs', 'edible_massage']) {
      expect(TOY_FINE_BLURBS[f], `no blurb for fine bucket ${f}`).toBeDefined();
    }
  });

  it('blurbs fit the tile and avoid the banned register', () => {
    // Copy rules: no discover/explore/unlock/curated/journey/amazing, no
    // "vibrant" (styleguide avoid term), and no gendered audience framing —
    // "for women"/"for men" is the audience-label class this codebase has
    // repeatedly repaired out of the glossary.
    const banned =
      /\b(discover|explore|unlock|curated|journey|amazing|tailored|vibrant|for (?:wo)?men)\b/i;
    for (const [k, v] of Object.entries(TOY_GROUP_META)) {
      expect(v.blurb.length, `${k} blurb too long (${v.blurb.length})`).toBeLessThanOrEqual(130);
      expect(banned.test(v.blurb), `${k} blurb uses banned register: ${v.blurb}`).toBe(false);
    }
    for (const [k, v] of Object.entries(TOY_FINE_BLURBS)) {
      expect(banned.test(v), `${k} blurb uses banned register: ${v}`).toBe(false);
    }
  });

  it('accessors return null rather than throwing on an unknown slug', () => {
    expect(toyGroupMeta('dildos')).not.toBeNull();
    expect(toyGroupMeta('tops')).toBeNull();
    expect(toyGroupMeta(null)).toBeNull();
    expect(toyFineBlurb('butt_plugs')).not.toBeNull();
    expect(toyFineBlurb('nope')).toBeNull();
  });
});
