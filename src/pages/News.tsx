import { useState, useEffect, useMemo } from "react";
import { useNews } from "@/hooks/useNews";
import { useMeta } from "@/hooks/useMeta";
import { NewsCard } from "@/components/news/NewsCard";
import { NewsFilters } from "@/components/news/NewsFilters";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageLoadingState } from "@/components/layout/PageLoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, LoadingTimeout, ErrorState } from '@/components/ui/EmptyState';
import { Newspaper, Search, Grid3X3, List, SortAsc, Filter, X, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";

const ARTICLES_PER_PAGE = 24;

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
    getTrendingTags,
    loadingTimedOut
  } = useNews();
  const [featuredArticles, setFeaturedArticles] = useState<any[]>([]);
  const [trendingTags, setTrendingTags] = useState<{
    tag: string;
    count: number;
  }[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState('date-desc');
  const [quickSearch, setQuickSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [currentFilters, setCurrentFilters] = useState<any>({});
  const [currentPage, setCurrentPage] = useState(1);

  // City/country name lookup maps for location display
  const [cityNames, setCityNames] = useState<Record<string, string>>({});
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});

  // Build a sources lookup map (source_id → {id, name, url})
  const sourcesMap = useMemo(() => {
    const map: Record<string, { id: string; name: string; url?: string }> = {};
    sources.forEach((s: any) => { map[s.id] = s; });
    return map;
  }, [sources]);

  // Load city/country names once for all articles
  useEffect(() => {
    if (articles.length === 0) return;
    const allCityIds = new Set<string>();
    const allCountryIds = new Set<string>();
    articles.forEach((a: any) => {
      (a.city_ids || []).forEach((id: string) => allCityIds.add(id));
      (a.country_ids || []).forEach((id: string) => allCountryIds.add(id));
    });

    const fetchNames = async () => {
      if (allCityIds.size > 0) {
        const { data } = await supabase
          .from('cities')
          .select('id, name')
          .in('id', Array.from(allCityIds));
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((c: any) => { map[c.id] = c.name; });
          setCityNames(map);
        }
      }
      if (allCountryIds.size > 0) {
        const { data } = await supabase
          .from('countries')
          .select('id, name')
          .in('id', Array.from(allCountryIds));
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((c: any) => { map[c.id] = c.name; });
          setCountryNames(map);
        }
      }
    };
    fetchNames();
  }, [articles]);

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

  // Reset page when filters change
  const applyFiltersAndFetch = (filters: any) => {
    setCurrentFilters(filters);
    setCurrentPage(1);
    fetchArticles(filters);
  };

  const handleFiltersChange = (filters: any) => {
    const option = sortOptions.find(opt => opt.value === sortBy);
    const filtersWithSort = {
      ...filters,
      sortField: option?.field || 'published_at',
      sortOrder: option?.order || 'desc',
    };
    applyFiltersAndFetch(filtersWithSort);
  };

  const handleQuickSearch = (value: string) => {
    setQuickSearch(value);
    const option = sortOptions.find(opt => opt.value === sortBy);
    const filters = {
      ...currentFilters,
      search: value || undefined,
      sortField: option?.field || 'published_at',
      sortOrder: option?.order || 'desc',
    };
    applyFiltersAndFetch(filters);
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    const option = sortOptions.find(opt => opt.value === value);
    if (option) {
      const newFilters = {
        ...currentFilters,
        sortField: option.field,
        sortOrder: option.order,
      };
      applyFiltersAndFetch(newFilters);
    }
  };

  const handleViewArticle = (articleId: string) => {
    incrementViews(articleId);
  };

  // --- Clickable handlers for NewsCard ---
  const handleFilterByTag = (tag: string) => {
    setQuickSearch(tag);
    const option = sortOptions.find(opt => opt.value === sortBy);
    const filters = {
      ...currentFilters,
      search: tag,
      sortField: option?.field || 'published_at',
      sortOrder: option?.order || 'desc',
    };
    applyFiltersAndFetch(filters);
  };

  const handleFilterBySource = (sourceId: string, sourceName: string) => {
    setQuickSearch(sourceName);
    const option = sortOptions.find(opt => opt.value === sortBy);
    const filters = {
      ...currentFilters,
      sourceId,
      search: undefined,
      category: undefined,
      sortField: option?.field || 'published_at',
      sortOrder: option?.order || 'desc',
    };
    applyFiltersAndFetch(filters);
  };

  const handleFilterByCategory = (category: string) => {
    setQuickSearch(category);
    const option = sortOptions.find(opt => opt.value === sortBy);
    const filters = {
      ...currentFilters,
      category,
      search: undefined,
      sourceId: undefined,
      sortField: option?.field || 'published_at',
      sortOrder: option?.order || 'desc',
    };
    applyFiltersAndFetch(filters);
  };

  const handleFilterByAuthor = (author: string) => {
    setQuickSearch(author);
    const option = sortOptions.find(opt => opt.value === sortBy);
    const filters = {
      ...currentFilters,
      search: author,
      sortField: option?.field || 'published_at',
      sortOrder: option?.order || 'desc',
    };
    applyFiltersAndFetch(filters);
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
    setCurrentPage(1);
    fetchArticles({});
  };

  const hasActiveFilters = quickSearch || Object.keys(currentFilters).some(k => currentFilters[k] !== undefined);

  // Pagination
  const sortedArticles = getSortedArticles();
  const totalPages = Math.ceil(sortedArticles.length / ARTICLES_PER_PAGE);
  const paginatedArticles = sortedArticles.slice(
    (currentPage - 1) * ARTICLES_PER_PAGE,
    currentPage * ARTICLES_PER_PAGE
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Header */}
        <PageHeader
          title="News"
          subtitle="Stay informed with the latest news and stories from the LGBTQ+ community worldwide"
        >
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
        </PageHeader>

        {/* Quick Search & Controls */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 2 }}>
            {/* Quick Search */}
            <Box sx={{ position: 'relative', flex: 1, maxWidth: '28rem' }}>
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#999999' }} />
              <Input placeholder="Quick search articles..." value={quickSearch} onChange={e => handleQuickSearch(e.target.value)} style={{ paddingLeft: 40, paddingRight: 40 }} aria-label="Search articles" />
              {quickSearch && (
                <Button variant="ghost" size="sm" onClick={() => handleQuickSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', height: 24, width: 24, padding: 0 }}>
                  <X style={{ width: 16, height: 16 }} />
                </Button>
              )}
            </Box>

            {/* Controls */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {/* Sort */}
              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger style={{ width: 180 }} aria-label="Sort articles">
                  <SortAsc style={{ width: 16, height: 16, marginRight: 8 }} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* View Mode */}
              <Box sx={{ display: 'flex', alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 2, p: 0.5 }}>
                <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('grid')} style={{ height: 32, width: 32, padding: 0 }} aria-label="Grid view">
                  <Grid3X3 style={{ width: 16, height: 16 }} />
                </Button>
                <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} style={{ height: 32, width: 32, padding: 0 }} aria-label="List view">
                  <List style={{ width: 16, height: 16 }} />
                </Button>
              </Box>

              {/* Advanced Filters Toggle */}
              <Button variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(!showFilters)} style={{ display: 'flex', gap: 8 }} aria-label="Toggle filters">
                <Filter style={{ width: 16, height: 16 }} />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" style={{ marginLeft: 4, height: 20, width: 20, padding: 0, fontSize: '0.75rem' }}>
                    !
                  </Badge>
                )}
              </Button>
            </Box>
          </Box>
        </Paper>

        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, p: 2, bgcolor: 'background.paper' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Filter style={{ width: 16, height: 16 }} />
              <Typography variant="body2" color="text.secondary">Active filters applied</Typography>
              {quickSearch && <Badge variant="outline">Filter: {quickSearch}</Badge>}
              {currentFilters.sourceId && (
                <Badge variant="outline">Source: {sourcesMap[currentFilters.sourceId]?.name || 'Unknown'}</Badge>
              )}
              {currentFilters.category && (
                <Badge variant="outline">Category: {currentFilters.category}</Badge>
              )}
              {sortBy !== 'date-desc' && (
                <Badge variant="outline">
                  Sort: {sortOptions.find(o => o.value === sortBy)?.label}
                </Badge>
              )}
              {currentFilters.featured !== undefined && (
                <Badge variant="outline">Featured only</Badge>
              )}
            </Box>
            <Button variant="ghost" size="sm" onClick={clearAllFilters} aria-label="Clear all filters">
              Clear All
            </Button>
          </Paper>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(4, 1fr)' }, gap: 3 }}>
          {/* Sidebar Filters */}
          {showFilters && (
            <Box sx={{ gridColumn: { lg: 'span 1' } }}>
              <NewsFilters sources={sources} onFiltersChange={handleFiltersChange} trendingTags={trendingTags} />
            </Box>
          )}

          {/* Main Content */}
          <Box sx={{ gridColumn: showFilters ? { lg: 'span 3' } : { lg: 'span 4' } }}>
            {/* Error State */}
            {error && !loading && <ErrorState message={error} onRetry={() => fetchArticles()} />}

            {/* Loading State */}
            {loading && <PageLoadingState count={6} variant="card" />}
            {loading && loadingTimedOut && <LoadingTimeout onRetry={() => fetchArticles()} />}

            {/* Empty State */}
            {!loading && !error && sortedArticles.length === 0 && (
              <EmptyState
                icon={Newspaper}
                title="The newsroom is quiet"
                description="No stories right now — check back soon."
                mood="encouraging"
              />
            )}

            {/* Articles */}
            {!loading && paginatedArticles.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Results Summary */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">
                    Showing {(currentPage - 1) * ARTICLES_PER_PAGE + 1}–{Math.min(currentPage * ARTICLES_PER_PAGE, sortedArticles.length)} of {sortedArticles.length} article{sortedArticles.length !== 1 ? 's' : ''}
                  </Typography>
                </Box>

                {/* Articles Grid/List */}
                <Box sx={viewMode === 'grid'
                  ? { display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(3, 1fr)' }, gap: 3 }
                  : { display: 'flex', flexDirection: 'column', gap: 2 }
                }>
                  {paginatedArticles.map((article: any) => (
                    <NewsCard
                      key={article.id}
                      article={article}
                      onViewArticle={handleViewArticle}
                      onFilterByTag={handleFilterByTag}
                      onFilterBySource={handleFilterBySource}
                      onFilterByCategory={handleFilterByCategory}
                      onFilterByAuthor={handleFilterByAuthor}
                      cityNames={cityNames}
                      countryNames={countryNames}
                      sourcesMap={sourcesMap}
                    />
                  ))}
                </Box>

                {/* Pagination */}
                {totalPages > 1 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, pt: 2 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <ChevronLeft style={{ width: 16, height: 16 }} />
                      Previous
                    </Button>

                    <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.5 }}>
                      {getPageNumbers().map((page, i) =>
                        page === 'ellipsis' ? (
                          <Typography key={`e${i}`} variant="body2" sx={{ px: 1, color: 'text.secondary' }}>
                            ...
                          </Typography>
                        ) : (
                          <Button
                            key={page}
                            variant={currentPage === page ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handlePageChange(page as number)}
                            style={{ minWidth: 36, height: 36, padding: 0 }}
                          >
                            {page}
                          </Button>
                        )
                      )}
                    </Box>

                    {/* Mobile page indicator */}
                    <Typography variant="body2" sx={{ display: { xs: 'block', sm: 'none' }, color: 'text.secondary' }}>
                      {currentPage} / {totalPages}
                    </Typography>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      Next
                      <ChevronRight style={{ width: 16, height: 16 }} />
                    </Button>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
