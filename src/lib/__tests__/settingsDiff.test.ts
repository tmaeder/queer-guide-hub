import { describe, it, expect } from 'vitest';
import { diffSettings, filterRelevantChanges, AxisChange } from '../settingsDiff';

describe('diffSettings', () => {
  it('returns unchanged when both inputs are empty', () => {
    const d = diffSettings({}, {});
    expect(d.hasChanges).toBe(false);
    expect(d.summary).toEqual([]);
  });

  it('marks added keys', () => {
    const d = diffSettings({}, { searchableAttributes: ['title'] });
    expect(d.hasChanges).toBe(true);
    expect(d.changes.searchableAttributes.kind).toBe('added');
  });

  it('marks removed keys', () => {
    const d = diffSettings({ searchableAttributes: ['title'] }, {});
    expect(d.hasChanges).toBe(true);
    expect(d.changes.searchableAttributes.kind).toBe('removed');
  });

  it('treats searchableAttributes as a set (order does not matter)', () => {
    const d = diffSettings(
      { searchableAttributes: ['a', 'b', 'c'] },
      { searchableAttributes: ['c', 'b', 'a'] },
    );
    expect(d.changes.searchableAttributes.kind).toBe('unchanged');
  });

  it('detects items added/removed in set keys', () => {
    const d = diffSettings(
      { filterableAttributes: ['city', 'country'] },
      { filterableAttributes: ['country', 'tags'] },
    );
    const c = d.changes.filterableAttributes;
    expect(c.kind).toBe('changed');
    if (c.kind === 'changed') {
      expect(c.added).toEqual(['tags']);
      expect(c.removed).toEqual(['city']);
    }
  });

  it('treats rankingRules as ordered (reorder = changed/reordered)', () => {
    const d = diffSettings(
      { rankingRules: ['words', 'typo', 'proximity'] },
      { rankingRules: ['typo', 'words', 'proximity'] },
    );
    const c = d.changes.rankingRules;
    expect(c.kind).toBe('changed');
    if (c.kind === 'changed') {
      expect(c.reordered).toBe(true);
      expect(c.added).toEqual([]);
      expect(c.removed).toEqual([]);
    }
  });

  it('rankingRules with same items same order = unchanged', () => {
    const d = diffSettings(
      { rankingRules: ['words', 'typo'] },
      { rankingRules: ['words', 'typo'] },
    );
    expect(d.changes.rankingRules.kind).toBe('unchanged');
  });

  it('synonyms diffs as object (per-key)', () => {
    const d = diffSettings(
      { synonyms: { 'gay bar': ['lgbt bar'], 'queer pub': ['gay bar'] } },
      { synonyms: { 'gay bar': ['lgbt bar', 'queer bar'], 'lesbian bar': ['sapphic bar'] } },
    );
    const c = d.changes.synonyms as AxisChange & { kind: 'changed' };
    expect(c.kind).toBe('changed');
    expect(c.nested).toBeDefined();
    expect(c.nested!['gay bar'].kind).toBe('changed');
    expect(c.nested!['queer pub'].kind).toBe('removed');
    expect(c.nested!['lesbian bar'].kind).toBe('added');
  });

  it('typoTolerance diffs as nested object', () => {
    const d = diffSettings(
      { typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } } },
      { typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 5, twoTypos: 8 } } },
    );
    const c = d.changes.typoTolerance as AxisChange & { kind: 'changed' };
    expect(c.kind).toBe('changed');
    expect(c.nested!.minWordSizeForTypos.kind).toBe('changed');
  });

  it('handles null gracefully', () => {
    expect(diffSettings(null, null).hasChanges).toBe(false);
    expect(diffSettings(null, { rankingRules: ['x'] }).hasChanges).toBe(true);
  });

  it('produces a human summary', () => {
    const d = diffSettings(
      { rankingRules: ['a', 'b'], filterableAttributes: ['x'] },
      { rankingRules: ['b', 'a'], filterableAttributes: ['x', 'y'] },
    );
    expect(d.summary).toContain('rankingRules: reordered');
    expect(d.summary.some((s) => s.startsWith('filterableAttributes:'))).toBe(true);
  });

  it('unknown keys default to scalar comparison', () => {
    const d = diffSettings({ customSetting: 'foo' }, { customSetting: 'bar' });
    expect(d.changes.customSetting.kind).toBe('changed');
  });
});

describe('filterRelevantChanges', () => {
  it('drops ignored keys', () => {
    const d = diffSettings(
      { rankingRules: ['a'], embedders: { foo: { source: 'openAi' } } },
      { rankingRules: ['b'], embedders: {} },
    );
    expect(d.hasChanges).toBe(true);
    const filtered = filterRelevantChanges(d, { ignoreKeys: ['embedders'] });
    expect(filtered.changes.embedders).toBeUndefined();
    expect(filtered.changes.rankingRules.kind).toBe('changed');
    expect(filtered.summary.some((s) => s.startsWith('embedders'))).toBe(false);
  });

  it('reports hasChanges=false when only ignored keys differ', () => {
    const d = diffSettings({ embedders: { x: 1 } }, { embedders: { x: 2 } });
    const filtered = filterRelevantChanges(d, { ignoreKeys: ['embedders'] });
    expect(filtered.hasChanges).toBe(false);
  });
});
