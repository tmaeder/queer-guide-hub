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
import { Search, Filter, X, Sliders } from 'lucide-react';
import { TagSelector } from '@/components/tags/TagSelector';
import { useMarketplaceFacets, useMarketplaceSubcategoryTiles } from '@/hooks/useMarketplaceQueries';

const PRICE_MIN = 0;
const PRICE_MAX = 500;
const PRICE_STEP = 5;

interface MarketplaceFiltersProps {
  initialSearch?: string;
  onFiltersChange: (filters: {
    search?: string;
    /** products / services (was labelled "Category", now "Type"). */
    category?: string;
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
}: MarketplaceFiltersProps) {
  const [search, setSearch] = useState(initialSearch);
  // Re-sync the input when the URL `?q=` changes externally (back/forward
  // nav, saved-search restore). Without this, the typed and URL search
  // paths can drift apart — the same query string yielded different
  // result counts depending on which surface set it.
  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [location, setLocation] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [priceMin, setPriceMin] = useState<number>(PRICE_MIN);
  const [priceMax, setPriceMax] = useState<number>(PRICE_MAX);
  const [priceTouched, setPriceTouched] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
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
      subcategory: subcategory === 'all' ? undefined : subcategory || undefined,
      location: location || undefined,
      businessType: businessType === 'all' ? undefined : businessType || undefined,
      priceRange,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
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
    subcategory,
    location,
    businessType,
    priceMin,
    priceMax,
    priceTouched,
    selectedTags,
    communityOwned,
    currency,
    availability,
    relevanceMin,
    verifiedWithinDays,
  ]);

  const clearFilters = () => {
    setSearch('');
    setCategory('');
    setSubcategory('');
    setLocation('');
    setBusinessType('');
    setPriceMin(PRICE_MIN);
    setPriceMax(PRICE_MAX);
    setPriceTouched(false);
    setSelectedTags([]);
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
    (subcategory && subcategory !== 'all') ||
    location ||
    (businessType && businessType !== 'all') ||
    priceTouched ||
    selectedTags.length > 0 ||
    communityOwned.length > 0 ||
    currency ||
    availability === 'any' ||
    relevanceMin > 0 ||
    verifiedWithinDays > 0;

  const handleTypeChange = (newType: string) => {
    setCategory(newType);
  };

  const { data: facets } = useMarketplaceFacets({
    category: category && category !== 'all' ? category : undefined,
    subcategory: subcategory && subcategory !== 'all' ? subcategory : undefined,
    businessType: businessType && businessType !== 'all' ? businessType : undefined,
  });
  const { data: subcategoryOptions } = useMarketplaceSubcategoryTiles();
  const fmtCount = (n: number | undefined) => (n != null && n > 0 ? ` (${n.toLocaleString()})` : '');

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
          size="icon"
          aria-label="Toggle filters"
        >
          <Filter size={16} />
        </Button>
      </div>

      {showAllFilters && (
        <div className="flex flex-col gap-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="type">Type</Label>
              <Select value={category} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types{fmtCount(facets.total)}</SelectItem>
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
              <Label htmlFor="subcategory">Category</Label>
              <Select value={subcategory} onValueChange={setSubcategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {subcategoryOptions.map((opt) => (
                    <SelectItem key={opt.slug} value={opt.slug}>
                      {prettifySlug(opt.slug)}
                      {fmtCount(facets.subcategory.get(opt.slug) ?? opt.count)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="businessType">Business Type</Label>
              <Select value={businessType} onValueChange={setBusinessType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {businessTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                      {fmtCount(facets.business_type.get(type))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="Enter city, state..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
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
          </div>

          <TagSelector
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            placeholder="Select marketplace tags..."
            maxTags={10}
            categories={['business', 'commerce', 'product', 'service', 'identity']}
          />

          <div className="flex flex-col gap-4 border-t border-border pt-4">
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Select value={currency || 'all'} onValueChange={(v) => setCurrency(v === 'all' ? '' : v)}>
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
                  {relevanceMin === 0
                    ? 'Any'
                    : `${Math.round(relevanceMin * 100)}%+`}
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

          <div className="flex gap-2 pt-2">
            <Button onClick={handleApply}>
              <Sliders size={16} />
              Apply Filters
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                <X size={16} />
                Clear All
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
          {selectedTags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
              <X
                size={12}
                className="cursor-pointer"
                onClick={() => setSelectedTags((prev) => prev.filter((t) => t !== tag))}
              />
            </Badge>
          ))}
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
