import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import {
  useCentralizedTags,
  useTagUsageCounts,
  type CategoryTreeNode,
  type CategoryTreeChild,
} from '@/hooks/useCentralizedTags';
import { useComputeTagSimilarities } from '@/hooks/useTagRelationships';
import { RelatedTagsCard } from '@/components/tags/RelatedTagsCard';
import { TagLinkedContent } from '@/components/tags/TagLinkedContent';
import { ResourcesFilterBar } from '@/components/resources/ResourcesFilterBar';
import { TagListRenderer } from '@/components/resources/TagListRenderer';
import { getCategoryIcon, getCategoryShortName } from '@/components/resources/categoryMeta';
import { supabase } from '@/integrations/supabase/client';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  Tag,
  Upload,
  Grid3X3,
  Briefcase,
  ChevronRight,
  Network,
  Brain,
  Zap,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
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
function ComputeRelationshipsButton() {
  const { mutate, isPending } = useComputeTagSimilarities();
  return (
    <Button
      onClick={() => mutate()}
      disabled={isPending}
      variant="secondary"
      size="sm"
      style={{ transition: 'all 0.2s' }}
    >
      <Network style={{ width: 14, height: 14, marginRight: 6 }} />
      {isPending ? 'Computing...' : 'Compute Relationships'}
    </Button>
  );
}

export default function Ressources() {
  const { tagName } = useParams<{
    tagName: string;
  }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { allTags, tagsByCategory, categoriesTree, loading, error, searchTags } =
    useCentralizedTags();
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('usage');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('chips');
  const [usageFilter, setUsageFilter] = useState<string>('all');
  const [hasImageFilter, setHasImageFilter] = useState(false);
  const [processingImages, setProcessingImages] = useState(false);
  const [categorizingTags, setCategorizingTags] = useState(false);
  const { data: tagUsageCounts = {} } = useTagUsageCounts();
  const [professions, setProfessions] = useState<string[]>([]);
  const [selectedProfession, setSelectedProfession] = useState<string>('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load professions from personalities
  useEffect(() => {
    const loadProfessions = async () => {
      try {
        const { data } = await supabase
          .from('personalities')
          .select('profession')
          .not('profession', 'is', null);
        if (data) {
          const uniqueProfessions = [
            ...new Set(data.map((p) => p.profession).filter(Boolean)),
          ].sort();
          setProfessions(uniqueProfessions);
        }
      } catch (error) {
        console.error('Error loading professions:', error);
      }
    };
    loadProfessions();
  }, []);

  // Handle profession filtering from URL params
  useEffect(() => {
    const profession = searchParams.get('profession');
    if (profession) {
      setSelectedProfession(profession);
      setViewMode('search');
      setSearchQuery(profession);
    }
  }, [searchParams]);

  // Usage counts now provided by useTagUsageCounts() hook via the DB tag_usage_summary view

  // Handle route parameter for individual tag pages
  useEffect(() => {
    if (!tagName) return;
    const decodedTagName = decodeURIComponent(tagName);

    // First try the preloaded list (fast path)
    if (allTags.length > 0) {
      const foundTag = allTags.find(
        (tag) => tag.name.toLowerCase() === decodedTagName.toLowerCase(),
      );
      if (foundTag) {
        setSelectedTag(foundTag);
        setViewMode('tag-detail');
        return;
      }
    }

    // If not found in preloaded list (could be outside top-1000 by usage_count),
    // fetch directly from Supabase
    if (allTags.length > 0 || !loading) {
      const fetchTagDirect = async () => {
        const { data } = await supabase
          .from('unified_tags')
          .select('*')
          .ilike('name', decodedTagName)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        if (data) {
          // Fetch category info for this tag
          const { data: catAssignments } = await supabase
            .from('tag_category_assignments')
            .select(
              'tag_id, category_id, is_primary, tag_categories(id, name, slug, level, parent_id)',
            )
            .eq('tag_id', data.id);
          const categories = (catAssignments || [])
            .map((a: any) => {
              const cat = a.tag_categories;
              return cat
                ? {
                    id: cat.id,
                    name: cat.name,
                    slug: cat.slug,
                    level: cat.level,
                    parent_id: cat.parent_id,
                    parent_name: null,
                    is_primary: a.is_primary,
                  }
                : null;
            })
            .filter(Boolean);
          // Look up parent names
          if (categories.length > 0) {
            const parentIds = categories
              .filter((c: any) => c.parent_id)
              .map((c: any) => c.parent_id);
            if (parentIds.length > 0) {
              const { data: parents } = await supabase
                .from('tag_categories')
                .select('id, name')
                .in('id', parentIds);
              const parentMap = new Map((parents || []).map((p: any) => [p.id, p.name]));
              categories.forEach((c: any) => {
                if (c.parent_id) c.parent_name = parentMap.get(c.parent_id) || null;
              });
            }
          }
          setSelectedTag({ ...data, categories });
          setViewMode('tag-detail');
        }
      };
      fetchTagDirect();
    }
  }, [tagName, allTags, loading]);

  // Memoized filtered and sorted tags
  const filteredAndSortedTags = useMemo(() => {
    // Ensure all dependencies are initialized
    if (!allTags || !Array.isArray(allTags)) return [];
    if (!Array.isArray(searchResults)) return [];
    if (!tagUsageCounts || typeof tagUsageCounts !== 'object') return [];

    let filtered = viewMode === 'search' ? searchResults : allTags;

    // Filter by category (supports multi-category tags)
    if (filterCategory !== 'all') {
      filtered = filtered.filter((tag) => {
        if (tag.categories && tag.categories.length > 0) {
          return tag.categories.some((c) => c.name === filterCategory);
        }
        return tag.category === filterCategory;
      });
    }

    // Filter by usage
    if (usageFilter === 'used') {
      filtered = filtered.filter((tag) => (tagUsageCounts[tag.name] || 0) > 0);
    } else if (usageFilter === 'unused') {
      filtered = filtered.filter((tag) => (tagUsageCounts[tag.name] || 0) === 0);
    }

    // Filter by has image
    if (hasImageFilter) {
      filtered = filtered.filter((tag) => tag.image_url);
    }

    // Sort tags
    const dir = sortDirection === 'asc' ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'usage':
          return dir * ((tagUsageCounts[b.name] || 0) - (tagUsageCounts[a.name] || 0));
        case 'recent':
          return (
            dir * (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          );
        case 'alphabetical':
        default: {
          const cmp = a.name.localeCompare(b.name);
          return sortDirection === 'asc' ? cmp : -cmp;
        }
      }
    });
    return sorted;
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

  // Get unique categories (from multi-category assignments)
  const categories = useMemo(() => {
    const catSet = new Set<string>();
    allTags.forEach((tag) => {
      if (tag.categories && tag.categories.length > 0) {
        tag.categories.forEach((c) => catSet.add(c.name));
      } else if (tag.category) {
        catSet.add(tag.category);
      }
    });
    return [...catSet].sort();
  }, [allTags]);

  const categoryTags = useMemo(() => {
    if (!selectedCategory) return [];
    return allTags
      .filter((tag) => {
        if (tag.categories && tag.categories.length > 0) {
          return tag.categories.some((c) => c.name === selectedCategory);
        }
        return tag.category === selectedCategory;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allTags, selectedCategory]);

  // Categories sorted by tag count, with top tags for each
  const sortedCategories = useMemo(() => {
    return categories
      .filter((cat) => cat !== 'Miscellaneous')
      .map((cat) => {
        const tags = allTags.filter((t) => {
          if (t.categories && t.categories.length > 0) {
            return t.categories.some((c) => c.name === cat);
          }
          return t.category === cat;
        });
        // Sort by usage, then alphabetically for unused
        const topTags = [...tags]
          .sort((a, b) => {
            const ua = tagUsageCounts[a.name] || 0;
            const ub = tagUsageCounts[b.name] || 0;
            return ub - ua || a.name.localeCompare(b.name);
          })
          .slice(0, 6);
        return { name: cat, count: tags.length, topTags };
      })
      .sort((a, b) => b.count - a.count);
  }, [categories, allTags, tagUsageCounts]);

  // Popular tags = most used across venues/events/groups
  const popularTags = useMemo(() => {
    return [...allTags]
      .filter((t) => (tagUsageCounts[t.name] || 0) > 0)
      .sort((a, b) => (tagUsageCounts[b.name] || 0) - (tagUsageCounts[a.name] || 0))
      .slice(0, 24);
  }, [allTags, tagUsageCounts]);
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (!query.trim()) {
        setViewMode('overview');
        setSearchResults([]);
        return;
      }

      // Fast client-side pass: filter loaded tags by name or description
      const lower = query.toLowerCase();
      const localMatches = allTags
        .filter(
          (tag) =>
            tag.name.toLowerCase().includes(lower) ||
            (tag.description && tag.description.toLowerCase().includes(lower)),
        )
        .slice(0, 50);
      setSearchResults(localMatches);
      setViewMode('search');

      // Debounced server search for more thorough results (300ms)
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(async () => {
        const serverResults = await searchTags(query);
        // Merge: server results that aren't already in local matches
        const localIds = new Set(localMatches.map((t) => t.id));
        const merged = [...localMatches, ...serverResults.filter((t) => !localIds.has(t.id))];
        setSearchResults(merged);
      }, 300);
    },
    [allTags, searchTags],
  );
  const handleTagClick = (tag: any) => {
    setSelectedTag(tag);
    setViewMode('tag-detail');
    navigate(`/resources/${encodeURIComponent(tag.name)}`);
  };
  const handleBack = () => {
    if (viewMode === 'tag-detail') {
      if (selectedSubcategory) {
        setViewMode('subcategory');
      } else if (selectedCategory) {
        setViewMode('category');
      } else {
        setViewMode('overview');
      }
      navigate('/resources');
    } else if (viewMode === 'subcategory') {
      setViewMode('category');
      setSelectedSubcategory('');
    } else if (viewMode === 'category') {
      setViewMode('overview');
      setSelectedCategory('');
      setSelectedSubcategory('');
    } else if (viewMode === 'professions') {
      setViewMode('overview');
    } else if (viewMode === 'graph') {
      setViewMode('overview');
    } else if (viewMode === 'search') {
      setViewMode('overview');
      setSearchQuery('');
      setSearchResults([]);
    }
  };
  // categoryMeta, getCategoryIcon, getCategoryShortName now imported from @/components/resources/categoryMeta
  const storeTagImages = async () => {
    if (allTags.length === 0) return;
    setProcessingImages(true);
    toast({
      title: 'Processing Started',
      description: `Processing images for ${allTags.length} tags. This may take a while...`,
    });
    try {
      let successCount = 0;
      let errorCount = 0;
      for (let i = 0; i < allTags.length; i++) {
        const tag = allTags[i];
        try {
          const { data, error } = await supabase.functions.invoke('store-tag-images', {
            body: {
              tagId: tag.id,
              tagName: tag.name,
            },
          });
          if (error) {
            errorCount++;
          } else if (data?.success) {
            successCount++;
          } else {
            errorCount++;
          }
          if ((i + 1) % 10 === 0 || i === allTags.length - 1) {
            toast({
              title: 'Processing Progress',
              description: `Processed ${i + 1}/${allTags.length} tags (${successCount} successful)`,
            });
          }
        } catch (err) {
          errorCount++;
        }
      }
      toast({
        title: 'Processing Complete',
        description: `Processed ${allTags.length} tags. ${successCount} successful, ${errorCount} failed.`,
        variant: errorCount > 0 ? 'destructive' : 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Error processing tag images',
        variant: 'destructive',
      });
    } finally {
      setProcessingImages(false);
    }
  };
  const categorizeAllTags = async () => {
    setCategorizingTags(true);
    try {
      const { data, error } = await supabase.functions.invoke('categorize-tags');
      if (error) {
        toast({
          title: 'Categorization failed',
          description: `Failed to categorize tags: ${error.message}`,
          variant: 'destructive',
        });
      } else if (data?.success) {
        toast({
          title: 'Tags categorized',
          description: `Successfully categorized ${data.categorized_count} tags! Refreshing...`,
        });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        toast({
          title: 'Unexpected response',
          description: 'Received unexpected response from categorization service',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to categorize tags',
        variant: 'destructive',
      });
    } finally {
      setCategorizingTags(false);
    }
  };
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <PageLoadingState count={12} />
      </Container>
    );
  }
  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <ErrorState
          message="Something went wrong while loading resources. Please try again later."
          onRetry={() => window.location.reload()}
        />
      </Container>
    );
  }

  // Render Tag Detail View
  if (viewMode === 'tag-detail' && selectedTag) {
    const primaryCatInfo = selectedTag.categories?.find((c: any) => c.is_primary);
    const primaryCat = primaryCatInfo?.name || selectedTag.category;
    const parentCatName = primaryCatInfo?.parent_name;

    return (
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        {/* Breadcrumb (3-level: Resources > Parent > Subcategory > Tag) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2, flexWrap: 'wrap' }}>
          <Box
            component="button"
            onClick={() => {
              navigate('/resources');
              setViewMode('overview');
            }}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              p: 0,
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14, marginRight: 4 }} />
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ '&:hover': { color: 'primary.main' } }}
            >
              Resources
            </Typography>
          </Box>
          {parentCatName && (
            <>
              <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
              <Box
                component="button"
                onClick={() => {
                  setFilterCategory(parentCatName);
                  setViewMode('category');
                  setSelectedCategory(parentCatName);
                  setSelectedSubcategory('');
                  navigate('/resources');
                }}
                sx={{ background: 'none', border: 'none', cursor: 'pointer', p: 0 }}
              >
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ '&:hover': { color: 'primary.main' } }}
                >
                  {getCategoryShortName(parentCatName)}
                </Typography>
              </Box>
            </>
          )}
          {primaryCat && (
            <>
              <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
              <Box
                component="button"
                onClick={() => {
                  if (parentCatName) {
                    // This is a subcategory
                    setSelectedSubcategory(primaryCat);
                    setViewMode('subcategory');
                  } else {
                    setFilterCategory(primaryCat);
                    setViewMode('category');
                    setSelectedCategory(primaryCat);
                  }
                  navigate('/resources');
                }}
                sx={{ background: 'none', border: 'none', cursor: 'pointer', p: 0 }}
              >
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ '&:hover': { color: 'primary.main' } }}
                >
                  {getCategoryShortName(primaryCat)}
                </Typography>
              </Box>
            </>
          )}
          <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {selectedTag.name}
          </Typography>
        </Box>

        {/* Hero Image */}
        {selectedTag.image_url && (
          <Box
            sx={{
              width: '100%',
              height: { xs: 160, md: 200 },
              borderRadius: 3,
              overflow: 'hidden',
              mb: 3,
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
          </Box>
        )}

        {/* Title + Category + Description */}
        <Paper
          variant="outlined"
          sx={{ p: { xs: 2.5, sm: 3 }, mb: 3, bgcolor: 'background.paper' }}
        >
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
            {selectedTag.name}
          </Typography>
          {primaryCat && (
            <Typography variant="body2" color="text.secondary">
              {parentCatName ? `${getCategoryShortName(parentCatName)} › ` : ''}
              {getCategoryShortName(primaryCat)}
              {selectedTag.categories && selectedTag.categories.length > 1 && (
                <>
                  {' · '}
                  {selectedTag.categories
                    .filter((c: any) => !c.is_primary)
                    .map((c: any) => {
                      const pName = c.parent_name
                        ? `${getCategoryShortName(c.parent_name)} › `
                        : '';
                      return `${pName}${getCategoryShortName(c.name)}`;
                    })
                    .join(' · ')}
                </>
              )}
            </Typography>
          )}
          {selectedTag.description && (
            <Typography color="text.secondary" sx={{ lineHeight: 1.7, mt: 1.5 }}>
              {selectedTag.description}
            </Typography>
          )}
        </Paper>

        {/* 2-Column Layout: Linked content + Sidebar */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
          {/* Left: Linked Content */}
          <TagLinkedContent tagId={selectedTag.id} tagName={selectedTag.name} />

          {/* Right: Related Tags */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <RelatedTagsCard
              tagId={selectedTag.id}
              onTagClick={(tag) => handleTagClick({ name: tag.name, id: tag.id })}
            />
          </Box>
        </Box>
      </Container>
    );
  }
  // Render tags in the selected display mode
  const renderTagList = (tags: any[]) => (
    <TagListRenderer
      tags={tags}
      displayMode={displayMode}
      tagUsageCounts={tagUsageCounts}
      onTagClick={handleTagClick}
    />
  );

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
      {/* Header */}
      <PageHeader
        title="Resources"
        subtitle="Discover and explore LGBTQ+ community tags, resources, and professions"
        center
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <Badge variant="secondary">{allTags.length} Total Tags</Badge>
          <Badge variant="secondary">{categories.length} Categories</Badge>
        </Box>
      </PageHeader>

      {/* Search and Filters */}
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

      {/* Graph View */}
      {viewMode === 'graph' && (
        <Suspense fallback={<PageLoadingState count={1} />}>
          <Card style={{ marginBottom: 24 }}>
            <CardHeader>
              <CardTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Network style={{ width: 24, height: 24 }} />
                  <Typography variant="h5" component="span">
                    Tag Relationship Graph
                  </Typography>
                </Box>
              </CardTitle>
              <Typography color="text.secondary">
                Explore how tags relate to each other based on semantic similarity and co-occurrence
              </Typography>
            </CardHeader>
            <CardContent>
              <Box sx={{ width: '100%', height: { xs: 400, md: 600 } }}>
                <TagRelationshipGraph
                  onTagClick={(tag) => handleTagClick({ name: tag.name, id: tag.id })}
                  categoryFilter={filterCategory !== 'all' ? filterCategory : null}
                  categories={categories}
                />
              </Box>
            </CardContent>
          </Card>
        </Suspense>
      )}

      {/* Overview — curated landing page (only when no filters active) */}
      {viewMode === 'overview' &&
        !searchQuery &&
        filterCategory === 'all' &&
        usageFilter === 'all' &&
        !hasImageFilter && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Popular Tags */}
            {popularTags.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Zap style={{ width: 18, height: 18 }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Popular Tags
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {popularTags.map((tag) => (
                    <Box
                      key={tag.id}
                      onClick={() => handleTagClick(tag)}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.75,
                        px: 1.5,
                        py: 0.75,
                        borderRadius: 2,
                        cursor: 'pointer',
                        bgcolor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        '&:hover': { borderColor: 'primary.main', bgcolor: 'secondary.main' },
                        transition: 'all 0.15s',
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                        {tag.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: '0.7rem' }}
                      >
                        {tagUsageCounts[tag.name]}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Browse by Category — hierarchical with subcategory counts */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Grid3X3 style={{ width: 18, height: 18 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Browse by Category
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {categoriesTree
                  .filter((cat) => cat.name !== 'Miscellaneous')
                  .map((cat) => {
                    const Icon = getCategoryIcon(cat.name);
                    const hasChildren = cat.children && cat.children.length > 0;
                    return (
                      <Box
                        key={cat.id}
                        onClick={() => {
                          setFilterCategory(cat.name);
                          setViewMode('category');
                          setSelectedCategory(cat.name);
                        }}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          px: 2,
                          py: 1.5,
                          borderRadius: 2,
                          cursor: 'pointer',
                          bgcolor: 'background.paper',
                          border: '1px solid',
                          borderColor: 'divider',
                          '&:hover': { borderColor: 'primary.main', bgcolor: 'secondary.main' },
                          transition: 'all 0.15s',
                        }}
                      >
                        <Icon style={{ width: 18, height: 18, flexShrink: 0, opacity: 0.7 }} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {getCategoryShortName(cat.name)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {cat.total_tag_count}
                            </Typography>
                          </Box>
                          {hasChildren ? (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {cat.children.map((child, idx) => (
                                <Typography
                                  key={child.id}
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ fontSize: '0.7rem' }}
                                >
                                  {child.name} ({child.tag_count})
                                  {idx < cat.children.length - 1 ? ',' : ''}
                                </Typography>
                              ))}
                              {cat.tag_count > 0 && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ fontSize: '0.7rem' }}
                                >
                                  + {cat.tag_count} general
                                </Typography>
                              )}
                            </Box>
                          ) : (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {sortedCategories
                                .find((sc) => sc.name === cat.name)
                                ?.topTags.map((tag, idx, arr) => (
                                  <Typography
                                    key={tag.id}
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ fontSize: '0.7rem' }}
                                  >
                                    {tag.name}
                                    {idx < arr.length - 1 ? ',' : ''}
                                  </Typography>
                                ))}
                            </Box>
                          )}
                        </Box>
                        <ChevronRight
                          style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.4 }}
                        />
                      </Box>
                    );
                  })}
                {/* Professions row */}
                <Box
                  onClick={() => setViewMode('professions')}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    px: 2,
                    py: 1.5,
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    '&:hover': { borderColor: 'primary.main', bgcolor: 'secondary.main' },
                    transition: 'all 0.15s',
                  }}
                >
                  <Briefcase style={{ width: 18, height: 18, flexShrink: 0, opacity: 0.7 }} />
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Professions
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {professions.length}
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontSize: '0.7rem' }}
                    >
                      Browse LGBTQ+ personalities by profession
                    </Typography>
                  </Box>
                  <ChevronRight style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.4 }} />
                </Box>
              </Box>
            </Box>

            {/* Admin Controls — only in dev mode */}
            {import.meta.env.DEV && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                <Button
                  onClick={storeTagImages}
                  disabled={processingImages}
                  variant="secondary"
                  size="sm"
                >
                  <Upload style={{ width: 14, height: 14, marginRight: 6 }} />
                  {processingImages ? 'Processing...' : 'Reimport Images'}
                </Button>
                <Button
                  onClick={categorizeAllTags}
                  disabled={categorizingTags}
                  variant="secondary"
                  size="sm"
                >
                  <Brain style={{ width: 14, height: 14, marginRight: 6 }} />
                  {categorizingTags ? 'Categorizing...' : 'AI Categorize'}
                </Button>
                <ComputeRelationshipsButton />
              </Box>
            )}
          </Box>
        )}

      {/* Category View — with subcategory sections */}
      {viewMode === 'category' && selectedCategory && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <Button variant="secondary" size="sm" onClick={handleBack}>
              <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
              Back
            </Button>
            {(() => {
              const IconComponent = getCategoryIcon(selectedCategory);
              return <IconComponent style={{ width: 18, height: 18 }} />;
            })()}
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {getCategoryShortName(selectedCategory)}
            </Typography>
            <Badge variant="secondary">{categoryTags.length}</Badge>
          </Box>

          {/* Subcategory navigation cards (if this category has subcategories) */}
          {(() => {
            const treeNode = categoriesTree.find((c) => c.name === selectedCategory);
            if (!treeNode || !treeNode.children || treeNode.children.length === 0) {
              // No subcategories — show flat tag list
              return renderTagList(categoryTags);
            }

            return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Subcategory cards */}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      sm: '1fr 1fr',
                      md: 'repeat(3, 1fr)',
                      lg: 'repeat(4, 1fr)',
                    },
                    gap: 1.5,
                  }}
                >
                  {treeNode.children.map((child) => {
                    const SubIcon = getCategoryIcon(child.name);
                    return (
                      <Box
                        key={child.id}
                        onClick={() => {
                          setSelectedSubcategory(child.name);
                          setViewMode('subcategory');
                        }}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          px: 2,
                          py: 1.5,
                          borderRadius: 2,
                          cursor: 'pointer',
                          bgcolor: 'background.paper',
                          border: '1px solid',
                          borderColor: 'divider',
                          '&:hover': { borderColor: 'primary.main', bgcolor: 'secondary.main' },
                          transition: 'all 0.15s',
                        }}
                      >
                        <SubIcon style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.6 }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
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

                {/* Tags directly assigned to parent (not in any subcategory) */}
                {treeNode.tag_count > 0 && (
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        General {getCategoryShortName(selectedCategory)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {treeNode.tag_count}
                      </Typography>
                    </Box>
                    {renderTagList(
                      categoryTags.filter((tag) => {
                        // Only tags assigned directly to parent, not to any subcategory
                        const tagCats = tag.categories || [];
                        const childIds = new Set(treeNode.children.map((c) => c.id));
                        return (
                          tagCats.some((c) => c.id === treeNode.id) &&
                          !tagCats.some((c) => childIds.has(c.id))
                        );
                      }),
                    )}
                  </Box>
                )}

                {/* Preview: top tags from each subcategory */}
                {treeNode.children
                  .filter((c) => c.tag_count > 0)
                  .map((child) => {
                    const childTags = allTags
                      .filter((tag) => tag.categories?.some((c) => c.id === child.id))
                      .sort((a, b) => b.usage_count - a.usage_count)
                      .slice(0, 8);
                    if (childTags.length === 0) return null;
                    return (
                      <Box key={child.id}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {child.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {child.tag_count}
                          </Typography>
                          <Box
                            component="button"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              setSelectedSubcategory(child.name);
                              setViewMode('subcategory');
                            }}
                            sx={{
                              ml: 'auto',
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

      {/* Subcategory View — all tags in a specific subcategory */}
      {viewMode === 'subcategory' && selectedSubcategory && (
        <Box>
          {/* Breadcrumb */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 3, flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" onClick={handleBack}>
              <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
              Back
            </Button>
            {(() => {
              const parentCat = categoriesTree.find((c) =>
                c.children.some((ch) => ch.name === selectedSubcategory),
              );
              const IconComponent = getCategoryIcon(selectedSubcategory);
              const subcatTags = allTags
                .filter((tag) => tag.categories?.some((c) => c.name === selectedSubcategory))
                .sort((a, b) => a.name.localeCompare(b.name));
              return (
                <>
                  {parentCat && (
                    <Box
                      component="button"
                      onClick={() => {
                        setSelectedCategory(parentCat.name);
                        setSelectedSubcategory('');
                        setViewMode('category');
                        setFilterCategory(parentCat.name);
                      }}
                      sx={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        p: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ '&:hover': { color: 'primary.main' } }}
                      >
                        {getCategoryShortName(parentCat.name)}
                      </Typography>
                    </Box>
                  )}
                  <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />
                  <IconComponent style={{ width: 16, height: 16 }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {getCategoryShortName(selectedSubcategory)}
                  </Typography>
                  <Badge variant="secondary">{subcatTags.length}</Badge>
                </>
              );
            })()}
          </Box>
          {renderTagList(
            allTags
              .filter((tag) => tag.categories?.some((c) => c.name === selectedSubcategory))
              .sort((a, b) => a.name.localeCompare(b.name)),
          )}
        </Box>
      )}

      {/* Professions View */}
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
                onClick={() => {
                  setSelectedProfession(profession);
                  navigate(`/personalities?profession=${encodeURIComponent(profession)}`);
                }}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 2,
                  cursor: 'pointer',
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'secondary.main' },
                  transition: 'all 0.15s',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                  {profession}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Search results / filtered tags */}
      {(viewMode === 'search' ||
        (viewMode === 'overview' &&
          (searchQuery ||
            filterCategory !== 'all' ||
            usageFilter !== 'all' ||
            hasImageFilter))) && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {viewMode === 'search'
                ? 'Search Results'
                : filterCategory !== 'all'
                  ? `${getCategoryShortName(filterCategory)} Tags`
                  : 'Filtered Tags'}
            </Typography>
            <Badge variant="secondary">{filteredAndSortedTags.length}</Badge>
          </Box>
          {renderTagList(filteredAndSortedTags)}
          {filteredAndSortedTags.length === 0 && (
            <EmptyState
              icon={Tag}
              title="Nothing here yet"
              description="Resources are being added regularly."
              mood="encouraging"
            />
          )}
        </Box>
      )}
    </Container>
  );
}
