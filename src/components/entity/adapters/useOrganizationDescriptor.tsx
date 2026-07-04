import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MarketplaceFilteredView } from '@/components/marketplace/MarketplaceFilteredView';
import { useOrganization } from '@/hooks/useOrganization';
import { buildOrgMeta } from '@/pages/OrganizationDetail.meta';
import {
  OrgHero,
  OrgAbout,
  OrgWhatTheyDo,
  OrgTags,
  OrgVisit,
  OrgArticles,
  OrgSidebar,
} from '@/pages/OrganizationDetail.parts';
import type { EntityDescriptor, EntityDescriptorResult } from '@/components/entity/entityDescriptor';

/** Organisation adapter → normalised `EntityDescriptor` (single scroll, no tabs). */
export function useOrganizationDescriptor(slug: string | undefined): EntityDescriptorResult {
  const { t } = useTranslation();
  const { data: org, isLoading, error, refetch } = useOrganization(slug);

  const descriptor: EntityDescriptor | null = useMemo(() => {
    if (!org) return null;

    const located = org.venues.find((v) => v.latitude != null && v.longitude != null);
    const isPublisher = org.roles.includes('publisher');
    const isSeller = org.roles.includes('seller');

    return {
      source: 'organization',
      id: org.id,
      slug: org.slug,
      title: org.name,
      hero: <OrgHero org={org} />,
      sections: [
        { id: 'about', when: Boolean(org.editorial_long || org.description), render: () => <OrgAbout org={org} /> },
        { id: 'what-they-do', render: () => <OrgWhatTheyDo org={org} /> },
        { id: 'tags', when: (org.tags?.length ?? 0) > 0, render: () => <OrgTags org={org} /> },
        { id: 'visit', when: org.venue_count > 0, render: () => <OrgVisit org={org} /> },
        {
          id: 'articles',
          when: isPublisher && org.article_count > 0,
          render: () => <OrgArticles orgId={org.id} />,
        },
        {
          id: 'shop',
          when: isSeller && org.product_count > 0 && Boolean(org.website_domain),
          render: () => (
            <MarketplaceFilteredView
              filters={{ merchantDomain: org.website_domain! }}
              emptyTitle={t('pages.entityDetail.shopEmpty', 'No products listed yet.')}
            />
          ),
        },
      ],
      sidebar: <OrgSidebar org={org} />,
      related: { type: 'organization', id: org.id, title: t('pages.entityDetail.related', 'Related') },
      mobileBar: null,
      overlays: null,
      breadcrumbs: [{ label: t('nav.home', 'Home'), href: '/' }, { label: org.name }],
      meta: buildOrgMeta(org),
      personalization: {
        entityType: 'organization',
        entityId: org.id,
        tags: (org.tags ?? []).filter(Boolean),
        lat: located?.latitude ?? null,
        lng: located?.longitude ?? null,
        countryId: org.country_id ?? null,
        countryName: null,
        criminalization: null,
      },
      trackView: {
        type: 'organization',
        slug: org.slug,
        title: org.name,
        image: org.cover_image_url ?? org.images?.[0] ?? org.logo_url ?? undefined,
      },
    };
  }, [org, t]);

  return {
    descriptor,
    isLoading,
    error: error instanceof Error ? error : null,
    notFound: !isLoading && !org,
    refetch,
  };
}
