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
import { MeetNavBar } from '@/components/meet/MeetNav';
import { PageHeader } from '@/components/layout/PageHeader';

/** The map moved to /meet/nearby; old map links keep their layers. */
function movedMapTarget(params: URLSearchParams): string | null {
  const wantsMap = params.get('view') === 'map' || params.get('panel') === 'spots';
  if (!wantsMap) return null;
  const layers = params.get('layers');
  return `/meet/nearby${layers ? `?layers=${encodeURIComponent(layers)}` : ''}`;
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
  const cityId = params.get('city');
  const cityName = params.get('in');

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
      next.delete('in');
      return next;
    });

  return (
    <div className="pb-12">
      <MeetNavBar />
      <PageContainer className="pb-6 pt-6 md:pt-8">
        <PageHeader
          title={t('people.tabs.dating', 'Dating')}
          subtitle={t(
            'cruising.views.profilesIntro',
            'Opted-in members, 18+. Tap a profile to see more.',
          )}
          actions={
            <Button variant="outline" asChild>
              <LocalizedLink to="/meet/nearby">
                <MapPin size={16} aria-hidden />
                {t('cruising.openMap', 'Live map')}
              </LocalizedLink>
            </Button>
          }
        />

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 shrink-0" size={14} aria-hidden />
          <p>
            {t('cruising.safety.body')}{' '}
            <LocalizedLink
              to="/tags/cruising"
              className="font-semibold underline underline-offset-4"
            >
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
      </PageContainer>

      <PageContainer className="pt-0">
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
        <IntimateDiscovery embedded cityIdOverride={cityId ?? undefined} />
      </PageContainer>
    </div>
  );
}
