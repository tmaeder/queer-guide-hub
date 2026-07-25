import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ExternalLink, MapPin, Accessibility } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  EntityDetailLayout,
  type EntityDetailBreadcrumb,
} from '@/components/entity/EntityDetailLayout';
import { Badge } from '@/components/ui/badge';
import { landmarkKindLabel } from '@/lib/landmarkKinds';
import { LandmarkKindIcon } from '@/components/geo/LandmarkKindIcon';
import { useGeoBreadcrumbs, usePlaceDetail } from '@/hooks/useGeoPlaces';

const CRUMB_HREF: Record<string, (slug: string) => string> = {
  country: (slug) => `/country/${slug}`,
  city: (slug) => `/city/${slug}`,
  village: (slug) => `/villages/${slug}`,
  landmark: (slug) => `/place/${slug}`,
};

export default function PlaceDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();

  const { data: place, isLoading, error } = usePlaceDetail(slug);
  const { data: crumbData } = useGeoBreadcrumbs(place?.id);

  if (!isLoading && !error && !place) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto px-4 py-8 text-center">
          <h5 className="mb-4 text-xl font-bold">
            {t('geo.place.notFoundTitle', 'Place not found')}
          </h5>
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
        </div>
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

  const overview = place ? (
    <div className="flex flex-col gap-6">
      {place.description && (
        <p className="max-w-prose text-body-lg leading-relaxed">{place.description}</p>
      )}
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {profile?.address && (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <dt className="text-2xs uppercase tracking-wide text-muted-foreground">
                {t('geo.place.address', 'Address')}
              </dt>
              <dd>{profile.address}</dd>
            </div>
          </div>
        )}
        {profile?.website && (
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
        )}
      </dl>
      {profile?.accessibility_notes && (
        <div className="rounded-element border border-border p-4">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <Accessibility className="h-4 w-4" aria-hidden />
            {t('geo.place.accessibility', 'Accessibility')}
          </div>
          <p className="text-15 text-muted-foreground">{profile.accessibility_notes}</p>
        </div>
      )}
      {place.latitude != null && place.longitude != null && (
        <a
          href={`https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=17/${place.latitude}/${place.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-15 underline"
        >
          {t('geo.place.openMap', 'Open on map')}
        </a>
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
            {place.image_url && (
              <img
                src={place.image_url}
                alt={place.name}
                className="max-h-[420px] w-full rounded-container object-cover"
              />
            )}
            <div className="flex flex-wrap items-center gap-4">
              <h1 className="text-display font-display">{place.name}</h1>
              <Badge variant="outline" className="gap-1">
                <LandmarkKindIcon kind={kind} className="h-3 w-3" />
                {landmarkKindLabel(kind, t)}
              </Badge>
            </div>
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
      tabs={[{ id: 'overview', label: t('geo.place.overview', 'Overview'), content: overview }]}
      entityType="landmark"
      entityId={place?.id}
    />
  );
}
