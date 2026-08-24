import { FilterChip } from '@/components/transit/FilterChip';
import { SIZE_ORDER } from '@/lib/marketplaceTaxonomy';

interface SizeChipGridProps {
  /** Available size slugs with counts (bare values: s, m, 2xl, eu-38, one-size). */
  options: Array<{ slug: string; count: number }>;
  /** Selected bare size slugs. */
  selected: string[];
  onToggle: (slug: string) => void;
}

function sizeLabel(slug: string): string {
  if (slug === 'one-size') return 'One size';
  if (slug.startsWith('eu-')) return `EU ${slug.slice(3)}`;
  if (/^w\d+$/.test(slug)) return `W${slug.slice(1)}`;
  return slug.toUpperCase();
}

/** Canonical ladder order first, then numerics — never alphabetical
 *  (alphabetical puts 2XL before L and XL before XS). */
function sizeSort(a: string, b: string): number {
  const ladder = SIZE_ORDER as readonly string[];
  const ia = ladder.indexOf(a);
  const ib = ladder.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b, undefined, { numeric: true });
}

export function SizeChipGrid({ options, selected, onToggle }: SizeChipGridProps) {
  if (options.length === 0) return null;
  const sorted = [...options].sort((a, b) => sizeSort(a.slug, b.slug));
  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map((opt) => (
        <FilterChip
          key={opt.slug}
          active={selected.includes(opt.slug)}
          onClick={() => onToggle(opt.slug)}
          aria-label={`Size ${sizeLabel(opt.slug)} (${opt.count.toLocaleString()} items)`}
          label={sizeLabel(opt.slug)}
        />
      ))}
    </div>
  );
}
