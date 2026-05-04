import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Users, X } from 'lucide-react';

import { useMeta } from '@/hooks/useMeta';
import { useAuth } from '@/hooks/useAuth';
import {
  usePersonalities,
  useProfessionFacets,
  type PersonalityFilters,
} from '@/hooks/usePersonalities';
import { parseFilters, serializeFilters } from '@/lib/personalitiesFilters';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StaggerGrid } from '@/components/animation/StaggerGrid';

import { PersonalityCard, PersonalityCardSkeleton } from '@/components/personalities/PersonalityCard';
import { PersonalitiesFiltersBar } from '@/components/personalities/PersonalitiesFiltersBar';
import { StickyLetterBar } from '@/components/personalities/StickyLetterBar';
import { FeaturedPersonalityRail } from '@/components/personalities/FeaturedPersonalityRail';
import { AddPersonalityDialog } from '@/components/personalities/AddPersonalityDialog';import { useTranslation } from 'react-i18next';

const PAGE_SIZE = 24;
const AUTO_LOAD_CAP = 48;

const GRID_CLASS =
  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 md:gap-5 [&>*]:min-w-0';

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
  const { t } = useTranslation();
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

  // Profession facets are loaded once and used to validate the URL `profession` param.
  const { facets: professionFacets } = useProfessionFacets(60);
  const validProfessions = useMemo(
    () => professionFacets.map((f) => f.profession),
    [professionFacets],
  );

  const [filters, setFilters] = useState<PersonalityFilters>(
    () => parseFilters(searchParams).filters,
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
    const nextParams = serializeFilters(filters);
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
    const { filters: fromUrl } = parseFilters(searchParams, validProfessions.length ? validProfessions : null);
    const a = JSON.stringify(fromUrl);
    const b = JSON.stringify(filters);
    if (a !== b) {
      setFilters(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Once facets load, re-validate the current `profession` against the allowlist
  // and rewrite the URL if it was stale (e.g. ?profession=Foo).
  useEffect(() => {
    if (!validProfessions.length) return;
    const { filters: cleaned, changed } = parseFilters(searchParams, validProfessions);
    if (changed) {
      setFilters(cleaned);
      setSearchParams(serializeFilters(cleaned), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validProfessions]);

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
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 md:py-16">
        <PageHeader
          title={t('pages.personalities.title', 'Personalities')}
          subtitle={t('pages.personalities.subtitle', 'Browse 8,000+ LGBTQ+ activists, artists, writers, athletes, and historical icons.')}
          center
          actions={
            user ? <AddPersonalityDialog onSuccess={() => window.location.reload()} /> : undefined
          }
        />

        {/* Featured rail — only on the cold default view */}
        {!hasAnyFilter && <FeaturedPersonalityRail />}

        <div className="mb-4">
          <PersonalitiesFiltersBar filters={filters} onFiltersChange={handleFiltersChange} />
        </div>

        <StickyLetterBar
          letter={filters.name_starts_with ?? null}
          onChange={handleLetterChange}
        />

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <p className="text-sm">
              Active:
            </p>
            {activeChips.map((chip) => (
              <Badge
                key={chip.key}
                variant="secondary"

              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={`Remove ${chip.label}`}
                  className="inline-flex items-center justify-center bg-transparent border-none cursor-pointer p-0 ml-1"
                >
                  <X size={12} />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear all
            </Button>
          </div>
        )}

        {/* Results toolbar */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm">
            {loading && personalities.length === 0
              ? 'Loading…'
              : totalCount > 0
                ? `Showing ${loadedCount.toLocaleString()} of ${totalCount.toLocaleString()}`
                : 'No results'}
          </p>
        </div>

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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 md:gap-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <PersonalityCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && personalities.length === 0 && (
          <EmptyState
            icon={Users}
            title={t('pages.personalities.emptyTitle', 'No personalities match your filters')}
            description={t('pages.personalities.emptyDescription', 'Try clearing a filter or searching for a different name.')}
            mood="encouraging"
          />
        )}

        {/* Grid */}
        {personalities.length > 0 && (
          <>
            <StaggerGrid className={GRID_CLASS}>
              {personalities.map((p) => (
                <PersonalityCard key={p.id} personality={p} />
              ))}
            </StaggerGrid>

            {/* Sentinel for auto-load */}
            {hasMore && autoLoadedCount < AUTO_LOAD_CAP && (
              <div ref={sentinelRef} className="h-10 mt-8" aria-hidden="true" />
            )}

            {/* Manual load more after cap */}
            {showLoadMoreButton && (
              <div className="flex justify-center mt-8">
                <Button onClick={loadMoreManual} variant="outline">
                  Load more ({(totalCount - loadedCount).toLocaleString()} more)
                </Button>
              </div>
            )}

            {loading && personalities.length > 0 && (
              <p className="text-sm">
                Loading more…
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
