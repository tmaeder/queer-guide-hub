import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { AnimatePresence, motion } from 'motion/react';
import { useSearchParams } from "react-router";
import { useLocalizedNavigate } from "@/hooks/useLocalizedNavigate";
import { useNews } from "@/hooks/useNews";
import type { NewsCategory } from "@/hooks/useNews";
import { useEntityImageAssets } from "@/hooks/useEntityImageAssets";
import { useMeta } from "@/hooks/useMeta";
import { NewsCard } from "@/components/news/NewsCard";
import { NewsFilters } from "@/components/news/NewsFilters";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, LoadingTimeout, ErrorState } from '@/components/ui/EmptyState';
import { Newspaper, Search, Grid3X3, List, SortAsc, Filter, X, TrendingUp, ChevronLeft, ChevronRight, LayoutList, BookOpen, Rows3, Rows4, Layers } from "lucide-react";
import { useNewsStories } from "@/hooks/useNewsStories";
import { StoryCard } from "@/components/news/StoryCard";
import { fetchNamesByIds } from "@/hooks/usePageFetchers";
import type { Tables } from "@/integrations/supabase/types";

type FeaturedArticle = Tables<'news_articles'> & { news_sources?: Tables<'news_sources'> };
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { useTranslation } from 'react-i18next';


const ARTICLES_PER_PAGE = 24;

interface SortOption {
  value: string;
  label: string;
  field: string;
  order: 'asc' | 'desc';
}
const sortOptions: SortOption[] = [{
  value: 'date-desc', label: 'Newest First', field: 'published_at', order: 'desc'
}, {
  value: 'date-asc', label: 'Oldest First', field: 'published_at', order: 'asc'
}, {
  value: 'views-desc', label: 'Most Viewed', field: 'views_count', order: 'desc'
}, {
  value: 'views-asc', label: 'Least Viewed', field: 'views_count', order: 'asc'
}, {
  value: 'title-asc', label: 'Title A-Z', field: 'title', order: 'asc'
}, {
  value: 'title-desc', label: 'Title Z-A', field: 'title', order: 'desc'
}];

type ViewMode = 'grid' | 'list' | 'headlines' | 'magazine' | 'stories';
type Density = 'comfortable' | 'compact';
const DENSITY_STORAGE_KEY = 'news:density';
const readInitialDensity = (): Density => {
  if (typeof window === 'undefined') return 'comfortable';
  return window.localStorage.getItem(DENSITY_STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable';
};

export default function News() {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const {
    articles,
    sources,
    categories,
    articleTags,
    loading,
    error,
    fetchArticles,
    fetchTagsForArticles,
    incrementViews,
    getFeaturedArticles,
    getTrendingTags,
    loadingTimedOut
  } = useNews();

  // ---- URL state (Group D) -------------------------------------------------
  // Filter, sort, view, search and pagination are all reflected in the
  // querystring so users can copy URLs, refresh, or use back/forward.
  const [searchParams, setSearchParams] = useSearchParams();
  const validViewModes: ViewMode[] = ['grid', 'list', 'headlines', 'magazine', 'stories'];
  const isViewMode = (v: string | null): v is ViewMode =>
    !!v && (validViewModes as string[]).includes(v);
  const validSorts = sortOptions.map((o) => o.value);
  const initialView: ViewMode = isViewMode(searchParams.get('view')) ? (searchParams.get('view') as ViewMode) : 'grid';
  const initialSort = validSorts.includes(searchParams.get('sort') ?? '') ? (searchParams.get('sort') as string) : 'date-desc';
  const initialPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const initialCategory = searchParams.get('category');
  const initialSearch = searchParams.get('q') ?? '';
  const initialFilters: Record<string, unknown> = {};
  const sourceParam = searchParams.get('source');
  if (sourceParam) initialFilters.sourceId = sourceParam;
  if (searchParams.get('featured') === '1') initialFilters.featured = true;
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  if (dateFrom || dateTo) {
    initialFilters.dateRange = {
      ...(dateFrom ? { from: dateFrom } : {}),
      ...(dateTo ? { to: dateTo } : {}),
    };
  }
  const countryParam = searchParams.get('country');
  if (countryParam) initialFilters.countryIds = [countryParam];
  const cityParam = searchParams.get('city');
  if (cityParam) initialFilters.cityIds = [cityParam];

  const [featuredArticles, setFeaturedArticles] = useState<FeaturedArticle[]>([]);
  const [trendingTags, setTrendingTags] = useState<{ tag: string; count: number; }[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [sortBy, setSortBy] = useState(initialSort);
  const [quickSearch, setQuickSearch] = useState(initialSearch);
  const [showFilters, setShowFilters] = useState(false);
  const [currentFilters, setCurrentFilters] = useState<Record<string, unknown>>(initialFilters);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategory);
  const [density, setDensity] = useState<Density>(readInitialDensity);

  const { stories, heroArticles: storyHeroes, loading: storiesLoading } = useNewsStories({ minArticles: 2, limit: 60 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);

  // Write the canonical state back to the URL whenever it changes. We push for
  // explicit user actions (filter/sort/view/page) and replace for the search
  // input as the user types so back-button history isn't a flood of keystrokes.
  const writeUrl = useCallback((opts?: { replace?: boolean }) => {
    const next = new URLSearchParams();
    if (viewMode !== 'grid') next.set('view', viewMode);
    if (sortBy !== 'date-desc') next.set('sort', sortBy);
    if (quickSearch) next.set('q', quickSearch);
    if (activeCategory) next.set('category', activeCategory);
    if (currentPage > 1) next.set('page', String(currentPage));
    const f = currentFilters;
    if (typeof f.sourceId === 'string' && f.sourceId) next.set('source', f.sourceId);
    if (f.featured === true) next.set('featured', '1');
    const dr = f.dateRange as { from?: string; to?: string } | undefined;
    if (dr?.from) next.set('date_from', dr.from);
    if (dr?.to) next.set('date_to', dr.to);
    const cIds = f.countryIds as string[] | undefined;
    if (cIds?.length) next.set('country', cIds[0]);
    const ciIds = f.cityIds as string[] | undefined;
    if (ciIds?.length) next.set('city', ciIds[0]);
    setSearchParams(next, { replace: opts?.replace ?? false });
  }, [viewMode, sortBy, quickSearch, activeCategory, currentPage, currentFilters, setSearchParams]);

  // Push history entry for filter/sort/view/category/page changes.
  useEffect(() => {
    writeUrl();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, sortBy, currentPage, activeCategory, currentFilters]);

  // Replace history entry as the user types in the quick-search box so the
  // back button doesn't have to walk through every keystroke.
  useEffect(() => {
    writeUrl({ replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickSearch]);

  // Apply URL-derived filters on mount so a deep link like
  // /news?category=politics&source=<id>&q=trump cold-loads the right slice
  // (the default useNews mount only fetches with no filters).
  const didApplyInitialUrlRef = useRef(false);
  useEffect(() => {
    if (didApplyInitialUrlRef.current) return;
    didApplyInitialUrlRef.current = true;
    const opt = sortOptions.find((o) => o.value === initialSort);
    const f: Record<string, unknown> = {
      ...initialFilters,
      sortField: opt?.field || 'published_at',
      sortOrder: opt?.order || 'desc',
    };
    if (initialCategory) f.category = initialCategory;
    if (initialSearch) f.search = initialSearch;
    fetchArticles(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [cityNames, setCityNames] = useState<Record<string, string>>({});
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});

  const sourcesMap = useMemo(() => {
    const map: Record<string, { id: string; name: string; url?: string }> = {};
    sources.forEach((s: { id: string; name: string; url?: string }) => { map[s.id] = s; });
    return map;
  }, [sources]);

  const categoriesMap = useMemo(() => {
    const map: Record<string, NewsCategory> = {};
    categories.forEach((c) => { map[c.slug] = c; });
    return map;
  }, [categories]);

  const activeCategoryName = activeCategory ? categoriesMap[activeCategory]?.name ?? activeCategory : null;
  const metaTitle = activeCategoryName ? `${activeCategoryName} news` : 'News';
  const metaDescription = activeCategoryName
    ? `Latest ${activeCategoryName.toLowerCase()} news and stories from the LGBTQ+ community worldwide.`
    : 'Stay informed with the latest LGBTQ+ news and stories from around the world.';
  useMeta({
    title: metaTitle,
    description: metaDescription,
    canonicalPath: '/news',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: activeCategoryName ? `LGBTQ+ ${activeCategoryName} News` : 'LGBTQ+ News',
        description: metaDescription,
        url: activeCategory ? `https://queer.guide/news?category=${activeCategory}` : 'https://queer.guide/news',
        isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://queer.guide' },
          { '@type': 'ListItem', position: 2, name: 'News', item: 'https://queer.guide/news' },
          ...(activeCategoryName
            ? [{ '@type': 'ListItem', position: 3, name: activeCategoryName, item: `https://queer.guide/news?category=${activeCategory}` }]
            : []),
        ],
      },
    ],
  });

  // Load city/country names
  useEffect(() => {
    if (articles.length === 0) return;
    const allCityIds = new Set<string>();
    const allCountryIds = new Set<string>();
    articles.forEach((a: { city_ids?: string[]; country_ids?: string[] }) => {
      (a.city_ids || []).forEach((id: string) => allCityIds.add(id));
      (a.country_ids || []).forEach((id: string) => allCountryIds.add(id));
    });
    const fetchNames = async () => {
      const [cities, countries] = await Promise.all([
        fetchNamesByIds('cities', Array.from(allCityIds)),
        fetchNamesByIds('countries', Array.from(allCountryIds)),
      ]);
      if (Object.keys(cities).length > 0) setCityNames(cities);
      if (Object.keys(countries).length > 0) setCountryNames(countries);
    };
    fetchNames();
  }, [articles]);

  // Batch-fetch tags when articles change
  useEffect(() => {
    if (articles.length === 0) return;
    const ids = articles.map((a: { id: string }) => a.id);
    fetchTagsForArticles(ids);
  }, [articles, fetchTagsForArticles]);

  useEffect(() => {
    const loadAdditionalData = async () => {
      const [featured, trending] = await Promise.all([getFeaturedArticles(), getTrendingTags()]);
      setFeaturedArticles(featured);
      setTrendingTags(trending);
    };
    if (!loading) loadAdditionalData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const applyFiltersAndFetch = (filters: Record<string, unknown>) => {
    setCurrentFilters(filters);
    setCurrentPage(1);
    fetchArticles(filters);
  };

  const handleFiltersChange = (filters: Record<string, unknown>) => {
    const option = sortOptions.find(opt => opt.value === sortBy);
    const filtersWithSort = {
      ...filters,
      sortField: option?.field || 'published_at',
      sortOrder: option?.order || 'desc',
      ...(activeCategory ? { category: activeCategory } : {}),
    };
    applyFiltersAndFetch(filtersWithSort);
  };

  const handleQuickSearch = (value: string) => {
    setQuickSearch(value);
    const option = sortOptions.find(opt => opt.value === sortBy);
    applyFiltersAndFetch({
      ...currentFilters,
      search: value || undefined,
      sortField: option?.field || 'published_at',
      sortOrder: option?.order || 'desc',
    });
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    const option = sortOptions.find(opt => opt.value === value);
    if (option) {
      applyFiltersAndFetch({
        ...currentFilters,
        sortField: option.field,
        sortOrder: option.order,
      });
    }
  };

  const handleCategoryClick = (slug: string | null) => {
    setActiveCategory(slug);
    setCurrentPage(1);
    const option = sortOptions.find(opt => opt.value === sortBy);
    const filters = {
      ...currentFilters,
      category: slug || undefined,
      sortField: option?.field || 'published_at',
      sortOrder: option?.order || 'desc',
    };
    applyFiltersAndFetch(filters);
  };

  const handleViewArticle = (articleId: string) => {
    incrementViews(articleId);
  };

  const handleFilterByTag = (tag: string) => {
    setQuickSearch(tag);
    const option = sortOptions.find(opt => opt.value === sortBy);
    applyFiltersAndFetch({
      ...currentFilters, search: tag,
      sortField: option?.field || 'published_at', sortOrder: option?.order || 'desc',
    });
  };

  const handleFilterBySource = (sourceId: string, sourceName: string) => {
    setQuickSearch(sourceName);
    const option = sortOptions.find(opt => opt.value === sortBy);
    applyFiltersAndFetch({
      ...currentFilters, sourceId, search: undefined, category: undefined,
      sortField: option?.field || 'published_at', sortOrder: option?.order || 'desc',
    });
  };

  const handleFilterByCategory = (category: string) => {
    setActiveCategory(category);
    setCurrentPage(1);
    const option = sortOptions.find(opt => opt.value === sortBy);
    applyFiltersAndFetch({
      ...currentFilters, category, search: undefined, sourceId: undefined,
      sortField: option?.field || 'published_at', sortOrder: option?.order || 'desc',
    });
  };

  const handleFilterByAuthor = (author: string) => {
    setQuickSearch(author);
    const option = sortOptions.find(opt => opt.value === sortBy);
    applyFiltersAndFetch({
      ...currentFilters, search: author,
      sortField: option?.field || 'published_at', sortOrder: option?.order || 'desc',
    });
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
      return option.order === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
  };

  const searchInputRef = useRef<HTMLInputElement>(null);

  const clearAllFilters = () => {
    setQuickSearch('');
    setCurrentFilters({});
    setCurrentPage(1);
    setActiveCategory(null);
    fetchArticles({});
  };

  const handleResetAndFocus = () => {
    clearAllFilters();
    queueMicrotask(() => searchInputRef.current?.focus());
  };

  const hasActiveFilters = quickSearch || activeCategory || Object.keys(currentFilters).some(k => currentFilters[k] !== undefined);

  const sortedArticles = getSortedArticles();
  const totalPages = Math.ceil(sortedArticles.length / ARTICLES_PER_PAGE);
  const paginatedArticles = sortedArticles.slice(
    (currentPage - 1) * ARTICLES_PER_PAGE,
    currentPage * ARTICLES_PER_PAGE
  );

  const visibleArticleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of paginatedArticles as Array<{ id: string }>) ids.add(a.id);
    for (const a of featuredArticles) ids.add(a.id);
    return Array.from(ids);
  }, [paginatedArticles, featuredArticles]);
  const { assets: articleAssets } = useEntityImageAssets('news_article', visibleArticleIds);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  // Count articles per canonical category for the tab badges. Prefer
  // category_canonical (from migration news_qa_backfill_category_canonical)
  // and fall back to legacy `category` so unclassified rows still surface.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    articles.forEach((a: { category?: string; category_canonical?: string | null }) => {
      const slug = a.category_canonical || a.category;
      if (slug && slug !== 'general') {
        counts[slug] = (counts[slug] || 0) + 1;
      }
    });
    return counts;
  }, [articles]);

  // Show featured section on first page with no active category filter
  const showFeatured = currentPage === 1 && !activeCategory && !quickSearch && featuredArticles.length > 0;

  return (
    <div className="min-h-screen">
      {/* pb-24 reserves space for the fixed bottom-right Feedback FAB so it doesn't overlap the last row of cards / pagination. */}
      <div className="container mx-auto py-12 md:py-20 px-4 pb-24">
        <PageHeader
          title={t('pages.news.title', 'News')}
          subtitle={t('pages.news.subtitle', 'Stay informed with the latest news and stories from the LGBTQ+ community worldwide')}
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Newspaper size={16} />
              <p className="text-sm text-muted-foreground">{articles.length} articles</p>
            </div>
            <div className="flex items-center gap-1">
              <TrendingUp size={16} />
              <p className="text-sm text-muted-foreground">{sources.length} sources</p>
            </div>
          </div>
        </PageHeader>

        {/* Category Tabs (sticky) */}
        {categories.length > 0 && (
          <div
            role="tablist"
            aria-label={t('pages.news.categoriesLabel', 'News categories')}
            className="flex gap-2 mb-6 overflow-x-auto pb-2 sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 -mx-4 px-4 pt-2"
            style={{ scrollbarWidth: 'none' }}
          >
            <button
              type="button"
              role="tab"
              aria-current={activeCategory === null ? 'true' : undefined}
              aria-selected={activeCategory === null}
              className={`whitespace-nowrap rounded-md border text-xs font-medium px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeCategory === null
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-foreground border-border hover:bg-muted'
              }`}
              onClick={() => handleCategoryClick(null)}
            >
              All
            </button>
            {categories.map((cat) => {
              const count = categoryCounts[cat.slug] || 0;
              const selected = activeCategory === cat.slug;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-current={selected ? 'true' : undefined}
                  aria-selected={selected}
                  className={`whitespace-nowrap rounded-md border text-xs font-medium px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected
                      ? 'border-transparent'
                      : 'bg-transparent text-foreground border-border hover:bg-muted'
                  }`}
                  style={selected ? { backgroundColor: cat.color, color: 'hsl(var(--background))' } : undefined}
                  onClick={() => handleCategoryClick(cat.slug)}
                >
                  {cat.name}{count > 0 ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>
        )}

        {/* Featured Section */}
        {showFeatured && (
          <section className="border border-border rounded-lg p-6 mb-6 bg-background" aria-labelledby="featured-stories-heading">
            <h2
              id="featured-stories-heading"
              className="font-bold tracking-widest mb-4 text-muted-foreground uppercase text-xs"
            >
              Featured Stories
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Hero featured article */}
              {featuredArticles[0] && (
                <NewsCard
                  article={featuredArticles[0]}
                  variant="featured"
                  priority
                  hideDate
                  onViewArticle={handleViewArticle}
                  sourcesMap={sourcesMap}
                  categoriesMap={categoriesMap}
                  tags={articleTags[featuredArticles[0].id] || []}
                  imageAsset={articleAssets.get(featuredArticles[0].id)}
                />
              )}
              {/* Secondary featured articles */}
              <div className="flex flex-col gap-4">
                {featuredArticles.slice(1, 4).map((fa) => (
                  <NewsCard
                    key={fa.id}
                    article={fa}
                    variant="headline"
                    hideDate
                    onViewArticle={handleViewArticle}
                    sourcesMap={sourcesMap}
                    categoriesMap={categoriesMap}
                    tags={articleTags[fa.id] || []}
                    imageAsset={articleAssets.get(fa.id)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Quick Search & Controls */}
        <div className="border border-border rounded-lg p-4 mb-6 bg-background">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
              <Input ref={searchInputRef} placeholder={t('pages.news.searchPlaceholder', 'Quick search articles...')} value={quickSearch} onChange={e => handleQuickSearch(e.target.value)} style={{ paddingLeft: 40, paddingRight: 40 }} aria-label="Search articles" />
              {quickSearch && (
                <Button variant="ghost" size="sm" onClick={() => handleQuickSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', height: 24, width: 24, padding: 0 }}>
                  <X size={16} />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Select value={sortBy} onValueChange={handleSortChange}>
                <SelectTrigger style={{ width: 180 }} aria-label="Sort articles">
                  <SortAsc style={{ width: 16, height: 16, marginRight: 8 }} />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* View Mode Buttons */}
              <div className="flex items-center rounded-lg p-1">
                <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('grid')} style={{ height: 32, width: 32, padding: 0 }} aria-label="Grid view" title="Grid">
                  <Grid3X3 size={16} />
                </Button>
                <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} style={{ height: 32, width: 32, padding: 0 }} aria-label="List view" title="List">
                  <List size={16} />
                </Button>
                <Button variant={viewMode === 'headlines' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('headlines')} style={{ height: 32, width: 32, padding: 0 }} aria-label="Headlines view" title="Headlines">
                  <LayoutList size={16} />
                </Button>
                <Button variant={viewMode === 'magazine' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('magazine')} style={{ height: 32, width: 32, padding: 0 }} aria-label="Magazine view" title="Magazine">
                  <BookOpen size={16} />
                </Button>
                <Button variant={viewMode === 'stories' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('stories')} style={{ height: 32, width: 32, padding: 0 }} aria-label="Stories view" title="Stories">
                  <Layers size={16} />
                </Button>
              </div>

              {/* Density toggle */}
              <div className="hidden md:flex items-center rounded-lg p-1 border border-border" role="group" aria-label="Card density">
                <Button
                  variant={density === 'comfortable' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setDensity('comfortable')}
                  style={{ height: 32, width: 32, padding: 0 }}
                  aria-label="Comfortable density"
                  aria-pressed={density === 'comfortable'}
                  title="Comfortable"
                >
                  <Rows3 size={16} />
                </Button>
                <Button
                  variant={density === 'compact' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setDensity('compact')}
                  style={{ height: 32, width: 32, padding: 0 }}
                  aria-label="Compact density"
                  aria-pressed={density === 'compact'}
                  title="Compact"
                >
                  <Rows4 size={16} />
                </Button>
              </div>

              <Button variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(!showFilters)} style={{ display: 'flex', gap: 8 }} aria-label="Toggle filters">
                <Filter size={16} />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" style={{ marginLeft: 4, height: 20, width: 20, padding: 0, fontSize: '0.75rem' }}>!</Badge>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Trending tags strip */}
        {trendingTags.length > 0 && !quickSearch && (
          <div className="flex items-center gap-2 mb-6 flex-wrap" aria-label={t('pages.news.trendingTags', 'Trending tags')}>
            <span className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <TrendingUp size={14} /> {t('pages.news.trendingTags', 'Trending')}
            </span>
            {trendingTags.slice(0, 10).map(({ tag }) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleFilterByTag(tag)}
                className="text-xs rounded-full border border-border px-3 py-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Active Filters Summary */}
        {hasActiveFilters && sortedArticles.length > 0 && (
          <div className="flex items-center justify-between mb-6 p-4 border border-border rounded-lg bg-background">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={16} />
              <p className="text-sm text-muted-foreground">{t('pages.news.activeFilters', 'Active filters')}</p>
              {quickSearch && <Badge variant="outline">Search: {quickSearch}</Badge>}
              {activeCategory && <Badge variant="outline">Category: {categoriesMap[activeCategory]?.name || activeCategory}</Badge>}
              {currentFilters.sourceId && (
                <Badge variant="outline">Source: {sourcesMap[currentFilters.sourceId as string]?.name || 'Unknown'}</Badge>
              )}
              {sortBy !== 'date-desc' && (
                <Badge variant="outline">Sort: {sortOptions.find(o => o.value === sortBy)?.label}</Badge>
              )}
              {currentFilters.featured !== undefined && <Badge variant="outline">Featured only</Badge>}
            </div>
            <Button variant="ghost" size="sm" onClick={clearAllFilters} aria-label="Clear all filters">{t('pages.news.clearAll', 'Clear All')}</Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {showFilters && (
            <div className="lg:col-span-1">
              <NewsFilters sources={sources} categories={categories} onFiltersChange={handleFiltersChange} trendingTags={trendingTags} />
            </div>
          )}

          <div className={showFilters ? 'lg:col-span-3' : 'lg:col-span-4'}>
            {/* Error and loading are mutually exclusive with the list. */}
            {error && !loading ? (
              <ErrorState message={error} onRetry={() => fetchArticles()} />
            ) : null}

            {!error && loading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (<NewsCard key={i} loading />))}
              </div>
            )}
            {!error && loading && loadingTimedOut && <LoadingTimeout onRetry={() => fetchArticles()} />}

            {!loading && !error && sortedArticles.length === 0 && (
              hasActiveFilters ? (
                <EmptyState
                  icon={Newspaper}
                  variant="filtered"
                  title={t('pages.news.filteredEmptyTitle', 'No news matches your filters')}
                  description={t('pages.news.filteredEmptyDescription', 'Try resetting your filters or exploring another topic.')}
                  mood="neutral"
                  activeFilters={[
                    ...(quickSearch
                      ? [{ label: `${t('pages.news.filterSearch', 'Search')}: ${quickSearch}`, onRemove: () => handleQuickSearch('') }]
                      : []),
                    ...(activeCategory
                      ? [{ label: `${t('pages.news.filterCategory', 'Category')}: ${categoriesMap[activeCategory]?.name || activeCategory}`, onRemove: () => handleCategoryClick(null) }]
                      : []),
                    ...(currentFilters.sourceId
                      ? [{ label: `${t('pages.news.filterSource', 'Source')}: ${sourcesMap[currentFilters.sourceId as string]?.name || 'Unknown'}`, onRemove: () => applyFiltersAndFetch({ ...currentFilters, sourceId: undefined }) }]
                      : []),
                    ...(currentFilters.featured !== undefined
                      ? [{ label: t('pages.news.filterFeatured', 'Featured only'), onRemove: () => applyFiltersAndFetch({ ...currentFilters, featured: undefined }) }]
                      : []),
                  ]}
                  primaryAction={{
                    label: t('pages.news.resetFilters', 'Reset filters'),
                    onClick: handleResetAndFocus,
                    variant: 'default',
                  }}
                />
              ) : (
                <EmptyState
                  icon={Newspaper}
                  title={t('pages.news.emptyTitle', 'The newsroom is quiet')}
                  description={t('pages.news.emptyDescription', 'No stories right now. Check back soon.')}
                  mood="encouraging"
                  primaryAction={{
                    label: t('pages.news.refresh', 'Refresh'),
                    onClick: () => fetchArticles(),
                  }}
                  secondaryAction={{
                    label: t('pages.news.emptyBrowseEvents', 'Browse events'),
                    onClick: () => navigate('/events'),
                  }}
                />
              )
            )}

            {!error && (paginatedArticles.length > 0 || viewMode === 'stories') && !(loading && viewMode !== 'stories') && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * ARTICLES_PER_PAGE + 1}–{Math.min(currentPage * ARTICLES_PER_PAGE, sortedArticles.length)} of {sortedArticles.length} article{sortedArticles.length !== 1 ? 's' : ''}
                  </p>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                {/* Stories View */}
                {viewMode === 'stories' && (
                  <motion.div key="stories" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}>
                    {storiesLoading ? (
                      <p className="text-sm text-muted-foreground">Loading stories…</p>
                    ) : stories.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No multi-article stories yet. Check back as more coverage accumulates.</p>
                    ) : (
                      <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {stories.map((s) => (
                          <StoryCard key={s.id} story={s} hero={s.hero_article_id ? storyHeroes[s.hero_article_id] : undefined} />
                        ))}
                      </StaggerGrid>
                    )}
                  </motion.div>
                )}

                {/* Headlines View */}
                {viewMode === 'headlines' && (
                  <motion.div key="headlines" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}>
                  <div className="border border-border rounded-lg overflow-hidden">
                    {paginatedArticles.map((article) => (
                      <NewsCard
                        key={article.id}
                        article={article}
                        variant="headline"
                        onViewArticle={handleViewArticle}
                        onFilterByTag={handleFilterByTag}
                        onFilterBySource={handleFilterBySource}
                        onFilterByCategory={handleFilterByCategory}
                        onFilterByAuthor={handleFilterByAuthor}
                        cityNames={cityNames}
                        countryNames={countryNames}
                        sourcesMap={sourcesMap}
                        categoriesMap={categoriesMap}
                        tags={articleTags[article.id] || []}
                        imageAsset={articleAssets.get(article.id)}
                      />
                    ))}
                  </div>
                  </motion.div>
                )}

                {/* Magazine View */}
                {viewMode === 'magazine' && (
                  <motion.div key="magazine" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}>
                  <div className="flex flex-col gap-6">
                    {/* First article as hero */}
                    {paginatedArticles[0] && (
                      <NewsCard
                        article={paginatedArticles[0]}
                        variant="featured"
                        onViewArticle={handleViewArticle}
                        onFilterByTag={handleFilterByTag}
                        onFilterBySource={handleFilterBySource}
                        onFilterByCategory={handleFilterByCategory}
                        onFilterByAuthor={handleFilterByAuthor}
                        cityNames={cityNames}
                        countryNames={countryNames}
                        sourcesMap={sourcesMap}
                        categoriesMap={categoriesMap}
                        tags={articleTags[paginatedArticles[0].id] || []}
                        imageAsset={articleAssets.get(paginatedArticles[0].id)}
                      />
                    )}
                    {/* Next 2 as medium cards */}
                    {paginatedArticles.length > 1 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {paginatedArticles.slice(1, 3).map((article) => (
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
                            categoriesMap={categoriesMap}
                            tags={articleTags[article.id] || []}
                          />
                        ))}
                      </div>
                    )}
                    {/* Rest in compact grid */}
                    {paginatedArticles.length > 3 && (
                      <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {paginatedArticles.slice(3).map((article) => (
                          <NewsCard
                            key={article.id}
                            article={article}
                            density={density}
                            onViewArticle={handleViewArticle}
                            onFilterByTag={handleFilterByTag}
                            onFilterBySource={handleFilterBySource}
                            onFilterByCategory={handleFilterByCategory}
                            onFilterByAuthor={handleFilterByAuthor}
                            cityNames={cityNames}
                            countryNames={countryNames}
                            sourcesMap={sourcesMap}
                            categoriesMap={categoriesMap}
                            tags={articleTags[article.id] || []}
                          />
                        ))}
                      </StaggerGrid>
                    )}
                  </div>
                  </motion.div>
                )}

                {/* Grid / List View */}
                {(viewMode === 'grid' || viewMode === 'list') && (
                  <motion.div key={viewMode} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}>
                  <StaggerGrid className={viewMode === 'grid'
                    ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'
                    : 'flex flex-col gap-3'
                  }>
                    {paginatedArticles.map((article) => (
                      <NewsCard
                        key={article.id}
                        article={article}
                        variant={viewMode === 'list' ? 'compact' : undefined}
                        density={density}
                        onViewArticle={handleViewArticle}
                        onFilterByTag={handleFilterByTag}
                        onFilterBySource={handleFilterBySource}
                        onFilterByCategory={handleFilterByCategory}
                        onFilterByAuthor={handleFilterByAuthor}
                        cityNames={cityNames}
                        countryNames={countryNames}
                        sourcesMap={sourcesMap}
                        categoriesMap={categoriesMap}
                        tags={articleTags[article.id] || []}
                        imageAsset={articleAssets.get(article.id)}
                      />
                    ))}
                  </StaggerGrid>
                  </motion.div>
                )}
                </AnimatePresence>

                {/* Pagination */}
                {totalPages > 1 && viewMode !== 'stories' && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ChevronLeft size={16} /> {t('pages.news.previous', 'Previous')}
                    </Button>
                    <div className="hidden sm:flex items-center gap-1">
                      {getPageNumbers().map((page, i) =>
                        page === 'ellipsis' ? (
                          <p key={`e${i}`} className="px-2 text-sm text-muted-foreground">...</p>
                        ) : (
                          <Button key={page} variant={currentPage === page ? 'default' : 'outline'} size="sm" onClick={() => handlePageChange(page as number)} style={{ minWidth: 36, height: 36, padding: 0 }}>
                            {page}
                          </Button>
                        )
                      )}
                    </div>
                    <p className="block sm:hidden text-sm text-muted-foreground">
                      {currentPage} / {totalPages}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Next <ChevronRight size={16} />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
