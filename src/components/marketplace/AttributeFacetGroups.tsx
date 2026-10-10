import { useMemo, useState } from 'react';
import { FilterChip } from '@/components/transit/FilterChip';
import type { MarketplaceTagFacet } from '@/hooks/useMarketplaceQueries';
import {
  ATTRIBUTE_KIND_LABELS,
  SIZE_ORDER,
  attributeFacetsForDepartment,
  type MarketplaceAttributeKind,
} from '@/lib/marketplaceTaxonomy';

/** Chips shown per group before the expander; the rest hide behind "+N". */
const COLLAPSE_AT = 10;

const sizeRank = (slug: string) => {
  const i = (SIZE_ORDER as readonly string[]).indexOf(slug.replace(/^size-/, ''));
  return i === -1 ? SIZE_ORDER.length : i;
};

function GroupRow({
  kind,
  facets,
  selected,
  onToggle,
}: {
  kind: MarketplaceAttributeKind;
  facets: MarketplaceTagFacet[];
  selected: string[];
  onToggle: (slug: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // A selected chip is ALWAYS visible, whatever its rank — collapsing a group
  // must never hide a filter the reader has already applied, or the result
  // count moves with nothing on screen explaining why.
  const visible = expanded
    ? facets
    : facets.filter((f, i) => i < COLLAPSE_AT || selected.includes(f.slug));
  const hidden = facets.length - visible.length;

  return (
    <div className="grid gap-2 sm:grid-cols-[7rem_1fr] sm:items-baseline sm:gap-4">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground sm:pt-2.5">
        {ATTRIBUTE_KIND_LABELS[kind]}
      </span>
      <div className="flex flex-wrap gap-2">
        {visible.map((f) => {
          const active = selected.includes(f.slug);
          return (
            <FilterChip
              key={f.slug}
              active={active}
              label={
                <>
                  {f.name}{' '}
                  <span className={active ? 'text-background/70' : 'text-muted-foreground'}>
                    {f.count.toLocaleString()}
                  </span>
                </>
              }
              onClick={() => onToggle(f.slug)}
            />
          );
        })}
        {hidden > 0 && (
          <FilterChip
            active={false}
            label={`+${hidden}`}
            aria-label={`Show ${hidden} more ${ATTRIBUTE_KIND_LABELS[kind].toLowerCase()} filters`}
            onClick={() => setExpanded(true)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The attribute facets, grouped by their own `kind` instead of poured into one
 * count-sorted wall. The grouping needs no new data: `get_marketplace_tag_facets`
 * has always returned `kind`, and the category page simply discarded it — so a
 * reader met 58 undifferentiated chips on /marketplace/category/apparel with
 * sizes, colours, materials and vibes interleaved by popularity.
 *
 * Two orderings are deliberate. Groups follow `attributeFacetsForDepartment`,
 * the canonical per-department order, so size leads on apparel and genre leads
 * on books. Sizes follow SIZE_LADDER, never count — XS ranked below 5XL by
 * popularity is the one ordering a reader reads as broken.
 */
export function AttributeFacetGroups({
  department,
  facets,
  selected,
  onToggle,
  className,
}: {
  department: string | null | undefined;
  facets: MarketplaceTagFacet[];
  selected: string[];
  onToggle: (slug: string) => void;
  className?: string;
}) {
  const groups = useMemo(() => {
    const byKind = new Map<MarketplaceAttributeKind, MarketplaceTagFacet[]>();
    for (const f of facets) {
      if (!f.kind) continue;
      const bucket = byKind.get(f.kind);
      if (bucket) bucket.push(f);
      else byKind.set(f.kind, [f]);
    }
    // A kind the department order does not list still renders — an unlisted
    // kind is a vocabulary gap, and dropping its chips silently removes
    // working filters rather than reporting the gap.
    const order = attributeFacetsForDepartment(department);
    const extras = [...byKind.keys()].filter((k) => !order.includes(k));
    return [...order, ...extras]
      .filter((k) => byKind.has(k))
      .map((kind) => ({
        kind,
        facets:
          kind === 'size'
            ? [...byKind.get(kind)!].sort((a, b) => sizeRank(a.slug) - sizeRank(b.slug))
            : byKind.get(kind)!,
      }));
  }, [facets, department]);

  if (groups.length === 0) return null;

  return (
    <div className={className} aria-label="Refine by attribute">
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <GroupRow
            key={g.kind}
            kind={g.kind}
            facets={g.facets}
            selected={selected}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
