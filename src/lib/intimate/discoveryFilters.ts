import { AGE_BANDS, INTO_TAGS } from '@/assets/intimate/options';
import type { KinkTaxonomy } from '@/hooks/useKinkTaxonomy';

export interface InterestOption {
  id: string;
  label: string;
  categoryId: string;
  categoryLabel: string;
  itemSlug?: string;
  legacyTag?: string;
}

function humanize(value: string) {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildInterestOptions(taxonomy?: KinkTaxonomy): InterestOption[] {
  if (!taxonomy) {
    return INTO_TAGS.map((tag) => ({
      id: `legacy:${tag}`,
      label: humanize(tag),
      categoryId: 'baseline',
      categoryLabel: 'Popular',
      legacyTag: tag,
    }));
  }
  const categories = new Map(taxonomy.categories.map((category) => [category.id, category]));
  return taxonomy.items.flatMap((item) => {
    const category = categories.get(item.category_id);
    if (!category) return [];
    return [
      {
        id: item.slug,
        label: item.label,
        categoryId: category.id,
        categoryLabel: category.label,
        itemSlug: item.slug,
        legacyTag: item.unified_tag_slug?.replace(/^intimate-/, ''),
      },
    ];
  });
}

export function ageBandsFromRange(range: readonly [number, number]): string[] {
  const start = Math.max(0, Math.min(range[0], AGE_BANDS.length - 1));
  const end = Math.max(start, Math.min(range[1], AGE_BANDS.length - 1));
  return AGE_BANDS.slice(start, end + 1);
}
