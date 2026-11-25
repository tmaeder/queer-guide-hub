import { Navigate, useLocation, useSearchParams } from 'react-router';
import { MapPin, ShieldCheck } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import IntimateDiscovery from '@/pages/intimate/IntimateDiscovery';
import { PeopleLocationError } from '@/components/people/PeopleDiscoveryState';
import { readPeopleContext, peopleContextHref } from '@/lib/peopleContext';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { MeetPageLayout } from '@/components/meet/MeetPageLayout';
import { MeetNavBar } from '@/components/meet/MeetNav';

/** The map moved to /meet/nearby; old map links keep their layers. */
function movedMapTarget(params: URLSearchParams): string | null {
  const wantsMap = params.get('view') === 'map' || params.get('panel') === 'spots';
  if (!wantsMap) return null;
  const layers = params.get('layers');
  const next = new URLSearchParams(params);
  next.delete('view');
  next.delete('panel');
  if (layers) next.set('layers', layers);
  return `/meet/nearby?${next}`;
}

/**
 * /meet/dating — opted-in dating profiles, 18+. The live map (people, dating
 * areas, cruising spots) lives on /meet/nearby; a dating area there links
 * back here filtered to its city (`?city=<id>&in=<name>`).
 */
export default function Cruising() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const context = readPeopleContext(params);
  const place = useIntentLocation(context.city, { cityId: context.cityId });
  const cityId = context.city || context.cityId ? place.cityId : undefined;
  const cityName = place.cityName ?? params.get('in');

  useMeta({
    title: t('people.tabs.dating', 'Dating'),
    description: t('cruising.meta.description'),
    canonicalPath: '/meet/dating',
    noIndex: true,
  });

  const moved = movedMapTarget(params);
  if (moved) return <Navigate to={moved} replace />;

  if (authLoading) {
    return (
      <>
        <MeetNavBar />
        <PageContainer>
          <PageLoadingState count={4} label={t('cruising.loading')} />
        </PageContainer>
      </>
    );
  }
  if (!user) {
    return (
      <Navigate to="/auth" state={{ from: `${location.pathname}${location.search}` }} replace />
    );
  }

  const clearCity = () =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete('city');
      next.delete('cityId');
      next.delete('in');
      return next;
    });

  return (
    <MeetPageLayout
      title={t('people.tabs.dating', 'Dating')}
      description={t(
        'cruising.views.profilesIntro',
        'Opted-in members, 18+. Tap a profile to see more.',
      )}
      actions={
        <Button variant="outline" asChild>
          <LocalizedLink to={peopleContextHref('/meet/nearby', context)}>
            <MapPin size={16} aria-hidden />
            {t('cruising.openMap', 'Live map')}
          </LocalizedLink>
        </Button>
      }
    >
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 shrink-0" size={14} aria-hidden />
        <p>
          {t('cruising.safety.body')}{' '}
          <LocalizedLink to="/tags/cruising" className="font-semibold underline underline-offset-4">
            {t('cruising.safety.guide')}
          </LocalizedLink>{' '}
          {t('cruising.safety.healthLead')}{' '}
          <LocalizedLink
            to="/tags/sti-guide"
            className="font-semibold underline underline-offset-4"
          >
            {t('cruising.safety.health')}
          </LocalizedLink>
          .
        </p>
      </div>
      <div className="mt-6">
        {cityId ? (
          <p className="mb-4 flex flex-wrap items-center gap-x-2 text-13 text-muted-foreground">
            {cityName
              ? t('cruising.cityFilter', 'Showing dating profiles around {{city}}.', {
                  city: cityName,
                })
              : t('cruising.cityFilterUnnamed', 'Showing dating profiles around one city.')}
            <button
              type="button"
              className="font-bold text-foreground underline underline-offset-4"
              onClick={clearCity}
            >
              {t('cruising.views.allCities', 'Show all cities')}
            </button>
          </p>
        ) : null}
        {(context.city || context.cityId) && place.loading ? (
          <PageLoadingState count={4} label={t('cruising.loading')} />
        ) : place.error ? (
          <PeopleLocationError retry={place.retry} />
        ) : (
          <IntimateDiscovery embedded cityIdOverride={cityId ?? undefined} />
        )}
      </div>
    </MeetPageLayout>
  );
}
