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
import { Search, Filter, X, Sliders } from 'lucide-react';
import { TagSelector } from '@/components/tags/TagSelector';
import { useMarketplaceFacets } from '@/hooks/useMarketplaceQueries';

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
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAllFilters, setShowAllFilters] = useState(false);

  const buildFilters = () => {
    const priceRange = minPrice || maxPrice ? {
      min: parseFloat(minPrice) || 0,
      max: parseFloat(maxPrice) || 10000
    } : undefined;

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
  }, [search, category, subcategory, location, businessType, minPrice, maxPrice, selectedTags]);

  const clearFilters = () => {
    setSearch('');
    setCategory('');
    setSubcategory('');
    setLocation('');
    setBusinessType('');
    setMinPrice('');
    setMaxPrice('');
    setSelectedTags([]);
    onFiltersChange({});
  };

  const hasActiveFilters = search || (category && category !== 'all') || (subcategory && subcategory !== 'all') || location || (businessType && businessType !== 'all') || minPrice || maxPrice || selectedTags.length > 0;

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
    <div className="flex flex-col gap-4 p-4 rounded-2xl border border-border bg-card/60 backdrop-blur-sm">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products and services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-11 h-11 rounded-xl"
            aria-label="Search products and services"
          />
        </div>
        <Button onClick={handleSearch} size="icon" className="h-11 w-11 rounded-xl" aria-label="Search">
          <Search style={{ height: 16, width: 16 }} />
        </Button>
        <Button
          variant={showAllFilters ? 'default' : 'outline'}
          onClick={() => setShowAllFilters(!showAllFilters)}
          size="icon"
          className="h-11 w-11 rounded-xl"
          aria-label="Toggle filters"
        >
          <Filter style={{ height: 16, width: 16 }} />
        </Button>
      </div>

      {showAllFilters && (
        <div className="flex flex-col gap-6 pt-5 mt-1 border-t border-border">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" aria-hidden="true" />
              Refine
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category" className="text-[11px] uppercase tracking-wider text-muted-foreground">Category</Label>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger className="h-11 rounded-xl">
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subcategory" className="text-[11px] uppercase tracking-wider text-muted-foreground">Subcategory</Label>
              <Select value={subcategory} onValueChange={setSubcategory} disabled={!category}>
                <SelectTrigger className="h-11 rounded-xl">
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="businessType" className="text-[11px] uppercase tracking-wider text-muted-foreground">Business Type</Label>
              <Select value={businessType} onValueChange={setBusinessType}>
                <SelectTrigger className="h-11 rounded-xl">
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location" className="text-[11px] uppercase tracking-wider text-muted-foreground">Location</Label>
              <Input
                id="location"
                placeholder="Enter city, state..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="minPrice" className="text-[11px] uppercase tracking-wider text-muted-foreground">Min Price</Label>
              <Input
                id="minPrice"
                type="number"
                placeholder="$0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maxPrice" className="text-[11px] uppercase tracking-wider text-muted-foreground">Max Price</Label>
              <Input
                id="maxPrice"
                type="number"
                placeholder="No limit"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="h-11 rounded-xl"
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
            <Button onClick={handleSearch} className="rounded-full h-10 px-5">
              <Sliders style={{ height: 16, width: 16, marginRight: 6 }} />
              Apply Filters
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="rounded-full h-10 px-5">
                <X style={{ height: 16, width: 16, marginRight: 6 }} />
                Clear All
              </Button>
            )}
          </div>
        </div>
      )}

      {hasActiveFilters && !showAllFilters && (
        <div className="flex flex-wrap gap-1.5 items-center pt-1 px-1">
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
          {(minPrice || maxPrice) && (
            <Badge variant="secondary">
              Price: ${minPrice || '0'} - ${maxPrice || '∞'}
              <X style={{ height: 12, width: 12, cursor: 'pointer' }} onClick={() => { setMinPrice(''); setMaxPrice(''); }} />
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
