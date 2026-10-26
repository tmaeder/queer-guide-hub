import { getTaxonomyDestinations } from '../../src/config/taxonomyCatalog';

const slugTables = new Set([
  'tag_categories',
  'news_categories',
  'marketplace_categories',
  'amenities',
  'venue_services',
  'event_types',
  'target_groups',
  'professions',
  'kink_categories',
  'kink_items',
]);

export const taxonomyFamilies = getTaxonomyDestinations()
  .filter((item) => item.id !== 'taxonomy_terms' || item.route.includes('?taxonomy='))
  .map((item) => ({
    ...item,
    taxonomy: new URL(item.route, 'http://localhost').searchParams.get('taxonomy'),
    titleColumn: item.id === 'kink_categories' || item.id === 'kink_items' ? 'label' : 'name',
    titleInput:
      item.id === 'unified_tags'
        ? 'Tag Name*'
        : item.id === 'taxonomy_terms' || item.id.startsWith('kink_')
          ? 'Label*'
          : 'Name*',
    hasSlug: slugTables.has(item.id),
  }));

export type TaxonomyFamily = (typeof taxonomyFamilies)[number];

export function stableValue(taxonomy: string, key: string): string {
  const words = key.replaceAll('-', '_');
  if (taxonomy === 'competition_category') return words;
  if (taxonomy === 'marketplace_browse') return `department:${words}`;
  return key;
}

export function referenceMetadata(taxonomy: string | null): Record<string, unknown> | undefined {
  if (taxonomy === 'pride_flag') return { stripes: [{ hex: '#111111' }] };
  if (taxonomy === 'hanky_code')
    return { hex: '#111111', meaningEn: 'Synthetic regression fixture', tier: 'classic' };
  return undefined;
}
