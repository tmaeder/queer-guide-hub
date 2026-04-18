import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { Sparkles, MapPin, Calendar, Wallet, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTripRecap, useGenerateTripRecap } from '@/hooks/useTripRecap';

interface Props {
  tripId: string;
}

/**
 * Memory-phase recap card. Shown atop the itinerary tab after a trip
 * ends. If no recap exists yet, offers a "Generate" CTA that calls
 * the `trip-recap` edge function. Once generated, shows the narrative
 * summary + structured highlights + a discreet "Regenerate" action.
 */
export function MemoryRecapCard({ tripId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: recap, isLoading } = useTripRecap(tripId);
  const generate = useGenerateTripRecap(tripId);

  const highlights = recap?.highlights;
  const totalSpentLabel = useMemo(() => {
    if (!highlights?.total_spent?.length) return null;
    return highlights.total_spent
      .map(({ currency, amount }) => {
        try {
          return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
          }).format(amount);
        } catch {
          return `${Math.round(amount)} ${currency}`;
        }
      })
      .join(' + ');
  }, [highlights]);

  const handleGenerate = async (refresh: boolean) => {
    try {
      await generate.mutateAsync({ refresh });
      toast({
        title: refresh
          ? t('trips.recap.refreshed', 'Recap refreshed')
          : t('trips.recap.generated', 'Recap ready'),
      });
    } catch (err) {
      toast({
        title: t('trips.recap.failed', 'Could not generate recap'),
        description: String((err as Error).message ?? err),
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (!recap) {
    return (
      <Card>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              flexWrap: 'wrap',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: 2,
                bgcolor: 'brand.main',
                color: 'primary.contrastText',
              }}
            >
              <Sparkles size={20} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {t('trips.recap.emptyTitle', 'Your trip, in a paragraph')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t(
                  'trips.recap.emptyDescription',
                  'Generate a warm recap you can save or share — crafted from your places, days, and budget.',
                )}
              </Typography>
            </Box>
            <Button
              variant="brand"
              onClick={() => handleGenerate(false)}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <CircularProgress size={16} sx={{ color: 'inherit', mr: 1 }} />
              ) : (
                <Sparkles size={16} style={{ marginRight: 6 }} />
              )}
              {t('trips.recap.generateCta', 'Generate recap')}
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 1,
            mb: 1.25,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              color: 'brand.main',
            }}
          >
            {t('trips.recap.badge', 'Trip recap')}
          </Typography>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenerate(true)}
            disabled={generate.isPending}
            aria-label={t('trips.recap.regenerate', 'Regenerate recap')}
          >
            {generate.isPending ? (
              <CircularProgress size={14} sx={{ color: 'inherit' }} />
            ) : (
              <RefreshCw size={14} />
            )}
          </Button>
        </Box>

        <Typography
          variant="body1"
          sx={{ fontSize: '1.0625rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', mb: 2 }}
        >
          {recap.summary}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {highlights?.cities?.slice(0, 6).map((city) => (
            <Chip
              key={city}
              size="small"
              variant="outlined"
              icon={<MapPin size={12} />}
              label={city}
            />
          ))}
          {highlights?.favourite_day && (
            <Chip
              size="small"
              variant="outlined"
              icon={<Calendar size={12} />}
              label={t('trips.recap.favouriteDay', 'Fullest day: {{date}}', {
                date: format(new Date(highlights.favourite_day.date), 'MMM d'),
              })}
            />
          )}
          {totalSpentLabel && (
            <Chip
              size="small"
              variant="outlined"
              icon={<Wallet size={12} />}
              label={totalSpentLabel}
            />
          )}
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1.5 }}
        >
          {t('trips.recap.generatedAt', 'Generated {{date}}', {
            date: format(new Date(recap.generated_at), 'MMM d, yyyy'),
          })}
        </Typography>
      </CardContent>
    </Card>
  );
}
