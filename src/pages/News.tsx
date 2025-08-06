import { useState, useEffect } from "react";
import { useNews } from "@/hooks/useNews";
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
      setCurrentFilters(prev => ({
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
    return <div className="container mx-auto px-4 py-8">
        <Card className="border-destructive/20">
          <CardContent className="pt-6">
            <p className="text-destructive">Error loading news: {error}</p>
          </CardContent>
        </Card>
      </div>;
  }
  return <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold gradient-text">
              LGBTQ+ News Hub
            </h1>
            <p className="text-lg text-muted-foreground">
              Stay informed with the latest news and stories from the LGBTQ+ community worldwide
            </p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Newspaper className="h-4 w-4" />
                {articles.length} articles
              </div>
              <div className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                {sources.length} sources
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            
          </div>
        </div>

        {/* Quick Search & Controls */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          {/* Quick Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Quick search articles..." value={quickSearch} onChange={e => handleQuickSearch(e.target.value)} className="pl-10 pr-10" />
            {quickSearch && <Button variant="ghost" size="sm" onClick={() => handleQuickSearch('')} className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0">
                <X className="h-4 w-4" />
              </Button>}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            {/* Sort */}
            <Select value={sortBy} onValueChange={handleSortChange}>
              <SelectTrigger className="w-[180px]">
                <SortAsc className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map(option => <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>)}
              </SelectContent>
            </Select>

            {/* View Mode */}
            <div className="flex items-center border rounded-lg p-1">
              <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('grid')} className="h-8 w-8 p-0">
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="h-8 w-8 p-0">
                <List className="h-4 w-4" />
              </Button>
            </div>

            {/* Advanced Filters Toggle */}
            <Button variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(!showFilters)} className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 text-xs">
                  !
                </Badge>}
            </Button>
          </div>
        </div>

        {/* Active Filters Summary */}
        {hasActiveFilters && <div className="flex items-center justify-between mb-6 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>Active filters applied</span>
              {quickSearch && <Badge variant="outline">Search: {quickSearch}</Badge>}
            </div>
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              Clear All
            </Button>
          </div>}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Filters */}
          {showFilters && <div className="lg:col-span-1">
              <NewsFilters sources={sources} onFiltersChange={handleFiltersChange} trendingTags={trendingTags} />
            </div>}

          {/* Main Content */}
          <div className={showFilters ? "lg:col-span-3" : "lg:col-span-4"}>
            {/* Loading State */}
            {loading && <div className="flex items-center justify-center py-12">
                <Loader className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading articles...</span>
              </div>}

            {/* Empty State */}
            {!loading && getSortedArticles().length === 0 && <Card className="p-8 text-center">
                <CardContent>
                  
                  <h3 className="text-xl font-semibold mb-2">No articles found</h3>
                  
                  <div className="text-sm text-muted-foreground">
                    News is automatically imported every 2 hours via cron job
                  </div>
                </CardContent>
              </Card>}

            {/* Articles */}
            {!loading && getSortedArticles().length > 0 && <div className="space-y-6">
                {/* Results Summary */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {getSortedArticles().length} article{getSortedArticles().length !== 1 ? 's' : ''}
                  </p>
                </div>
                
                {/* Articles Grid/List */}
                <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" : "space-y-4"}>
                  {getSortedArticles().map(article => <NewsCard key={article.id} article={article} onViewArticle={handleViewArticle} />)}
                </div>
              </div>}
          </div>
        </div>
      </div>
    </div>;
}