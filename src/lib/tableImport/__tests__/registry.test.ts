import { describe, expect, it } from 'vitest';
import { unifiedTagsContentType } from '@/config/contentTypes/tag';
import { cityContentType } from '@/config/contentTypes/city';
import { hotelContentType } from '@/config/contentTypes/hotel';
import { organizationContentType } from '@/config/contentTypes/organization';
import { buildImportPlan, convertCell, writableFields } from '../plan';
it('supports real hidden FK fields emitted by editable location pickers', () => {
  expect(writableFields(cityContentType).map((f) => f.name)).toContain('country_id');
  expect(writableFields(hotelContentType).map((f) => f.name)).toEqual(
    expect.arrayContaining(['city_id', 'country_id']),
  );
  expect(writableFields(cityContentType).map((f) => f.name)).not.toContain('region_code');
});
it('supports transactional organisation locations but never bypasses the separate relationships editor', () => {
  const fields = writableFields(organizationContentType).map((f) => f.name);
  expect(fields).toContain('_locations');
  expect(fields).not.toContain('_relationships');
});
describe('actual editor storage formats', () => {
  it('parses tag-name arrays and plain addresses without JSON-encoding text', () => {
    expect(
      convertCell(
        'gay|queer',
        hotelContentType.fields.find((f) => f.name === 'tags')!,
      ),
    ).toEqual(['gay', 'queer']);
    expect(
      convertCell(
        '1 High Street',
        hotelContentType.fields.find((f) => f.name === 'address')!,
      ),
    ).toBe('1 High Street');
  });
  it('maps the city country identity field for resolver creation', () => {
    const row = buildImportPlan(
      cityContentType,
      {
        name: 'Cities',
        headers: ['id', 'name', 'country_id', 'latitude', 'longitude'],
        rows: [['', 'Example', 'country-id', '12', '34']],
      },
      {
        mode: 'create',
        matchField: 'id',
        clearBlanks: false,
        mapping: ['id', 'name', 'country_id', 'latitude', 'longitude'],
      },
      [],
    )[0];
    expect(row.action).toBe('create');
    expect(row.patch.country_id).toBe('country-id');
  });
});

it('plans a full tag catalogue larger than the first API batch without dropping records', () => {
  const existing = Array.from({ length: 10428 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    name: `Tag ${i}`,
    description: '',
  }));
  const rows = buildImportPlan(
    unifiedTagsContentType,
    { name: 'Tags', headers: ['ID', 'Description'], rows: existing.map((r) => [r.id, 'Enriched']) },
    { mode: 'enrich', matchField: 'id', clearBlanks: false, mapping: ['id', 'description'] },
    existing,
  );
  expect(rows).toHaveLength(10428);
  expect(rows.every((row) => row.action === 'update' && row.patch.description === 'Enriched')).toBe(
    true,
  );
  expect(new Set(rows.map((row) => row.before?.id)).size).toBe(10428);
}, 30000);
