import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { MapPin, Calendar, Star, Eye, Heart, Users, ShoppingBag, Newspaper, Globe, Plane, FileText, Search, Filter, ArrowUpDown, Grid, List, TrendingUp, Clock, Sparkles } from 'lucide-react';
import { useUniversalSearch, SearchResult, SearchFilters } from '@/hooks/useUniversalSearch';
import { SearchFiltersPanel } from '@/components/search/SearchFiltersPanel';

const contentTypeIcons = {
  venue: MapPin,
  event: Calendar,
  marketplace: ShoppingBag,
  user: Users,
  news: Newspaper,
  location: Globe,
  content: FileText,
  travel: Plane
};

export default function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTab, setSelectedTab] = useState('all');
  const [sortBy, setSortBy] = useState('relevance');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchParams.get('q') || '';
  const initialTypes = searchParams.get('types')?.split(',') || [];
  const initialLocation = searchParams.get('location') || undefined;
  const initialCategories = searchParams.get('categories')?.split(',') || [];

  // Initialize search query state
  useEffect(() => {
    setSearchQuery(query);
  }, [query]);

  const [filters, setFilters] = useState<SearchFilters>({
    types: initialTypes,
    location: initialLocation,
    categories: initialCategories.length > 0 ? initialCategories : undefined
  });

  const { results, loading } = useUniversalSearch(query, {
    ...filters,
    types: selectedTab === 'all' ? filters.types : [selectedTab]
  });

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    
    // Update URL parameters
    const params = new URLSearchParams(searchParams);
    if (newFilters.types.length > 0) {
      params.set('types', newFilters.types.join(','));
    } else {
      params.delete('types');
    }
    if (newFilters.location) {
      params.set('location', newFilters.location);
    } else {
      params.delete('location');
    }
    if (newFilters.categories && newFilters.categories.length > 0) {
      params.set('categories', newFilters.categories.join(','));
    } else {
      params.delete('categories');
    }
    setSearchParams(params);
  };

  const getResultsByType = () => {
    return results.reduce((acc, result) => {
      if (!acc[result.type]) acc[result.type] = [];
      acc[result.type].push(result);
      return acc;
    }, {} as Record<string, SearchResult[]>);
  };

  const formatResultDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
  };

  const sortResults = (results: SearchResult[]) => {
    const sorted = [...results];
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());
      case 'rating':
        return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      case 'price-low':
        return sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
      case 'price-high':
        return sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
      case 'popular':
        return sorted.sort((a, b) => (b.metadata?.viewsCount || 0) - (a.metadata?.viewsCount || 0));
      default:
        return sorted;
    }
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    const params = new URLSearchParams(searchParams);
    params.set('q', searchQuery);
    setSearchParams(params);
  };

  const renderResultCard = (result: SearchResult) => {
    const Icon = contentTypeIcons[result.type];
    
    if (viewMode === 'grid') {
      return (
        <Card key={`${result.type}-${result.id}`} className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
          <div className="relative">
            {result.imageUrl ? (
              <div className="aspect-video relative overflow-hidden rounded-t-lg">
                <img 
                  src={result.imageUrl} 
                  alt={result.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute top-2 left-2">
                  <Badge variant="secondary" className="text-xs backdrop-blur-sm bg-background/80">
                    <Icon className="h-3 w-3 mr-1" />
                    {result.type}
                  </Badge>
                </div>
                {result.metadata?.featured && (
                  <div className="absolute top-2 right-2">
                    <Badge className="text-xs backdrop-blur-sm">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Featured
                    </Badge>
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-video bg-muted rounded-t-lg flex items-center justify-center">
                <Icon className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>
          <CardContent className="p-4">
            <h3 className="font-semibold text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">
              {result.title}
            </h3>
            {result.description && (
              <p className="text-muted-foreground text-sm line-clamp-2 mb-3">
                {result.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-3">
              {result.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {result.location}
                </div>
              )}
              {result.rating && (
                <div className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  {result.rating}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              {result.price ? (
                <div className="font-semibold text-lg text-primary">
                  ${result.price}
                </div>
              ) : (
                <div />
              )}
              <Button variant="outline" size="sm" className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                View
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card key={`${result.type}-${result.id}`} className="group hover:shadow-md transition-all duration-200 hover:border-primary/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {result.imageUrl && (
              <div className="flex-shrink-0">
                <img 
                  src={result.imageUrl} 
                  alt={result.title}
                  className="w-20 h-20 object-cover rounded-lg group-hover:scale-105 transition-transform duration-200"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="secondary" className="text-xs">
                      {result.type}
                    </Badge>
                    {result.metadata?.featured && (
                      <Badge className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Featured
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-semibold text-xl leading-tight mb-2 group-hover:text-primary transition-colors">
                    {result.title}
                  </h3>
                  {result.description && (
                    <p className="text-muted-foreground text-sm line-clamp-2 mb-3">
                      {result.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3">
                    {result.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {result.location}
                      </div>
                    )}
                    {result.date && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatResultDate(result.date)}
                      </div>
                    )}
                    {result.rating && (
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {result.rating}
                      </div>
                    )}
                    {result.metadata?.viewsCount && (
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {result.metadata.viewsCount} views
                      </div>
                    )}
                  </div>
                  {result.tags && result.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {result.tags.slice(0, 4).map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {result.tags.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{result.tags.length - 4} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {result.price && (
                    <div className="font-semibold text-xl text-primary">
                      ${result.price}
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    View Details
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const resultsByType = getResultsByType();
  const totalResults = results.length;
  const sortedResults = sortResults(results);
  const sortedResultsByType = Object.entries(resultsByType).reduce((acc, [type, typeResults]) => {
    acc[type] = sortResults(typeResults);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  // Generate tabs based on available result types
  const availableTabs = ['all', ...Object.keys(resultsByType)];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
              Search Results
            </h1>
            <p className="text-muted-foreground text-lg">
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                  Searching across all content...
                </span>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{totalResults}</span> results found for{' '}
                  <span className="font-medium text-primary">"{query}"</span>
                </>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
              {Object.values(filters).some(v => v && (Array.isArray(v) ? v.length > 0 : true)) && (
                <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 text-xs">
                  !
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Enhanced Search Bar */}
        <div className="flex gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Refine your search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button onClick={handleSearch} className="bg-gradient-primary">
            Search
          </Button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <Card className="mb-6 border-primary/20 shadow-lg">
            <SearchFiltersPanel filters={filters} onFiltersChange={handleFiltersChange} />
          </Card>
        )}

        {/* Results Controls */}
        {!loading && results.length > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Sort by:</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3 w-3" />
                        Relevance
                      </div>
                    </SelectItem>
                    <SelectItem value="newest">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        Newest
                      </div>
                    </SelectItem>
                    <SelectItem value="rating">
                      <div className="flex items-center gap-2">
                        <Star className="h-3 w-3" />
                        Highest Rated
                      </div>
                    </SelectItem>
                    <SelectItem value="popular">
                      <div className="flex items-center gap-2">
                        <Eye className="h-3 w-3" />
                        Most Popular
                      </div>
                    </SelectItem>
                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">View:</span>
              <div className="flex items-center border rounded-lg">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="rounded-r-none"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="rounded-l-none"
                >
                  <Grid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
            <p className="text-muted-foreground">Searching across all content types...</p>
          </div>
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No results found</h3>
          <p className="text-muted-foreground mb-4">
            Try adjusting your search query or filters
          </p>
          <Button variant="outline" onClick={() => setShowFilters(true)}>
            Adjust Filters
          </Button>
        </div>
      ) : (
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="all">All ({totalResults})</TabsTrigger>
            {Object.entries(resultsByType).map(([type, typeResults]) => {
              const Icon = contentTypeIcons[type as keyof typeof contentTypeIcons];
              return (
                <TabsTrigger key={type} value={type} className="flex items-center gap-1">
                  <Icon className="h-3 w-3" />
                  {type} ({typeResults.length})
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="all">
            <div className={viewMode === 'grid' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' 
              : 'space-y-4'
            }>
              {sortedResults.map(renderResultCard)}
            </div>
          </TabsContent>

          {Object.entries(sortedResultsByType).map(([type, typeResults]) => (
            <TabsContent key={type} value={type}>
              <div className={viewMode === 'grid' 
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' 
                : 'space-y-4'
              }>
                {typeResults.map(renderResultCard)}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}