import { useMemo } from 'react';
import { FilterChip } from '@/components/transit/FilterChip';
import { PickerRow } from '@/components/transit/PickerRow';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { MarketplaceTagFacet } from '@/hooks/useMarketplaceQueries';
import {
  ATTRIBUTE_KIND_LABELS,
  SIZE_ORDER,
  attributeFacetsForDepartment,
  type MarketplaceAttributeKind,
} from '@/lib/marketplaceTaxonomy';

const sizeRank = (slug: string) => {
  const i = (SIZE_ORDER as readonly string[]).indexOf(slug.replace(/^size-/, ''));
  return i === -1 ? SIZE_ORDER.length : i;
};

function KindPicker({
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
  const label = ATTRIBUTE_KIND_LABELS[kind];
  const activeCount = facets.filter((f) => selected.includes(f.slug)).length;

  // Uncontrolled: nothing here reads the open state, so Radix can own it.
  // (This was briefly a `useState` pair on the suspicion that it was why the
  // popover would not open under a headless click. It was not — the click was
  // never reaching the trigger. Kept uncontrolled because it is less code,
  // not because the controlled version was broken.)
  return (
    <Popover>
      {/* FilterChip forwards refs and rest props specifically so it can be a
          PopoverTrigger — that is why the control bar's private FacetChip was
          deleted. Do not swap in a plain <button>: the trigger needs
          aria-expanded / aria-haspopup / data-state cloned onto it. */}
      <PopoverTrigger asChild>
        <FilterChip
          active={activeCount > 0}
          aria-label={`Filter by ${label.toLowerCase()}`}
          label={activeCount > 0 ? `${label} · ${activeCount}` : label}
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        {/* max-h + scroll rather than a "+N more" expander: a popover can hold
            all 17 colours without costing the page any height, which is the
            whole reason this moved out of inline chip rows. */}
        <ul className="m-0 flex max-h-72 list-none flex-col overflow-y-auto p-0">
          {facets.map((f) => (
            <li key={f.slug}>
              <PickerRow selected={selected.includes(f.slug)} onClick={() => onToggle(f.slug)}>
                <span>
                  {f.name}
                  <span className="ml-1.5 text-xs tabular-nums opacity-70">
                    {f.count.toLocaleString()}
                  </span>
                </span>
              </PickerRow>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The attribute facets as one row of per-kind dropdowns.
 *
 * The grouping needs no new data: `get_marketplace_tag_facets` has always
 * returned `kind`, and the category page discarded it — a reader met 58
 * undifferentiated chips on /marketplace/category/apparel with sizes, colours,
 * materials and vibes interleaved by popularity.
 *
 * SIX LABELLED CHIP ROWS BECAME ONE ROW OF SIX TRIGGERS. The intermediate
 * version grouped the chips into labelled rows, which fixed the semantics but
 * still spent 294px of desktop height (664px at 375px wide) on filters above
 * the grid. A popover costs one 44px row no matter how many options a kind
 * has, and it retires the "+N more" expander entirely — the list scrolls, so
 * every option is reachable instead of hidden behind a second click that
 * expanded in place and pushed the grid further down.
 *
 * The trade is that applied filters are no longer all visible at a glance.
 * That is carried by the trigger's own count (`Color · 2`) and a ring on each
 * selected row, which is the same affordance MarketplaceControlBar's pickers
 * already use — not a new vocabulary.
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
    // kind is a vocabulary gap, and dropping its options silently removes
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
      <div className="flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <KindPicker
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
