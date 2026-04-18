import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Accommodations */}
      {accommodations.length > 0 && (
        <Box>
          <SectionHeader icon={<Hotel size={14} />} title={t('trips.suggestions.stayTitle')} />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
              gap: 1.5,
            }}
          >
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
          </Box>
        </Box>
      )}

      {/* Transport */}
      {hasAnyTransport && (
        <Box>
          <SectionHeader icon={<Plane size={14} />} title={t('trips.suggestions.getToTitle')} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {(['flight', 'rail', 'bus'] as const).map((mode) => {
              const group = transportGroups[mode];
              if (group.length === 0) return null;
              const Icon = mode === 'flight' ? Plane : mode === 'rail' ? Train : Bus;
              return (
                <Box key={mode}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Icon size={13} />
                    <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {t(`trips.suggestions.mode.${mode}`)}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      gap: 1.5,
                    }}
                  >
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
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: 1.25,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </Box>
      <Typography
        variant="subtitle2"
        sx={{ fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {title}
      </Typography>
    </Box>
  );
}
