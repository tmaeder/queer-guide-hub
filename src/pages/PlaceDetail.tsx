import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router';
import { ExternalLink, MapPin, Accessibility } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  EntityDetailLayout,
  type EntityDetailBreadcrumb,
} from '@/components/entity/EntityDetailLayout';
import { Badge } from '@/components/ui/badge';
import { landmarkKindLabel } from '@/lib/landmarkKinds';
import { LandmarkKindIcon } from '@/components/geo/LandmarkKindIcon';
import { useGeoBreadcrumbs, usePlaceDetail } from '@/hooks/useGeoPlaces';
import { PageContainer } from '@/components/layout/PageContainer';
import { MapInset } from '@/components/transit/MapInset';
import { EntityMap } from '@/components/map/EntityMap';
import { mapUrl } from '@/lib/mapContext';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { landmarkGaps, landmarkHasOverview, landmarkIsUseful } from '@/lib/landmarkContent';

const CRUMB_HREF: Record<string, (slug: string) => string> = {
  country: (slug) => `/country/${slug}`,
  city: (slug) => `/city/${slug}`,
  village: (slug) => `/villages/${slug}`,
  landmark: (slug) => `/place/${slug}`,
};

export default function PlaceDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { pathname, search } = useLocation();

  const { data: place, isLoading, error } = usePlaceDetail(slug);
  const { data: crumbData } = useGeoBreadcrumbs(place?.id);

  if (!isLoading && !error && !place) {
    return (
      <div className="min-h-screen bg-background">
        <PageContainer className="text-center">
          <h1 className="mb-4 text-title font-bold">
            {t('geo.place.notFoundTitle', 'Place not found')}
          </h1>
          <p className="mb-2 text-muted-foreground">
            {t('geo.place.notFoundDescription', "The place you're looking for doesn't exist.")}
          </p>
          <p className="mb-6 text-13 text-muted-foreground">
            {t(
              'geo.place.gatedHint',
              'Places in high-risk regions are only visible to signed-in members.',
            )}
          </p>
          <LocalizedLink to="/places" className="font-medium" style={{ color: 'inherit' }}>
            {t('city.backToPlaces', '← Back to Places')}
          </LocalizedLink>
        </PageContainer>
      </div>
    );
  }

  const profile = place?.geo_landmark_profiles;
  const kind = profile?.landmark_kind ?? 'landmark';

  const breadcrumbs: EntityDetailBreadcrumb[] = [
    { label: t('breadcrumb.places', 'Places'), href: '/places' },
    ...(crumbData ?? [])
      .filter((c) => c.slug && c.id !== place?.id && CRUMB_HREF[c.type])
      .map((c) => ({ label: c.name, href: CRUMB_HREF[c.type](c.slug!) })),
    ...(place ? [{ label: place.name }] : []),
  ];

  const content = place
    ? {
        description: place.description,
        latitude: place.latitude,
        longitude: place.longitude,
        address: profile?.address,
        website: profile?.website,
        accessibility_notes: profile?.accessibility_notes,
      }
    : null;
  const useful = content ? landmarkIsUseful(content) : true;
  const gaps = content ? landmarkGaps(content) : [];
  // Onward links up the hierarchy: the nearest place that does have a page.
  const parents = (crumbData ?? [])
    .filter((c) => c.slug && c.id !== place?.id && CRUMB_HREF[c.type])
    .reverse();

  // A name and a badge is not a page. Say so, point to the district/city
  // that does have content, and offer the correction route.
  const incomplete =
    place && !useful ? (
      <section
        aria-labelledby="place-incomplete"
        className="flex max-w-reading flex-col gap-4 rounded-container bg-surface-container p-6"
      >
        <h2 id="place-incomplete" className="text-title font-bold">
          {t('geo.place.incomplete.title', 'This entry is incomplete')}
        </h2>
        <p className="text-15">
          {gaps.includes('significance') && gaps.includes('location')
            ? t(
                'geo.place.incomplete.both',
                'We do not have a description, address or map location for {{name}} yet.',
                { name: place.name },
              )
            : gaps.includes('significance')
              ? t(
                  'geo.place.incomplete.significance',
                  'We do not have a description for {{name}} yet.',
                  {
                    name: place.name,
                  },
                )
              : t(
                  'geo.place.incomplete.location',
                  'We do not have an address or map location for {{name}} yet.',
                  {
                    name: place.name,
                  },
                )}
        </p>
        {parents.length > 0 && (
          <nav aria-label={t('geo.place.incomplete.nearby', 'Nearby places with more detail')}>
            <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
              {parents.map((c) => (
                <li key={c.id}>
                  <LocalizedLink
                    to={CRUMB_HREF[c.type](c.slug!)}
                    className="inline-flex min-h-11 items-center text-15 font-bold underline underline-offset-4"
                  >
                    {t('geo.place.incomplete.see', 'See {{name}}', { name: c.name })}
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <p className="text-15">
          {t('geo.place.incomplete.help', 'Know this place?')}{' '}
          <LocalizedLink to="/contact" className="font-bold underline underline-offset-4">
            {t('geo.place.incomplete.correct', 'Send a correction or details')}
          </LocalizedLink>
        </p>
      </section>
    ) : null;

  const overview = place ? (
    <div className="flex flex-col gap-6">
      {profile?.website && (
        <dl>
          <div className="flex items-start gap-2">
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                {t('geo.place.website', 'Website')}
              </dt>
              <dd>
                <a href={profile.website} target="_blank" rel="noopener noreferrer">
                  {profile.website.replace(/^https?:\/\//, '')}
                </a>
              </dd>
            </div>
          </div>
        </dl>
      )}
      {profile?.accessibility_notes && (
        <div className="rounded-element p-4 bg-surface-container">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <Accessibility className="h-4 w-4" aria-hidden />
            {t('geo.place.accessibility', 'Accessibility')}
          </div>
          <p className="text-15 text-muted-foreground">{profile.accessibility_notes}</p>
        </div>
      )}
      {/*
        A landmark had coordinates and offered only a raw openstreetmap.org
        link — the one geographic entity with no inset at all, while Countries,
        Cities and Villages all have one. `MapInset` is "a frame, not a second
        map", so this is the frame plus the shared `EntityMap`: the popup is
        `MapEntityCard`, so Directions (the handoff this link used to be) and
        Open-full-map arrive with it rather than being hand-rolled here.

        NOT `MapShell`: the command bar is absolutely positioned for a
        full-bleed canvas and overflows a detail rail — the measured reason
        every other inset is an `EntityMap` too.
      */}
      {place.latitude != null && place.longitude != null && (
        <MapInset>
          <EntityMap
            center={[Number(place.longitude), Number(place.latitude)]}
            zoom={16}
            height={240}
            markers={[
              {
                id: place.id,
                lat: Number(place.latitude),
                lng: Number(place.longitude),
                name: place.name ?? 'Place',
                // No `entityType`/`entityId`: `PlaceMarkEntity` is
                // venue|event|village|country|city, so a LANDMARK cannot carry
                // a visited mark without widening that CHECK. A migration and
                // its own decision — same as hotels and organizations.
                type: 'neighbourhoods',
                primary: true,
              },
            ]}
          />
          <LocalizedLink
            to={mapUrl({
              center: [Number(place.longitude), Number(place.latitude)],
              zoom: 16,
              back: `${pathname}${search}`,
            })}
            className="mt-2 inline-block text-15 underline"
          >
            {t('geo.place.openMap', 'Open on map')}
          </LocalizedLink>
        </MapInset>
      )}
    </div>
  ) : null;

  return (
    <EntityDetailLayout
      loading={isLoading}
      error={error as Error | null}
      breadcrumbs={breadcrumbs}
      hero={
        place ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <h1 className="break-words font-display text-headline leading-tight md:text-display">
                {place.name}
              </h1>
              <Badge variant="outline" className="gap-1">
                <LandmarkKindIcon kind={kind} className="h-3 w-3" />
                {landmarkKindLabel(kind, t)}
              </Badge>
              {/* No currentData: this page loads only the fields it renders,
                  so the edit sheet loads the full record itself. */}
              <AdminEditButton
                contentType="landmarks"
                contentId={place.id}
                contentName={place.name}
                onSaved={() => window.location.reload()}
                exportable
              />
            </div>
            {place.description && (
              <p className="max-w-reading text-body-lg leading-relaxed">{place.description}</p>
            )}
            {profile?.address && (
              <p className="flex items-start gap-2 text-15 text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {profile.address}
              </p>
            )}
            {place.image_url && (
              <img
                src={place.image_url}
                alt={place.name}
                className="max-h-[420px] w-full rounded-container object-cover"
              />
            )}
            {profile?.tags && profile.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {profile.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : null
      }
      tabs={
        place && (incomplete || (content && landmarkHasOverview(content)))
          ? [
              {
                id: 'overview',
                label: t('geo.place.overview', 'Overview'),
                content: (
                  <div className="flex flex-col gap-6">
                    {incomplete}
                    {content && landmarkHasOverview(content) && overview}
                  </div>
                ),
              },
            ]
          : []
      }
      entityType="landmark"
      entityId={place?.id}
    />
  );
}
