import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { MarketplaceFilteredView } from '@/components/marketplace/MarketplaceFilteredView';
import { AdultContentGate } from '@/components/marketplace/AdultContentGate';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { isAdultCategorySlug } from '@/hooks/useAdultContent';
import { DEPARTMENT_LABELS } from '@/lib/marketplaceTaxonomy';

function prettify(slug: string): string {
  return slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MarketplaceCategory() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const subcategory = (slug ?? '').toLowerCase();
  // The route serves both grains: department umbrellas (apparel, intimacy, …)
  // from the browse tiles, and fine subcategory slugs (sex_toys, …) from
  // legacy links / the all-categories page.
  const isDepartment = subcategory in DEPARTMENT_LABELS;
  const name = isDepartment ? DEPARTMENT_LABELS[subcategory] : prettify(subcategory);

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
        <MarketplaceFilteredView
          filters={isDepartment ? { department: subcategory } : { subcategory }}
          emptyTitle={`No ${name.toLowerCase()} listings yet.`}
          emptyDescription="Check back soon or list a business."
        />
      </div>
      <AdultContentGate active={isAdultCategorySlug(subcategory)} fallbackPath="/marketplace" />
    </div>
  );
}
