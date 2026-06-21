import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Globe, Mail, Phone, Newspaper, ShoppingBag, MapPin, Building2 } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/entity/EntityDetailLayout';
import { EntityMap } from '@/components/map/EntityMap';
import { NewsCard } from '@/components/news/NewsCard';
import { MarketplaceFilteredView } from '@/components/marketplace/MarketplaceFilteredView';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { tagHref } from '@/lib/searchRoutes';
import { useMeta } from '@/hooks/useMeta';
import { useTrackView } from '@/hooks/useTrackView';
import {
  useOrganization,
  useOrganizationArticles,
  type Organization,
  type OrgRole,
} from '@/hooks/useOrganization';

const ROLE_LABELS: Record<OrgRole, string> = {
  publisher: 'News outlet',
  seller: 'Shop',
  venue: 'Physical venue',
  organizer: 'Organizer',
  community: 'Community',
  support: 'Support organization',
};

function OrgHero({ org }: { org: Organization }) {
  const cover = org.cover_image_url || org.images?.[0] || null;
  return (
    <div className="overflow-hidden rounded-container border border-border">
      <div className="relative h-40 w-full bg-muted md:h-56">
        {cover && (
          <img src={cover} alt="" className="h-full w-full object-cover" loading="eager" />
        )}
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
                {ROLE_LABELS[role] ?? role}
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
              Visit website
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function OrgOverview({ org }: { org: Organization }) {
  const about = org.editorial_long || org.description;
  return (
    <div className="flex flex-col gap-8">
      {about && (
        <section>
          <h2 className="mb-4 font-display text-headline">About</h2>
          <p className="whitespace-pre-line text-body-lg leading-relaxed text-foreground/90">
            {about}
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-4 font-display text-headline">What they do</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {org.roles.includes('publisher') && (
            <Card>
              <CardContent className="flex items-center gap-2 p-4">
                <Newspaper size={20} className="text-muted-foreground" aria-hidden="true" />
                <div>
                  <div className="font-medium">{org.article_count} articles</div>
                  <div className="text-13 text-muted-foreground">News outlet</div>
                </div>
              </CardContent>
            </Card>
          )}
          {org.roles.includes('seller') && (
            <Card>
              <CardContent className="flex items-center gap-2 p-4">
                <ShoppingBag size={20} className="text-muted-foreground" aria-hidden="true" />
                <div>
                  <div className="font-medium">{org.product_count} products</div>
                  <div className="text-13 text-muted-foreground">Shop</div>
                </div>
              </CardContent>
            </Card>
          )}
          {org.venue_count > 0 && (
            <Card>
              <CardContent className="flex items-center gap-2 p-4">
                <MapPin size={20} className="text-muted-foreground" aria-hidden="true" />
                <div>
                  <div className="font-medium">{org.venue_count} location{org.venue_count > 1 ? 's' : ''}</div>
                  <div className="text-13 text-muted-foreground">Physical venue</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {org.tags?.length > 0 && (
        <section>
          <h2 className="mb-4 font-display text-headline">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {org.tags.slice(0, 16).map((tag) => (
              <LocalizedLink key={tag} to={tagHref(tag)}>
                <Badge variant="outline">{tag}</Badge>
              </LocalizedLink>
            ))}
          </div>
        </section>
      )}

      <SimilarItems entity={{ type: 'organization', id: org.id }} title="Related" />
    </div>
  );
}

function OrgVisit({ org }: { org: Organization }) {
  const located = org.venues.filter((v) => v.latitude != null && v.longitude != null);
  const center = located[0];
  return (
    <div className="flex flex-col gap-6">
      {center && (
        <EntityMap
          center={[Number(center.longitude), Number(center.latitude)]}
          zoom={located.length > 1 ? 4 : 14}
          markers={located.map((v) => ({
            id: v.id,
            lat: Number(v.latitude),
            lng: Number(v.longitude),
            name: v.name,
            subtitle: v.city ?? undefined,
            type: 'venues' as const,
            linkTo: `/venues/${v.slug}`,
            primary: v.id === center.id,
          }))}
          className="rounded-container"
        />
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

function OrgArticles({ orgId }: { orgId: string }) {
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
    return <p className="text-muted-foreground">No articles yet.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <NewsCard key={article.id} article={article} />
      ))}
    </div>
  );
}

function OrgSidebar({ org }: { org: Organization }) {
  const socials = Object.entries(org.social || {}).filter(([, v]) => Boolean(v));
  const hasContact = org.website || org.email || org.phone || socials.length > 0;
  if (!hasContact) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-title">Contact</CardTitle>
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
        {socials.map(([key, value]) => (
          <a
            key={key}
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 capitalize hover:underline"
          >
            <Globe size={16} className="text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{key}</span>
          </a>
        ))}
      </CardContent>
    </Card>
  );
}

export default function OrganizationDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { data: org, isLoading, error } = useOrganization(slug);

  useTrackView({ type: 'organization', slug: org?.slug, title: org?.name });
  useMeta(
    org
      ? {
          title: `${org.name} — Queer Guide`,
          description:
            org.editorial_hook ||
            org.description ||
            `${org.name} on Queer Guide.`,
          canonicalPath: `/organizations/${org.slug}`,
        }
      : {},
  );

  const tabs: EntityDetailTab[] = useMemo(() => {
    if (!org) return [];
    const list: EntityDetailTab[] = [
      { id: 'overview', label: 'Overview', content: <OrgOverview org={org} /> },
    ];
    if (org.venue_count > 0) {
      list.push({ id: 'visit', label: 'Visit', content: <OrgVisit org={org} /> });
    }
    if (org.roles.includes('publisher') && org.article_count > 0) {
      list.push({ id: 'articles', label: 'Latest articles', content: <OrgArticles orgId={org.id} /> });
    }
    if (org.roles.includes('seller') && org.product_count > 0 && org.website_domain) {
      list.push({
        id: 'shop',
        label: 'Shop',
        content: (
          <MarketplaceFilteredView
            filters={{ merchantDomain: org.website_domain }}
            emptyTitle="No products listed yet."
          />
        ),
      });
    }
    return list;
  }, [org]);

  if (!isLoading && !org) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="mb-4 text-xl font-bold">Organization not found</h1>
        <p className="mb-6 text-muted-foreground">
          No organization matches this URL. It may have been removed or the link is incorrect.
        </p>
        <LocalizedLink to="/search">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to search
          </Button>
        </LocalizedLink>
      </div>
    );
  }

  return (
    <EntityDetailLayout
      loading={isLoading}
      error={error instanceof Error ? error : null}
      breadcrumbs={
        org ? [{ label: t('nav.home', 'Home'), href: '/' }, { label: org.name }] : undefined
      }
      hero={org ? <OrgHero org={org} /> : null}
      tabs={tabs}
      sidebar={org ? <OrgSidebar org={org} /> : undefined}
      entityType="organization"
      entityId={org?.id}
    />
  );
}
