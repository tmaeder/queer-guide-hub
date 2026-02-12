import { useState, useEffect } from "react";
import { useNews } from "@/hooks/useNews";
import { useMeta } from "@/hooks/useMeta";
import { NewsCard } from "@/components/news/NewsCard";
import { NewsFilters } from "@/components/news/NewsFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Newspaper, Loader, Search, Grid3X3, List, SortAsc, SortDesc, Filter, X, Calendar, Eye, Clock, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

interface SortOption {
  value: string;
  label: string;
  field: string;
  order: 'asc' | 'desc';
}
const sortOptions: SortOption[] = [{
  value: 'date-desc',
  label: 'Newest First',
  field: 'published_at',
  order: 'desc'
}, {
  value: 'date-asc',
  label: 'Oldest First',
  field: 'published_at',
  order: 'asc'
}, {
  value: 'views-desc',
  label: 'Most Viewed',
  field: 'views_count',
  order: 'desc'
}, {
  value: 'views-asc',
  label: 'Least Viewed',
  field: 'views_count',
  order: 'asc'
}, {
  value: 'title-asc',
  label: 'Title A-Z',
  field: 'title',
  order: 'asc'
}, {
  value: 'title-desc',
  label: 'Title Z-A',
  field: 'title',
  order: 'desc'
}];
export default function News() {
  useMeta({
    title: 'News',
    description: 'Stay informed with the latest LGBTQ+ news and stories from around the world.',
    canonicalPath: '/news',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'LGBTQ+ News',
      description: 'Stay informed with the latest LGBTQ+ news and stories from around the world.',
      url: 'https://queer.guide/news',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });

  const {
    articles,
    sources,
    loading,
    error,
    fetchArticles,
    incrementViews,
    getFeaturedArticles,
    getTrendingTags
  } = useNews();
  const [featuredArticles, setFeaturedArticles] = useState<any[]>([]);
  const [trendingTags, setTrendingTags] = useState<{
    tag: string;
    count: number;
  }[]>([]);
  // Manual import functionality removed - news is now automatically imported via cron job
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState('date-desc');
  const [quickSearch, setQuickSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentFilters, setCurrentFilters] = useState<any>({});
  // Manual import removed - news is now automatically imported via cron job
  useEffect(() => {
    const loadAdditionalData = async () => {
      const [featured, trending] = await Promise.all([getFeaturedArticles(), getTrendingTags()]);
      setFeaturedArticles(featured);
      setTrendingTags(trending);
    };
    if (!loading) {
      loadAdditionalData();
    }
  }, [loading]);
  const handleFiltersChange = (filters: any) => {
    setCurrentFilters(filters);
    fetchArticles(filters);
  };
  const handleQuickSearch = (value: string) => {
    setQuickSearch(value);
    const filters = {
      ...currentFilters,
      search: value || undefined
    };
    setCurrentFilters(filters);
    fetchArticles(filters);
  };
  const handleSortChange = (value: string) => {
    setSortBy(value);
    // Note: Sorting would need to be implemented in the useNews hook
    // For now, we'll sort locally
    const option = sortOptions.find(opt => opt.value === value);
    if (option) {
      // Local sorting implementation
      setCurrentFilters((prev: any) => ({
        ...prev,
        sortBy: value
      }));
    }
  };
  const handleViewArticle = (articleId: string) => {
    incrementViews(articleId);
  };
  const getSortedArticles = () => {
    const option = sortOptions.find(opt => opt.value === sortBy);
    if (!option) return articles;
    return [...articles].sort((a, b) => {
      let aVal, bVal;
      switch (option.field) {
        case 'published_at':
          aVal = new Date(a.published_at).getTime();
          bVal = new Date(b.published_at).getTime();
          break;
        case 'views_count':
          aVal = a.views_count || 0;
          bVal = b.views_count || 0;
          break;
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        default:
          return 0;
      }
      if (option.order === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  };
  const clearAllFilters = () => {
    setQuickSearch('');
    setCurrentFilters({});
    fetchArticles({});
  };
  const hasActiveFilters = quickSearch || Object.keys(currentFilters).length > 0;
  if (error) {
    return <Container maxWidth="lg" sx={{ py: 4 }}>
        <Card style={{ borderColor: 'var(--destructive)', borderWidth: 1, opacity: 0.8 }}>
          <CardContent sx={{ pt: 3 }}>
            <Typography color="error">Something went wrong while loading news. Please try again later.</Typography>
          </CardContent>
        </Card>
      </Container>;
  }
  return <Box sx={{ minHeight: '100vh' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Header */}
        <Card style={{ marginBottom: 24 }}>
          <CardContent style={{ padding: '24px 32px' }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, alignItems: { lg: 'center' }, justifyContent: { lg: 'space-between' }, gap: 3 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="h3" sx={{ fontWeight: 700 }}>
                  News
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">
                  Stay informed with the latest news and stories from the LGBTQ+ community worldwide
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Newspaper style={{ width: 16, height: 16 }} />
                    <Typography variant="body2" color="text.secondary">{articles.length} articles</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TrendingUp style={{ width: 16, height: 16 }} />
                    <Typography variant="body2" color="text.secondary">{sources.length} sources</Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Quick Search & Controls */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 2, mb: 3 }}>
          {/* Quick Search */}
          <Box sx={{ position: 'relative', flex: 1, maxWidth: '28rem' }}>
            <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--muted-foreground)' }} />
            <Input placeholder="Quick search articles..." value={quickSearch} onChange={e => handleQuickSearch(e.target.value)} style={{ paddingLeft: 40, paddingRight: 40 }} />
            {quickSearch && <Button variant="ghost" size="sm" onClick={() => handleQuickSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', height: 24, width: 24, padding: 0 }}>
                <X style={{ width: 16, height: 16 }} />
              </Button>}
          </Box>

          {/* Controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {/* Sort */}
            <Select value={sortBy} onValueChange={handleSortChange}>
              <SelectTrigger style={{ width: 180 }}>
                <SortAsc style={{ width: 16, height: 16, marginRight: 8 }} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map(option => <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>)}
              </SelectContent>
            </Select>

            {/* View Mode */}
            <Box sx={{ display: 'flex', alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 2, p: 0.5 }}>
              <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('grid')} style={{ height: 32, width: 32, padding: 0 }}>
                <Grid3X3 style={{ width: 16, height: 16 }} />
              </Button>
              <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} style={{ height: 32, width: 32, padding: 0 }}>
                <List style={{ width: 16, height: 16 }} />
              </Button>
            </Box>

            {/* Advanced Filters Toggle */}
            <Button variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(!showFilters)} style={{ display: 'flex', gap: 8 }}>
              <Filter style={{ width: 16, height: 16 }} />
              Filters
              {hasActiveFilters && <Badge variant="secondary" style={{ marginLeft: 4, height: 20, width: 20, padding: 0, fontSize: '0.75rem' }}>
                  !
                </Badge>}
            </Button>
          </Box>
        </Box>

        {/* Active Filters Summary */}
        {hasActiveFilters && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Filter style={{ width: 16, height: 16 }} />
              <Typography variant="body2" color="text.secondary">Active filters applied</Typography>
              {quickSearch && <Badge variant="outline">Search: {quickSearch}</Badge>}
            </Box>
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              Clear All
            </Button>
          </Box>}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(4, 1fr)' }, gap: 3 }}>
          {/* Sidebar Filters */}
          {showFilters && <Box sx={{ gridColumn: { lg: 'span 1' } }}>
              <NewsFilters sources={sources} onFiltersChange={handleFiltersChange} trendingTags={trendingTags} />
            </Box>}

          {/* Main Content */}
          <Box sx={{ gridColumn: showFilters ? { lg: 'span 3' } : { lg: 'span 4' } }}>
            {/* Loading State */}
            {loading && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
                <Loader style={{ width: 32, height: 32, color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                <Typography color="text.secondary" sx={{ ml: 1 }}>Loading articles...</Typography>
              </Box>}

            {/* Empty State */}
            {!loading && getSortedArticles().length === 0 && <Card sx={{ p: 4, textAlign: 'center' }}>
                <CardContent>

                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>No articles found</Typography>

                  <Typography variant="body2" color="text.secondary">
                    News is automatically imported every 2 hours via cron job
                  </Typography>
                </CardContent>
              </Card>}

            {/* Articles */}
            {!loading && getSortedArticles().length > 0 && <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Results Summary */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Showing {getSortedArticles().length} article{getSortedArticles().length !== 1 ? 's' : ''}
                  </Typography>
                </Box>

                {/* Articles Grid/List */}
                <Box sx={viewMode === 'grid' ? { display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(3, 1fr)' }, gap: 3 } : { display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {getSortedArticles().map(article => <NewsCard key={article.id} article={article} onViewArticle={handleViewArticle} />)}
                </Box>
              </Box>}
          </Box>
        </Box>
      </Container>
    </Box>;
}
