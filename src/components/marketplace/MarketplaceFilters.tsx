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
    <div className="space-y-4 p-4 bg-card">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products and services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} className="bg-primary" size="icon">
          <Search className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowAllFilters(!showAllFilters)}
          size="icon"
        >
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Extended Filters */}
      {showAllFilters && (
        <div className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
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

            <div className="space-y-2">
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

            <div className="space-y-2">
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="Enter city, state..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="minPrice">Min Price</Label>
              <Input
                id="minPrice"
                type="number"
                placeholder="$0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
            </div>

            <div className="space-y-2">
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
            className="space-y-2"
          />

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSearch} className="bg-primary gap-2">
              <Sliders className="h-4 w-4" />
              Apply Filters
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="gap-2">
                <X className="h-4 w-4" />
                Clear All
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && !showAllFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {search && (
            <Badge variant="secondary" className="gap-1">
              Search: {search}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setSearch('')} />
            </Badge>
          )}
          {category && category !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              {category}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setCategory('')} />
            </Badge>
          )}
          {subcategory && subcategory !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              {subcategory}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setSubcategory('')} />
            </Badge>
          )}
          {location && (
            <Badge variant="secondary" className="gap-1">
              Location: {location}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setLocation('')} />
            </Badge>
          )}
          {businessType && businessType !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              {businessType}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setBusinessType('')} />
            </Badge>
          )}
          {(minPrice || maxPrice) && (
            <Badge variant="secondary" className="gap-1">
              Price: ${minPrice || '0'} - ${maxPrice || '∞'}
              <X className="h-3 w-3 cursor-pointer" onClick={() => { setMinPrice(''); setMaxPrice(''); }} />
            </Badge>
          )}
           {selectedTags.map((tag) => (
             <Badge key={tag} variant="secondary" className="gap-1">
               {tag}
               <X
                 className="h-3 w-3 cursor-pointer"
                 onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))}
               />
             </Badge>
           ))}
        </div>
      )}
    </div>
  );
}