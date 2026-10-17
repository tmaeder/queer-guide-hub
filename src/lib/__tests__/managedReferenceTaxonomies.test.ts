import { beforeEach, describe, expect, it } from 'vitest';
import seeds from '@/config/referenceTaxonomySeeds.json';
import { replaceReferenceTaxonomy, type ReferenceTerm } from '../referenceTaxonomyStore';
import { prideFlagDefinition, validateReferenceTerm } from '../referenceTaxonomyDefinitions';
import { flagById, flagByTagSlug, HANKY_CODE } from '../flags';
import { categoryById, categoryPath, COMPETITION_CATEGORIES } from '../competitionCategories';
import {
  DEPARTMENT_GROUPS,
  DEPARTMENT_ORDER,
  GROUP_FINE,
  departmentLabel,
  departmentOf,
} from '../marketplaceTaxonomy';

const rows = (taxonomy: string): ReferenceTerm[] =>
  seeds
    .filter((row) => row.taxonomy === taxonomy)
    .map((row) => ({ ...row, is_active: true, metadata: row.metadata as Record<string, unknown> }))
    .sort((a, b) => a.sort_order - b.sort_order || a.value.localeCompare(b.value));
beforeEach(() => {
  for (const taxonomy of new Set(seeds.map((row) => row.taxonomy)))
    replaceReferenceTaxonomy(taxonomy, rows(taxonomy));
});
describe('managed reference vocabularies', () => {
  it('preserves every curated reference definition in the seed snapshot', () => {
    for (const seed of seeds)
      expect(
        validateReferenceTerm({ taxonomy: seed.taxonomy, metadata: seed.metadata }).isValid,
        `${seed.taxonomy}:${seed.value}`,
      ).toBe(true);
    for (const term of rows('pride_flag')) expect(prideFlagDefinition(term)).not.toBeNull();
    expect(flagByTagSlug.get('leather-pride-flag')?.id).toBe('leather-pride');
  });
  it('updates names and hierarchy in the real marketplace consumers without editing code', () => {
    const terms = rows('marketplace_browse');
    const department = terms.find((row) => row.value === 'department:apparel')!;
    department.name = 'Clothing and accessories';
    const group = terms.find((row) => row.value === 'group:tops')!;
    const target = terms.find((row) => row.value === 'department:home')!;
    group.parent_id = target.id;
    replaceReferenceTaxonomy('marketplace_browse', terms);
    expect(departmentLabel('apparel')).toBe('Clothing and accessories');
    expect(DEPARTMENT_GROUPS.home).toContain('tops');
    expect(DEPARTMENT_GROUPS.apparel).not.toContain('tops');
    expect(GROUP_FINE.tops).toContain('t_shirts');
    expect(DEPARTMENT_ORDER).toContain('apparel');
    expect(departmentOf('sex_toys')).toBe('intimacy');
  });
  it('keeps historical flag references while applying managed labels', () => {
    const flags = rows('pride_flag');
    const changed = flags[0];
    changed.name = 'Updated flag name';
    changed.is_active = false;
    replaceReferenceTaxonomy('pride_flag', flags);
    expect(flagById(changed.value)?.nameEn).toBe('Updated flag name');
    expect(flagById(changed.value)?.nameKey).toContain('managedFlags.');
  });
  it('creates categories on a route that cannot collide with locale routing, preserving all legacy paths', () => {
    const original = categoryById('drag_series')!;
    expect(categoryPath(original)).toBe('/competitions/drag-series');
    const categories = rows('competition_category');
    categories.push({
      id: 'test-new',
      value: 'new_contest',
      name: 'New contest',
      metadata: {},
      parent_id: null,
      is_active: true,
      sort_order: 100,
    });
    replaceReferenceTaxonomy('competition_category', categories);
    const created = categoryById('new_contest')!;
    expect(created.label).toBe('New contest');
    expect(created.hasGrid).toBe(false);
    expect(categoryPath(created)).toBe('/competitions/types/new-contest');
    expect(COMPETITION_CATEGORIES).toContainEqual(created);
  });
  it('rejects malformed reference metadata and updates translated reference fallbacks after an edit', () => {
    expect(
      validateReferenceTerm({
        taxonomy: 'pride_flag',
        metadata: { stripes: [{ hex: 'url(script)' }] },
      }).isValid,
    ).toBe(false);
    const code = rows('hanky_code');
    const black = code.find((row) => row.value === 'black')!;
    black.metadata = { ...black.metadata, meaningEn: 'Updated reference meaning' };
    replaceReferenceTaxonomy('hanky_code', code);
    expect(HANKY_CODE.find((entry) => entry.id === 'black')?.meaningEn).toBe(
      'Updated reference meaning',
    );
    expect(HANKY_CODE.find((entry) => entry.id === 'black')?.meaningKey).toBe(
      'managedHanky.black.meaning',
    );
  });
});
