import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error — .mjs script lib, no type declarations
import { osmAccessibilityFromTags } from '../../../scripts/data-quality/lib/osm-accessibility-tags.mjs';

/**
 * The node mirror of `_shared/osm-accessibility.ts` must not drift from it.
 *
 * The edge function is Deno TypeScript; the P3 extract converter is plain node
 * in a GitHub Action. Neither can import the other, so the vocabulary is pinned
 * here instead. A slug that exists only in the mirror is not a cosmetic
 * difference: `commit_venue_staging_item` default-rejects any value absent from
 * `public.amenities` (kind='accessibility'), so an invented slug is dropped at
 * write time and the finding disappears without an error.
 */

const SOURCE = join(
  process.cwd(),
  'supabase',
  'functions',
  '_shared',
  'osm-accessibility.ts',
);

/** The canonical list, parsed out of the Deno module rather than restated. */
function canonicalSlugs(): string[] {
  const src = readFileSync(SOURCE, 'utf8');
  const block = src.match(/OSM_ACCESSIBILITY_SLUGS[^=]*=\s*\[([\s\S]*?)\]/);
  expect(block, 'OSM_ACCESSIBILITY_SLUGS not found — the mirror has nothing to check against').toBeTruthy();
  return [...block![1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
}

describe('osm accessibility mirror', () => {
  it('emits only slugs the canonical module declares', () => {
    const canonical = new Set(canonicalSlugs());
    expect(canonical.size).toBeGreaterThan(5); // positive control: we parsed something

    // Every tag shape the mirror understands, in one object.
    const everything = {
      wheelchair: 'limited',
      'toilets:wheelchair': 'no',
      'toilets:unisex': 'yes',
      ramp: 'yes',
      elevator: 'yes',
      tactile_paving: 'yes',
      hearing_loop: 'yes',
      step_count: '3',
      'capacity:disabled': '2',
    };
    const emitted = osmAccessibilityFromTags(everything);
    expect(emitted.length).toBeGreaterThan(0);
    for (const slug of emitted) expect(canonical).toContain(slug);

    // And the positive branches, which use different slugs.
    for (const tags of [{ wheelchair: 'yes' }, { wheelchair: 'no' }, { 'toilets:wheelchair': 'yes' }, { step_count: '0' }]) {
      for (const slug of osmAccessibilityFromTags(tags)) expect(canonical).toContain(slug);
    }
  });

  it('reads all four wheelchair values, and never collapses a "no" into silence', () => {
    // The asymmetry this whole carve-out exists for: absence of a ramp and a
    // measured "there is no ramp" are different claims, and only one of them
    // strands a traveller at a door.
    expect(osmAccessibilityFromTags({ wheelchair: 'yes' })).toEqual(['wheelchair-accessible']);
    expect(osmAccessibilityFromTags({ wheelchair: 'designated' })).toEqual(['wheelchair-accessible']);
    expect(osmAccessibilityFromTags({ wheelchair: 'limited' })).toEqual(['limited-wheelchair-access']);
    expect(osmAccessibilityFromTags({ wheelchair: 'no' })).toEqual(['not-wheelchair-accessible']);
    expect(osmAccessibilityFromTags({})).toEqual([]);
  });

  it('emits both halves of a contradiction rather than resolving it', () => {
    // The mapper deliberately does not adjudicate; `resolve_entity_accessibility`
    // does, and the negative wins there.
    const out = osmAccessibilityFromTags({ wheelchair: 'yes', 'toilets:wheelchair': 'no' });
    expect(out).toContain('wheelchair-accessible');
    expect(out).toContain('no-accessible-restroom');
  });
});
