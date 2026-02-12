import React from 'react';
import { useState } from 'react';
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

interface MarketplaceFiltersProps {
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


export function MarketplaceFilters({ onFiltersChange }: MarketplaceFiltersProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [location, setLocation] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAllFilters, setShowAllFilters] = useState(false);

  const handleSearch = () => {
    const priceRange = minPrice || maxPrice ? {
      min: parseFloat(minPrice) || 0,
      max: parseFloat(maxPrice) || 10000
    } : undefined;

    onFiltersChange({
      search: search || undefined,
      category: category === 'all' ? undefined : category || undefined,
      subcategory: subcategory === 'all' ? undefined : subcategory || undefined,
      location: location || undefined,
      businessType: businessType === 'all' ? undefined : businessType || undefined,
      priceRange,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
    });
  };


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

  // Reset subcategory when category changes
  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    setSubcategory('');
  };

  return (
    <div sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, bgcolor: 'background.paper' }}>
      {/* Search Bar */}
      <div sx={{ display: 'flex', gap: 1 }}>
        <div sx={{ position: 'relative', flex: 1 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
          <Input
            placeholder="Search products and services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            sx={{ pl: 4.5 }}
          />
        </div>
        <Button onClick={handleSearch} sx={{ bgcolor: 'primary.main' }} size="icon" aria-label="Search">
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

      {/* Extended Filters */}
      {showAllFilters && (
        <div sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="Enter city, state..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="minPrice">Min Price</Label>
              <Input
                id="minPrice"
                type="number"
                placeholder="$0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
            </div>

            <div sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="maxPrice">Max Price</Label>
              <Input
                id="maxPrice"
                type="number"
                placeholder="No limit"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </div>
          </div>

          {/* Tags */}
          <TagSelector
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            placeholder="Select marketplace tags..."
            maxTags={10}
            categories={['business', 'commerce', 'product', 'service', 'identity']}
            sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
          />

          {/* Action Buttons */}
          <div sx={{ display: 'flex', gap: 1, pt: 1 }}>
            <Button onClick={handleSearch} sx={{ bgcolor: 'primary.main', gap: 1 }}>
              <Sliders style={{ height: 16, width: 16 }} />
              Apply Filters
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} sx={{ gap: 1 }}>
                <X style={{ height: 16, width: 16 }} />
                Clear All
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && !showAllFilters && (
        <div sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <span sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Active filters:</span>
          {search && (
            <Badge variant="secondary" sx={{ gap: 0.5 }}>
              Search: {search}
              <X style={{ height: 12, width: 12, cursor: 'pointer' }} onClick={() => setSearch('')} />
            </Badge>
          )}
          {category && category !== 'all' && (
            <Badge variant="secondary" sx={{ gap: 0.5 }}>
              {category}
              <X style={{ height: 12, width: 12, cursor: 'pointer' }} onClick={() => setCategory('')} />
            </Badge>
          )}
          {subcategory && subcategory !== 'all' && (
            <Badge variant="secondary" sx={{ gap: 0.5 }}>
              {subcategory}
              <X style={{ height: 12, width: 12, cursor: 'pointer' }} onClick={() => setSubcategory('')} />
            </Badge>
          )}
          {location && (
            <Badge variant="secondary" sx={{ gap: 0.5 }}>
              Location: {location}
              <X style={{ height: 12, width: 12, cursor: 'pointer' }} onClick={() => setLocation('')} />
            </Badge>
          )}
          {businessType && businessType !== 'all' && (
            <Badge variant="secondary" sx={{ gap: 0.5 }}>
              {businessType}
              <X style={{ height: 12, width: 12, cursor: 'pointer' }} onClick={() => setBusinessType('')} />
            </Badge>
          )}
          {(minPrice || maxPrice) && (
            <Badge variant="secondary" sx={{ gap: 0.5 }}>
              Price: ${minPrice || '0'} - ${maxPrice || '∞'}
              <X style={{ height: 12, width: 12, cursor: 'pointer' }} onClick={() => { setMinPrice(''); setMaxPrice(''); }} />
            </Badge>
          )}
           {selectedTags.map((tag) => (
             <Badge key={tag} variant="secondary" sx={{ gap: 0.5 }}>
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