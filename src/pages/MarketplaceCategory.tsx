import { useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
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
        <div className="mb-4">
          <LocalizedLink to="/marketplace">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={14} className="mr-1.5" />
              All marketplace
            </Button>
          </LocalizedLink>
        </div>
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
