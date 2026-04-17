import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { ArrowRight, Shield, ShieldAlert, Skull } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useReservations } from '@/hooks/useReservations';
import { useTripSafety, type CountrySafety } from '@/hooks/useTripSafety';
import { computeTripSegments, type TripSegment } from '@/utils/tripSegments';
import type { TripDay, TripPlace } from '@/hooks/useTrips';

interface Props {
  tripId: string;
  tripPlaces: TripPlace[];
  tripDays: TripDay[];
}

const formatRange = (start: string, end: string): string => {
  if (start === end) return format(new Date(start), 'MMM d');
  return `${format(new Date(start), 'MMM d')} – ${format(new Date(end), 'MMM d')}`;
};

const scoreColor = (score: number | null): { bg: string; fg: string } => {
  if (score == null) return { bg: 'action.hover', fg: 'text.secondary' };
  if (score < 30) return { bg: 'error.main', fg: 'error.contrastText' };
  if (score < 50) return { bg: 'warning.main', fg: 'warning.contrastText' };
  if (score < 70) return { bg: 'action.selected', fg: 'text.primary' };
  return { bg: 'success.main', fg: 'success.contrastText' };
};

/**
 * Renders the chronological per-leg safety timeline for a trip.
 *
 * Pulls reservations once via `useReservations` (cached at the page
 * level, so this is cheap), unions them with the page's `trip_places`,
 * collapses into per-country segments, and renders one row per leg
 * with its own equality-score color band and key facts chip.
 */
export function PerLegSafety({ tripId, tripPlaces, tripDays }: Props) {
  const { t } = useTranslation();
  const { data: reservations } = useReservations();

  const tripReservations = useMemo(
    () => (reservations ?? []).filter((r) => r.trip_id === tripId),
    [reservations, tripId],
  );

  const segments: TripSegment[] = useMemo(
    () => computeTripSegments(tripPlaces, tripDays, tripReservations),
    [tripPlaces, tripDays, tripReservations],
  );

  const segmentCountryIds = useMemo(() => segments.map((s) => s.country_id), [segments]);
  const safety = useTripSafety(segmentCountryIds);
  const countryById = useMemo(() => {
    const m = new Map<string, CountrySafety>();
    for (const c of safety.countries) m.set(c.id, c);
    return m;
  }, [safety.countries]);

  if (segments.length === 0) return null;

  return (
    <Box sx={{ mt: 4 }}>
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 700,
          mb: 1.5,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: '0.7rem',
          color: 'text.secondary',
        }}
      >
        {t('trips.safety.perLegHeading', 'Per-leg breakdown')}
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {segments.map((seg, i) => {
          const country = countryById.get(seg.country_id);
          const colors = scoreColor(country?.equality_score ?? null);
          return (
            <Box key={`${seg.country_id}:${seg.start_date}`}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 1.5,
                  bgcolor: 'background.paper',
                }}
              >
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    bgcolor: colors.bg,
                    color: colors.fg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: '0.95rem',
                  }}
                  aria-label={
                    country?.equality_score != null
                      ? t('trips.safety.scoreAria', {
                          score: country.equality_score,
                          defaultValue: 'Equality score {{score}}',
                        })
                      : t('trips.safety.scoreUnknown', 'Unknown score')
                  }
                >
                  {country?.equality_score ?? '—'}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 700 }}>
                      {country?.name ?? t('trips.safety.unknownCountry', 'Unknown country')}
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                      · {formatRange(seg.start_date, seg.end_date)}
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                      · {t('trips.safety.stopCount', {
                        count: seg.stop_count,
                        defaultValue: '{{count}} stop',
                      })}
                    </Typography>
                  </Box>

                  {country && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                      {country.deathPenalty && (
                        <Chip
                          icon={<Skull size={12} />}
                          label={t('trips.safety.chip.deathPenalty', 'Death penalty')}
                          size="small"
                          color="error"
                        />
                      )}
                      {!country.deathPenalty && country.criminalized && (
                        <Chip
                          icon={<ShieldAlert size={12} />}
                          label={t('trips.safety.chip.criminalized', 'Same-sex acts criminalized')}
                          size="small"
                          color="error"
                        />
                      )}
                      {!country.criminalized && country.equality_score != null && country.equality_score < 50 && (
                        <Chip
                          icon={<ShieldAlert size={12} />}
                          label={t('trips.safety.chip.limitedRights', 'Limited LGBTQ+ rights')}
                          size="small"
                          color="warning"
                        />
                      )}
                      {!country.criminalized && country.equality_score != null && country.equality_score >= 70 && (
                        <Chip
                          icon={<Shield size={12} />}
                          label={t('trips.safety.chip.protected', 'Strong legal protections')}
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Inter-segment connector */}
              {i < segments.length - 1 && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    py: 0.25,
                    color: 'text.secondary',
                  }}
                  aria-hidden
                >
                  <ArrowRight size={14} />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
