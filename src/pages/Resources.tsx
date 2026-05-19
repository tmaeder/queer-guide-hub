import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import {
  useCentralizedTags,
  useTagUsageCounts,
  type CategoryTreeNode,
  type CentralizedTag,
} from '@/hooks/useCentralizedTags';
import { ResourcesFilterBar } from '@/components/resources/ResourcesFilterBar';
import { parentOrder } from '@/components/resources/categoryMeta';
import { fetchAllProfessions, fetchTagWithCategories } from '@/hooks/usePageFetchers';
import { useMeta } from '@/hooks/useMeta';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, Network } from 'lucide-react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { ErrorState } from '@/components/ui/EmptyState';
import { ResourceTagDetail } from '@/pages/resources/ResourceTagDetail';
import { ResourceOverview } from '@/pages/resources/ResourceOverview';
import { ResourceCategory, ResourceSubcategory } from '@/pages/resources/ResourceCategory';
import { ResourceProfessions } from '@/pages/resources/ResourceProfessions';
import { ResourceSearch } from '@/pages/resources/ResourceSearch';
import { CrisisStrip } from '@/pages/resources/sections/CrisisStrip';
import { TopicHubGrid } from '@/pages/resources/sections/TopicHubGrid';
import { OrgsDirectory } from '@/pages/resources/sections/OrgsDirectory';
import { isRealTagImage, type ViewMode, type DisplayMode, type SortOption } from '@/pages/resources/resourceHelpers';

const TagRelationshipGraph = lazy(() => import('@/components/tags/TagRelationshipGraph'));

export default function Resources() {
  const { tagName, categorySlug } = useParams<{ tagName: string; categorySlug: string }>();
  const navigate = useLocalizedNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { allTags, categoriesTree, loading, error, searchTags } = useCentralizedTags();
  const { data: tagUsageCounts = {} } = useTagUsageCounts();

  // P1-1 — filter / sort / view state lives in URL query params so links
  // are shareable, back/forward works, and view-mode survives reloads.
  // Defaults are kept implicit (omitted from the URL) for clean links.
  const updateParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (value === null || value === '') p.delete(key);
          else p.set(key, value);
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const searchQuery = searchParams.get('q') ?? '';
  const sortBy = (searchParams.get('sort') as SortOption | null) ?? 'usage';
  const sortDirection: 'asc' | 'desc' = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const filterCategory = searchParams.get('cat') ?? 'all';
  const displayMode = (searchParams.get('view') as DisplayMode | null) ?? 'grid';
  const usageFilter = searchParams.get('usage') ?? 'all';
  const hasImageFilter = searchParams.get('hasImage') === '1';

  const setSortBy = (next: SortOption) => updateParam('sort', next === 'usage' ? null : next);
  const setSortDirection = (next: 'asc' | 'desc') =>
    updateParam('dir', next === 'desc' ? null : 'asc');
  const setFilterCategory = (next: string) => updateParam('cat', next === 'all' ? null : next);
  const setDisplayMode = (next: DisplayMode) =>
    updateParam('view', next === 'grid' ? null : next);
  const setUsageFilter = (next: string) => updateParam('usage', next === 'all' ? null : next);
  const setHasImageFilter = (next: boolean) => updateParam('hasImage', next ? '1' : null);

  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<CentralizedTag | null>(null);
  const [tagNotFound, setTagNotFound] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<CentralizedTag[]>([]);
  const [professions, setProfessions] = useState<string[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load professions once (DUP-4)
  useEffect(() => {
    fetchAllProfessions().then(setProfessions).catch((e) => console.error('Error loading professions:', e));
  }, []);

  // Profession filter from URL
  const professionParam = searchParams.get('profession');
  useEffect(() => {
    if (professionParam) {
      setViewMode('search');
      updateParam('q', professionParam);
    }
  }, [professionParam, updateParam]);

  // Category deep-link from URL.
  // P1-6 — preferred path: /resources/c/<categorySlug> (matched by `slug`).
  // Legacy path: /resources?category=<name> (matched by name; left in place
  // for back-compat).
  const categoryParam = searchParams.get('category');
  useEffect(() => {
    if (categoriesTree.length === 0) return;
    if (!categoryParam && !categorySlug) return;

    const matchAgainst = (
      predicate: (c: { name: string; slug?: string }) => boolean,
    ): boolean => {
      const parent = categoriesTree.find((c) => predicate(c));
      if (parent) {
        setSelectedCategory(parent.name);
        setSelectedSubcategory('');
        setFilterCategory('all');
        setViewMode('category');
        return true;
      }
      for (const p of categoriesTree) {
        const child = p.children?.find((c) => predicate(c));
        if (child) {
          setSelectedCategory(p.name);
          setSelectedSubcategory(child.name);
          setViewMode('subcategory');
          return true;
        }
      }
      return false;
    };

    if (categorySlug) {
      const slug = decodeURIComponent(categorySlug).toLowerCase();
      if (matchAgainst((c) => (c.slug ?? '').toLowerCase() === slug)) return;
    }
    if (categoryParam) {
      const decoded = decodeURIComponent(categoryParam);
      matchAgainst((c) => c.name === decoded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryParam, categorySlug, categoriesTree]);

  // P1-1 — hydrate search-mode results from `?q=...` on initial mount /
  // direct visit. Subsequent keystrokes go through handleSearch.
  useEffect(() => {
    if (!searchQuery || allTags.length === 0) return;
    if (viewMode === 'search') return; // already populated
    if (tagName || categorySlug) return; // tag-detail / category routes own the page
    const lower = searchQuery.toLowerCase();
    const local = allTags
      .filter(
        (t) =>
          t.name.toLowerCase().includes(lower) ||
          (t.description && t.description.toLowerCase().includes(lower)),
      )
      .slice(0, 50);
    setSearchResults(local);
    setViewMode('search');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, allTags, tagName, categorySlug]);

  // Load individual tag from route param
  useEffect(() => {
    if (!tagName) {
      setTagNotFound(false);
      return;
    }
    const decoded = decodeURIComponent(tagName);
    // P1-7 — canonicalize slug case to lowercase. SPA equivalent of a 301:
    // we replace the URL so back/forward and copy-paste land on the
    // canonical form. Crawlers that don't execute JS won't see a 301
    // status — accepted SPA trade-off.
    if (decoded !== decoded.toLowerCase()) {
      navigate(`/resources/${encodeURIComponent(decoded.toLowerCase())}`, {
        replace: true,
      });
      return;
    }
    if (allTags.length > 0) {
      const found = allTags.find((t) => t.name.toLowerCase() === decoded.toLowerCase());
      if (found) {
        setSelectedTag(found);
        setTagNotFound(false);
        setViewMode('tag-detail');
        return;
      }
    }
    if (allTags.length > 0 || !loading) {
      (async () => {
        const tag = await fetchTagWithCategories(decoded);
        if (!tag) {
          // P1-4 — render an explicit 404 instead of silently falling
          // back to the overview.
          setSelectedTag(null);
          setTagNotFound(true);
          setViewMode('not-found');
          return;
        }
        setSelectedTag(tag as CentralizedTag);
        setTagNotFound(false);
        setViewMode('tag-detail');
      })();
    }
  }, [tagName, allTags, loading, navigate]);

  // Filter + sort pipeline (used in search / filtered mode)
  const filteredAndSortedTags = useMemo(() => {
    if (!allTags || !Array.isArray(allTags)) return [];
    let filtered: CentralizedTag[] = viewMode === 'search' ? searchResults : allTags;
    if (filterCategory !== 'all') {
      filtered = filtered.filter((tag) =>
        tag.categories?.some(
          (c) => c.name === filterCategory || c.parent_name === filterCategory,
        ),
      );
    }
    if (usageFilter === 'used') {
      filtered = filtered.filter((t) => (tagUsageCounts[t.name] || 0) > 0);
    } else if (usageFilter === 'unused') {
      filtered = filtered.filter((t) => (tagUsageCounts[t.name] || 0) === 0);
    }
    if (hasImageFilter) filtered = filtered.filter((t) => isRealTagImage(t.image_url));

    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'usage':
          return dir * ((tagUsageCounts[b.name] || 0) - (tagUsageCounts[a.name] || 0));
        case 'recent':
          return (
            dir *
            (new Date(b.created_at || 0).getTime() -
              new Date(a.created_at || 0).getTime())
          );
        default: {
          const cmp = a.name.localeCompare(b.name);
          return sortDirection === 'asc' ? cmp : -cmp;
        }
      }
    });
  }, [
    allTags,
    searchResults,
    filterCategory,
    sortBy,
    sortDirection,
    tagUsageCounts,
    viewMode,
    usageFilter,
    hasImageFilter,
  ]);

  // Parents in canonical order
  const orderedParents = useMemo<CategoryTreeNode[]>(
    () =>
      parentOrder
        .map((name) => categoriesTree.find((c) => c.name === name))
        .filter((c): c is CategoryTreeNode => !!c),
    [categoriesTree],
  );

  // P1-5 — per-page metadata for the tag-detail view. SPA caveat: meta
  // is JS-injected so crawlers without JS won't pick it up; documented
  // in the bug report's Stack Adaptation note.
  const tagDetailMeta = useMemo(() => {
    if (viewMode !== 'tag-detail' || !selectedTag) return null;
    const desc =
      selectedTag.description?.trim() ||
      `${selectedTag.name} — Queer Guide resource term and related content.`;
    const slug = selectedTag.slug || encodeURIComponent(selectedTag.name);
    const jsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'DefinedTerm',
      name: selectedTag.name,
      description: desc,
      url: `https://queer.guide/resources/${slug}`,
    };
    if (selectedTag.image_url) jsonLd.image = selectedTag.image_url;
    return {
      title: selectedTag.name,
      description: desc,
      ogImage: selectedTag.image_url || undefined,
      ogType: 'article' as const,
      canonicalPath: `/resources/${slug}`,
      jsonLd,
    };
  }, [viewMode, selectedTag]);
  useMeta(tagDetailMeta ?? {});

  const handleSearch = useCallback(
    (query: string) => {
      updateParam('q', query.trim() ? query : null);
      if (!query.trim()) {
        setViewMode('overview');
        setSearchResults([]);
        return;
      }
      const lower = query.toLowerCase();
      const local = allTags
        .filter(
          (t) =>
            t.name.toLowerCase().includes(lower) ||
            (t.description && t.description.toLowerCase().includes(lower)),
        )
        .slice(0, 50);
      setSearchResults(local);
      setViewMode('search');
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(async () => {
        const server = await searchTags(query);
        const ids = new Set(local.map((t) => t.id));
        setSearchResults([...local, ...server.filter((t) => !ids.has(t.id))]);
      }, 300);
    },
    [allTags, searchTags, updateParam],
  );

  const handleTagClick = (tag: CentralizedTag) => {
    setSelectedTag(tag);
    setViewMode('tag-detail');
    navigate(`/resources/${encodeURIComponent(tag.name)}`);
  };

  const handleBack = () => {
    if (viewMode === 'tag-detail') {
      if (selectedSubcategory) setViewMode('subcategory');
      else if (selectedCategory) setViewMode('category');
      else setViewMode('overview');
      navigate('/resources');
    } else if (viewMode === 'subcategory') {
      setViewMode('category');
      setSelectedSubcategory('');
    } else if (viewMode === 'category') {
      setViewMode('overview');
      setSelectedCategory('');
      setSelectedSubcategory('');
    } else if (viewMode === 'professions' || viewMode === 'graph') {
      setViewMode('overview');
    } else if (viewMode === 'search') {
      setViewMode('overview');
      updateParam('q', null);
      setSearchResults([]);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 md:py-16 px-4">
        <PageLoadingState count={12} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="container mx-auto py-8 md:py-16 px-4">
        <ErrorState
          message="Something went wrong while loading resources. Please try again later."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  // ───────── Tag Not Found (P1-4) ─────────
  if (viewMode === 'not-found' || (tagName && tagNotFound)) {
    return (
      <div
        className="container mx-auto py-16 md:py-24 px-4 text-center"
        data-testid="tag-not-found"
      >
        <h1 className="text-3xl font-bold mb-2">Tag not found</h1>
        <p className="text-muted-foreground mb-6">
          We couldn&apos;t find a tag matching{' '}
          <code className="px-1 py-0.5 rounded bg-muted">/{tagName ?? ''}</code>.
        </p>
        <Button
          onClick={() => {
            setTagNotFound(false);
            setSelectedTag(null);
            setViewMode('overview');
            navigate('/resources');
          }}
        >
          Browse all resources
        </Button>
      </div>
    );
  }

  // ───────── Tag Detail ─────────
  if (viewMode === 'tag-detail' && selectedTag) {
    return (
      <ResourceTagDetail
        selectedTag={selectedTag}
        onNavigate={navigate}
        onSetViewMode={setViewMode}
        onSetSelectedCategory={setSelectedCategory}
        onSetSelectedSubcategory={setSelectedSubcategory}
        onTagClick={handleTagClick}
      />
    );
  }

  const showFilteredResults =
    viewMode === 'search' ||
    (viewMode === 'overview' &&
      (searchQuery || filterCategory !== 'all' || usageFilter !== 'all' || hasImageFilter));

  const isPureOverview = viewMode === 'overview' && !showFilteredResults;

  const filterBar = (
    <ResourcesFilterBar
      searchQuery={searchQuery}
      onSearch={handleSearch}
      displayMode={displayMode}
      onDisplayModeChange={setDisplayMode}
      viewMode={viewMode}
      onToggleGraph={() => setViewMode(viewMode === 'graph' ? 'overview' : 'graph')}
      filterCategory={filterCategory}
      onFilterCategoryChange={setFilterCategory}
      usageFilter={usageFilter}
      onUsageFilterChange={setUsageFilter}
      hasImageFilter={hasImageFilter}
      onHasImageFilterChange={setHasImageFilter}
      sortBy={sortBy}
      onSortByChange={setSortBy}
      sortDirection={sortDirection}
      onSortDirectionToggle={() =>
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
      }
      categoriesTree={categoriesTree}
    />
  );

  return (
    <div className="relative">
      <div className="container mx-auto pt-8 md:pt-10 pb-8 md:pb-12 px-4 relative">

      <header className="mb-6 md:mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">
          Support
        </p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Help &amp; resources.</h1>
        <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-2xl">
          Crisis support, practical guides, and the people and organisations behind them.
        </p>
      </header>

      {isPureOverview && (
        <div className="flex flex-col gap-10 mb-10">
          <CrisisStrip />
          <TopicHubGrid />
          <OrgsDirectory />
        </div>
      )}

      {!isPureOverview && filterBar}

      {/* ───────── Graph ───────── */}
      {viewMode === 'graph' && (
        <Suspense fallback={<PageLoadingState count={1} />}>
          <Card style={{ marginBottom: 24 }}>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <Network style={{ width: 20, height: 20 }} />
                  <span className="text-base">Tag Relationship Graph</span>
                </div>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Explore how tags relate by semantic similarity and co-occurrence
              </p>
            </CardHeader>
            <CardContent>
              <div className="w-full h-[400px] md:h-[600px]">
                <TagRelationshipGraph
                  onTagClick={(t) => handleTagClick({ name: t.name, id: t.id } as CentralizedTag)}
                  categoryFilter={filterCategory !== 'all' ? filterCategory : null}
                  categories={orderedParents.map((p) => p.name)}
                />
              </div>
            </CardContent>
          </Card>
        </Suspense>
      )}

      {/* ───────── Overview — explore disclosure ───────── */}
      {isPureOverview && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-3 rounded-element border border-border bg-background px-4 py-3 text-left hover:bg-muted transition-colors group"
              aria-label="Browse all topics, search and advanced filters"
            >
              <span className="font-semibold text-sm">Browse all topics &amp; search</span>
              <ChevronDown
                aria-hidden
                className="opacity-60 transition-transform group-data-[state=open]:rotate-180"
                style={{ width: 16, height: 16 }}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 flex flex-col gap-4">
            {filterBar}
            <ResourceOverview
              popularTags={[]}
              orderedParents={orderedParents}
              tagUsageCounts={tagUsageCounts}
              professionCount={professions.length}
              onTagClick={handleTagClick}
              onShowProfessions={() => setViewMode('professions')}
            />
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ───────── Category ───────── */}
      {viewMode === 'category' && selectedCategory && (
        <ResourceCategory
          selectedCategory={selectedCategory}
          categoriesTree={categoriesTree}
          allTags={allTags}
          tagUsageCounts={tagUsageCounts}
          displayMode={displayMode}
          onTagClick={handleTagClick}
          onBack={handleBack}
          onSelectSubcategory={(name) => {
            setSelectedSubcategory(name);
            setViewMode('subcategory');
          }}
        />
      )}

      {/* ───────── Subcategory ───────── */}
      {viewMode === 'subcategory' && selectedSubcategory && (
        <ResourceSubcategory
          selectedSubcategory={selectedSubcategory}
          categoriesTree={categoriesTree}
          allTags={allTags}
          tagUsageCounts={tagUsageCounts}
          displayMode={displayMode}
          onTagClick={handleTagClick}
          onBack={handleBack}
          onNavigateToParent={(parentName) => {
            setSelectedCategory(parentName);
            setSelectedSubcategory('');
            setViewMode('category');
          }}
        />
      )}

      {/* ───────── Professions ───────── */}
      {viewMode === 'professions' && (
        <ResourceProfessions
          professions={professions}
          onBack={handleBack}
          onNavigate={navigate}
        />
      )}

      {/* ───────── Search / Filtered ───────── */}
      {showFilteredResults && (
        <ResourceSearch
          viewMode={viewMode}
          filterCategory={filterCategory}
          filteredAndSortedTags={filteredAndSortedTags}
          tagUsageCounts={tagUsageCounts}
          displayMode={displayMode}
          onTagClick={handleTagClick}
        />
      )}
      </div>
    </div>
  );
}
