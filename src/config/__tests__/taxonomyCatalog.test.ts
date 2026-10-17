import legacy from '../legacyProfileTaxonomySeeds.json';
import references from '../referenceTaxonomySeeds.json';
import { describe, expect, it } from 'vitest';
import {
  TAXONOMY_CATALOG,
  getTaxonomyDestinations,
  CLASSIFICATION_FIELDS,
  CLASSIFICATION_LABELS,
} from '../taxonomyCatalog';
import seeds from '../classificationSeeds.json';
import { getContentType } from '../contentTypes';
import { getRouteMinRole } from '../adminNavigation';
import { fieldToZod } from '@/lib/cms/zodFromFields';

describe('complete taxonomy management contracts', () => {
  it.each(TAXONOMY_CATALOG)(
    '$id has a real CMS configuration and a moderator management floor',
    ({ id }) => {
      const config = getContentType(id)!;
      expect(config).toBeDefined();
      if (id === 'unified_tags') return; // Existing editor-level tag workflow remains intact.
      expect(config.writeCreatedBy).toBe(false);
      expect(getRouteMinRole(`/admin/content/${id}`)).toBe('moderator');
    },
  );
  it('seeds every editorial classification advertised in the editor', () => {
    expect(
      [
        ...new Set([
          ...Object.keys(seeds),
          ...Object.keys(legacy),
          ...references.map((row) => row.taxonomy),
        ]),
      ].sort(),
    ).toEqual(Object.keys(CLASSIFICATION_LABELS).sort());
    for (const values of Object.values(seeds)) {
      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values.map((v) => v.value)).size).toBe(values.length);
    }
  });
  it('uses managed choices for all bound fields and accepts newly created vocabulary values', () => {
    for (const [type, fields] of Object.entries(CLASSIFICATION_FIELDS)) {
      if (type === 'places') continue; // Submission-only alias has no corresponding CMS fields.
      const config = getContentType(type)!;
      for (const name of Object.keys(fields)) {
        const field = config.fields.find((f) => f.name === name)!;
        expect(field?.dynamicOptions, `${type}.${name}`).toBeDefined();
        expect(
          fieldToZod(field).safeParse(
            field.type === 'multiselect' ? ['new-editorial-choice'] : 'new-editorial-choice',
          ).success,
        ).toBe(true);
      }
    }
    expect(
      getContentType('events')?.fields.find((f) => f.name === 'event_type')?.dynamicOptions?.table,
    ).toBe('event_types');
    expect(
      getContentType('news_articles')?.fields.find((f) => f.name === 'category_canonical')
        ?.dynamicOptions?.table,
    ).toBe('news_categories');
  });
});

it('exposes a direct filtered management destination for every classification family', () => {
  const destinations = getTaxonomyDestinations();
  expect(new Set(destinations.map((item) => item.route)).size).toBe(destinations.length);
  for (const family of Object.keys(CLASSIFICATION_LABELS))
    expect(
      destinations.some(
        (item) =>
          item.route === `/admin/content/taxonomy_terms?taxonomy=${encodeURIComponent(family)}`,
      ),
    ).toBe(true);
});
