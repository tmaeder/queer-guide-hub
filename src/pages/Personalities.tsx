import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { Users, X } from 'lucide-react';

import { useMeta } from '@/hooks/useMeta';
import { useAuth } from '@/hooks/useAuth';
import {
  usePersonalities,
  type PersonalityFilters,
  type PersonalitySort,
} from '@/hooks/usePersonalities';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StaggerGrid } from '@/components/animation/StaggerGrid';

import { PersonalityCard, PersonalityCardSkeleton } from '@/components/personalities/PersonalityCard';
import { PersonalitiesFiltersBar } from '@/components/personalities/PersonalitiesFiltersBar';
import { StickyLetterBar } from '@/components/personalities/StickyLetterBar';
import { FeaturedPersonalityRail } from '@/components/personalities/FeaturedPersonalityRail';
import { AddPersonalityDialog } from '@/components/personalities/AddPersonalityDialog';

const PAGE_SIZE = 24;
const AUTO_LOAD_CAP = 48;

const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: {
    xs: 'repeat(2, minmax(0, 1fr))',
    sm: 'repeat(3, minmax(0, 1fr))',
    md: 'repeat(4, minmax(0, 1fr))',
    lg: 'repeat(5, minmax(0, 1fr))',
  },
  gap: { xs: 1.5, sm: 2, md: 2.5 },
  '& > *': { minWidth: 0 },
} as const;

function filtersFromParams(params: URLSearchParams): PersonalityFilters {
  return {
    profession: params.get('profession') || undefined,
    search: params.get('q') || undefined,
    name_starts_with: params.get('letter') || undefined,
    sortBy: (params.get('sort') as PersonalitySort) || 'featured',
    is_living:
      params.get('status') === 'living'
        ? true
        : params.get('status') === 'historical'
          ? false
          : undefined,
    featured_only: params.get('featured') === '1' || undefined,
    exclude_adult: params.get('include_adult') === '1' ? false : true,
  };
}

function paramsFromFilters(filters: PersonalityFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.profession) p.set('profession', filters.profession);
  if (filters.search) p.set('q', filters.search);
  if (filters.name_starts_with) p.set('letter', filters.name_starts_with);
  if (filters.sortBy && filters.sortBy !== 'featured') p.set('sort', filters.sortBy);
  if (filters.is_living === true) p.set('status', 'living');
  if (filters.is_living === false) p.set('status', 'historical');
  if (filters.featured_only) p.set('featured', '1');
  if (filters.exclude_adult === false) p.set('include_adult', '1');
  return p;
}

function activeFilterCount(f: PersonalityFilters): number {
  let c = 0;
  if (f.search) c++;
  if (f.profession) c++;
  if (f.is_living !== undefined) c++;
  if (f.featured_only) c++;
  if (f.verification_status) c++;
  if (f.name_starts_with) c++;
  if (f.exclude_adult === false) c++;
  return c;
}

export default function Personalities() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  useMeta({
    title: 'Personalities',
    description:
      'Browse 8,000+ LGBTQ+ activists, artists, writers, athletes, and historical icons.',
    canonicalPath: '/personalities',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Notable LGBTQ+ Personalities',
      description:
        'Browse 8,000+ LGBTQ+ activists, artists, writers, athletes, and historical icons.',
      url: 'https://queer.guide/personalities',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });

  const [filters, setFilters] = useState<PersonalityFilters>(() =>
    filtersFromParams(searchParams),
  );
  const [page, setPage] = useState(1);
  const [autoLoadedCount, setAutoLoadedCount] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const {
    personalities,
    totalCount,
    loading,
    error,
    hasMore,
    fetchPersonalities,
  } = usePersonalities(false);

  // Initial + filter-change fetch
  useEffect(() => {
    setPage(1);
    setAutoLoadedCount(0);
    fetchPersonalities(filters, { page: 1, pageSize: PAGE_SIZE, append: false });
    // Sync URL
    const nextParams = paramsFromFilters(filters);
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.search,
    filters.profession,
    filters.is_living,
    filters.featured_only,
    filters.verification_status,
    filters.name_starts_with,
    filters.sortBy,
    filters.exclude_adult,
  ]);

  // React to browser back/forward (external URL changes)
  useEffect(() => {
    const fromUrl = filtersFromParams(searchParams);
    // Only overwrite local filters if URL has genuinely different content
    const a = JSON.stringify(fromUrl);
    const b = JSON.stringify(filters);
    if (a !== b) {
      setFilters(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleFiltersChange = useCallback((next: PersonalityFilters) => {
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  const handleLetterChange = useCallback((letter: string | null) => {
    setFilters((prev) => ({ ...prev, name_starts_with: letter ?? undefined }));
  }, []);

  const clearAll = useCallback(() => {
    setFilters({ sortBy: 'featured' });
  }, []);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        const [entry] = entries;
        if (
          entry.isIntersecting &&
          !loading &&
          hasMore &&
          autoLoadedCount < AUTO_LOAD_CAP
        ) {
          const nextPage = page + 1;
          setPage(nextPage);
          const result = await fetchPersonalities(filters, {
            page: nextPage,
            pageSize: PAGE_SIZE,
            append: true,
          });
          const fetched = result?.fetched ?? PAGE_SIZE;
          setAutoLoadedCount((c) => Math.min(AUTO_LOAD_CAP, c + fetched));
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.unobserve(el);
  }, [page, loading, hasMore, filters, autoLoadedCount, fetchPersonalities]);

  const loadMoreManual = useCallback(async () => {
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchPersonalities(filters, {
      page: nextPage,
      pageSize: PAGE_SIZE,
      append: true,
    });
  }, [page, filters, fetchPersonalities]);

  const hasAnyFilter = useMemo(() => activeFilterCount(filters) > 0, [filters]);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (filters.search) {
      chips.push({
        key: 'search',
        label: `"${filters.search}"`,
        onRemove: () => handleFiltersChange({ search: undefined }),
      });
    }
    if (filters.profession) {
      chips.push({
        key: 'profession',
        label: filters.profession,
        onRemove: () => handleFiltersChange({ profession: undefined }),
      });
    }
    if (filters.is_living === true) {
      chips.push({
        key: 'living',
        label: 'Living',
        onRemove: () => handleFiltersChange({ is_living: undefined }),
      });
    }
    if (filters.is_living === false) {
      chips.push({
        key: 'historical',
        label: 'Historical',
        onRemove: () => handleFiltersChange({ is_living: undefined }),
      });
    }
    if (filters.name_starts_with) {
      chips.push({
        key: 'letter',
        label: `Letter: ${filters.name_starts_with}`,
        onRemove: () => handleFiltersChange({ name_starts_with: undefined }),
      });
    }
    if (filters.featured_only) {
      chips.push({
        key: 'featured',
        label: 'Featured only',
        onRemove: () => handleFiltersChange({ featured_only: undefined }),
      });
    }
    if (filters.exclude_adult === false) {
      chips.push({
        key: 'adult',
        label: 'Includes adult performers',
        onRemove: () => handleFiltersChange({ exclude_adult: true }),
      });
    }
    return chips;
  }, [filters, handleFiltersChange]);

  const showLoadMoreButton =
    !loading && hasMore && autoLoadedCount >= AUTO_LOAD_CAP;
  const loadedCount = personalities.length;

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Container maxWidth="lg" sx={{ px: 2, py: { xs: 4, md: 8 } }}>
        <PageHeader
          title="Personalities"
          subtitle="Browse 8,000+ LGBTQ+ activists, artists, writers, athletes, and historical icons."
          center
          actions={
            user ? <AddPersonalityDialog onSuccess={() => window.location.reload()} /> : undefined
          }
        />

        {/* Featured rail — only on the cold default view */}
        {!hasAnyFilter && <FeaturedPersonalityRail />}

        <Box sx={{ mb: 2 }}>
          <PersonalitiesFiltersBar filters={filters} onFiltersChange={handleFiltersChange} />
        </Box>

        <StickyLetterBar
          letter={filters.name_starts_with ?? null}
          onChange={handleLetterChange}
        />

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 1,
              mb: 2,
            }}
          >
            <Typography variant="body2" sx={{ color: 'text.secondary', mr: 0.5 }}>
              Active:
            </Typography>
            {activeChips.map((chip) => (
              <Badge
                key={chip.key}
                variant="secondary"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, pr: 0.5 }}
              >
                {chip.label}
                <Box
                  component="button"
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={`Remove ${chip.label}`}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    p: 0,
                    ml: 0.25,
                  }}
                >
                  <X size={12} />
                </Box>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear all
            </Button>
          </Box>
        )}

        {/* Results toolbar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 2,
          }}
        >
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            {loading && personalities.length === 0
              ? 'Loading…'
              : totalCount > 0
                ? `Showing ${loadedCount.toLocaleString()} of ${totalCount.toLocaleString()}`
                : 'No results'}
          </Typography>
        </Box>

        {/* Error state */}
        {error && personalities.length === 0 && (
          <ErrorState
            message={error}
            onRetry={() =>
              fetchPersonalities(filters, { page: 1, pageSize: PAGE_SIZE, append: false })
            }
          />
        )}

        {/* Initial loading skeleton */}
        {loading && personalities.length === 0 && !error && (
          <Box sx={GRID_SX}>
            {Array.from({ length: 10 }).map((_, i) => (
              <PersonalityCardSkeleton key={i} />
            ))}
          </Box>
        )}

        {/* Empty state */}
        {!loading && !error && personalities.length === 0 && (
          <EmptyState
            icon={Users}
            title="No personalities match your filters"
            description="Try clearing a filter or searching for a different name."
            mood="encouraging"
          />
        )}

        {/* Grid */}
        {personalities.length > 0 && (
          <>
            <StaggerGrid sx={GRID_SX as any}>
              {personalities.map((p) => (
                <PersonalityCard key={p.id} personality={p} />
              ))}
            </StaggerGrid>

            {/* Sentinel for auto-load */}
            {hasMore && autoLoadedCount < AUTO_LOAD_CAP && (
              <Box ref={sentinelRef} sx={{ height: 40, mt: 4 }} aria-hidden="true" />
            )}

            {/* Manual load more after cap */}
            {showLoadMoreButton && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                <Button onClick={loadMoreManual} variant="outline">
                  Load more ({(totalCount - loadedCount).toLocaleString()} more)
                </Button>
              </Box>
            )}

            {loading && personalities.length > 0 && (
              <Typography
                variant="body2"
                sx={{ textAlign: 'center', color: 'text.secondary', mt: 3 }}
              >
                Loading more…
              </Typography>
            )}
          </>
        )}
      </Container>
    </Box>
  );
}
