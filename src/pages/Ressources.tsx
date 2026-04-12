import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
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
import { supabase } from '@/integrations/supabase/client';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Tag, ChevronRight, Network, Briefcase, Zap } from 'lucide-react';
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
  | 'graph';
type DisplayMode = 'chips' | 'grid' | 'list';
type SortOption = 'alphabetical' | 'usage' | 'recent';

// ─────────────── Shared hover-card sx ───────────────
const hoverCardSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  minHeight: 44,
  px: 2,
  py: 1.5,
  borderRadius: 2,
  cursor: 'pointer',
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'divider',
  textAlign: 'left',
  font: 'inherit',
  color: 'inherit',
  width: '100%',
  transition: 'all 0.15s',
  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
} as const;

export default function Ressources() {
  const { tagName } = useParams<{ tagName: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { allTags, categoriesTree, loading, error, searchTags } = useCentralizedTags();
  const { data: tagUsageCounts = {} } = useTagUsageCounts();

  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<CentralizedTag | null>(null);
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

  // Load professions once
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('personalities')
          .select('profession')
          .not('profession', 'is', null);
        if (data) {
          const unique = [...new Set(data.map((p) => p.profession).filter(Boolean))].sort();
          setProfessions(unique as string[]);
        }
      } catch (e) {
        console.error('Error loading professions:', e);
      }
    })();
  }, []);

  // Profession filter from URL
  useEffect(() => {
    const profession = searchParams.get('profession');
    if (profession) {
      setViewMode('search');
      setSearchQuery(profession);
    }
  }, [searchParams]);

  // Load individual tag from route param
  useEffect(() => {
    if (!tagName) return;
    const decoded = decodeURIComponent(tagName);
    if (allTags.length > 0) {
      const found = allTags.find((t) => t.name.toLowerCase() === decoded.toLowerCase());
      if (found) {
        setSelectedTag(found);
        setViewMode('tag-detail');
        return;
      }
    }
    if (allTags.length > 0 || !loading) {
      (async () => {
        const { data } = await supabase
          .from('unified_tags')
          .select('*')
          .ilike('name', decoded)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        if (!data) return;
        const { data: catAssignments } = await supabase
          .from('tag_category_assignments')
          .select(
            'tag_id, category_id, is_primary, tag_categories(id, name, slug, level, parent_id)',
          )
          .eq('tag_id', data.id);
        const cats = (catAssignments || [])
          .map((a: { tag_categories: { id: string; name: string; slug: string; level: number; parent_id: string | null } | null; is_primary: boolean }) => {
            const c = a.tag_categories;
            return c
              ? {
                  id: c.id,
                  name: c.name,
                  slug: c.slug,
                  level: c.level,
                  parent_id: c.parent_id,
                  parent_name: null as string | null,
                  is_primary: a.is_primary,
                }
              : null;
          })
          .filter(Boolean) as { id: string; name: string; slug: string; level: number; parent_id: string | null; parent_name: string | null; is_primary: boolean }[];
        if (cats.length > 0) {
          const parentIds = cats.filter((c) => c.parent_id).map((c) => c.parent_id);
          if (parentIds.length > 0) {
            const { data: parents } = await supabase
              .from('tag_categories')
              .select('id, name')
              .in('id', parentIds);
            const pm = new Map((parents || []).map((p: { id: string; name: string }) => [p.id, p.name]));
            cats.forEach((c) => {
              if (c.parent_id) c.parent_name = pm.get(c.parent_id) || null;
            });
          }
        }
        setSelectedTag({ ...data, categories: cats } as CentralizedTag);
        setViewMode('tag-detail');
      })();
    }
  }, [tagName, allTags, loading]);

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
        .sort((a, b) => (tagUsageCounts[b.name] || 0) - (tagUsageCounts[a.name] || 0))
        .slice(0, 24),
    [allTags, tagUsageCounts],
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
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
        <PageLoadingState count={12} />
      </Container>
    );
  }
  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
        <ErrorState
          message="Something went wrong while loading resources. Please try again later."
          onRetry={() => window.location.reload()}
        />
      </Container>
    );
  }

  // ───────── Tag Detail ─────────
  if (viewMode === 'tag-detail' && selectedTag) {
    const primary =
      selectedTag.categories?.find((c) => c.is_primary) ?? selectedTag.categories?.[0];
    const parentName = primary?.parent_name ?? undefined;
    const childName = primary?.level === 1 ? primary.name : undefined;
    return (
      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
        {/* Breadcrumbs */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            mb: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box
            component="button"
            onClick={() => {
              navigate('/resources');
              setViewMode('overview');
            }}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              p: 0,
              color: 'text.secondary',
              '&:hover': { color: 'primary.main' },
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            <Typography variant="body2" color="inherit">
              Resources
            </Typography>
          </Box>
          {parentName && (
            <>
              <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
              <Box
                component="button"
                onClick={() => {
                  setSelectedCategory(parentName);
                  setSelectedSubcategory('');
                  setViewMode('category');
                  navigate('/resources');
                }}
                sx={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  p: 0,
                  color: 'text.secondary',
                  '&:hover': { color: 'primary.main' },
                }}
              >
                <Typography variant="body2" color="inherit">
                  {getCategoryShortName(parentName)}
                </Typography>
              </Box>
            </>
          )}
          {childName && (
            <>
              <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
              <Box
                component="button"
                onClick={() => {
                  setSelectedCategory(parentName || childName);
                  setSelectedSubcategory(childName);
                  setViewMode('subcategory');
                  navigate('/resources');
                }}
                sx={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  p: 0,
                  color: 'text.secondary',
                  '&:hover': { color: 'primary.main' },
                }}
              >
                <Typography variant="body2" color="inherit">
                  {getCategoryShortName(childName)}
                </Typography>
              </Box>
            </>
          )}
          <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {selectedTag.name}
          </Typography>
        </Box>

        {/* Hero — only show image box when tag has an image */}
        {selectedTag.image_url ? (
          <Box
            sx={{
              width: '100%',
              aspectRatio: { xs: '16 / 9', md: '16 / 6' },
              borderRadius: 3,
              overflow: 'hidden',
              mb: 3,
              position: 'relative',
              bgcolor: 'action.hover',
            }}
          >
            <Box
              component="img"
              src={selectedTag.image_url}
              alt={selectedTag.name}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                p: { xs: 2.5, sm: 3 },
              }}
            >
              {primary && (
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.65)', mb: 0.25, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {parentName ? `${getCategoryShortName(parentName)} › ` : ''}
                  {getCategoryShortName(primary.name)}
                </Typography>
              )}
              <Typography variant="h4" component="h1" sx={{ fontWeight: 800, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.3)', lineHeight: 1.1 }}>
                {selectedTag.name}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Box sx={{ mb: 3 }}>
            {primary && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {parentName ? `${getCategoryShortName(parentName)} › ` : ''}
                {getCategoryShortName(primary.name)}
              </Typography>
            )}
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
              {selectedTag.name}
            </Typography>
          </Box>
        )}

        {selectedTag.description && (
          <Typography color="text.secondary" sx={{ lineHeight: 1.7, mb: 3, maxWidth: 680, fontSize: '0.9rem' }}>
            {selectedTag.description}
          </Typography>
        )}

        {/* Content grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3, minWidth: 0 }}>
          <TagLinkedContent tagId={selectedTag.id} tagName={selectedTag.name} />
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              position: { lg: 'sticky' },
              top: { lg: 80 },
              alignSelf: 'start',
            }}
          >
            <RelatedTagsCard
              tagId={selectedTag.id}
              onTagClick={(t) => handleTagClick({ name: t.name, id: t.id } as CentralizedTag)}
            />
          </Box>
        </Box>
      </Container>
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
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
      <PageHeader
        title="Resources"
        subtitle="LGBTQ+ terms, concepts and topics — organised into a clean, browsable taxonomy"
        center
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
          <Badge variant="secondary">{allTags.length} tags</Badge>
          <Badge variant="secondary">{orderedParents.length} categories</Badge>
        </Box>
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Network style={{ width: 20, height: 20 }} />
                  <Typography variant="h6" component="span">
                    Tag Relationship Graph
                  </Typography>
                </Box>
              </CardTitle>
              <Typography variant="body2" color="text.secondary">
                Explore how tags relate by semantic similarity and co-occurrence
              </Typography>
            </CardHeader>
            <CardContent>
              <Box sx={{ width: '100%', height: { xs: 400, md: 600 } }}>
                <TagRelationshipGraph
                  onTagClick={(t) => handleTagClick({ name: t.name, id: t.id } as CentralizedTag)}
                  categoryFilter={filterCategory !== 'all' ? filterCategory : null}
                  categories={orderedParents.map((p) => p.name)}
                />
              </Box>
            </CardContent>
          </Card>
        </Suspense>
      )}

      {/* ───────── Overview ───────── */}
      {viewMode === 'overview' && !showFilteredResults && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {popularTags.length > 0 && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Zap style={{ width: 18, height: 18 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Popular tags
                </Typography>
              </Box>
              <TagListRenderer
                tags={popularTags}
                displayMode="chips"
                tagUsageCounts={tagUsageCounts}
                onTagClick={handleTagClick}
              />
            </Box>
          )}

          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Browse by category
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  lg: 'repeat(3, 1fr)',
                },
                gap: 1.5,
              }}
            >
              {orderedParents.map((cat) => {
                const Icon = getCategoryIcon(cat.name);
                const activeChildren = cat.children?.filter((c) => c.tag_count > 0) ?? [];
                return (
                  <Box
                    key={cat.id}
                    component="button"
                    onClick={() => {
                      setSelectedCategory(cat.name);
                      setSelectedSubcategory('');
                      setFilterCategory('all');
                      setViewMode('category');
                    }}
                    sx={{
                      ...hoverCardSx,
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 0.75,
                      minHeight: 96,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Icon style={{ width: 18, height: 18, opacity: 0.75 }} />
                        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          {getCategoryShortName(cat.name)}
                        </Typography>
                      </Box>
                      <Badge variant="secondary">{cat.total_tag_count}</Badge>
                    </Box>
                    {activeChildren.length > 0 && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          fontSize: '0.7rem',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.4,
                        }}
                      >
                        {activeChildren
                          .map(
                            (c) => `${getCategoryShortName(c.name)} (${c.tag_count})`,
                          )
                          .join(' · ')}
                      </Typography>
                    )}
                  </Box>
                );
              })}
              <Box
                component="button"
                onClick={() => setViewMode('professions')}
                sx={{
                  ...hoverCardSx,
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 0.75,
                  minHeight: 96,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Briefcase style={{ width: 18, height: 18, opacity: 0.75 }} />
                    <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      Professions
                    </Typography>
                  </Box>
                  <Badge variant="secondary">{professions.length}</Badge>
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontSize: '0.7rem', lineHeight: 1.4 }}
                >
                  Browse LGBTQ+ personalities by profession
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {/* ───────── Category ───────── */}
      {viewMode === 'category' && selectedCategory && (
        <Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              mb: 3,
              flexWrap: 'wrap',
            }}
          >
            <Button variant="secondary" size="sm" onClick={handleBack}>
              <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
              Back
            </Button>
            {(() => {
              const Icon = getCategoryIcon(selectedCategory);
              return <Icon style={{ width: 18, height: 18 }} />;
            })()}
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {getCategoryShortName(selectedCategory)}
            </Typography>
            <Badge variant="secondary">
              {categoriesTree.find((c) => c.name === selectedCategory)?.total_tag_count ?? 0}
            </Badge>
          </Box>

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
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      sm: 'repeat(2, 1fr)',
                      md: 'repeat(3, 1fr)',
                      lg: 'repeat(4, 1fr)',
                    },
                    gap: 1.5,
                  }}
                >
                  {activeChildren.map((child) => {
                    const Icon = getCategoryIcon(child.name);
                    return (
                      <Box
                        key={child.id}
                        component="button"
                        onClick={() => {
                          setSelectedSubcategory(child.name);
                          setViewMode('subcategory');
                        }}
                        sx={hoverCardSx}
                      >
                        <Icon style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.65 }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {getCategoryShortName(child.name)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {child.tag_count} tags
                          </Typography>
                        </Box>
                        <ChevronRight
                          style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.4 }}
                        />
                      </Box>
                    );
                  })}
                </Box>

                {activeChildren.map((child) => {
                  const childTags = allTags
                    .filter((t) => t.categories?.some((c) => c.id === child.id))
                    .sort(
                      (a, b) => (tagUsageCounts[b.name] || 0) - (tagUsageCounts[a.name] || 0),
                    )
                    .slice(0, 10);
                  if (childTags.length === 0) return null;
                  return (
                    <Box key={child.id}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          mb: 1.5,
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {getCategoryShortName(child.name)}
                          </Typography>
                          <Badge variant="secondary">{child.tag_count}</Badge>
                        </Box>
                        <Box
                          component="button"
                          onClick={() => {
                            setSelectedSubcategory(child.name);
                            setViewMode('subcategory');
                          }}
                          sx={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            p: 0,
                            color: 'primary.main',
                            fontSize: '0.75rem',
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        >
                          View all →
                        </Box>
                      </Box>
                      {renderTagList(childTags)}
                    </Box>
                  );
                })}
              </Box>
            );
          })()}
        </Box>
      )}

      {/* ───────── Subcategory ───────── */}
      {viewMode === 'subcategory' && selectedSubcategory && (
        <Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              mb: 3,
              flexWrap: 'wrap',
            }}
          >
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
                    <Box
                      component="button"
                      onClick={() => {
                        setSelectedCategory(parent.name);
                        setSelectedSubcategory('');
                        setViewMode('category');
                      }}
                      sx={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        p: 0,
                        color: 'text.secondary',
                        '&:hover': { color: 'primary.main' },
                      }}
                    >
                      <Typography variant="body2" color="inherit">
                        {getCategoryShortName(parent.name)}
                      </Typography>
                    </Box>
                  )}
                  <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
                  <Icon style={{ width: 18, height: 18 }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {getCategoryShortName(selectedSubcategory)}
                  </Typography>
                  <Badge variant="secondary">{subTags.length}</Badge>
                </>
              );
            })()}
          </Box>
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
        </Box>
      )}

      {/* ───────── Professions ───────── */}
      {viewMode === 'professions' && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <Button variant="secondary" size="sm" onClick={handleBack}>
              <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
              Back
            </Button>
            <Briefcase style={{ width: 18, height: 18 }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Professions
            </Typography>
            <Badge variant="secondary">{professions.length}</Badge>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {professions.map((profession) => (
              <Box
                key={profession}
                component="button"
                onClick={() =>
                  navigate(`/personalities?profession=${encodeURIComponent(profession)}`)
                }
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 36,
                  px: 1.75,
                  py: 0.75,
                  borderRadius: 999,
                  cursor: 'pointer',
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  font: 'inherit',
                  color: 'inherit',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                  transition: 'all 0.15s',
                }}
              >
                <Typography sx={{ fontWeight: 500, fontSize: '0.8rem' }}>{profession}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ───────── Search / Filtered ───────── */}
      {showFilteredResults && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {viewMode === 'search'
                ? 'Search results'
                : filterCategory !== 'all'
                  ? `${getCategoryShortName(filterCategory)} tags`
                  : 'Filtered tags'}
            </Typography>
            <Badge variant="secondary">{filteredAndSortedTags.length}</Badge>
          </Box>
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
        </Box>
      )}
    </Container>
  );
}
