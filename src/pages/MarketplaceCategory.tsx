import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { MarketplaceMasthead } from '@/components/marketplace/MarketplaceMasthead';
import { FilterChip } from '@/components/transit/FilterChip';
import { DeadEndTrack } from '@/components/transit/DeadEndTrack';
import { MarketplaceFilteredView } from '@/components/marketplace/MarketplaceFilteredView';
import { AdultContentGate } from '@/components/marketplace/AdultContentGate';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { isAdultCategorySlug, useAdultAcknowledgement } from '@/hooks/useAdultContent';
import {
  useMarketplaceSubcategoryGroupCounts,
  useMarketplaceTagFacets,
} from '@/hooks/useMarketplaceQueries';
import { DEPARTMENT_GROUPS, DEPARTMENT_LABELS, groupLabel } from '@/lib/marketplaceTaxonomy';
import { PageContainer } from '@/components/layout/PageContainer';

function prettify(slug: string): string {
  return slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Chip counts are dimmed INSIDE the label rather than beside it, and flip to
 * `text-background/70` when the chip fills — a muted foreground on an ink fill
 * is unreadable, which is what the previous hand-rolled chip did.
 */
function chipLabel(text: string, count: number, active: boolean) {
  return (
    <>
      {text}{' '}
      <span className={active ? 'text-background/70' : 'text-muted-foreground'}>
        {count.toLocaleString()}
      </span>
    </>
  );
}

export default function MarketplaceCategory() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const subcategory = (slug ?? '').toLowerCase();

  // The route serves both grains: department umbrellas (apparel, intimacy, …) from
  // the browse tiles, and fine subcategory slugs (sex_toys, …) from legacy links.
  const isDepartment = subcategory in DEPARTMENT_LABELS;
  const name = isDepartment ? DEPARTMENT_LABELS[subcategory] : prettify(subcategory);

  // 18+ state drives what the grid shows AND what the counts count — one source, so
  // a sub-tile / tag count always matches the grid it produces. Confirming the age
  // gate flips this on and the grid + counts refresh together (no more empty adult page).
  const { acknowledged } = useAdultAcknowledgement();
  const includeAdult = acknowledged;

  const activeGroup = searchParams.get('g') || '';
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { data: groups } = useMarketplaceSubcategoryGroupCounts(
    isDepartment ? subcategory : null,
    includeAdult,
  );
  const { data: tagFacets } = useMarketplaceTagFacets(
    isDepartment ? subcategory : null,
    activeGroup || null,
    includeAdult,
  );

  // Order groups by the department's canonical display order; keep only non-empty.
  const groupTiles = useMemo(() => {
    if (!isDepartment) return [];
    const counts = new Map(groups.map((g) => [g.slug, g.count]));
    const order = DEPARTMENT_GROUPS[subcategory] ?? [];
    const ordered = order.filter((g) => (counts.get(g) ?? 0) > 0);
    const extras = groups.map((g) => g.slug).filter((g) => !order.includes(g));
    return [...ordered, ...extras].map((g) => ({ slug: g, count: counts.get(g) ?? 0 }));
  }, [groups, isDepartment, subcategory]);

  const setGroup = (g: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (g) next.set('g', g);
        else next.delete('g');
        return next;
      },
      { replace: true },
    );
  };

  const toggleTag = (tagSlug: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagSlug) ? prev.filter((s) => s !== tagSlug) : [...prev, tagSlug],
    );
  };

  const filters = useMemo(() => {
    const base = isDepartment
      ? { department: subcategory, ...(activeGroup ? { subcategoryGroup: activeGroup } : {}) }
      : { subcategory };
    return {
      ...base,
      includeAdult,
      ...(selectedTags.length ? { tags: selectedTags } : {}),
    };
  }, [isDepartment, subcategory, activeGroup, includeAdult, selectedTags]);

  useMeta({
    title: name ? `${name} — Marketplace` : 'Marketplace category',
    description: `Browse ${name || 'this category'} on Queer Guide.`,
    canonicalPath: subcategory ? `/marketplace/category/${subcategory}` : undefined,
  });

  useBreadcrumbs(
    subcategory
      ? [
          { label: t('breadcrumb.marketplace', 'Marketplace'), href: '/marketplace' },
          { label: name },
        ]
      : null,
  );

  if (!subcategory) {
    return (
      <PageContainer>
        <h1 className="font-display text-display leading-[0.95]">No such category.</h1>
        <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
          That category does not exist on this line.
        </p>
        <DeadEndTrack className="mt-10" label="Unknown" type="marketplace" />
        <div className="mt-8">
          <Button asChild>
            <LocalizedLink to="/marketplace/categories" className="no-underline">
              All categories
            </LocalizedLink>
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <div className="min-h-screen">
      <MarketplaceMasthead
        size="page"
        backTo={{ label: 'All categories', to: '/marketplace/categories' }}
        eyebrow="Marketplace · Station"
        title={name}
        lede="Queer-friendly products and services in this category."
        // The count lives in MarketplaceFilteredView's own swatch row below,
        // where it tracks the group + tag chips. Repeating it here would show
        // two different numbers the moment a chip is pressed.
        count={null}
      />

      <PageContainer>
        {isDepartment && groupTiles.length > 1 && (
          <div className="mb-6 flex flex-wrap gap-2" aria-label="Filter by subcategory">
            <FilterChip active={!activeGroup} label="All" onClick={() => setGroup('')} />
            {groupTiles.map((g) => (
              <FilterChip
                key={g.slug}
                active={activeGroup === g.slug}
                label={chipLabel(groupLabel(g.slug), g.count, activeGroup === g.slug)}
                onClick={() => setGroup(g.slug)}
              />
            ))}
          </div>
        )}

        {isDepartment && tagFacets.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2" aria-label="Refine by tag">
            {tagFacets.map((tag) => (
              <FilterChip
                key={tag.slug}
                active={selectedTags.includes(tag.slug)}
                label={chipLabel(tag.name, tag.count, selectedTags.includes(tag.slug))}
                onClick={() => toggleTag(tag.slug)}
              />
            ))}
          </div>
        )}

        <MarketplaceFilteredView
          filters={filters}
          emptyTitle={`No ${name.toLowerCase()} listings yet.`}
          emptyAction={{ label: 'Browse all departments', to: '/marketplace/categories' }}
        />
      </PageContainer>
      <AdultContentGate active={isAdultCategorySlug(subcategory)} fallbackPath="/marketplace" />
    </div>
  );
}
