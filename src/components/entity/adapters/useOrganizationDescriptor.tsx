import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MarketplaceFilteredView } from '@/components/marketplace/MarketplaceFilteredView';
import { MilestoneRow } from '@/components/milestones/MilestoneRow';
import { EntityKindChips } from '@/components/entity/EntityKindChips';
import { useOrganization } from '@/hooks/useOrganization';
import { useMilestonesForEntity } from '@/hooks/useMilestones';
import { buildOrgMeta } from '@/pages/OrganizationDetail.meta';
import {
  arrivedFromShop,
  orgAboutText,
  orgIsService,
  orgLeadText,
  orgPrimaryAction,
  OrgPrimaryActionButton,
  OrgServiceSummary,
  OrgServiceTags,
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
const hasCover = (org: {
  cover_image_url: string | null;
  images: string[];
  logo_url: string | null;
}) => Boolean(org.cover_image_url || org.images?.[0] || org.logo_url);

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
    const isService = orgIsService(org);
    const fromShop = arrivedFromShop(typeof window !== 'undefined' ? window.location : undefined);
    const primary = orgPrimaryAction(org, { fromShop });
    // "Contact" when there is no place to go; the section holds only contact lines.
    const locationTitle =
      org.venues.length > 0
        ? t('pages.entityDetail.contactAndLocation', 'Contact & location')
        : t('pages.entityDetail.contact', 'Contact');
    const aboutText = orgAboutText(org);

    return {
      source: 'organization',
      id: org.id,
      slug: org.slug,
      title: org.name,
      // `EntitySingle` builds the masthead from `single`; `hero` is only read
      // by the legacy scroll shell, which organisations no longer use.
      hero: null,
      sections: (() => {
        const about = {
          id: 'about',
          title: t('pages.entityDetail.about', 'About'),
          when: Boolean(aboutText) || (isService && hasCover(org)),
          render: () => (
            <div className="flex flex-col gap-6">
              <OrgAbout org={org} />
              {/* A support service's photo follows the contact route rather than
                  standing between the summary and the phone number. */}
              {isService && <OrgBodyLead org={org} />}
            </div>
          ),
        };
        const location = {
          id: 'location',
          title: locationTitle,
          when: orgHasLocationOrContact(org),
          render: () => <OrgLocationContact org={org} />,
        };
        const services = {
          id: 'services',
          title: t('pages.entityDetail.services', 'Services and access'),
          when: isService && (org.tags?.length ?? 0) > 0,
          render: () => <OrgServiceTags org={org} />,
        };
        const shop = {
          id: 'shop',
          title: t('pages.entityDetail.shop', 'Shop'),
          when: orgShowsShopGrid(org),
          render: () => (
            <MarketplaceFilteredView
              filters={{ merchantDomain: org.website_domain! }}
              emptyTitle={t('pages.entityDetail.shopEmpty', 'No products listed yet.')}
            />
          ),
        };
        const rest = [
          {
            id: 'what-they-do',
            title: t('pages.entityDetail.whatTheyDo', 'What they do'),
            // A seller whose Shop grid renders is described by that grid, and a
            // publisher is described by its Articles section; a zero count is
            // not shown (it reflects feed linkage here, not the publication).
            when: isSeller && !orgShowsShopGrid(org),
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
            title: t(
              'pages.entityDetail.articlesIndexedHeading',
              'Articles indexed on Queer Guide',
            ),
            when: isPublisher && org.article_count > 0,
            render: () => <OrgArticles orgId={org.id} />,
          },
        ];
        // Support: contact, then what they offer, then the story. Arriving from
        // the marketplace: the shop first. Otherwise the story leads.
        if (isService) return [location, services, about, ...rest, shop];
        if (fromShop && orgShowsShopGrid(org)) return [shop, about, location, ...rest];
        return [about, location, ...rest, shop];
      })(),
      single: {
        eyebrow: [t('pages.entityDetail.kindOrganization', 'Organization'), cityName]
          .filter(Boolean)
          .join(' · '),
        track: 'green',
        density: 'compact',
        // The hook, else the description's first sentence; About carries the
        // rest, so a one-sentence description is no longer printed twice.
        lead: orgLeadText(org) ?? undefined,
        bodyLead: isService ? undefined : <OrgBodyLead org={org} />,
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
            {/* A support organisation's tags are grouped in "Services and access". */}
            {!isService && <OrgTags org={org} />}
          </div>
        ),
        // `OrgServiceSummary` leads the action for now; move it to
        // `single.summary` once that slot lands.
        action: (
          <>
            <OrgServiceSummary org={org} />
            {primary && <OrgPrimaryActionButton action={primary} />}
            {primary?.kind === 'products' && org.website && (
              <Button asChild variant="soft">
                <a href={org.website} target="_blank" rel="noopener noreferrer nofollow">
                  {t('pages.entityDetail.visitStore', 'Visit store')}
                </a>
              </Button>
            )}
            <OrgActions org={org} />
          </>
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
