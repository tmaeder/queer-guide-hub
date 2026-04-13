import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MapPin,
  Calendar,
  Star,
  Eye,
  Users,
  ShoppingBag,
  Newspaper,
  Globe,
  Plane,
  FileText,
  Search,
  Filter,
  ArrowUpDown,
  Grid,
  List,
  TrendingUp,
  Clock,
  Sparkles,
  Tag,
  User,
  Hotel,
  Tent,
  HelpCircle,
} from 'lucide-react';
import { useSearch, SearchResult, SearchFilters } from '@/hooks/useSearch';
import { SearchFiltersPanel } from '@/components/search/SearchFiltersPanel';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

const contentTypeIcons: Record<string, React.ComponentType<{ style?: React.CSSProperties }>> = {
  venue: MapPin,
  venues: MapPin,
  event: Calendar,
  events: Calendar,
  marketplace: ShoppingBag,
  user: Users,
  news: Newspaper,
  location: Globe,
  cities: Globe,
  countries: Globe,
  content: FileText,
  ressource: FileText,
  travel: Plane,
  personality: User,
  personalities: User,
  tag: Tag,
  tags: Tag,
  group: Users,
  hotels: Hotel,
  queer_villages: MapPin,
  festivals: Tent,
};

export default function SearchResults() {
  const theme = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTab, setSelectedTab] = useState('all');
  const initialSort = searchParams.get('sort') || 'relevance';
  const [sortBy, setSortBy] = useState(initialSort);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchParams.get('q') || '';
  const initialTypes = searchParams.get('types')?.split(',') || [];
  const initialLocation = searchParams.get('location') || undefined;
  const initialCategories = searchParams.get('categories')?.split(',') || [];

  useEffect(() => {
    setSearchQuery(query);
  }, [query]);

  const [filters, setFilters] = useState<SearchFilters>({
    types: initialTypes,
    location: initialLocation,
    categories: initialCategories.length > 0 ? initialCategories : undefined,
  });

  const { results, loading } = useSearch(query, {
    ...filters,
    types: selectedTab === 'all' ? filters.types : [selectedTab],
  });

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    const params = new URLSearchParams(searchParams);
    if (newFilters.types && newFilters.types.length > 0) {
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

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (sortBy && sortBy !== 'relevance') {
      params.set('sort', sortBy);
    } else {
      params.delete('sort');
    }
    setSearchParams(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams/setSearchParams are from useSearchParams, stable refs; only re-run on sortBy
  }, [sortBy]);

  const getResultsByType = () => {
    return results.reduce(
      (acc, result) => {
        if (!acc[result.type]) acc[result.type] = [];
        acc[result.type].push(result);
        return acc;
      },
      {} as Record<string, SearchResult[]>,
    );
  };

  const formatResultDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
  };

  const sortResults = (results: SearchResult[]) => {
    const sorted = [...results];
    switch (sortBy) {
      case 'newest':
        return sorted.sort(
          (a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime(),
        );
      case 'oldest':
        return sorted.sort(
          (a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime(),
        );
      case 'rating':
        return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      case 'price-low':
        return sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
      case 'price-high':
        return sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
      case 'popular':
        return sorted.sort((a, b) => (b.metadata?.viewsCount || 0) - (a.metadata?.viewsCount || 0));
      case 'alpha-asc':
        return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'alpha-desc':
        return sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
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

  const navigateToResult = (result: SearchResult) => {
    const slug = result.metadata?.slug || result.objectID;
    switch (result.type) {
      case 'venue':
      case 'venues':
        navigate(`/venues/${slug}`);
        break;
      case 'event':
      case 'events':
        navigate(`/events/${slug}`);
        break;
      case 'marketplace':
        navigate(`/marketplace/${slug}`);
        break;
      case 'user':
      case 'personalities':
      case 'personality':
        navigate(`/personalities/${slug}`);
        break;
      case 'news':
        navigate(`/news/${slug}`);
        break;
      case 'cities':
      case 'location':
        if (result.metadata?.isCountry) {
          navigate(`/country/${slug}`);
        } else {
          navigate(`/city/${slug}`);
        }
        break;
      case 'countries':
        navigate(`/country/${slug}`);
        break;
      case 'content':
      case 'ressource':
      case 'tags':
      case 'tag':
        navigate(`/resources/${slug}`);
        break;
      case 'hotels':
      case 'festivals':
      case 'queer_villages':
      case 'travel':
        navigate('/places');
        break;
      default:
        navigate(`/search?q=${encodeURIComponent(result.title)}`);
        break;
    }
  };

  const renderResultCard = (result: SearchResult) => {
    const Icon = contentTypeIcons[result.type] || HelpCircle;

    if (viewMode === 'grid') {
      return (
        <Card
          key={`${result.type}-${result.objectID}`}
          sx={{
            '&:hover': { boxShadow: 6, transform: 'translateY(-4px)' },
            transition: 'all 0.2s',
            cursor: 'pointer',
          }}
          onClick={() => navigateToResult(result)}
        >
          <Box sx={{ position: 'relative' }}>
            {result.imageUrl ? (
              <Box
                sx={{
                  aspectRatio: '16/9',
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: '8px 8px 0 0',
                }}
              >
                <Box
                  component="img"
                  src={result.imageUrl}
                  alt={result.title}
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 0.2s',
                  }}
                />
                <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                  <Badge
                    variant="secondary"
                    style={{ fontSize: '0.75rem', background: theme.palette.background.paper }}
                  >
                    <Icon style={{ width: 12, height: 12, marginRight: 4 }} />
                    {result.type}
                  </Badge>
                </Box>
                {result.metadata?.featured && (
                  <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                    <Badge style={{ fontSize: '0.75rem' }}>
                      <Sparkles style={{ width: 12, height: 12, marginRight: 4 }} />
                      Featured
                    </Badge>
                  </Box>
                )}
              </Box>
            ) : (
              <Box
                sx={{
                  aspectRatio: '16/9',
                  bgcolor: 'action.hover',
                  borderRadius: '8px 8px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon style={{ width: 48, height: 48, color: theme.palette.text.secondary }} />
              </Box>
            )}
          </Box>
          <CardContent style={{ padding: 16 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                mb: 1,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {result.title}
            </Typography>
            {result.description && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  mb: 1.5,
                }}
              >
                {result.description}
              </Typography>
            )}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1.5 }}>
              {result.location && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <MapPin style={{ width: 12, height: 12 }} />
                  <Typography variant="caption" color="text.secondary">
                    {result.location}
                  </Typography>
                </Box>
              )}
              {result.rating && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Star style={{ width: 12, height: 12, fill: '#facc15', color: '#facc15' }} />
                  <Typography variant="caption" color="text.secondary">
                    {result.rating}
                  </Typography>
                </Box>
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {result.price ? (
                <Typography sx={{ fontWeight: 600, fontSize: '1.125rem', color: 'primary.main' }}>
                  ${result.price}
                </Typography>
              ) : (
                <Box />
              )}
              <Button
                variant="outline"
                size="sm"
                style={{ transition: 'color 0.15s, background-color 0.15s' }}
              >
                View
              </Button>
            </Box>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card
        key={`${result.type}-${result.objectID}`}
        sx={{
          '&:hover': { boxShadow: 4, borderColor: 'primary.main' },
          transition: 'all 0.2s',
          cursor: 'pointer',
        }}
        onClick={() => navigateToResult(result)}
      >
        <CardContent style={{ padding: 16 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            {result.imageUrl && (
              <Box sx={{ flexShrink: 0 }}>
                <Box
                  component="img"
                  src={result.imageUrl}
                  alt={result.title}
                  sx={{
                    width: 80,
                    height: 80,
                    objectFit: 'cover',
                    borderRadius: 2,
                    transition: 'transform 0.2s',
                  }}
                />
              </Box>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 1,
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Icon style={{ width: 16, height: 16, color: theme.palette.text.secondary }} />
                    <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
                      {result.type}
                    </Badge>
                    {result.metadata?.featured && (
                      <Badge style={{ fontSize: '0.75rem' }}>
                        <Sparkles style={{ width: 12, height: 12, marginRight: 4 }} />
                        Featured
                      </Badge>
                    )}
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    {result.title}
                  </Typography>
                  {result.description && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        mb: 1.5,
                      }}
                    >
                      {result.description}
                    </Typography>
                  )}
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 2,
                      mb: 1.5,
                    }}
                  >
                    {result.location && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <MapPin style={{ width: 12, height: 12 }} />
                        <Typography variant="body2" color="text.secondary">
                          {result.location}
                        </Typography>
                      </Box>
                    )}
                    {result.date && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Calendar style={{ width: 12, height: 12 }} />
                        <Typography variant="body2" color="text.secondary">
                          {formatResultDate(result.date)}
                        </Typography>
                      </Box>
                    )}
                    {result.rating && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Star
                          style={{ width: 12, height: 12, fill: '#facc15', color: '#facc15' }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          {result.rating}
                        </Typography>
                      </Box>
                    )}
                    {result.metadata?.viewsCount && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Eye style={{ width: 12, height: 12 }} />
                        <Typography variant="body2" color="text.secondary">
                          {result.metadata.viewsCount} views
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  {result.metadata?.tags && result.metadata.tags.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {result.metadata.tags.slice(0, 4).map((tag: string, index: number) => (
                        <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                          {tag}
                        </Badge>
                      ))}
                      {result.metadata.tags.length > 4 && (
                        <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                          +{result.metadata.tags.length - 4} more
                        </Badge>
                      )}
                    </Box>
                  )}
                </Box>
                <Box
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}
                >
                  {result.price && (
                    <Typography
                      sx={{ fontWeight: 600, fontSize: '1.25rem', color: 'primary.main' }}
                    >
                      ${result.price}
                    </Typography>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    style={{ transition: 'color 0.15s, background-color 0.15s' }}
                  >
                    View Details
                  </Button>
                </Box>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  };

  const resultsByType = getResultsByType();
  const totalResults = results.length;
  const sortedResults = sortResults(results);
  const sortedResultsByType = Object.entries(resultsByType).reduce(
    (acc, [type, typeResults]) => {
      acc[type] = sortResults(typeResults);
      return acc;
    },
    {} as Record<string, SearchResult[]>,
  );

  const _availableTabs = ['all', ...Object.keys(resultsByType)];

  return (
    <Container sx={{ px: 2, py: 4 }}>
      {/* Header */}
      <PageHeader
        title="Search Results"
        subtitle={
          loading
            ? 'Searching across all content...'
            : query
              ? `${totalResults} results found for "${query}"`
              : undefined
        }
        actions={
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Filter style={{ width: 16, height: 16 }} />
            Filters
            {Object.values(filters).some((v) => v && (Array.isArray(v) ? v.length > 0 : true)) && (
              <Badge
                variant="destructive"
                style={{ marginLeft: 4, height: 20, width: 20, padding: 0, fontSize: '0.75rem' }}
              >
                !
              </Badge>
            )}
          </Button>
        }
      >
        {/* Enhanced Search Bar */}
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Box sx={{ flex: 1, position: 'relative' }}>
            <Search
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 16,
                height: 16,
                color: theme.palette.text.secondary,
              }}
            />
            <Input
              placeholder="Refine your search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ paddingLeft: 40 }}
            />
          </Box>
          <Button onClick={handleSearch}>Search</Button>
        </Box>
      </PageHeader>

      {/* Filters Panel */}
      {showFilters && (
        <Card sx={{ mb: 3, borderColor: 'primary.main', boxShadow: 6 }}>
          <SearchFiltersPanel filters={filters} onFiltersChange={handleFiltersChange} />
        </Card>
      )}

      {/* Results Controls */}
      {!loading && results.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'flex-start', sm: 'center' },
            justifyContent: 'space-between',
            gap: 2,
            mb: 3,
            p: 2,
            bgcolor: 'action.hover',
            borderRadius: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Sort by:
              </Typography>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger style={{ width: 160 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  style={{ zIndex: 50, backgroundColor: theme.palette.background.paper }}
                >
                  <SelectItem value="relevance">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingUp style={{ width: 12, height: 12 }} />
                      Relevance
                    </Box>
                  </SelectItem>
                  <SelectItem value="newest">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Clock style={{ width: 12, height: 12 }} />
                      Newest
                    </Box>
                  </SelectItem>
                  <SelectItem value="oldest">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Clock style={{ width: 12, height: 12, transform: 'rotate(180deg)' }} />
                      Oldest
                    </Box>
                  </SelectItem>
                  <SelectItem value="rating">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Star style={{ width: 12, height: 12 }} />
                      Highest Rated
                    </Box>
                  </SelectItem>
                  <SelectItem value="popular">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Eye style={{ width: 12, height: 12 }} />
                      Most Popular
                    </Box>
                  </SelectItem>
                  <SelectItem value="price-low">Price: Low to High</SelectItem>
                  <SelectItem value="price-high">Price: High to Low</SelectItem>
                  <SelectItem value="alpha-asc">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ArrowUpDown style={{ width: 12, height: 12 }} />A - Z
                    </Box>
                  </SelectItem>
                  <SelectItem value="alpha-desc">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ArrowUpDown style={{ width: 12, height: 12, transform: 'rotate(180deg)' }} />
                      Z - A
                    </Box>
                  </SelectItem>
                </SelectContent>
              </Select>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              View:
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                borderRadius: 2,
              }}
            >
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
              >
                <List style={{ width: 16, height: 16 }} />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
              >
                <Grid style={{ width: 16, height: 16 }} />
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* Results */}
      {loading ? (
        <PageLoadingState count={6} variant={viewMode === 'grid' ? 'card' : 'list'} />
      ) : results.length === 0 ? (
        <>
          {/* Search Suggestions -- shown when query is empty */}
          {(!query || query.trim() === '') && (
            <Card sx={{ p: 4 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  Try searching for...
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
                  {[
                    'Berlin venues',
                    'Pride events',
                    'Drag shows',
                    'LGBTQ+ history',
                    'Queer artists',
                    'Safe spaces',
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const params = new URLSearchParams(searchParams);
                        params.set('q', suggestion);
                        setSearchParams(params);
                      }}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Or browse by category:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {[
                    { label: 'Venues', path: '/venues' },
                    { label: 'Events', path: '/events' },
                    { label: 'Personalities', path: '/personalities' },
                    { label: 'News', path: '/news' },
                    { label: 'Places', path: '/places' },
                    { label: 'Resources', path: '/resources' },
                  ].map((cat) => (
                    <Button
                      key={cat.label}
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(cat.path)}
                    >
                      {cat.label}
                    </Button>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* No results -- shown when there IS a query but no results */}
          {query && query.trim() !== '' && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 6,
                textAlign: 'center',
              }}
            >
              <Search
                style={{
                  width: 48,
                  height: 48,
                  color: theme.palette.text.secondary,
                  marginBottom: 16,
                }}
              />
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                No results found
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Try adjusting your search query or filters
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button variant="outline" onClick={() => setShowFilters(true)}>
                  Adjust Filters
                </Button>
              </Box>
              <Box sx={{ mt: 4 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Or try one of these searches:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
                  {[
                    'Berlin venues',
                    'Pride events',
                    'Drag shows',
                    'LGBTQ+ history',
                    'Queer artists',
                    'Safe spaces',
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const params = new URLSearchParams(searchParams);
                        params.set('q', suggestion);
                        setSearchParams(params);
                      }}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </Box>
              </Box>
            </Box>
          )}
        </>
      ) : (
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList style={{ marginBottom: 24 }}>
            <TabsTrigger value="all">All ({totalResults})</TabsTrigger>
            {Object.entries(resultsByType).map(([type, typeResults]) => {
              const Icon = contentTypeIcons[type] || HelpCircle;
              return (
                <TabsTrigger
                  key={type}
                  value={type}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Icon style={{ width: 12, height: 12 }} />
                  {type} ({typeResults.length})
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="all">
            <Box
              sx={
                viewMode === 'grid'
                  ? {
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        md: '1fr 1fr',
                        lg: 'repeat(3, 1fr)',
                        xl: 'repeat(4, 1fr)',
                      },
                      gap: 3,
                    }
                  : { display: 'flex', flexDirection: 'column', gap: 2 }
              }
            >
              {sortedResults.map(renderResultCard)}
            </Box>
          </TabsContent>

          {Object.entries(sortedResultsByType).map(([type, typeResults]) => (
            <TabsContent key={type} value={type}>
              <Box
                sx={
                  viewMode === 'grid'
                    ? {
                        display: 'grid',
                        gridTemplateColumns: {
                          xs: '1fr',
                          md: '1fr 1fr',
                          lg: 'repeat(3, 1fr)',
                          xl: 'repeat(4, 1fr)',
                        },
                        gap: 3,
                      }
                    : { display: 'flex', flexDirection: 'column', gap: 2 }
                }
              >
                {typeResults.map(renderResultCard)}
              </Box>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </Container>
  );
}
