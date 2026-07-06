import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { X } from 'lucide-react';
import { TagSelector } from '@/components/tags/TagSelector';
import type { MarketplaceFiltersInput } from '@/hooks/useMarketplace';
import {
  useMarketplaceFacets,
  useMarketplaceSubcategoryTiles,
  useMarketplaceDepartmentCounts,
  useMarketplaceAttributeVocab,
} from '@/hooks/useMarketplaceQueries';
import {
  DEPARTMENT_ORDER,
  departmentLabel,
  departmentOf,
  ATTRIBUTE_KIND_LABELS,
  type MarketplaceAttributeKind,
} from '@/lib/marketplaceTaxonomy';
import { PRICE_CEILING, isAttributeTag, hasActiveFilters } from '@/lib/marketplaceFilterParams';
import { COMMUNITY_OWNED_OPTIONS } from './marketplaceFilterOptions';

const PRICE_MIN = 0;
const PRICE_MAX = 500;
const PRICE_STEP = 5;

const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'BRL', 'MXN'];

const VERIFIED_WINDOW_DAYS = [
  { value: 0, label: 'Any age' },
  { value: 30, label: 'Within 30 days' },
  { value: 90, label: 'Within 90 days' },
  { value: 180, label: 'Within 6 months' },
];

function prettifySlug(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const businessTypes = ['online', 'physical', 'both'];

interface MarketplaceFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: MarketplaceFiltersInput;
  /** Full-replacement callback — every control applies immediately. */
  onFiltersChange: (next: MarketplaceFiltersInput) => void;
  includeAdult?: boolean;
  onIncludeAdultChange?: (next: boolean) => void;
  /** Live result count for the footer button. */
  resultCount?: number;
}

/**
 * The demoted "everything else" filter surface — the four highest-value
 * facets live as chips in the control bar; the long tail lives here.
 * All controls write straight to the shared (URL-backed) filter state.
 */
export function MarketplaceFilterSheet({
  open,
  onOpenChange,
  filters,
  onFiltersChange,
  includeAdult = false,
  onIncludeAdultChange,
  resultCount,
}: MarketplaceFilterSheetProps) {
  const { data: facets } = useMarketplaceFacets({
    category: filters.category,
    subcategory: filters.subcategory,
    businessType: filters.businessType,
    includeAdult,
  });
  const { data: subcategoryOptions } = useMarketplaceSubcategoryTiles(null, includeAdult);
  const { data: departmentCountData } = useMarketplaceDepartmentCounts(includeAdult);
  const { data: attributeVocab } = useMarketplaceAttributeVocab();
  const fmtCount = (n: number | undefined) => (n != null && n > 0 ? ` (${n.toLocaleString()})` : '');

  const patch = (p: Partial<MarketplaceFiltersInput>) => onFiltersChange({ ...filters, ...p });

  // Free-text location debounces locally; everything else applies instantly.
  const [location, setLocation] = useState(filters.location ?? '');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setLocation(filters.location ?? '');
  }, [filters.location]);
  const locDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleLocation = (v: string) => {
    setLocation(v);
    clearTimeout(locDebounce.current);
    locDebounce.current = setTimeout(() => patch({ location: v.trim() || undefined }), 300);
  };

  const allTags = filters.tags ?? [];
  const attributeTags = allTags.filter(isAttributeTag);
  const vocabTags = allTags.filter((t) => !isAttributeTag(t));
  const setTags = (attrs: string[], vocab: string[]) => {
    const merged = [...vocab, ...attrs];
    patch({ tags: merged.length > 0 ? merged : undefined });
  };
  const toggleAttribute = (slug: string) => {
    const next = attributeTags.includes(slug)
      ? attributeTags.filter((s) => s !== slug)
      : [...attributeTags, slug];
    setTags(next, vocabTags);
  };

  const toggleCommunityOwned = (value: string) => {
    const cur = filters.communityOwned ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    patch({ communityOwned: next.length > 0 ? next : undefined });
  };

  const priceMin = filters.priceRange?.min ?? PRICE_MIN;
  const priceMax =
    filters.priceRange == null
      ? PRICE_MAX
      : filters.priceRange.max >= PRICE_CEILING
        ? PRICE_MAX
        : Math.min(filters.priceRange.max, PRICE_MAX);
  const priceTouched = filters.priceRange != null;

  // Department counts come straight from the gated RPC — matches the grid the
  // visitor will actually see (no more count/grid mismatch on adult umbrellas).
  const departmentCounts = new Map(departmentCountData.map((d) => [d.slug, d.count]));
  const departmentOptions = DEPARTMENT_ORDER.filter((d) => (departmentCounts.get(d) ?? 0) > 0);
  const visibleSubcategories = filters.department
    ? subcategoryOptions.filter((o) => departmentOf(o.slug) === filters.department)
    : subcategoryOptions;

  const handleDepartmentChange = (next: string) => {
    const dept = next === 'all' ? undefined : next;
    // Keep the drill-down coherent: drop a subcategory that left the umbrella.
    const sub =
      filters.subcategory && dept && departmentOf(filters.subcategory) !== dept
        ? undefined
        : filters.subcategory;
    patch({ department: dept, subcategory: sub });
  };

  const attributesByKind = (kind: MarketplaceAttributeKind) =>
    attributeVocab.filter((a) => a.kind === kind);

  const clearAll = () => onFiltersChange(filters.search ? { search: filters.search } : {});

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="pb-2">
          <SheetTitle>All filters</SheetTitle>
        </SheetHeader>

        {onIncludeAdultChange && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-element border border-border px-4 py-2">
            <Label htmlFor="show-adult" className="text-13 text-muted-foreground">
              Show adult products (18+)
            </Label>
            <Switch
              id="show-adult"
              checked={includeAdult}
              onCheckedChange={onIncludeAdultChange}
              aria-label="Show adult products"
            />
          </div>
        )}

        <Accordion type="multiple" defaultValue={['type-category', 'price']} className="w-full">
          <AccordionItem value="type-category">
            <AccordionTrigger className="text-13 uppercase tracking-wide text-muted-foreground">
              Type & category
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-4 pt-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="department">Department</Label>
                  <Select value={filters.department ?? ''} onValueChange={handleDepartmentChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {departmentOptions.map((d) => (
                        <SelectItem key={d} value={d}>
                          {departmentLabel(d)}
                          {fmtCount(departmentCounts.get(d))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Subcategory is a drill-down within a department — the
                    flat 550-slug merchant vocabulary was noise. */}
                {filters.department && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="subcategory">Category</Label>
                    <Select
                      value={filters.subcategory ?? ''}
                      onValueChange={(v) => patch({ subcategory: v === 'all' ? undefined : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {visibleSubcategories.map((opt) => (
                          <SelectItem key={opt.slug} value={opt.slug}>
                            {prettifySlug(opt.slug)}
                            {fmtCount(facets.subcategory.get(opt.slug) ?? opt.count)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="attributes">
            <AccordionTrigger className="text-13 uppercase tracking-wide text-muted-foreground">
              Attributes
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-4 pt-2">
                {(['material', 'occasion', 'vibe'] as MarketplaceAttributeKind[]).map((kind) => {
                  const opts = attributesByKind(kind);
                  if (opts.length === 0) return null;
                  return (
                    <div key={kind} className="flex flex-col gap-2">
                      <Label>{ATTRIBUTE_KIND_LABELS[kind]}</Label>
                      <div className="flex flex-wrap gap-2">
                        {opts.map((opt) => {
                          const active = attributeTags.includes(opt.slug);
                          return (
                            <button
                              key={opt.slug}
                              type="button"
                              onClick={() => toggleAttribute(opt.slug)}
                              aria-pressed={active}
                              className={`rounded-badge border px-2 py-1 text-xs transition-colors ${
                                active
                                  ? 'border-foreground bg-foreground text-background'
                                  : 'border-border bg-background text-foreground hover:bg-muted'
                              }`}
                            >
                              {opt.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="price">
            <AccordionTrigger className="text-13 uppercase tracking-wide text-muted-foreground">
              Price
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-2 pt-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="price-range">Price range (USD)</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ${priceMin}
                    {' – '}
                    {priceMax >= PRICE_MAX ? `$${PRICE_MAX}+` : `$${priceMax}`}
                  </span>
                </div>
                <Slider
                  id="price-range"
                  min={PRICE_MIN}
                  max={PRICE_MAX}
                  step={PRICE_STEP}
                  value={[priceMin, priceMax]}
                  onValueChange={(v) => {
                    if (!Array.isArray(v) || v.length !== 2) return;
                    patch({
                      priceRange: { min: v[0], max: v[1] >= PRICE_MAX ? PRICE_CEILING : v[1] },
                    });
                  }}
                  aria-label="Price range"
                />
                {priceTouched && (
                  <button
                    type="button"
                    className="self-start text-xs text-muted-foreground underline underline-offset-2"
                    onClick={() => patch({ priceRange: undefined })}
                  >
                    Reset price
                  </button>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="values">
            <AccordionTrigger className="text-13 uppercase tracking-wide text-muted-foreground">
              Identity & values
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-4 pt-2">
                <div className="flex flex-col gap-2">
                  <Label>Community-owned</Label>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {COMMUNITY_OWNED_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={(filters.communityOwned ?? []).includes(opt.value)}
                          onCheckedChange={() => toggleCommunityOwned(opt.value)}
                          aria-label={opt.label}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="product-tags">
            <AccordionTrigger className="text-13 uppercase tracking-wide text-muted-foreground">
              Tags
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-2">
                <TagSelector
                  selectedTags={vocabTags}
                  onTagsChange={(next) => setTags(attributeTags, next)}
                  placeholder="Filter by identity, product or service tags…"
                  maxTags={10}
                  categories={['identity', 'business', 'commerce', 'product', 'service']}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="business-location">
            <AccordionTrigger className="text-13 uppercase tracking-wide text-muted-foreground">
              Business & location
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-4 pt-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="businessType">Business type</Label>
                  <Select
                    value={filters.businessType ?? ''}
                    onValueChange={(v) => patch({ businessType: v === 'all' ? undefined : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {businessTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                          {fmtCount(facets.business_type.get(type))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="Enter city, state…"
                    value={location}
                    onChange={(e) => handleLocation(e.target.value)}
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="quality">
            <AccordionTrigger className="text-13 uppercase tracking-wide text-muted-foreground">
              Quality & freshness
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-4 pt-2">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select
                      value={filters.currency || 'all'}
                      onValueChange={(v) => patch({ currency: v === 'all' ? undefined : v })}
                    >
                      <SelectTrigger id="currency">
                        <SelectValue placeholder="Any currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any currency</SelectItem>
                        {CURRENCY_OPTIONS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="verified">Last verified</Label>
                    <Select
                      value={String(filters.verifiedWithinDays ?? 0)}
                      onValueChange={(v) =>
                        patch({ verifiedWithinDays: Number(v) > 0 ? Number(v) : undefined })
                      }
                    >
                      <SelectTrigger id="verified">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VERIFIED_WINDOW_DAYS.map((w) => (
                          <SelectItem key={w.value} value={String(w.value)}>
                            {w.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="in-stock" className="cursor-pointer">
                    Hide sold-out
                  </Label>
                  <Switch
                    id="in-stock"
                    checked={filters.availability !== 'any'}
                    onCheckedChange={(checked) =>
                      patch({ availability: checked ? 'in_stock' : 'any' })
                    }
                    aria-label="Hide sold-out listings"
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <SheetFooter className="sticky bottom-0 mt-6 flex-row gap-2 border-t border-border bg-background pt-4">
          {hasActiveFilters(filters) && (
            <Button variant="outline" onClick={clearAll}>
              <X size={16} />
              Clear all
            </Button>
          )}
          <Button className="flex-1" onClick={() => onOpenChange(false)}>
            {resultCount != null ? `Show ${resultCount.toLocaleString()} results` : 'Show results'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
