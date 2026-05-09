import { useMemo } from 'react';
import { Hotel, Plane, Train, Bus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { SuggestionCard } from '@/components/trips/shared/SuggestionCard';
import {
  useTripReservationSuggestions,
  type TransportSuggestion,
} from '@/hooks/useTripReservationSuggestions';
import { recordSuggestionImpression, recordSuggestionClick } from '@/utils/tripTracking';

interface Props {
  tripId: string;
}

export function ReservationSuggestionsPanel({ tripId }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useTripReservationSuggestions(tripId);

  const transportGroups = useMemo(() => {
    const by: Record<'flight' | 'rail' | 'bus', TransportSuggestion[]> = {
      flight: [],
      rail: [],
      bus: [],
    };
    for (const s of data?.transport ?? []) {
      by[s.kind].push(s);
    }
    return by;
  }, [data?.transport]);

  if (isLoading) {
    return <PageLoadingState count={2} variant="list" />;
  }

  const accommodations = data?.accommodations ?? [];
  const hasAnyTransport =
    transportGroups.flight.length +
      transportGroups.rail.length +
      transportGroups.bus.length >
    0;

  if (accommodations.length === 0 && !hasAnyTransport) {
    return null;
  }

  const openExternal = async (
    url: string,
    provider: string,
    type: 'accommodation' | 'flight' | 'rail' | 'bus',
    listingId: string | null,
    rank: number,
  ) => {
    await recordSuggestionClick({
      tripId,
      provider,
      type,
      externalUrl: url,
      listingId,
      rankPosition: rank,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col gap-6">
      {accommodations.length > 0 && (
        <div>
          <SectionHeader icon={<Hotel size={14} />} title={t('trips.suggestions.stayTitle')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {accommodations.map((a) => (
              <SuggestionCard
                key={a.id}
                title={a.title}
                description={a.description}
                imageUrl={a.imageUrl}
                provider={a.provider}
                priceLabel={
                  a.priceFrom != null && a.currency
                    ? `from ${a.priceFrom.toFixed(0)} ${a.currency}`
                    : null
                }
                ctaLabel={t('trips.suggestions.bookCta')}
                onImpression={() =>
                  recordSuggestionImpression({
                    tripId,
                    type: 'accommodation',
                    listingId: a.listingId,
                    externalUrl: a.externalUrl,
                    rankPosition: a.rank,
                  })
                }
                onCtaClick={() =>
                  openExternal(a.externalUrl, a.provider, 'accommodation', a.listingId, a.rank)
                }
              />
            ))}
          </div>
        </div>
      )}

      {hasAnyTransport && (
        <div>
          <SectionHeader icon={<Plane size={14} />} title={t('trips.suggestions.getToTitle')} />
          <div className="flex flex-col gap-3">
            {(['flight', 'rail', 'bus'] as const).map((mode) => {
              const group = transportGroups[mode];
              if (group.length === 0) return null;
              const Icon = mode === 'flight' ? Plane : mode === 'rail' ? Train : Bus;
              return (
                <div key={mode}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={13} />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {t(`trips.suggestions.mode.${mode}`)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {group.map((s) => (
                      <SuggestionCard
                        key={s.id}
                        title={s.title}
                        subtitle={s.subtitle}
                        provider={s.provider}
                        ctaLabel={t('trips.suggestions.searchCta')}
                        compact
                        onImpression={() =>
                          recordSuggestionImpression({
                            tripId,
                            type: s.kind,
                            externalUrl: s.externalUrl,
                            rankPosition: s.rank,
                          })
                        }
                        onCtaClick={() =>
                          openExternal(s.externalUrl, s.provider, s.kind, null, s.rank)
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center">
        {icon}
      </div>
      <p className="text-sm font-bold">
        {title}
      </p>
    </div>
  );
}
