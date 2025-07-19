import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { MapPin, Calendar, Star, Eye, Heart, Users, ShoppingBag, Newspaper, Globe, Plane, FileText, Search, Filter } from 'lucide-react';
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

  const query = searchParams.get('q') || '';
  const initialTypes = searchParams.get('types')?.split(',') || [];
  const initialLocation = searchParams.get('location') || undefined;
  const initialCategories = searchParams.get('categories')?.split(',') || [];

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

  const renderResultCard = (result: SearchResult) => {
    const Icon = contentTypeIcons[result.type];
    
    return (
      <Card key={`${result.type}-${result.id}`} className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {result.imageUrl && (
              <div className="flex-shrink-0">
                <img 
                  src={result.imageUrl} 
                  alt={result.title}
                  className="w-16 h-16 object-cover rounded-lg"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="secondary" className="text-xs">
                      {result.type}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-lg leading-tight mb-1">{result.title}</h3>
                  {result.description && (
                    <p className="text-muted-foreground text-sm line-clamp-2 mb-2">
                      {result.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
                        <Star className="h-3 w-3" />
                        {result.rating}
                      </div>
                    )}
                    {result.price && (
                      <div className="font-medium text-primary">
                        ${result.price}
                      </div>
                    )}
                  </div>
                  {result.tags && result.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {result.tags.slice(0, 3).map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <Button variant="outline" size="sm">
                    View
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

  // Generate tabs based on available result types
  const availableTabs = ['all', ...Object.keys(resultsByType)];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Search Results</h1>
            <p className="text-muted-foreground">
              {loading ? 'Searching...' : `${totalResults} results for "${query}"`}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            Filters
          </Button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <Card className="mb-6">
            <SearchFiltersPanel filters={filters} onFiltersChange={handleFiltersChange} />
          </Card>
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
            <div className="space-y-4">
              {results.map(renderResultCard)}
            </div>
          </TabsContent>

          {Object.entries(resultsByType).map(([type, typeResults]) => (
            <TabsContent key={type} value={type}>
              <div className="space-y-4">
                {typeResults.map(renderResultCard)}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}