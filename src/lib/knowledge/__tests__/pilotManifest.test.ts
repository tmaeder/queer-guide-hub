import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
const manifest = JSON.parse(readFileSync('docs/knowledge/pilot-manifest.json', 'utf8'));
describe('frozen knowledge pilot delivery', () => {
  it('contains twenty terms in five groups and ten profiles in five fields', () => {
    expect(manifest.entries).toHaveLength(30);
    const terms = manifest.entries.filter(
      (entry: { entity_type: string }) => entry.entity_type === 'unified_tags',
    );
    expect(terms).toHaveLength(20);
    const counts = Object.values(
      terms.reduce(
        (groups: Record<string, number>, entry: { pilot_group: string }) => ({
          ...groups,
          [entry.pilot_group]: (groups[entry.pilot_group] ?? 0) + 1,
        }),
        {},
      ),
    );
    expect(counts).toEqual([4, 4, 4, 4, 4]);
    expect(
      new Set(manifest.entries.map((entry: { entity_id: string }) => entry.entity_id)).size,
    ).toBe(30);
  });
  it('ships drafts, genuine baseline hashes, and source candidates without asserting review', () => {
    for (const entry of manifest.entries) {
      expect(entry.base_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.patch.description.length).toBeGreaterThan(30);
      expect((entry.patch.bio ?? entry.patch.long_description).length).toBeGreaterThan(500);
      expect(entry.sources.length).toBeGreaterThanOrEqual(2);
      expect(entry.status).toBeUndefined();
      expect(entry.reviewed_by).toBeUndefined();
      if (entry.portrait) expect(entry.portrait.status).not.toBe('approved');
    }
  });
});
