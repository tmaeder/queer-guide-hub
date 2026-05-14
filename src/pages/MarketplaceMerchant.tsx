import { useParams } from 'react-router';
import { ArrowLeft, Globe } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { PageHeader } from '@/components/layout/PageHeader';
import { MarketplaceFilteredView } from '@/components/marketplace/MarketplaceFilteredView';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';

export default function MarketplaceMerchant() {
  const { domain } = useParams<{ domain: string }>();
  const cleanDomain = (domain ?? '').toLowerCase();
  const displayName = cleanDomain.replace(/^www\./, '').replace(/\.[a-z]{2,}$/, '');

  useMeta({
    title: cleanDomain ? `${cleanDomain} — Marketplace` : 'Merchant',
    description: `All listings from ${cleanDomain} on Queer Guide.`,
    canonicalPath: cleanDomain ? `/marketplace/merchants/${cleanDomain}` : undefined,
  });

  if (!cleanDomain) {
    return (
      <div className="container mx-auto py-12 px-4 text-center">
        <h1 className="text-2xl font-bold mb-3">Merchant not found</h1>
        <LocalizedLink to="/marketplace">
          <Button>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
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
              <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} />
              All marketplace
            </Button>
          </LocalizedLink>
        </div>
        <PageHeader
          title={displayName.charAt(0).toUpperCase() + displayName.slice(1)}
          subtitle={cleanDomain}
          actions={
            <Button asChild variant="outline">
              <a href={`https://${cleanDomain}`} target="_blank" rel="noopener noreferrer">
                <Globe style={{ width: 16, height: 16, marginRight: 8 }} aria-hidden="true" />
                Visit merchant site
              </a>
            </Button>
          }
        />
        <MarketplaceFilteredView
          filters={{ merchantDomain: cleanDomain }}
          emptyTitle="No listings from this merchant yet."
          emptyDescription="They may have not synced products recently."
        />
      </div>
    </div>
  );
}
