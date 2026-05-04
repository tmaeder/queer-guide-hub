import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import {
  useCentralizedTags,
  useTagUsageCounts,
  type CategoryTreeNode,
  type CentralizedTag,
} from '@/hooks/useCentralizedTags';
import { RelatedTagsCard } from '@/components/tags/RelatedTagsCard';
import { TagLinkedContent } from '@/components/tags/TagLinkedContent';
import { ResourcesFilterBar } from '@/components/resources/ResourcesFilterBar';
import { TagListRenderer } from '@/components/resources/TagListRenderer';
import {
  getCategoryIcon,
  getCategoryShortName,
  parentOrder,
} from '@/components/resources/categoryMeta';
import { fetchAllProfessions, fetchTagWithCategories } from '@/hooks/usePageFetchers';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';
import { TagDetailWithGate } from '@/components/age-gate/TagDetailWithGate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Tag, ChevronRight, Network, Briefcase, Zap, AlertTriangle, Phone } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';

const TagRelationshipGraph = lazy(() => import('@/components/tags/TagRelationshipGraph'));

type ViewMode =
  | 'overview'
  | 'category'
  | 'subcategory'
  | 'search'
  | 'tag-detail'
  | 'professions'
  | 'graph'
  | 'not-found';
type DisplayMode = 'chips' | 'grid' | 'list';
type SortOption = 'alphabetical' | 'usage' | 'recent';

// ─────────────── Shared hover-card class ───────────────
const hoverCardCls =
  'flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer bg-background text-left text-inherit w-full transition-all duration-150 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary border-0';

export default function Ressources() {
  const { tagName } = useParams<{ tagName: string }>();
  const navigate = useLocalizedNavigate();
  const [searchParams] = useSearchParams();
  const { allTags, categoriesTree, loading, error, searchTags } = useCentralizedTags();
  const { data: tagUsageCounts = {} } = useTagUsageCounts();
  const safeMode = useSafeMode();
  const ageAffirmation = useAgeAffirmation();

  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<CentralizedTag | null>(null);
  const [tagNotFound, setTagNotFound] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<CentralizedTag[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('usage');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('grid');
  const [usageFilter, setUsageFilter] = useState<string>('all');
  const [hasImageFilter, setHasImageFilter] = useState(false);
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
      setSearchQuery(professionParam);
    }
  }, [professionParam]);

  // Category deep-link from URL (e.g. /resources?category=Health+%26+Wellness)
  const categoryParam = searchParams.get('category');
  useEffect(() => {
    if (!categoryParam || categoriesTree.length === 0) return;
    const decoded = decodeURIComponent(categoryParam);
    // Check parent categories first
    const parent = categoriesTree.find((c) => c.name === decoded);
    if (parent) {
      setSelectedCategory(parent.name);
      setSelectedSubcategory('');
      setFilterCategory('all');
      setViewMode('category');
      return;
    }
    // Check child categories
    for (const p of categoriesTree) {
      const child = p.children?.find((c) => c.name === decoded);
      if (child) {
        setSelectedCategory(p.name);
        setSelectedSubcategory(child.name);
        setViewMode('subcategory');
        return;
      }
    }
  }, [categoryParam, categoriesTree]);

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
    if (hasImageFilter) filtered = filtered.filter((t) => t.image_url);

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

  const popularTags = useMemo(
    () =>
      [...allTags]
        .filter((t) => (tagUsageCounts[t.name] || 0) > 0)
        .filter(
          (t) =>
            !safeMode.shouldHide([
              ...(t.categories?.map((c) => c.name) ?? []),
              ...(t.categories?.map((c) => c.parent_name ?? null) ?? []),
            ]),
        )
        .sort((a, b) => (tagUsageCounts[b.name] || 0) - (tagUsageCounts[a.name] || 0))
        .slice(0, 24),
    [allTags, tagUsageCounts, safeMode],
  );

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
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
    [allTags, searchTags],
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
      setSearchQuery('');
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
    const primary =
      selectedTag.categories?.find((c) => c.is_primary) ?? selectedTag.categories?.[0];
    const parentName = primary?.parent_name ?? undefined;
    const childName = primary?.level === 1 ? primary.name : undefined;
    const tagCategoryNames = [
      ...(selectedTag.categories?.map((c) => c.name) ?? []),
      ...(selectedTag.categories?.map((c) => c.parent_name ?? null) ?? []),
    ];
    const isAdult = tagCategoryNames.some((n) => safeMode.isAdultCategory(n));
    return (
      <TagDetailWithGate
        isAdult={isAdult}
        affirmed={ageAffirmation.affirmed}
        onDecline={() => {
          navigate('/resources');
          setViewMode('overview');
        }}
      >
      <div className="container mx-auto py-8 md:py-16 px-4">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 mb-4 flex-wrap">
          <button
            onClick={() => {
              navigate('/resources');
              setViewMode('overview');
            }}
            className="inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer p-0 text-muted-foreground hover:text-primary"
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            <span className="text-sm">Resources</span>
          </button>
          {parentName && (
            <>
              <ChevronRight style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
              <button
                onClick={() => {
                  setSelectedCategory(parentName);
                  setSelectedSubcategory('');
                  setViewMode('category');
                  navigate('/resources');
                }}
                className="bg-transparent border-0 cursor-pointer p-0 text-muted-foreground hover:text-primary"
              >
                <span className="text-sm">{getCategoryShortName(parentName)}</span>
              </button>
            </>
          )}
          {childName && (
            <>
              <ChevronRight style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
              <button
                onClick={() => {
                  setSelectedCategory(parentName || childName);
                  setSelectedSubcategory(childName);
                  setViewMode('subcategory');
                  navigate('/resources');
                }}
                className="bg-transparent border-0 cursor-pointer p-0 text-muted-foreground hover:text-primary"
              >
                <span className="text-sm">{getCategoryShortName(childName)}</span>
              </button>
            </>
          )}
          <ChevronRight style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
          <span className="text-sm font-medium">{selectedTag.name}</span>
        </div>

        {/* Hero — only show image box when tag has an image */}
        {selectedTag.image_url ? (
          <div
            className="w-full rounded-2xl overflow-hidden mb-6 relative bg-muted"
            style={{ aspectRatio: '16 / 9' }}
          >
            <img
              src={selectedTag.image_url}
              alt={selectedTag.name}
              className="w-full h-full object-cover"
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div
              className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)' }}
            >
              {primary && (
                <p className="font-semibold mb-1 uppercase" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.04em' }}>
                  {parentName ? `${getCategoryShortName(parentName)} › ` : ''}
                  {getCategoryShortName(primary.name)}
                </p>
              )}
              <h1 className="text-2xl font-extrabold text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.3)', lineHeight: 1.1 }}>
                {selectedTag.name}
              </h1>
            </div>
          </div>
        ) : (
          <div className="mb-6">
            {primary && (
              <p className="text-sm text-muted-foreground mb-1">
                {parentName ? `${getCategoryShortName(parentName)} › ` : ''}
                {getCategoryShortName(primary.name)}
              </p>
            )}
            <h1 className="text-2xl font-bold">{selectedTag.name}</h1>
          </div>
        )}

        {selectedTag.description && (
          <p className="text-muted-foreground mb-6" style={{ lineHeight: 1.7, maxWidth: 680, fontSize: '0.9rem' }}>
            {selectedTag.description}
          </p>
        )}

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 min-w-0">
          <TagLinkedContent tagId={selectedTag.id} tagName={selectedTag.name} />
          <div className="flex flex-col gap-6 lg:sticky self-start" style={{ top: 80 }}>
            <RelatedTagsCard
              tagId={selectedTag.id}
              onTagClick={(t) => handleTagClick({ name: t.name, id: t.id } as CentralizedTag)}
            />
          </div>
        </div>
      </div>
      </TagDetailWithGate>
    );
  }

  const renderTagList = (tags: CentralizedTag[]) => (
    <TagListRenderer
      tags={tags}
      displayMode={displayMode}
      tagUsageCounts={tagUsageCounts}
      onTagClick={handleTagClick}
    />
  );

  const showFilteredResults =
    viewMode === 'search' ||
    (viewMode === 'overview' &&
      (searchQuery || filterCategory !== 'all' || usageFilter !== 'all' || hasImageFilter));

  return (
    <div className="container mx-auto py-8 md:py-16 px-4">
      <PageHeader
        title="Resources"
        subtitle="LGBTQ+ terms, concepts and topics — organised into a clean, browsable taxonomy"
        center
      >
        <div className="flex items-center justify-center gap-3">
          <Badge variant="secondary">{allTags.length} tags</Badge>
          <Badge variant="secondary">{orderedParents.length} categories</Badge>
        </div>
      </PageHeader>

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
        onSortDirectionToggle={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
        categoriesTree={categoriesTree}
      />

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

      {/* ───────── Overview ───────── */}
      {viewMode === 'overview' && !showFilteredResults && (
        <div className="flex flex-col gap-8">
          {popularTags.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Zap style={{ width: 18, height: 18 }} />
                <h6 className="text-base font-semibold">Popular tags</h6>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-xs"
                  onClick={() => safeMode.toggle()}
                  data-testid="safe-mode-toggle"
                  aria-pressed={!safeMode.enabled}
                >
                  {safeMode.enabled ? 'Show 18+ content' : 'Hide 18+ content'}
                </Button>
              </div>
              <TagListRenderer
                tags={popularTags}
                displayMode="chips"
                tagUsageCounts={tagUsageCounts}
                onTagClick={handleTagClick}
              />
            </div>
          )}

          <div>
            <h6 className="text-base font-semibold mb-4">Browse by category</h6>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {orderedParents.map((cat) => {
                const Icon = getCategoryIcon(cat.name);
                const activeChildren = cat.children?.filter((c) => c.tag_count > 0) ?? [];
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.name);
                      setSelectedSubcategory('');
                      setFilterCategory('all');
                      setViewMode('category');
                    }}
                    className={`${hoverCardCls} flex-col items-stretch gap-1.5`}
                    style={{ minHeight: 96 }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon style={{ width: 18, height: 18, opacity: 0.75 }} />
                        <span className="font-semibold" style={{ fontSize: '0.9rem' }}>
                          {getCategoryShortName(cat.name)}
                        </span>
                      </div>
                      <Badge
                        variant="secondary"
                        title={`${cat.total_tag_count} tags total (across all subcategories)`}
                        aria-label={`${cat.total_tag_count} tags total across all subcategories`}
                      >
                        {cat.total_tag_count}
                      </Badge>
                    </div>
                    {activeChildren.length > 0 && (
                      <span
                        className="text-xs text-muted-foreground overflow-hidden"
                        style={{
                          fontSize: '0.7rem',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          lineHeight: 1.4,
                        }}
                        title="Each subcategory's count is the number of tags directly assigned to it"
                      >
                        {activeChildren
                          .map((c) => `${getCategoryShortName(c.name)} (${c.tag_count})`)
                          .join(' · ')}
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                onClick={() => setViewMode('professions')}
                className={`${hoverCardCls} flex-col items-stretch gap-1.5`}
                style={{ minHeight: 96 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Briefcase style={{ width: 18, height: 18, opacity: 0.75 }} />
                    <span className="font-semibold" style={{ fontSize: '0.9rem' }}>
                      Professions
                    </span>
                  </div>
                  <Badge variant="secondary">{professions.length}</Badge>
                </div>
                <span className="text-xs text-muted-foreground" style={{ fontSize: '0.7rem', lineHeight: 1.4 }}>
                  Browse LGBTQ+ personalities by profession
                </span>
              </button>
              {/* Crisis help card */}
              <LocalizedLink
                to="/help"
                className={`${hoverCardCls} flex-col items-stretch gap-1.5 no-underline text-inherit border-l-[3px] border-destructive`}
                style={{ minHeight: 96 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Phone style={{ width: 18, height: 18, opacity: 0.75 }} />
                    <span className="font-semibold" style={{ fontSize: '0.9rem' }}>
                      Crisis Hotlines
                    </span>
                  </div>
                  <ChevronRight style={{ width: 16, height: 16, opacity: 0.4 }} />
                </div>
                <span className="text-xs text-muted-foreground" style={{ fontSize: '0.7rem', lineHeight: 1.4 }}>
                  Free, anonymous LGBTQIA+ crisis support worldwide
                </span>
              </LocalizedLink>
            </div>
          </div>
        </div>
      )}

      {/* ───────── Category ───────── */}
      {viewMode === 'category' && selectedCategory && (
        <div>
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <Button variant="secondary" size="sm" onClick={handleBack}>
              <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
              Back
            </Button>
            {(() => {
              const Icon = getCategoryIcon(selectedCategory);
              return <Icon style={{ width: 18, height: 18 }} />;
            })()}
            <h6 className="text-base font-semibold">{getCategoryShortName(selectedCategory)}</h6>
            <Badge variant="secondary">
              {categoriesTree.find((c) => c.name === selectedCategory)?.total_tag_count ?? 0}
            </Badge>
          </div>

          {/* Crisis help banner in Support & News */}
          {selectedCategory === 'Support & News' && (
            <Alert className="mb-6">
              <AlertTriangle size={20} />
              <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
                <span>Need immediate help? Browse our curated crisis hotlines directory.</span>
                <Button asChild variant="outline" size="sm">
                  <LocalizedLink to="/help">
                    <Phone size={14} className="mr-1" />
                    Crisis Hotlines
                  </LocalizedLink>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {(() => {
            const node = categoriesTree.find((c) => c.name === selectedCategory);
            const activeChildren = node?.children?.filter((c) => c.tag_count > 0) ?? [];
            if (!node || activeChildren.length === 0) {
              const flat = allTags
                .filter((t) =>
                  t.categories?.some(
                    (c) => c.name === selectedCategory || c.parent_name === selectedCategory,
                  ),
                )
                .sort((a, b) => a.name.localeCompare(b.name));
              return flat.length > 0 ? (
                renderTagList(flat)
              ) : (
                <EmptyState
                  icon={Tag}
                  title="No tags in this category yet"
                  description="Check back soon — this bucket is being filled."
                  mood="encouraging"
                />
              );
            }
            return (
              <div className="flex flex-col gap-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {activeChildren.map((child) => {
                    const Icon = getCategoryIcon(child.name);
                    return (
                      <button
                        key={child.id}
                        onClick={() => {
                          setSelectedSubcategory(child.name);
                          setViewMode('subcategory');
                        }}
                        className={hoverCardCls}
                      >
                        <Icon style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.65 }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold" style={{ fontSize: '0.85rem' }}>
                            {getCategoryShortName(child.name)}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {child.tag_count} tags
                          </span>
                        </div>
                        <ChevronRight
                          style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.4 }}
                        />
                      </button>
                    );
                  })}
                </div>

                {activeChildren.map((child) => {
                  const childTags = allTags
                    .filter((t) => t.categories?.some((c) => c.id === child.id))
                    .sort(
                      (a, b) => (tagUsageCounts[b.name] || 0) - (tagUsageCounts[a.name] || 0),
                    )
                    .slice(0, 10);
                  if (childTags.length === 0) return null;
                  return (
                    <div key={child.id}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{getCategoryShortName(child.name)}</p>
                          <Badge variant="secondary">{child.tag_count}</Badge>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedSubcategory(child.name);
                            setViewMode('subcategory');
                          }}
                          className="bg-transparent border-0 cursor-pointer p-0 text-primary text-xs hover:underline"
                        >
                          View all →
                        </button>
                      </div>
                      {renderTagList(childTags)}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ───────── Subcategory ───────── */}
      {viewMode === 'subcategory' && selectedSubcategory && (
        <div>
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <Button variant="secondary" size="sm" onClick={handleBack}>
              <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
              Back
            </Button>
            {(() => {
              const parent = categoriesTree.find((c) =>
                c.children.some((ch) => ch.name === selectedSubcategory),
              );
              const Icon = getCategoryIcon(selectedSubcategory);
              const subTags = allTags
                .filter((t) => t.categories?.some((c) => c.name === selectedSubcategory))
                .sort((a, b) => a.name.localeCompare(b.name));
              return (
                <>
                  {parent && (
                    <button
                      onClick={() => {
                        setSelectedCategory(parent.name);
                        setSelectedSubcategory('');
                        setViewMode('category');
                      }}
                      className="bg-transparent border-0 cursor-pointer p-0 text-muted-foreground hover:text-primary"
                    >
                      <span className="text-sm">{getCategoryShortName(parent.name)}</span>
                    </button>
                  )}
                  <ChevronRight style={{ width: 14, height: 14, color: 'hsl(var(--muted-foreground))' }} />
                  <Icon style={{ width: 18, height: 18 }} />
                  <h6 className="text-base font-semibold">{getCategoryShortName(selectedSubcategory)}</h6>
                  <Badge variant="secondary">{subTags.length}</Badge>
                </>
              );
            })()}
          </div>
          {(() => {
            const subTags = allTags
              .filter((t) => t.categories?.some((c) => c.name === selectedSubcategory))
              .sort((a, b) => a.name.localeCompare(b.name));
            return subTags.length > 0 ? (
              renderTagList(subTags)
            ) : (
              <EmptyState
                icon={Tag}
                title="No tags here yet"
                description="This subcategory is being populated."
                mood="encouraging"
              />
            );
          })()}
        </div>
      )}

      {/* ───────── Professions ───────── */}
      {viewMode === 'professions' && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <Button variant="secondary" size="sm" onClick={handleBack}>
              <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
              Back
            </Button>
            <Briefcase style={{ width: 18, height: 18 }} />
            <h6 className="text-base font-semibold">Professions</h6>
            <Badge variant="secondary">{professions.length}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {professions.map((profession) => (
              <button
                key={profession}
                onClick={() =>
                  navigate(`/personalities?profession=${encodeURIComponent(profession)}`)
                }
                className="inline-flex items-center px-3.5 py-1.5 rounded-full cursor-pointer bg-background text-inherit border-0 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary transition-all duration-150"
                style={{ minHeight: 36 }}
              >
                <span className="font-medium" style={{ fontSize: '0.8rem' }}>{profession}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ───────── Search / Filtered ───────── */}
      {showFilteredResults && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h6 className="text-base font-semibold">
              {viewMode === 'search'
                ? 'Search results'
                : filterCategory !== 'all'
                  ? `${getCategoryShortName(filterCategory)} tags`
                  : 'Filtered tags'}
            </h6>
            <Badge
              variant="secondary"
              title={`${filteredAndSortedTags.length} matching tags`}
              aria-label={`${filteredAndSortedTags.length} matching tags`}
            >
              {filteredAndSortedTags.length}
            </Badge>
          </div>
          {filteredAndSortedTags.length > 0 ? (
            renderTagList(filteredAndSortedTags)
          ) : (
            <EmptyState
              icon={Tag}
              title="Nothing here yet"
              description="Try broadening your filters or searching for something else."
              mood="encouraging"
            />
          )}
        </div>
      )}
    </div>
  );
}
