import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from '@/components/icons';
import { MarketplaceFilteredView } from '@/components/marketplace/MarketplaceFilteredView';
import { MilestoneRow } from '@/components/milestones/MilestoneRow';
import { DestinationSafetyCard } from '@/components/safety/DestinationSafetyCard';
import { EntityKindChips } from '@/components/entity/EntityKindChips';
import { useOrganization } from '@/hooks/useOrganization';
import { useMilestonesForEntity } from '@/hooks/useMilestones';
import { buildOrgMeta } from '@/pages/OrganizationDetail.meta';
import {
  OrgAbout,
  OrgActions,
  OrgArticles,
  OrgBodyLead,
  OrgLocationContact,
  OrgTags,
  OrgWhatTheyDo,
  orgHasLocationOrContact,
  orgShowsShopGrid,
} from '@/pages/OrganizationDetail.parts';
import type {
  EntityDescriptor,
  EntityDescriptorResult,
} from '@/components/entity/entityDescriptor';

/**
 * Organisation adapter → normalised `EntityDescriptor`.
 *
 * Renders on the same subway single (`EntitySingle`) as the venue page, with
 * the same masthead slots (eyebrow, kind chips, tags, actions), the same body
 * order (About → Location & contact → …) and the same rail. The two used to be
 * different pages — a cover-image hero plus a Contact sidebar here, a masthead
 * plus a contact section there — although most organisations are the identity
 * behind exactly one venue, so a reader moving between the pair saw two layouts
 * for one place.
 */
export function useOrganizationDescriptor(slug: string | undefined): EntityDescriptorResult {
  const { t } = useTranslation();
  const { data: org, isLoading, error, refetch } = useOrganization(slug);
  const { data: milestones } = useMilestonesForEntity('organization', org?.id);

  const descriptor: EntityDescriptor | null = useMemo(() => {
    if (!org) return null;

    const located = org.venues.find((v) => v.latitude != null && v.longitude != null);
    const isPublisher = org.roles.includes('publisher');
    const isSeller = org.roles.includes('seller');
    const cityName = org.venue_count === 1 ? org.venues[0]?.city : null;
    // A single location links across from the chip; several are listed in the
    // "Location & contact" section instead, so the chip only describes.
    const soleVenue = org.venues.length === 1 ? org.venues[0] : null;
    const isVenue = org.venue_count > 0 || org.roles.includes('venue');

    return {
      source: 'organization',
      id: org.id,
      slug: org.slug,
      title: org.name,
      // `EntitySingle` builds the masthead from `single`; `hero` is only read
      // by the legacy scroll shell, which organisations no longer use.
      hero: null,
      sections: [
        {
          id: 'about',
          title: t('pages.entityDetail.about', 'About'),
          when: Boolean(org.editorial_long || org.description),
          render: () => <OrgAbout org={org} />,
        },
        {
          id: 'location',
          title: t('venues.detail.section.location', 'Location & contact'),
          when: orgHasLocationOrContact(org),
          render: () => <OrgLocationContact org={org} />,
        },
        {
          id: 'what-they-do',
          title: t('pages.entityDetail.whatTheyDo', 'What they do'),
          // A seller whose Shop grid renders is described by that grid; the
          // section stays for publishers and for sellers with no grid.
          when: isPublisher || (isSeller && !orgShowsShopGrid(org)),
          render: () => <OrgWhatTheyDo org={org} />,
        },
        {
          id: 'milestones',
          title: t('milestones.forEntity.heading', 'Milestones'),
          when: (milestones?.length ?? 0) > 0,
          render: () => (
            <div className="space-y-4">
              {(milestones ?? []).map((m) => (
                <MilestoneRow key={m.id} milestone={m} density="row" />
              ))}
            </div>
          ),
        },
        {
          id: 'articles',
          title: t('pages.entityDetail.articles', 'Articles'),
          when: isPublisher && org.article_count > 0,
          render: () => <OrgArticles orgId={org.id} />,
        },
        {
          id: 'shop',
          title: t('pages.entityDetail.shop', 'Shop'),
          when: orgShowsShopGrid(org),
          render: () => (
            <MarketplaceFilteredView
              filters={{ merchantDomain: org.website_domain! }}
              emptyTitle={t('pages.entityDetail.shopEmpty', 'No products listed yet.')}
            />
          ),
        },
      ],
      single: {
        eyebrow: [t('pages.entityDetail.kindOrganization', 'Organization'), cityName]
          .filter(Boolean)
          .join(' · '),
        track: 'green',
        lead: org.editorial_hook ?? undefined,
        bodyLead: <OrgBodyLead org={org} />,
        tags: (
          <div className="flex flex-col gap-4">
            <EntityKindChips
              // No `organization` chip: the eyebrow directly above already
              // says "Organization", so the chip printed it a second time.
              kinds={[
                ...(isVenue
                  ? [
                      {
                        kind: 'venue' as const,
                        href: soleVenue ? `/venues/${soleVenue.slug}` : undefined,
                      },
                    ]
                  : []),
              ]}
              roles={org.roles}
            />
            <OrgTags org={org} />
          </div>
        ),
        action: <OrgActions org={org} />,
        // Same rail as the venue page, so the two-column frame matches.
        rail: (
          <div className="flex flex-col gap-6">
            <DestinationSafetyCard countryIds={[org.country_id]} />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles size={13} aria-hidden="true" />
              {t(
                'pages.entityDetail.reportHint',
                'Spotted something off? Use the flag in the header to let us know.',
              )}
            </p>
          </div>
        ),
      },
      sidebar: null,
      related: {
        type: 'organization',
        id: org.id,
        title: t('pages.entityDetail.related', 'Related'),
      },
      mobileBar: null,
      overlays: null,
      // Entity-only trail — BreadcrumbBar prepends the Home crumb itself.
      breadcrumbs: [
        { label: t('breadcrumb.organizations', 'Organizations'), href: '/organizations' },
        { label: org.name },
      ],
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
  }, [org, milestones, t]);

  return {
    descriptor,
    isLoading,
    error: error instanceof Error ? error : null,
    notFound: !isLoading && !org,
    refetch,
  };
}
