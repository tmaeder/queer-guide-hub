import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { PageHeader } from '@/components/layout/PageHeader';
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

function prettify(slug: string): string {
  return slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-badge border px-2.5 py-1.5 text-13 transition-colors ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
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
      <div className="container mx-auto py-12 px-4 text-center">
        <h1 className="text-2xl font-bold mb-4">Category not found</h1>
        <LocalizedLink to="/marketplace">
          <Button>
            <ArrowLeft size={16} className="mr-2" />
            Back to Marketplace
          </Button>
        </LocalizedLink>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto py-12 md:py-20 px-4">
        <PageHeader title={name} subtitle="Queer-friendly products and services in this category." />

        {isDepartment && groupTiles.length > 1 && (
          <div className="mb-6 flex flex-wrap gap-2" aria-label="Filter by subcategory">
            <Chip active={!activeGroup} onClick={() => setGroup('')}>
              All
            </Chip>
            {groupTiles.map((g) => (
              <Chip key={g.slug} active={activeGroup === g.slug} onClick={() => setGroup(g.slug)}>
                {groupLabel(g.slug)}{' '}
                <span className="text-muted-foreground">{g.count.toLocaleString()}</span>
              </Chip>
            ))}
          </div>
        )}

        {isDepartment && tagFacets.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2" aria-label="Refine by tag">
            {tagFacets.map((tag) => (
              <Chip
                key={tag.slug}
                active={selectedTags.includes(tag.slug)}
                onClick={() => toggleTag(tag.slug)}
              >
                {tag.name} <span className="text-muted-foreground">{tag.count.toLocaleString()}</span>
              </Chip>
            ))}
          </div>
        )}

        <MarketplaceFilteredView
          filters={filters}
          emptyTitle={`No ${name.toLowerCase()} listings yet.`}
          emptyDescription="Check back soon or list a business."
        />
      </div>
      <AdultContentGate active={isAdultCategorySlug(subcategory)} fallbackPath="/marketplace" />
    </div>
  );
}
