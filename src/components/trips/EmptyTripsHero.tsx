import { Plus, Sparkles, Compass, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useDiscoverableTrips } from '@/hooks/useDiscoverableTrips';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PublicTripCard } from './PublicTripCard';
import { TripTemplates } from './TripTemplates';

interface Props {
  onCreate: () => void;
}

/**
 * Cold-start hero for users without any trips. Replaces the older
 * "EmptyState + templates" pair with three equal-weight paths so the
 * jump from zero to first trip feels less like a single dead-end CTA.
 */
export function EmptyTripsHero({ onCreate }: Props) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { data: publicTrips, isLoading: discoverLoading } = useDiscoverableTrips();
  const previewTrips = (publicTrips ?? []).slice(0, 3);

  const paths = [
    {
      key: 'scratch' as const,
      icon: Plus,
      title: t('trips.empty.paths.scratch.title', 'Start from scratch'),
      description: t(
        'trips.empty.paths.scratch.description',
        'Empty itinerary, your destinations, your pace.',
      ),
      cta: t('trips.empty.paths.scratch.cta', 'Create trip'),
      onClick: onCreate,
      brand: true,
    },
    {
      key: 'template' as const,
      icon: Sparkles,
      title: t('trips.empty.paths.template.title', 'Use a template'),
      description: t(
        'trips.empty.paths.template.description',
        'Pre-built itineraries you can fork and edit.',
      ),
      cta: t('trips.empty.paths.template.cta', 'Browse templates'),
      onClick: () => {
        const el = document.getElementById('trip-templates');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      brand: false,
    },
    {
      key: 'discover' as const,
      icon: Compass,
      title: t('trips.empty.paths.discover.title', 'Fork a public trip'),
      description: t(
        'trips.empty.paths.discover.description',
        'Real itineraries from other QG travelers.',
      ),
      cta: t('trips.empty.paths.discover.cta', 'Open Discover'),
      onClick: () => navigate('/trips/discover'),
      brand: false,
    },
  ];

  return (
    <div className="mt-2">
      <div className="text-center mb-8 md:mb-10 max-w-2xl mx-auto px-2">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
          {t('trips.empty.hero.title', 'Plan a trip you’ll feel safe on.')}
        </h2>
        <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
          {t(
            'trips.empty.hero.subtitle',
            'Three ways to start — pick whichever fits.',
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        {paths.map(({ key, icon: Icon, title, description, cta, onClick, brand }) => (
          <Card key={key} hoverable className="flex">
            <CardContent className="flex flex-col items-start gap-4 p-6 w-full">
              <span
                aria-hidden="true"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background shadow-sm"
              >
                <Icon style={{ width: 20, height: 20 }} />
              </span>
              <div className="flex-1">
                <h3 className="text-lg font-bold tracking-tight mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </div>
              <Button
                variant={brand ? 'brand' : 'outline'}
                onClick={onClick}
                className="mt-1"
              >
                {cta}
                <ArrowRight style={{ width: 14, height: 14, marginLeft: 6 }} />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {(discoverLoading || previewTrips.length > 0) && (
        <section className="mb-12">
          <div className="flex items-end justify-between gap-3 mb-4">
            <div>
              <div className="inline-flex items-center gap-2 mb-1">
                <Compass style={{ width: 16, height: 16 }} />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('trips.empty.discoverEyebrow', 'From real travelers')}
                </span>
              </div>
              <h3 className="text-lg md:text-xl font-bold tracking-tight">
                {t('trips.empty.discoverTitle', 'Recent public trips')}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/trips/discover')}
            >
              {t('trips.empty.discoverCta', 'Open Discover')}
              <ArrowRight style={{ width: 14, height: 14, marginLeft: 4 }} />
            </Button>
          </div>
          {discoverLoading && previewTrips.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[240px] w-full rounded" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {previewTrips.map((trip) => (
                <PublicTripCard key={trip.id} trip={trip} />
              ))}
            </div>
          )}
        </section>
      )}

      <div id="trip-templates">
        <TripTemplates />
      </div>
    </div>
  );
}
