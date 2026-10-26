import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Globe, Mail, Phone, Newspaper, ShoppingBag } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { MapInset } from '@/components/transit/MapInset';
import { PhotoInset } from '@/components/transit/PhotoInset';
import { EntitySocialLinks } from '@/components/entity/EntitySocialLinks';
import { orgRoleLabel } from '@/lib/entityKindLabels';
import { ShareMenu } from '@/components/share/ShareMenu';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { displayWebsite, hasSocialLinks } from '@/lib/entityContact';
import { EntityMap } from '@/components/map/EntityMap';
import { NearbyMapLegend } from '@/components/map/NearbyMapLegend';
import { NewsCard } from '@/components/news/NewsCard';
import { useNearbyMapPoints } from '@/hooks/useNearbyMapPoints';
import { tagHref } from '@/lib/searchRoutes';
import { formatPhoneDisplay, formatPhoneHref } from '@/lib/formatPhone';
import { useOrganizationArticles, type Organization, type OrgRole } from '@/hooks/useOrganization';

/** Kept as the org-page name for the shared label map in `EntityKindChips`. */
export function roleLabel(role: OrgRole, t: TFunction): string {
  return orgRoleLabel(role, t);
}

/** Cover photo — what the old hero carried that is not the masthead. Rendered
 *  at the top of the body, the same slot `VenueBodyLead` uses. */
export function OrgBodyLead({ org }: { org: Organization }) {
  const cover = org.cover_image_url || org.images?.[0] || org.logo_url || null;
  return (
    <PhotoInset
      src={cover}
      alt={org.name}
      fallbackEntityType="default"
      fallbackKey={org.id}
      priority
      caption={org.legal_name && org.legal_name !== org.name ? org.legal_name : null}
    />
  );
}

/** Masthead actions. Deliberately NO website button: the website lives once,
 *  in the "Location & contact" section, on organisation and venue alike. */
export function OrgActions({ org }: { org: Organization }) {
  return (
    <>
      <ShareMenu
        url={
          typeof window !== 'undefined'
            ? window.location.href
            : `https://queer.guide/organizations/${org.slug}`
        }
        title={org.name}
        entity={{
          entity_table: 'organizations',
          entity_id: org.id,
          title: org.name,
          subtitle: org.venues[0]?.city ?? null,
          image_url: org.cover_image_url ?? org.images?.[0] ?? org.logo_url ?? null,
          path: `/organizations/${org.slug}`,
        }}
      />
      <ReportButton contentType="organizations" contentId={org.id} contentName={org.name} />
      <AdminEditButton
        contentType="organizations"
        contentId={org.id}
        contentName={org.name}
        currentData={org as unknown as Record<string, unknown>}
        exportable
      />
    </>
  );
}

export function OrgAbout({ org }: { org: Organization }) {
  const about = org.editorial_long || org.description;
  if (!about) return null;
  return (
    // No heading of its own: the `SingleSection` around it renders "About".
    <p className="max-w-reading whitespace-pre-line text-body-lg leading-relaxed">{about}</p>
  );
}

export function OrgWhatTheyDo({ org }: { org: Organization }) {
  const { t } = useTranslation();
  // Venues are not counted here: they have their own "Location & contact"
  // section, the same one the venue page carries.
  const hasAny = org.roles.includes('publisher') || org.roles.includes('seller');
  if (!hasAny) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {org.roles.includes('publisher') && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4">
            <Newspaper size={20} className="text-muted-foreground" aria-hidden="true" />
            <div>
              <div className="font-medium">
                {t('pages.entityDetail.articlesCount', '{{count}} articles', {
                  count: org.article_count,
                })}
              </div>
              <div className="text-13 text-muted-foreground">
                {t('pages.entityDetail.rolePublisher', 'News outlet')}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {org.roles.includes('seller') && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4">
            <ShoppingBag size={20} className="text-muted-foreground" aria-hidden="true" />
            <div>
              <div className="font-medium">
                {t('pages.entityDetail.productsCount', '{{count}} products', {
                  count: org.product_count,
                })}
              </div>
              <div className="text-13 text-muted-foreground">
                {t('pages.entityDetail.roleSeller', 'Shop')}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Masthead tag row — the same slot venue uses for `VenueTags`. */
export function OrgTags({ org }: { org: Organization }) {
  if (!org.tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {org.tags.slice(0, 16).map((tag) => (
        <LocalizedLink key={tag} to={tagHref(tag)} className="no-underline">
          <Badge variant="outline">{tag}</Badge>
        </LocalizedLink>
      ))}
    </div>
  );
}

/** The organisation's own phone, else its primary venue's (the RPC lists the
 *  primary venue first). Most organisations are the identity behind one venue
 *  and were minted before the venue's number arrived, so `organizations.phone`
 *  is empty on ~2,200 of them while the venue has one. */
export function orgPhone(org: Organization): string | null {
  return org.phone || org.venues[0]?.phone || null;
}

/** True when the organisation has anything for the "Location & contact"
 *  section — so the descriptor's guard and the component's null-return agree. */
export function orgHasLocationOrContact(org: Organization): boolean {
  return Boolean(
    org.venues.length > 0 ||
    org.website ||
    org.email ||
    formatPhoneHref(orgPhone(org)) ||
    hasSocialLinks(org.social),
  );
}

/**
 * The organisation's "Location & contact" — the same section, in the same
 * place and with the same markup, as the venue page's `VenueLocationContact`.
 *
 * The website renders here and NOWHERE else on the page. It used to appear
 * three times: as the domain beside the role badges, as a "Visit website"
 * button in the hero, and in the Contact sidebar card — plus a fourth time when
 * `social` held a `website` key, which `EntitySocialLinks` is told to skip.
 */
export function OrgLocationContact({ org }: { org: Organization }) {
  const { t } = useTranslation();
  const located = org.venues.filter((v) => v.latitude != null && v.longitude != null);
  const center = located[0];
  // Only enrich with surroundings for a single-location org — a multi-city org's
  // own markers already span the map and "nearby" around one of them misleads.
  const nearbyPoints = useNearbyMapPoints({
    lat: located.length === 1 && center ? Number(center.latitude) : null,
    lng: located.length === 1 && center ? Number(center.longitude) : null,
    excludeType: 'venue',
    excludeId: center?.id ?? null,
  });
  const phone = orgPhone(org);
  const phoneHref = formatPhoneHref(phone);
  const hasContact = Boolean(org.website || org.email || phoneHref || hasSocialLinks(org.social));
  if (!center && !hasContact && org.venues.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        {center && (
          <MapInset className="border-0 p-0">
            <EntityMap
              center={[Number(center.longitude), Number(center.latitude)]}
              zoom={located.length > 1 ? 4 : 15}
              height={nearbyPoints.length > 0 ? 220 : 180}
              markers={[
                ...located.map((v) => ({
                  id: v.id,
                  lat: Number(v.latitude),
                  lng: Number(v.longitude),
                  name: v.name,
                  subtitle: v.city ?? undefined,
                  type: 'venues' as const,
                  linkTo: `/venues/${v.slug}`,
                  primary: v.id === center.id,
                })),
                ...nearbyPoints,
              ]}
            />
            <NearbyMapLegend markers={nearbyPoints} />
          </MapInset>
        )}

        {hasContact && (
          <div className="flex min-w-0 flex-col gap-4">
            {/* `flex items-center` on the link, not just the row: the base layer
                gives every <a> min-height 44px, so a bare link is a 44px block
                whose text sits at its top while the icon is centred. */}
            {org.email && (
              <div className="flex items-center gap-2">
                <Mail size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <a
                  href={`mailto:${org.email}`}
                  className="flex min-w-0 items-center text-sm text-primary hover:underline"
                >
                  <span className="truncate">{org.email}</span>
                </a>
              </div>
            )}
            {phoneHref && (
              <div className="flex items-center gap-2">
                <Phone size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <a
                  href={phoneHref}
                  className="flex items-center text-sm text-primary hover:underline"
                >
                  {formatPhoneDisplay(phone)}
                </a>
              </div>
            )}
            {org.website && (
              <div className="flex items-center gap-2">
                <Globe size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <a
                  href={org.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="flex min-w-0 items-center text-sm text-primary hover:underline"
                >
                  <span className="truncate">{displayWebsite(org.website)}</span>
                </a>
              </div>
            )}
            <EntitySocialLinks
              links={org.social}
              size="sm"
              exclude={org.website ? ['website'] : undefined}
            />
          </div>
        )}
      </div>

      {/* Module 08 — the type's OWNER module. A business is legible only through
          the entities it operates, and each one carries the VENUE bullet, not the
          organization's: spec rule 4, "cross-type links use the other type's
          bullet, so the network is legible from inside any page." */}
      {org.venues.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {org.venues.map((v) => (
            <NestedEntityCard
              key={v.id}
              type="venue"
              eyebrow={t('pages.entityDetail.kindVenue', 'Venue')}
              name={v.name}
              description={v.city}
              href={`/venues/${v.slug}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgArticles({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const { data: articles = [], isLoading } = useOrganizationArticles(orgId, true);
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <NewsCard key={i} loading />
        ))}
      </div>
    );
  }
  if (articles.length === 0) {
    return (
      <p className="text-muted-foreground">
        {t('pages.entityDetail.noArticles', 'No articles yet.')}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <NewsCard key={article.id} article={article} />
      ))}
    </div>
  );
}
