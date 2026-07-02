import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Globe } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { MarketplaceFilteredView } from '@/components/marketplace/MarketplaceFilteredView';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useMarketplaceBrand } from '@/hooks/useMarketplaceBrands';

const OWNERSHIP_LABELS: Record<string, string> = {
  queer_owned: 'Queer-owned',
  trans_owned: 'Trans-owned',
  bipoc_owned: 'BIPOC-owned',
  women_owned: 'Women-owned',
  disabled_owned: 'Disabled-owned',
  nonprofit: 'Nonprofit',
};

export default function MarketplaceBrand() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { data: brand, isLoading } = useMarketplaceBrand(slug);

  useMeta({
    title: brand ? `${brand.display_name} — Marketplace` : 'Brand',
    description: brand
      ? `Products from ${brand.display_name} on Queer Guide.`
      : 'Marketplace brand on Queer Guide.',
    canonicalPath: slug ? `/marketplace/brands/${slug}` : undefined,
  });

  useBreadcrumbs(
    brand
      ? [
          { label: t('breadcrumb.marketplace', 'Marketplace'), href: '/marketplace' },
          { label: brand.display_name },
        ]
      : null,
  );

  if (!isLoading && !brand) {
    return (
      <div className="container mx-auto py-12 px-4 text-center">
        <h1 className="mb-4 text-headline font-display">Brand not found</h1>
        <LocalizedLink to="/marketplace">
          <Button>
            <ArrowLeft size={16} className="mr-2" />
            Back to Marketplace
          </Button>
        </LocalizedLink>
      </div>
    );
  }
  if (!brand) return null;

  const ownershipBadges = brand.ownership_tags.filter((o) => OWNERSHIP_LABELS[o]);

  return (
    <div className="min-h-screen">
      <div className="container mx-auto py-12 md:py-20 px-4">
        <PageHeader
          title={brand.display_name}
          subtitle={`${brand.product_count.toLocaleString()} listings`}
          actions={
            brand.website ? (
              <Button asChild variant="outline">
                <a href={brand.website} target="_blank" rel="noopener noreferrer">
                  <Globe size={16} className="mr-2" aria-hidden="true" />
                  Visit brand site
                </a>
              </Button>
            ) : undefined
          }
        />
        {ownershipBadges.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {ownershipBadges.map((o) => (
              <Badge key={o} variant="outline">
                {OWNERSHIP_LABELS[o]}
              </Badge>
            ))}
          </div>
        )}
        {brand.story && <p className="mb-8 max-w-2xl text-body-lg">{brand.story}</p>}
        <MarketplaceFilteredView
          filters={{ brandKey: brand.brand_key }}
          surface="brand_page"
          emptyTitle="No listings from this brand yet."
          emptyDescription="Check back soon."
        />
      </div>
    </div>
  );
}
