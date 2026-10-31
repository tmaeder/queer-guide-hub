import { useTranslation } from 'react-i18next';
import { Sparkles } from '@/components/icons';
import { Rail, RailItem } from '@/components/ui/Rail';
import { Button } from '@/components/ui/button';
import { VenueCard } from '@/components/venues/VenueCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useVenueRail, type VenueRailData, type VenueRailParams } from '@/hooks/useVenueRail';
import { DeferredSection } from '@/components/home/DeferredSection';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

interface VenuesRailsProps {
  userLocation: { latitude: number; longitude: number } | null;
  primaryCityId: string | null;
  primaryCityName: string | null;
}

export function VenuesRails({ userLocation, primaryCityId, primaryCityName }: VenuesRailsProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const nearYou: VenueRailParams = {
    userId: user?.id ?? null,
    lat: userLocation?.latitude ?? null,
    lng: userLocation?.longitude ?? null,
    sort: 'nearest',
    filters: { radiusKm: 30 },
  };

  const forYou: VenueRailParams = {
    userId: user?.id ?? null,
    lat: userLocation?.latitude ?? null,
    lng: userLocation?.longitude ?? null,
    sort: 'relevance',
  };

  const newThisMonth: VenueRailParams = {
    userId: user?.id ?? null,
    lat: userLocation?.latitude ?? null,
    lng: userLocation?.longitude ?? null,
    sort: 'created_at',
  };

  const topInCity: VenueRailParams = {
    userId: user?.id ?? null,
    lat: userLocation?.latitude ?? null,
    lng: userLocation?.longitude ?? null,
    filters: { cityId: primaryCityId ?? undefined, city: primaryCityName ?? undefined },
    sort: 'featured',
  };

  const editorsPicks: VenueRailParams = {
    userId: user?.id ?? null,
    lat: userLocation?.latitude ?? null,
    lng: userLocation?.longitude ?? null,
    sort: 'featured',
  };

  return (
    <div className="space-y-12">
      {!!userLocation && (
        <DeferredRailSection
          title={t('venues.rails.nearYou.title', 'Near you')}
          subtitle={t('venues.rails.nearYou.subtitle', 'Venues within 30 km, ranked by distance.')}
          params={nearYou}
        />
      )}
      {user ? (
        <DeferredRailSection
          title={t('venues.rails.forYou.title', 'For your taste')}
          subtitle={t(
            'venues.rails.forYou.subtitle',
            'Picked from your interests and where you’ve been.',
          )}
          params={forYou}
        />
      ) : (
        <AnonPersonalizationPromo />
      )}
      <DeferredRailSection
        title={t('venues.rails.new.title', 'New this month')}
        subtitle={t('venues.rails.new.subtitle', 'Fresh additions to the guide.')}
        params={newThisMonth}
      />
      {!!primaryCityName && (
        <DeferredRailSection
          title={t('venues.rails.topInCity.title', {
            city: primaryCityName,
            defaultValue: 'Top in {{city}}',
          })}
          subtitle={t('venues.rails.topInCity.subtitle', 'Popular with the community right now.')}
          params={topInCity}
          enabled={!!primaryCityId}
        />
      )}
      <DeferredRailSection
        title={t('venues.rails.editors.title', 'Editor’s picks')}
        subtitle={t('venues.rails.editors.subtitle', 'Hand-curated highlights worth the trip.')}
        params={editorsPicks}
      />
    </div>
  );
}

/** Query ownership lives inside the viewport boundary, not in the page shell. */
function DeferredRailSection({
  title,
  subtitle,
  params,
  enabled = true,
}: {
  title: string;
  subtitle: string;
  params: VenueRailParams;
  enabled?: boolean;
}) {
  return (
    <div data-venue-rail={params.sort}>
      <DeferredSection
        rootMargin="0px"
        fallback={<RailPlaceholder title={title} subtitle={subtitle} />}
      >
        <LoadedRailSection title={title} subtitle={subtitle} params={params} enabled={enabled} />
      </DeferredSection>
    </div>
  );
}

function RailPlaceholder({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Rail title={title} subtitle={subtitle}>
      {Array.from({ length: 4 }, (_, i) => (
        <RailItem key={i}>
          <div aria-hidden="true" className="h-[392px] rounded-container bg-muted md:h-[442px]" />
        </RailItem>
      ))}
    </Rail>
  );
}

function LoadedRailSection({
  title,
  subtitle,
  params,
  enabled,
}: {
  title: string;
  subtitle: string;
  params: VenueRailParams;
  enabled: boolean;
}) {
  const data = useVenueRail(enabled, params);
  if (data.loading) return <RailPlaceholder title={title} subtitle={subtitle} />;
  return <RailSection title={title} subtitle={subtitle} data={data} />;
}

function RailSection({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: VenueRailData;
}) {
  if (!data.loading && data.venues.length === 0) return null;
  return (
    <Rail title={title} subtitle={subtitle}>
      {data.loading
        ? Array.from({ length: 4 }).map((_, i) => (
            <RailItem key={i}>
              <Skeleton className="h-72 w-full rounded-container" />
            </RailItem>
          ))
        : data.venues.map((v) => (
            <RailItem key={v.id}>
              <VenueCard venue={v} />
            </RailItem>
          ))}
    </Rail>
  );
}

function AnonPersonalizationPromo() {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('venues.rails.forYouPromo.label', 'Personalize your venues')}
      className="rounded-container bg-card p-8"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Sparkles size={14} />
            {t('venues.rails.forYouPromo.kicker', 'For your taste')}
          </div>
          <h2 className="text-headline font-semibold tracking-tight">
            {t('venues.rails.forYouPromo.title', 'Tell us what you love.')}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {t(
              'venues.rails.forYouPromo.body',
              'Sign in and answer four quick questions — we’ll rank venues by your interests and where you’ve been.',
            )}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild>
            <LocalizedLink to="/auth?redirect=%2Fonboarding%2Fvenues">
              {t('venues.rails.forYouPromo.cta', 'Get started')}
            </LocalizedLink>
          </Button>
        </div>
      </div>
    </section>
  );
}
