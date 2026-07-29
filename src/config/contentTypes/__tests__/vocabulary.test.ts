import { describe, expect, it } from 'vitest';
import { Shapes } from 'lucide-react';
import { vocabularyContentType } from '../vocabulary';
import { contentTypeRegistry, getContentType, getFieldGroups } from '../index';

/**
 * The eight controlled vocabularies moved off their own admin shell onto the
 * CMS registry. These pin the parts that were easy to get silently wrong.
 */

const VOCABULARIES = [
  'venue_categories',
  'venue_services',
  'event_types',
  'event_amenities',
  'event_services',
  'accessibility_attributes',
  'target_groups',
  'professions',
] as const;

describe('vocabulary registry entries', () => {
  it.each(VOCABULARIES)('%s is registered and self-consistent', (id) => {
    const config = getContentType(id);
    expect(config).toBeDefined();
    // id and tableName must match — the route is /admin/content/<id> and the
    // editor writes to tableName; a mismatch 404s or writes the wrong table.
    expect(config!.id).toBe(id);
    expect(config!.tableName).toBe(id);
    expect(config!.titleField).toBe('name');
  });

  it.each(VOCABULARIES)('%s exposes every field group it actually uses', (id) => {
    const config = getContentType(id)!;
    const used = new Set(config.fields.filter((f) => !f.hidden).map((f) => f.group));
    const declared = new Set(config.fieldGroupOrder ?? []);
    // A group missing from fieldGroupOrder renders no tab, so its fields become
    // uneditable without any error — how professions.aliases would have been lost.
    for (const g of used) {
      expect(declared.has(g), `${id}: group "${g}" has fields but no tab`).toBe(true);
    }
    expect(getFieldGroups(id).length).toBeGreaterThan(0);
  });

  it.each(VOCABULARIES)('%s selects every column its fields reference', (id) => {
    const config = getContentType(id)!;
    const selected = new Set((config.listSelect ?? '').split(',').map((s) => s.trim()));
    for (const field of config.fields.filter((f) => f.listColumn)) {
      expect(selected.has(field.name), `${id}: ${field.name} is a list column but not selected`).toBe(true);
    }
  });

  it('does not collide with the pre-existing entity types', () => {
    // unified_tags already existed; a vocabulary must never shadow a real type.
    expect(contentTypeRegistry.unified_tags.tableName).toBe('unified_tags');
    expect(Object.keys(contentTypeRegistry)).toHaveLength(25);
  });
});

describe('vocabularyContentType', () => {
  const base = {
    table: 'demo_terms',
    icon: Shapes,
    label: { singular: 'Term', plural: 'Terms' },
  };

  it('omits slug, colour and category unless asked for', () => {
    const names = vocabularyContentType(base).fields.map((f) => f.name);
    expect(names).toEqual(['name', 'description', 'icon', 'sort_order', 'is_active']);
  });

  it('adds slug, colour and category when configured', () => {
    const names = vocabularyContentType({
      ...base,
      hasSlug: true,
      hasColor: true,
      categoryOptions: [{ value: 'general', label: 'General' }],
    }).fields.map((f) => f.name);
    expect(names).toContain('slug');
    expect(names).toContain('color');
    expect(names).toContain('category');
  });

  it('defaults new terms to active and unsorted', () => {
    expect(vocabularyContentType(base).defaults).toMatchObject({ is_active: true, sort_order: 0 });
  });

  it('sorts by sort_order, matching the old taxonomy pages', () => {
    expect(vocabularyContentType(base).defaultSort).toEqual({ field: 'sort_order', dir: 'asc' });
  });

  it('has no publicPath — a vocabulary term has no page of its own', () => {
    expect(vocabularyContentType(base).publicPath).toBeUndefined();
  });
});
