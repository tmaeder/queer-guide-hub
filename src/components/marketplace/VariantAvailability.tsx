import type { Database } from '@/integrations/supabase/types';
import { SIZE_ORDER } from '@/lib/marketplaceTaxonomy';

export type ListingVariant = Database['public']['Tables']['marketplace_listing_variants']['Row'];

function sizeLabel(slug: string): string {
  if (slug === 'one-size') return 'One size';
  if (slug.startsWith('eu-')) return `EU ${slug.slice(3)}`;
  if (/^w\d+$/.test(slug)) return `W${slug.slice(1)}`;
  return slug.toUpperCase();
}

function sizeSort(a: string, b: string): number {
  const ladder = SIZE_ORDER as readonly string[];
  const ia = ladder.indexOf(a);
  const ib = ladder.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Module 09's owner, finally renderable (the variants data model exists —
 * marketplace_listing_variants, PR 3 of the finer-categorisation program).
 *
 * Offered sizes in ladder order (never alphabetical); a size sold out across
 * every variant offering it renders dimmed + line-through + sr-only "sold
 * out" — never colour-only (WCAG 1.4.1). The chips are NON-INTERACTIVE
 * spans: there is no cart, every purchase completes on the merchant's own
 * site, so a clickable size that selects nothing would be a lie. Renders
 * nothing without variant rows (rule 2: no empty shells).
 */
export function VariantAvailability({ variants }: { variants: ListingVariant[] }) {
  const bySize = new Map<string, { available: boolean }>();
  for (const v of variants) {
    if (!v.option_size) continue;
    const cur = bySize.get(v.option_size);
    const avail = v.available !== false; // null = unknown, treat as offered
    if (cur) cur.available = cur.available || avail;
    else bySize.set(v.option_size, { available: avail });
  }
  if (bySize.size === 0) return null;

  const sizes = [...bySize.entries()].sort((a, b) => sizeSort(a[0], b[0]));
  const colors = [...new Set(variants.map((v) => v.option_color).filter(Boolean))] as string[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
          Offered sizes
        </p>
        <div className="flex flex-wrap gap-2">
          {sizes.map(([slug, { available }]) => (
            <span
              key={slug}
              className={
                available
                  ? 'inline-flex h-8 items-center bg-muted rounded-element px-2.5 text-13 font-bold'
                  : 'inline-flex h-8 items-center bg-muted rounded-element px-2.5 text-13 font-bold text-muted-foreground line-through opacity-60'
              }
            >
              {sizeLabel(slug)}
              {!available && <span className="sr-only"> (sold out)</span>}
            </span>
          ))}
        </div>
      </div>
      {colors.length > 1 && (
        <p className="text-13 text-muted-foreground">
          Available in {colors.length} colors: {colors.map((c) => c.replace(/-/g, ' ')).join(', ')}
        </p>
      )}
    </div>
  );
}
