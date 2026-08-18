import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { MarketplaceMasthead } from '@/components/marketplace/MarketplaceMasthead';
import { DeadEndTrack } from '@/components/transit/DeadEndTrack';
import { MarketplaceFilteredView } from '@/components/marketplace/MarketplaceFilteredView';
import { GuidesRail } from '@/components/guides/GuidesRail';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { useOrgSlugByDomain } from '@/hooks/useOrganization';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { PageContainer } from '@/components/layout/PageContainer';

export default function MarketplaceMerchant() {
  const { t } = useTranslation();
  const { domain } = useParams<{ domain: string }>();
  const cleanDomain = (domain ?? '').toLowerCase();
  const displayName = cleanDomain.replace(/^www\./, '').replace(/\.[a-z]{2,}$/, '');

  // Sellers now have a unified organization profile — redirect there when one exists.
  const navigate = useLocalizedNavigate();
  const { data: orgSlug } = useOrgSlugByDomain(cleanDomain || undefined);
  useEffect(() => {
    if (orgSlug) navigate(`/organizations/${orgSlug}`, { replace: true });
  }, [orgSlug, navigate]);

  useMeta({
    title: cleanDomain ? `${cleanDomain} — Marketplace` : 'Merchant',
    description: `All listings from ${cleanDomain} on Queer Guide.`,
    canonicalPath: cleanDomain ? `/marketplace/merchants/${cleanDomain}` : undefined,
  });

  useBreadcrumbs(
    cleanDomain
      ? [
          { label: t('breadcrumb.marketplace', 'Marketplace'), href: '/marketplace' },
          { label: displayName.charAt(0).toUpperCase() + displayName.slice(1) },
        ]
      : null,
  );

  if (!cleanDomain) {
    return (
      <PageContainer>
        <h1 className="font-display text-display leading-[0.95]">No such merchant.</h1>
        <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
          That seller is not listed on this line.
        </p>
        <DeadEndTrack className="mt-10" label="Unknown" type="marketplace" />
        <div className="mt-8">
          <Button asChild>
            <LocalizedLink to="/marketplace/brands" className="no-underline">
              All makers
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
        backTo={{ label: 'All makers', to: '/marketplace/brands' }}
        eyebrow="Marketplace · Merchant"
        title={displayName.charAt(0).toUpperCase() + displayName.slice(1)}
        lede={cleanDomain}
        // The listing count belongs to the grid below, which owns the query.
        count={null}
        actions={
          <Button asChild variant="outline">
            <a href={`https://${cleanDomain}`} target="_blank" rel="noopener noreferrer">
              Visit merchant site
            </a>
          </Button>
        }
      />

      <PageContainer>
        <GuidesRail filters={{ entityType: 'marketplace', limit: 3 }} />
        <MarketplaceFilteredView
          filters={{ merchantDomain: cleanDomain }}
          emptyTitle="No listings from this merchant yet."
          emptyAction={{ label: 'Browse the marketplace', to: '/marketplace' }}
        />
      </PageContainer>
    </div>
  );
}
