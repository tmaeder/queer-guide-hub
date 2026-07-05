import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Globe, Mail, Phone, Newspaper, ShoppingBag, MapPin, Building2 } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SocialCards } from '@/components/social/SocialCard';
import { EntityMap } from '@/components/map/EntityMap';
import { NearbyMapLegend } from '@/components/map/NearbyMapLegend';
import { NewsCard } from '@/components/news/NewsCard';
import { useNearbyMapPoints } from '@/hooks/useNearbyMapPoints';
import { tagHref } from '@/lib/searchRoutes';
import { useOrganizationArticles, type Organization, type OrgRole } from '@/hooks/useOrganization';

export function roleLabel(role: OrgRole, t: TFunction): string {
  const map: Record<OrgRole, string> = {
    publisher: t('pages.entityDetail.rolePublisher', 'News outlet'),
    seller: t('pages.entityDetail.roleSeller', 'Shop'),
    venue: t('pages.entityDetail.roleVenue', 'Physical venue'),
    organizer: t('pages.entityDetail.roleOrganizer', 'Organizer'),
    community: t('pages.entityDetail.roleCommunity', 'Community'),
    support: t('pages.entityDetail.roleSupport', 'Support organization'),
  };
  return map[role] ?? role;
}

export function OrgHero({ org }: { org: Organization }) {
  const { t } = useTranslation();
  const cover = org.cover_image_url || org.images?.[0] || null;
  return (
    <div className="overflow-hidden rounded-container border border-border">
      <div className="relative h-40 w-full bg-muted md:h-56">
        {cover && <img src={cover} alt="" className="h-full w-full object-cover" loading="eager" />}
        {cover && <div className="absolute inset-0 bg-gradient-to-b from-black/15 to-black/65" />}
      </div>
      <div className="flex flex-col gap-4 p-6 md:flex-row md:items-end">
        {org.logo_url && (
          <img
            src={org.logo_url}
            alt=""
            className="-mt-16 h-24 w-24 rounded-element border border-border bg-background object-contain p-2"
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-headline-lg leading-tight md:text-display">{org.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {org.roles.map((role) => (
              <Badge key={role} variant="secondary">
                {roleLabel(role, t)}
              </Badge>
            ))}
            {org.website_domain && (
              <span className="text-13 text-muted-foreground">{org.website_domain}</span>
            )}
          </div>
          {org.editorial_hook && (
            <p className="mt-4 max-w-2xl text-body-lg text-muted-foreground">{org.editorial_hook}</p>
          )}
        </div>
        {org.website && (
          <Button asChild variant="outline">
            <a href={org.website} target="_blank" rel="noopener noreferrer">
              <Globe size={16} className="mr-2" aria-hidden="true" />
              {t('pages.entityDetail.visitWebsite', 'Visit website')}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export function OrgAbout({ org }: { org: Organization }) {
  const { t } = useTranslation();
  const about = org.editorial_long || org.description;
  if (!about) return null;
  return (
    <section>
      <h2 className="mb-4 font-display text-headline">{t('pages.entityDetail.about', 'About')}</h2>
      <p className="whitespace-pre-line text-body-lg leading-relaxed text-foreground/90">{about}</p>
    </section>
  );
}

export function OrgSocial({ org }: { org: Organization }) {
  const { t } = useTranslation();
  const hasSocial = org.social && Object.keys(org.social).length > 0;
  if (!hasSocial) return null;
  return (
    <section>
      <h2 className="mb-4 font-display text-headline">{t('pages.entityDetail.onSocial', 'On social')}</h2>
      <SocialCards links={org.social} />
    </section>
  );
}

export function OrgWhatTheyDo({ org }: { org: Organization }) {
  const { t } = useTranslation();
  const hasAny =
    org.roles.includes('publisher') || org.roles.includes('seller') || org.venue_count > 0;
  if (!hasAny) return null;
  return (
    <section>
      <h2 className="mb-4 font-display text-headline">
        {t('pages.entityDetail.whatTheyDo', 'What they do')}
      </h2>
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
        {org.venue_count > 0 && (
          <Card>
            <CardContent className="flex items-center gap-2 p-4">
              <MapPin size={20} className="text-muted-foreground" aria-hidden="true" />
              <div>
                <div className="font-medium">
                  {t('pages.entityDetail.locationsCount', '{{count}} locations', {
                    count: org.venue_count,
                  })}
                </div>
                <div className="text-13 text-muted-foreground">
                  {t('pages.entityDetail.roleVenue', 'Physical venue')}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

export function OrgTags({ org }: { org: Organization }) {
  const { t } = useTranslation();
  if (!org.tags?.length) return null;
  return (
    <section>
      <h2 className="mb-4 font-display text-headline">{t('pages.entityDetail.tags', 'Tags')}</h2>
      <div className="flex flex-wrap gap-2">
        {org.tags.slice(0, 16).map((tag) => (
          <LocalizedLink key={tag} to={tagHref(tag)}>
            <Badge variant="outline">{tag}</Badge>
          </LocalizedLink>
        ))}
      </div>
    </section>
  );
}

export function OrgVisit({ org }: { org: Organization }) {
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
  return (
    <div className="flex flex-col gap-6">
      {center && (
        <div className="flex flex-col gap-2">
          <EntityMap
            center={[Number(center.longitude), Number(center.latitude)]}
            zoom={located.length > 1 ? 4 : 14}
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
            className="rounded-container"
          />
          <NearbyMapLegend markers={nearbyPoints} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {org.venues.map((v) => (
          <LocalizedLink key={v.id} to={`/venues/${v.slug}`}>
            <Card className="h-full transition-colors hover:bg-muted">
              <CardContent className="flex items-center gap-2 p-4">
                <Building2 size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{v.name}</div>
                  {v.city && <div className="text-13 text-muted-foreground">{v.city}</div>}
                </div>
              </CardContent>
            </Card>
          </LocalizedLink>
        ))}
      </div>
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
    return <p className="text-muted-foreground">{t('pages.entityDetail.noArticles', 'No articles yet.')}</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <NewsCard key={article.id} article={article} />
      ))}
    </div>
  );
}

export function OrgSidebar({ org }: { org: Organization }) {
  const { t } = useTranslation();
  const hasContact = org.website || org.email || org.phone;
  if (!hasContact) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-title">{t('pages.entityDetail.contact', 'Contact')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-15">
        {org.website && (
          <a
            href={org.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:underline"
          >
            <Globe size={16} className="text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{org.website_domain || org.website}</span>
          </a>
        )}
        {org.email && (
          <a href={`mailto:${org.email}`} className="flex items-center gap-2 hover:underline">
            <Mail size={16} className="text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{org.email}</span>
          </a>
        )}
        {org.phone && (
          <a href={`tel:${org.phone}`} className="flex items-center gap-2 hover:underline">
            <Phone size={16} className="text-muted-foreground" aria-hidden="true" />
            <span>{org.phone}</span>
          </a>
        )}
      </CardContent>
    </Card>
  );
}
