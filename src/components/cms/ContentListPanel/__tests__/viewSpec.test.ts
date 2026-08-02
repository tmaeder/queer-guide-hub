import { describe, it, expect } from 'vitest';
import { Tag } from 'lucide-react';
import {
  buildDefaultSpec,
  normalizeSpec,
  specEquals,
  queryShapeOf,
  type ViewSpec,
} from '../viewSpec';
import { capabilitiesFor, widgetFor } from '../fieldCapabilities';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';

const f = (over: Partial<FieldConfig> & { name: string }): FieldConfig =>
  ({ label: over.name, type: 'text', group: 'basic', ...over }) as FieldConfig;

const config = {
  id: 'venues',
  tableName: 'venues',
  primaryKey: 'id',
  titleField: 'name',
  icon: Tag,
  label: { singular: 'Venue', plural: 'Venues' },
  color: 'hsl(0 0% 20%)',
  defaultSort: { field: 'updated_at', dir: 'desc' },
  fields: [
    f({ name: 'name', listColumn: true, sortable: true }),
    f({
      name: 'category',
      type: 'select',
      listColumn: true,
      options: [{ value: 'bar', label: 'Bar' }],
    }),
    f({ name: 'is_featured', type: 'boolean' }),
    f({ name: 'amenities', type: 'tags' }),
    f({ name: 'starts_at', type: 'datetime' }),
    f({ name: 'price_range', type: 'number' }),
    f({ name: 'notes', type: 'textarea' }),
    // Computed: displayable but never filterable/sortable, whatever its type.
    f({
      name: 'country_name',
      type: 'select',
      virtual: true,
      options: [{ value: 'x', label: 'X' }],
    }),
  ],
} as unknown as ContentTypeConfig;

describe('buildDefaultSpec', () => {
  it('seeds columns from the type’s existing listColumn curation', () => {
    expect(buildDefaultSpec(config).columns).toEqual(['name', 'category']);
  });

  it('honours defaultSort', () => {
    expect(buildDefaultSpec(config).sorts).toEqual([{ field: 'updated_at', dir: 'desc' }]);
  });

  it('honours an ASCENDING defaultSort', () => {
    // The original fixture used desc on both sides, so reading the wrong key
    // (`direction` instead of `dir`) still passed. Milestones really do sort
    // ascending; this is the case that catches it.
    const asc = { ...config, defaultSort: { field: 'date', dir: 'asc' } } as ContentTypeConfig;
    expect(buildDefaultSpec(asc).sorts).toEqual([{ field: 'date', dir: 'asc' }]);
  });

  it('survives a null config', () => {
    expect(buildDefaultSpec(null).columns).toEqual([]);
  });
});

describe('normalizeSpec is the injection guard', () => {
  it('drops a column naming a field that does not exist', () => {
    const spec = normalizeSpec({ columns: ['name', 'nope'] } as Partial<ViewSpec>, config);
    expect(spec.columns).toEqual(['name']);
  });

  it('drops an entire hostile spec rather than passing SQL through', () => {
    // A spec is user-editable JSON read back from the database, and every
    // field lands in a PostgREST column position.
    const hostile = {
      columns: ['name', 'id); drop table venues;--', '*'],
      filters: [
        { id: 'a', field: 'category', op: 'in', value: ['bar'] },
        { id: 'b', field: 'password', op: 'eq', value: 'x' },
        { id: 'c', field: 'name); delete from venues where (1=1', op: 'eq', value: 'x' },
      ],
      sorts: [
        { field: 'name', dir: 'asc' },
        { field: 'evil(', dir: 'desc' },
      ],
      groupBy: 'not_a_field',
      dateField: 'also_not_a_field',
    } as unknown as Partial<ViewSpec>;

    const spec = normalizeSpec(hostile, config);
    expect(spec.columns).toEqual(['name']);
    expect(spec.filters.map((x) => x.field)).toEqual(['category']);
    expect(spec.sorts).toEqual([{ field: 'name', dir: 'asc' }]);
    expect(spec.groupBy).toBeNull();
    expect(spec.dateField).toBeNull();
  });

  it('drops a filter whose operator the field does not support', () => {
    // 'contains' is textual; category is a select.
    const spec = normalizeSpec(
      {
        filters: [{ id: 'a', field: 'category', op: 'contains', value: 'b' }],
      } as Partial<ViewSpec>,
      config,
    );
    expect(spec.filters).toEqual([]);
  });

  it('refuses to filter, sort or group on a virtual field', () => {
    // country_name is a `select` — without the virtual check first it would
    // inherit select's operators and produce a query the server cannot run.
    const spec = normalizeSpec(
      {
        filters: [{ id: 'a', field: 'country_name', op: 'in', value: ['x'] }],
        sorts: [{ field: 'country_name', dir: 'asc' }],
        groupBy: 'country_name',
      } as Partial<ViewSpec>,
      config,
    );
    expect(spec.filters).toEqual([]);
    expect(spec.sorts).toEqual([]);
    expect(spec.groupBy).toBeNull();
  });

  it('still lets a virtual field be displayed', () => {
    expect(
      normalizeSpec({ columns: ['country_name'] } as Partial<ViewSpec>, config).columns,
    ).toEqual(['country_name']);
  });

  it('rejects a groupBy that is real but not groupable', () => {
    expect(normalizeSpec({ groupBy: 'name' } as Partial<ViewSpec>, config).groupBy).toBeNull();
  });

  it('rejects a dateField that is real but not a date', () => {
    expect(normalizeSpec({ dateField: 'name' } as Partial<ViewSpec>, config).dateField).toBeNull();
  });

  it('de-duplicates columns', () => {
    expect(
      normalizeSpec({ columns: ['name', 'name', 'category'] } as Partial<ViewSpec>, config).columns,
    ).toEqual(['name', 'category']);
  });

  it('falls back to the default spec for junk input', () => {
    expect(normalizeSpec(null, config)).toEqual(buildDefaultSpec(config));
    expect(normalizeSpec('nope' as unknown as Partial<ViewSpec>, config)).toEqual(
      buildDefaultSpec(config),
    );
  });

  it('gives every filter an id, so two filters on one field stay distinct', () => {
    const spec = normalizeSpec(
      {
        filters: [
          { field: 'price_range', op: 'gte', value: 1 },
          { field: 'price_range', op: 'lte', value: 3 },
        ],
      } as unknown as Partial<ViewSpec>,
      config,
    );
    expect(spec.filters).toHaveLength(2);
    expect(new Set(spec.filters.map((x) => x.id)).size).toBe(2);
  });
});

describe('specEquals', () => {
  const base = buildDefaultSpec(config);

  it('ignores filter ids, which are generated per session', () => {
    // JSON.stringify would call these different and report a fresh view dirty.
    const a: ViewSpec = {
      ...base,
      filters: [{ id: 'x', field: 'category', op: 'in', value: ['bar'] }],
    };
    const b: ViewSpec = {
      ...base,
      filters: [{ id: 'y', field: 'category', op: 'in', value: ['bar'] }],
    };
    expect(specEquals(a, b)).toBe(true);
  });

  it('notices a changed filter value', () => {
    const a: ViewSpec = {
      ...base,
      filters: [{ id: 'x', field: 'category', op: 'in', value: ['bar'] }],
    };
    const b: ViewSpec = {
      ...base,
      filters: [{ id: 'x', field: 'category', op: 'in', value: ['club'] }],
    };
    expect(specEquals(a, b)).toBe(false);
  });

  it('treats column order as significant', () => {
    expect(specEquals({ ...base, columns: ['a', 'b'] }, { ...base, columns: ['b', 'a'] })).toBe(
      false,
    );
  });

  it('treats sort precedence as significant', () => {
    const a: ViewSpec = {
      ...base,
      sorts: [
        { field: 'x', dir: 'asc' },
        { field: 'y', dir: 'asc' },
      ],
    };
    const b: ViewSpec = {
      ...base,
      sorts: [
        { field: 'y', dir: 'asc' },
        { field: 'x', dir: 'asc' },
      ],
    };
    expect(specEquals(a, b)).toBe(false);
  });

  it('matches a spec against itself', () => {
    expect(specEquals(base, { ...base })).toBe(true);
  });
});

describe('queryShapeOf', () => {
  const base = buildDefaultSpec(config);

  it('ignores columns and kind, so toggling a column does not refetch', () => {
    expect(queryShapeOf({ ...base, columns: ['name'], kind: 'table' })).toBe(
      queryShapeOf({ ...base, columns: ['name', 'category'], kind: 'gallery' }),
    );
  });

  it('changes when a filter changes', () => {
    expect(queryShapeOf(base)).not.toBe(
      queryShapeOf({
        ...base,
        filters: [{ id: 'x', field: 'category', op: 'in', value: ['bar'] }],
      }),
    );
  });
});

describe('capabilitiesFor', () => {
  it('offers no operators for a virtual field, with a reason', () => {
    const cap = capabilitiesFor(f({ name: 'v', type: 'select', virtual: true }));
    expect(cap.operators).toEqual([]);
    expect(cap.unfilterableReason).toMatch(/computed/i);
    expect(cap.displayable).toBe(true);
  });

  it('makes autocompletes filterable — today they render an inert text box', () => {
    const cap = capabilitiesFor(f({ name: 'country', type: 'country_autocomplete' }));
    expect(cap.operators).toContain('in');
  });

  it('gives an unknown field type no operators rather than guessing', () => {
    const cap = capabilitiesFor(f({ name: 'weird', type: 'nonsense' as never }));
    expect(cap.operators).toEqual([]);
    expect(cap.unfilterableReason).toBeTruthy();
  });
});

describe('widgetFor', () => {
  it('renders no value control for presence checks', () => {
    expect(widgetFor(f({ name: 'x' }), 'is_empty')).toBe('none');
    expect(widgetFor(f({ name: 'x', type: 'boolean' }), 'is_true')).toBe('none');
  });

  it('pairs between with a range control per type', () => {
    expect(widgetFor(f({ name: 'n', type: 'number' }), 'between')).toBe('number-range');
    expect(widgetFor(f({ name: 'd', type: 'date' }), 'between')).toBe('date-range');
  });

  it('uses a multi-select for set operators', () => {
    expect(widgetFor(f({ name: 'c', type: 'select' }), 'in')).toBe('select-multi');
    expect(widgetFor(f({ name: 'a', type: 'tags' }), 'has_any')).toBe('select-multi');
  });
});
