import { useEffect, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowLeft } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { useMeta } from '@/hooks/useMeta';
import { useTrackView } from '@/hooks/useTrackView';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { GatedDetailFallback } from '@/components/safety/GatedDetailFallback';
import { NotFoundMeta } from '@/components/seo/NotFoundMeta';
import { EntityDetailScroll } from '@/components/entity/EntityDetailScroll';
import { useVenueDescriptor } from '@/components/entity/adapters/useVenueDescriptor';
import { useOrganizationDescriptor } from '@/components/entity/adapters/useOrganizationDescriptor';
import type { EntitySource, EntityDescriptorResult } from '@/components/entity/entityDescriptor';

/**
 * Unified detail page. The route fixes `source`; we branch once into a
 * per-source component so each adapter hook is called unconditionally (rules of
 * hooks). Both render the same single-scroll shell.
 */
export default function EntityDetail({ source }: { source: EntitySource }) {
  return source === 'organization' ? <OrgEntityDetail /> : <VenueEntityDetail />;
}

function VenueEntityDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const result = useVenueDescriptor(slug);
  return (
    <EntityDetailView
      source="venue"
      slug={slug}
      result={result}
      notFoundNode={<VenueNotFound slug={slug} t={t} />}
    />
  );
}

function OrgEntityDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const result = useOrganizationDescriptor(slug);
  return (
    <EntityDetailView
      source="organization"
      slug={slug}
      result={result}
      notFoundNode={<OrgNotFound t={t} />}
    />
  );
}

function EntityDetailView({
  source,
  slug,
  result,
  notFoundNode,
}: {
  source: EntitySource;
  slug: string | undefined;
  result: EntityDescriptorResult;
  notFoundNode: ReactNode;
}) {
  const { descriptor, isLoading, error, notFound } = result;
  const { track } = useTrackEvent();

  useMeta(descriptor?.meta ?? {});
  useTrackView(
    (descriptor?.trackView ?? { type: source }) as Parameters<typeof useTrackView>[0],
  );

  useEffect(() => {
    // user_events only models venues (entityType union); orgs use recently-viewed.
    if (source === 'venue' && descriptor?.id) {
      track({
        eventType: 'page_view',
        entityType: 'venue',
        entityId: descriptor.id,
        metadata: { name: descriptor.title },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptor?.id]);

  if (!isLoading && notFound) {
    return <GatedDetailFallback entityType={source} slug={slug} notFound={notFoundNode} />;
  }

  return <EntityDetailScroll descriptor={descriptor} loading={isLoading} error={error} />;
}

const SECTION_SLUGS = ['hotels', 'events', 'news', 'marketplace', 'travel', 'groups', 'resources'];

function VenueNotFound({ slug, t }: { slug: string | undefined; t: TFunction }) {
  const didYouMeanSection = slug && SECTION_SLUGS.includes(slug) ? slug : null;
  return (
    <div className="container mx-auto py-8 px-4 text-center">
      <NotFoundMeta title={t('pages.venueDetail.notFoundTitle', 'Venue not found')} />
      <h1 className="text-xl font-bold mb-4">
        {t('pages.venueDetail.notFoundTitle', 'Venue not found')}
      </h1>
      <p className="text-muted-foreground mb-6">
        {t(
          'pages.venueDetail.notFoundBody',
          'No venue matches this URL. It may have been removed or the link is incorrect.',
        )}
      </p>
      {didYouMeanSection && (
        <p className="text-sm mb-6">
          {t('pages.venueDetail.didYouMean', 'Did you mean')}{' '}
          <LocalizedLink to={`/${didYouMeanSection}`} className="underline font-medium">
            /{didYouMeanSection}
          </LocalizedLink>
          ?
        </p>
      )}
      <LocalizedLink to="/venues">
        <Button variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('pages.venueDetail.backToVenues', 'Back to Venues')}
        </Button>
      </LocalizedLink>
    </div>
  );
}

function OrgNotFound({ t }: { t: TFunction }) {
  return (
    <div className="container mx-auto px-4 py-8 text-center">
      <NotFoundMeta title={t('pages.entityDetail.orgNotFoundTitle', 'Organization not found')} />
      <h1 className="mb-4 text-xl font-bold">
        {t('pages.entityDetail.orgNotFoundTitle', 'Organization not found')}
      </h1>
      <p className="mb-6 text-muted-foreground">
        {t(
          'pages.entityDetail.orgNotFoundBody',
          'No organization matches this URL. It may have been removed or the link is incorrect.',
        )}
      </p>
      <LocalizedLink to="/search">
        <Button variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('pages.entityDetail.backToSearch', 'Back to search')}
        </Button>
      </LocalizedLink>
    </div>
  );
}
