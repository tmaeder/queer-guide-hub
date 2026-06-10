import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Search, Filter, X, Sliders } from 'lucide-react';
import { TagSelector } from '@/components/tags/TagSelector';
import {
  useMarketplaceFacets,
  useMarketplaceSubcategoryTiles,
  useMarketplaceAttributeVocab,
} from '@/hooks/useMarketplaceQueries';
import {
  DEPARTMENT_ORDER,
  departmentLabel,
  departmentOf,
  ATTRIBUTE_KIND_LABELS,
  type MarketplaceAttributeKind,
} from '@/lib/marketplaceTaxonomy';

const PRICE_MIN = 0;
const PRICE_MAX = 500;
const PRICE_STEP = 5;

interface MarketplaceFiltersProps {
  initialSearch?: string;
  onFiltersChange: (filters: {
    search?: string;
    /** products / services (was labelled "Category", now "Type"). */
    category?: string;
    /** browse umbrella (apparel, underwear, intimacy, …). */
    department?: string;
    /** canonical subcategory slug (fetish_gear, sex_toys, …). */
    subcategory?: string;
    location?: string;
    priceRange?: { min: number; max: number };
    businessType?: string;
    tags?: string[];
    communityOwned?: string[];
    currency?: string;
    availability?: 'in_stock' | 'any';
    relevanceMin?: number;
    verifiedWithinDays?: number;
  }) => void;
  /** Default-SFW browse toggle (owned by the page; persisted + 18+ opt-in). */
  includeAdult?: boolean;
  onIncludeAdultChange?: (next: boolean) => void;
}

const COMMUNITY_OWNED_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'queer_owned', label: 'Queer-owned' },
  { value: 'trans_owned', label: 'Trans-owned' },
  { value: 'bipoc_owned', label: 'BIPOC-owned' },
  { value: 'women_owned', label: 'Women-owned' },
  { value: 'disabled_owned', label: 'Disabled-owned' },
  { value: 'nonprofit', label: 'Non-profit' },
];

// Subset of the 23 supported currencies — covers the long tail in
// practice. If a listing uses something exotic, free-text search still
// finds it; the filter just won't list it. Order: USD/EUR first, then
// alpha.
const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'BRL', 'MXN'];

const VERIFIED_WINDOW_DAYS = [
  { value: 0, label: 'Any age' },
  { value: 30, label: 'Within 30 days' },
  { value: 90, label: 'Within 90 days' },
  { value: 180, label: 'Within 6 months' },
];

// "Type" was previously labelled "Category" but its options are the
// products/services enum, duplicating the tabs. The real category
// dimension is the canonical subcategory_slug column populated by the
// ingestion pipeline (fetish_gear, sex_toys, underwear, …) — wired
// below via useMarketplaceSubcategoryTiles().
const types = ['products', 'services'];

function prettifySlug(slug: string): string {
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const businessTypes = ['online', 'physical', 'both'];

export function MarketplaceFilters({
  initialSearch = '',
  onFiltersChange,
  includeAdult = false,
  onIncludeAdultChange,
}: MarketplaceFiltersProps) {
  const [search, setSearch] = useState(initialSearch);
  // Re-sync the input when the URL `?q=` changes externally (back/forward
  // nav, saved-search restore). Without this, the typed and URL search
  // paths can drift apart — the same query string yielded different
  // result counts depending on which surface set it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setSearch(initialSearch);
  }, [initialSearch]);
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [location, setLocation] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [priceMin, setPriceMin] = useState<number>(PRICE_MIN);
  const [priceMax, setPriceMax] = useState<number>(PRICE_MAX);
  const [priceTouched, setPriceTouched] = useState(false);
  // Two tag dimensions surfaced separately so users can filter on
  // values (queer-owned, BIPOC-owned, …) without scrolling past
  // product-type tags. Combined into a single `tags` payload on submit.
  const [valueTags, setValueTags] = useState<string[]>([]);
  const [productTags, setProductTags] = useState<string[]>([]);
  // Attribute facets (material/occasion/vibe) — namespaced unified_tags slugs
  // that ride the same `tags` filter pipeline as the selectors above.
  const [attributeTags, setAttributeTags] = useState<string[]>([]);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const [communityOwned, setCommunityOwned] = useState<string[]>([]);
  const [currency, setCurrency] = useState('');
  // Default 'in_stock' — hide sold-out listings unless the user opts in.
  const [availability, setAvailability] = useState<'in_stock' | 'any'>('in_stock');
  const [relevanceMin, setRelevanceMin] = useState<number>(0);
  const [verifiedWithinDays, setVerifiedWithinDays] = useState<number>(0);

  const toggleCommunityOwned = (value: string) => {
    setCommunityOwned((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const allTags = [...valueTags, ...productTags, ...attributeTags];

  const toggleAttribute = (slug: string) => {
    setAttributeTags((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  };

  const buildFilters = () => {
    const priceRange = priceTouched
      ? {
          min: priceMin,
          max: priceMax >= PRICE_MAX ? 100000 : priceMax,
        }
      : undefined;

    const cleanSearch = search.replace(/[,()]/g, ' ').trim();

    return {
      search: cleanSearch || undefined,
      category: category === 'all' ? undefined : category || undefined,
      department: department === 'all' ? undefined : department || undefined,
      subcategory: subcategory === 'all' ? undefined : subcategory || undefined,
      location: location || undefined,
      businessType: businessType === 'all' ? undefined : businessType || undefined,
      priceRange,
      tags: allTags.length > 0 ? allTags : undefined,
      communityOwned: communityOwned.length > 0 ? communityOwned : undefined,
      currency: currency || undefined,
      availability,
      relevanceMin: relevanceMin > 0 ? relevanceMin : undefined,
      verifiedWithinDays: verifiedWithinDays > 0 ? verifiedWithinDays : undefined,
    };
  };

  const handleSearch = () => {
    onFiltersChange(buildFilters());
  };

  // Apply Filters: fire onFiltersChange AND collapse the panel so the
  // user sees the updated results immediately. Without the collapse,
  // the QA report rightly complained that clicking Apply "produced no
  // visible change".
  const handleApply = () => {
    onFiltersChange(buildFilters());
    setShowAllFilters(false);
  };

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const t = setTimeout(() => {
      onFiltersChange(buildFilters());
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    search,
    category,
    department,
    subcategory,
    location,
    businessType,
    priceMin,
    priceMax,
    priceTouched,
    valueTags,
    productTags,
    attributeTags,
    communityOwned,
    currency,
    availability,
    relevanceMin,
    verifiedWithinDays,
  ]);

  const clearFilters = () => {
    setSearch('');
    setCategory('');
    setDepartment('');
    setSubcategory('');
    setLocation('');
    setBusinessType('');
    setPriceMin(PRICE_MIN);
    setPriceMax(PRICE_MAX);
    setPriceTouched(false);
    setValueTags([]);
    setProductTags([]);
    setAttributeTags([]);
    setCommunityOwned([]);
    setCurrency('');
    setAvailability('in_stock');
    setRelevanceMin(0);
    setVerifiedWithinDays(0);
    onFiltersChange({});
  };

  const hasActiveFilters =
    search ||
    (category && category !== 'all') ||
    (department && department !== 'all') ||
    (subcategory && subcategory !== 'all') ||
    location ||
    (businessType && businessType !== 'all') ||
    priceTouched ||
    allTags.length > 0 ||
    communityOwned.length > 0 ||
    currency ||
    availability === 'any' ||
    relevanceMin > 0 ||
    verifiedWithinDays > 0;

  const activeFilterCount =
    (search ? 1 : 0) +
    (category && category !== 'all' ? 1 : 0) +
    (department && department !== 'all' ? 1 : 0) +
    (subcategory && subcategory !== 'all' ? 1 : 0) +
    (location ? 1 : 0) +
    (businessType && businessType !== 'all' ? 1 : 0) +
    (priceTouched ? 1 : 0) +
    allTags.length +
    communityOwned.length +
    (currency ? 1 : 0) +
    (availability === 'any' ? 1 : 0) +
    (relevanceMin > 0 ? 1 : 0) +
    (verifiedWithinDays > 0 ? 1 : 0);

  const handleTypeChange = (newType: string) => {
    setCategory(newType);
  };

  const { data: facets } = useMarketplaceFacets({
    category: category && category !== 'all' ? category : undefined,
    subcategory: subcategory && subcategory !== 'all' ? subcategory : undefined,
    businessType: businessType && businessType !== 'all' ? businessType : undefined,
  });
  const { data: subcategoryOptions } = useMarketplaceSubcategoryTiles(null);
  const { data: attributeVocab } = useMarketplaceAttributeVocab();
  const fmtCount = (n: number | undefined) => (n != null && n > 0 ? ` (${n.toLocaleString()})` : '');

  // Department counts: group the fine subcategory tiles into umbrellas.
  const departmentCounts = new Map<string, number>();
  for (const opt of subcategoryOptions) {
    const d = departmentOf(opt.slug);
    departmentCounts.set(d, (departmentCounts.get(d) ?? 0) + opt.count);
  }
  const departmentOptions = DEPARTMENT_ORDER.filter((d) => (departmentCounts.get(d) ?? 0) > 0);
  // Drill-down: with a department selected, only show its fine subcategories.
  const visibleSubcategories = department && department !== 'all'
    ? subcategoryOptions.filter((o) => departmentOf(o.slug) === department)
    : subcategoryOptions;

  const handleDepartmentChange = (next: string) => {
    setDepartment(next);
    // Keep the drill-down coherent: drop a subcategory that left the umbrella.
    if (subcategory && subcategory !== 'all' && next !== 'all' && departmentOf(subcategory) !== next) {
      setSubcategory('');
    }
  };

  const attributesByKind = (kind: MarketplaceAttributeKind) =>
    attributeVocab.filter((a) => a.kind === kind);

  return (
    <div className="flex flex-col gap-4 p-4 bg-background">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            style={{ left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16 }}
            className="absolute text-muted-foreground"
          />
          <Input
            placeholder="Search products and services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ paddingLeft: 36 }}
            aria-label="Search products and services"
          />
        </div>
        <Button onClick={handleSearch} size="icon" aria-label="Search">
          <Search size={16} />
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowAllFilters(!showAllFilters)}
          aria-label="Toggle filters"
          aria-expanded={showAllFilters}
        >
          <Filter size={16} />
          {activeFilterCount > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-badge bg-foreground px-1.5 text-2xs font-medium text-background">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {onIncludeAdultChange && (
        <div className="flex items-center justify-between gap-4 rounded-element border border-border px-4 py-2">
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

      {showAllFilters && (
        <div className="flex flex-col gap-4 pt-2">
          <Accordion
            type="multiple"
            defaultValue={['type-category', 'price']}
            className="w-full"
          >
            <AccordionItem value="type-category">
              <AccordionTrigger className="text-13 uppercase tracking-wide text-muted-foreground">
                Type & category
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="type">Type</Label>
                    <Select value={category} onValueChange={handleTypeChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types{fmtCount(facets.total)}</SelectItem>
                        {types.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                            {fmtCount(facets.category.get(t))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="department">Department</Label>
                    <Select value={department} onValueChange={handleDepartmentChange}>
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
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="subcategory">Category</Label>
                    <Select value={subcategory} onValueChange={setSubcategory}>
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
                      setPriceMin(v[0]);
                      setPriceMax(v[1]);
                      setPriceTouched(true);
                    }}
                    aria-label="Price range"
                  />
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
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={communityOwned.includes(opt.value)}
                            onCheckedChange={() => toggleCommunityOwned(opt.value)}
                            aria-label={opt.label}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <TagSelector
                    selectedTags={valueTags}
                    onTagsChange={setValueTags}
                    placeholder="Identity tags…"
                    maxTags={8}
                    categories={['identity']}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="product-tags">
              <AccordionTrigger className="text-13 uppercase tracking-wide text-muted-foreground">
                Product tags
              </AccordionTrigger>
              <AccordionContent>
                <div className="pt-2">
                  <TagSelector
                    selectedTags={productTags}
                    onTagsChange={setProductTags}
                    placeholder="Filter by product or service tags…"
                    maxTags={10}
                    categories={['business', 'commerce', 'product', 'service']}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="business-location">
              <AccordionTrigger className="text-13 uppercase tracking-wide text-muted-foreground">
                Business & location
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="businessType">Business type</Label>
                    <Select value={businessType} onValueChange={setBusinessType}>
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
                      onChange={(e) => setLocation(e.target.value)}
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Select
                        value={currency || 'all'}
                        onValueChange={(v) => setCurrency(v === 'all' ? '' : v)}
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
                        value={String(verifiedWithinDays)}
                        onValueChange={(v) => setVerifiedWithinDays(Number(v))}
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
                    <div className="flex items-center justify-between gap-2 self-end">
                      <Label htmlFor="in-stock" className="cursor-pointer">
                        Hide sold-out
                      </Label>
                      <Switch
                        id="in-stock"
                        checked={availability === 'in_stock'}
                        onCheckedChange={(checked) =>
                          setAvailability(checked ? 'in_stock' : 'any')
                        }
                        aria-label="Hide sold-out listings"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="relevance">Minimum LGBTQ+ relevance</Label>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {relevanceMin === 0 ? 'Any' : `${Math.round(relevanceMin * 100)}%+`}
                      </span>
                    </div>
                    <Slider
                      id="relevance"
                      min={0}
                      max={1}
                      step={0.05}
                      value={[relevanceMin]}
                      onValueChange={(v) => Array.isArray(v) && v[0] != null && setRelevanceMin(v[0])}
                      aria-label="Minimum LGBTQ+ relevance"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleApply}>
              <Sliders size={16} />
              Apply filters
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                <X size={16} />
                Clear all
              </Button>
            )}
          </div>
        </div>
      )}

      {hasActiveFilters && !showAllFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {search && (
            <Badge variant="secondary">
              Search: {search}
              <X size={12} className="cursor-pointer" onClick={() => setSearch('')} />
            </Badge>
          )}
          {category && category !== 'all' && (
            <Badge variant="secondary">
              Type: {category}
              <X size={12} className="cursor-pointer" onClick={() => setCategory('')} />
            </Badge>
          )}
          {department && department !== 'all' && (
            <Badge variant="secondary">
              Department: {departmentLabel(department)}
              <X size={12} className="cursor-pointer" onClick={() => setDepartment('')} />
            </Badge>
          )}
          {subcategory && subcategory !== 'all' && (
            <Badge variant="secondary">
              Category: {prettifySlug(subcategory)}
              <X size={12} className="cursor-pointer" onClick={() => setSubcategory('')} />
            </Badge>
          )}
          {location && (
            <Badge variant="secondary">
              Location: {location}
              <X size={12} className="cursor-pointer" onClick={() => setLocation('')} />
            </Badge>
          )}
          {businessType && businessType !== 'all' && (
            <Badge variant="secondary">
              {businessType}
              <X size={12} className="cursor-pointer" onClick={() => setBusinessType('')} />
            </Badge>
          )}
          {priceTouched && (
            <Badge variant="secondary">
              Price: ${priceMin} – {priceMax >= PRICE_MAX ? `$${PRICE_MAX}+` : `$${priceMax}`}
              <X
                size={12}
                className="cursor-pointer"
                onClick={() => {
                  setPriceMin(PRICE_MIN);
                  setPriceMax(PRICE_MAX);
                  setPriceTouched(false);
                }}
              />
            </Badge>
          )}
          {valueTags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
              <X
                size={12}
                className="cursor-pointer"
                onClick={() => setValueTags((prev) => prev.filter((t) => t !== tag))}
              />
            </Badge>
          ))}
          {productTags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
              <X
                size={12}
                className="cursor-pointer"
                onClick={() => setProductTags((prev) => prev.filter((t) => t !== tag))}
              />
            </Badge>
          ))}
          {attributeTags.map((slug) => {
            const label = attributeVocab.find((a) => a.slug === slug)?.name ?? slug;
            return (
              <Badge key={slug} variant="secondary">
                {label}
                <X size={12} className="cursor-pointer" onClick={() => toggleAttribute(slug)} />
              </Badge>
            );
          })}
          {communityOwned.map((v) => {
            const label = COMMUNITY_OWNED_OPTIONS.find((o) => o.value === v)?.label ?? v;
            return (
              <Badge key={v} variant="secondary">
                {label}
                <X
                  size={12}
                  className="cursor-pointer"
                  onClick={() => toggleCommunityOwned(v)}
                />
              </Badge>
            );
          })}
          {currency && (
            <Badge variant="secondary">
              {currency}
              <X size={12} className="cursor-pointer" onClick={() => setCurrency('')} />
            </Badge>
          )}
          {availability === 'any' && (
            <Badge variant="secondary">
              Including sold-out
              <X
                size={12}
                className="cursor-pointer"
                onClick={() => setAvailability('in_stock')}
              />
            </Badge>
          )}
          {relevanceMin > 0 && (
            <Badge variant="secondary">
              Relevance ≥ {Math.round(relevanceMin * 100)}%
              <X size={12} className="cursor-pointer" onClick={() => setRelevanceMin(0)} />
            </Badge>
          )}
          {verifiedWithinDays > 0 && (
            <Badge variant="secondary">
              Verified ≤ {verifiedWithinDays}d
              <X
                size={12}
                className="cursor-pointer"
                onClick={() => setVerifiedWithinDays(0)}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
