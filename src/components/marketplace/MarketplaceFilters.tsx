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
import { Search, Filter, X, Sliders } from 'lucide-react';
import { TagSelector } from '@/components/tags/TagSelector';
import { useMarketplaceFacets } from '@/hooks/useMarketplaceQueries';

const PRICE_MIN = 0;
const PRICE_MAX = 500;
const PRICE_STEP = 5;

interface MarketplaceFiltersProps {
  initialSearch?: string;
  onFiltersChange: (filters: {
    search?: string;
    category?: string;
    subcategory?: string;
    location?: string;
    priceRange?: { min: number; max: number };
    businessType?: string;
    tags?: string[];
  }) => void;
}

const categories = [
  'products',
  'services'
];

const subcategories: Record<string, string[]> = {
  products: ['clothing', 'jewelry', 'art', 'books', 'food', 'crafts', 'beauty', 'electronics', 'home-goods', 'handmade'],
  services: ['photography', 'design', 'marketing', 'therapy', 'legal', 'financial', 'consulting', 'wellness', 'creative', 'professional']
};

const businessTypes = [
  'online',
  'physical',
  'both'
];

export function MarketplaceFilters({ initialSearch = '', onFiltersChange }: MarketplaceFiltersProps) {
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [location, setLocation] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [priceMin, setPriceMin] = useState<number>(PRICE_MIN);
  const [priceMax, setPriceMax] = useState<number>(PRICE_MAX);
  const [priceTouched, setPriceTouched] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAllFilters, setShowAllFilters] = useState(false);

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
    };
  };

  const handleSearch = () => {
    onFiltersChange(buildFilters());
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
  }, [search, category, subcategory, location, businessType, priceMin, priceMax, priceTouched, selectedTags]);

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
    onFiltersChange({});
  };

  const hasActiveFilters = search || (category && category !== 'all') || (subcategory && subcategory !== 'all') || location || (businessType && businessType !== 'all') || priceTouched || selectedTags.length > 0;

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    setSubcategory('');
  };

  const { data: facets } = useMarketplaceFacets({
    category: category && category !== 'all' ? category : undefined,
    subcategory: subcategory && subcategory !== 'all' ? subcategory : undefined,
    businessType: businessType && businessType !== 'all' ? businessType : undefined,
  });
  const fmtCount = (n: number | undefined) =>
    n != null && n > 0 ? ` (${n})` : '';

  return (
    <div className="flex flex-col gap-4 p-4 bg-background">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
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
          <Search style={{ height: 16, width: 16 }} />
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowAllFilters(!showAllFilters)}
          size="icon"
          aria-label="Toggle filters"
        >
          <Filter style={{ height: 16, width: 16 }} />
        </Button>
      </div>

      {showAllFilters && (
        <div className="flex flex-col gap-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories{fmtCount(facets.total)}</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      {fmtCount(facets.category.get(cat))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="subcategory">Subcategory</Label>
              <Select value={subcategory} onValueChange={setSubcategory} disabled={!category}>
                <SelectTrigger>
                  <SelectValue placeholder="Select subcategory" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subcategories</SelectItem>
                  {category && subcategories[category]?.map((subcat) => (
                    <SelectItem key={subcat} value={subcat}>
                      {subcat.charAt(0).toUpperCase() + subcat.slice(1)}
                      {fmtCount(facets.subcategory.get(subcat))}
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

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSearch}>
              <Sliders style={{ height: 16, width: 16 }} />
              Apply Filters
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>
                <X style={{ height: 16, width: 16 }} />
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
              <X style={{ height: 12, width: 12, cursor: 'pointer' }} onClick={() => setSearch('')} />
            </Badge>
          )}
          {category && category !== 'all' && (
            <Badge variant="secondary">
              {category}
              <X style={{ height: 12, width: 12, cursor: 'pointer' }} onClick={() => setCategory('')} />
            </Badge>
          )}
          {subcategory && subcategory !== 'all' && (
            <Badge variant="secondary">
              {subcategory}
              <X style={{ height: 12, width: 12, cursor: 'pointer' }} onClick={() => setSubcategory('')} />
            </Badge>
          )}
          {location && (
            <Badge variant="secondary">
              Location: {location}
              <X style={{ height: 12, width: 12, cursor: 'pointer' }} onClick={() => setLocation('')} />
            </Badge>
          )}
          {businessType && businessType !== 'all' && (
            <Badge variant="secondary">
              {businessType}
              <X style={{ height: 12, width: 12, cursor: 'pointer' }} onClick={() => setBusinessType('')} />
            </Badge>
          )}
          {priceTouched && (
            <Badge variant="secondary">
              Price: ${priceMin} – {priceMax >= PRICE_MAX ? `$${PRICE_MAX}+` : `$${priceMax}`}
              <X
                style={{ height: 12, width: 12, cursor: 'pointer' }}
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
                 style={{ height: 12, width: 12, cursor: 'pointer' }}
                 onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
               />
             </Badge>
           ))}
        </div>
      )}
    </div>
  );
}
