import { useMemo, useState } from 'react';
import { FilterChip } from '@/components/transit/FilterChip';
import type { MarketplaceTagFacet } from '@/hooks/useMarketplaceQueries';
import {
  ATTRIBUTE_KIND_LABELS,
  SIZE_ORDER,
  attributeFacetsForDepartment,
  type MarketplaceAttributeKind,
} from '@/lib/marketplaceTaxonomy';

/**
 * Chips shown per group before the expander; the rest hide behind "+N".
 *
 * 6 rather than 10, measured on apparel at 375px: 10 renders the block at
 * 864px, 8 at 814px, 6 at 664px — the drop from 8 to 6 is where a 44px wrap
 * line disappears from several groups at once. On desktop every group already
 * fits one line, so the cost there is horizontal only. Safe to lower because
 * the facets arrive count-descending (the 6 shown are the 6 biggest) and a
 * SELECTED chip is surfaced regardless of rank.
 */
const COLLAPSE_AT = 6;

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
    // The label sits INSIDE the same wrapping flex row as the chips rather
    // than in its own grid column. A column costs a full stacked line per
    // group on mobile (six groups, six wasted lines) and a fixed 7rem of
    // gutter on desktop; inline it rides along the 44px line the first chip
    // already occupies and costs no height at all. `items-center` puts it on
    // the chip's optical centre, and the fixed `w-16` keeps the six labels
    // aligned with each other so the rows still read as a column.
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {/* `w-full` below sm, so the label takes its own 14px line and the chips
          get the whole 375px back. Measured: inline on mobile costs 64px of a
          375px row and pushes chips into extra 44px wrap lines — 944px against
          864px for the same six groups, i.e. the inline label is a net LOSS
          there and a clear win from sm up. */}
      <span className="w-full shrink-0 text-2xs uppercase tracking-wide text-muted-foreground sm:w-16">
        {ATTRIBUTE_KIND_LABELS[kind]}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
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
      <div className="flex flex-col gap-1.5">
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
