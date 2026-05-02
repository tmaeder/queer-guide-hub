import { useMemo } from 'react';
import { Sparkles, MapPin, Calendar, Wallet, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useTripRecap, useGenerateTripRecap } from '@/hooks/useTripRecap';

interface Props {
  tripId: string;
}

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
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!recap) {
    return (
      <Card>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-md text-primary-foreground"
              style={{ backgroundColor: 'hsl(var(--brand))' }}
            >
              <Sparkles size={20} />
            </div>
            <div className="flex-1 min-w-[220px]">
              <p className="text-base font-bold">
                {t('trips.recap.emptyTitle', 'Your trip, in a paragraph')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t(
                  'trips.recap.emptyDescription',
                  'Generate a warm recap you can save or share — crafted from your places, days, and budget.',
                )}
              </p>
            </div>
            <Button
              variant="brand"
              onClick={() => handleGenerate(false)}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles size={16} className="mr-1.5" />
              )}
              {t('trips.recap.generateCta', 'Generate recap')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <div className="flex justify-between items-start gap-2 mb-3">
          <span className="uppercase tracking-wider font-bold text-xs" style={{ color: 'hsl(var(--brand))' }}>
            {t('trips.recap.badge', 'Trip recap')}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenerate(true)}
            disabled={generate.isPending}
            aria-label={t('trips.recap.regenerate', 'Regenerate recap')}
          >
            {generate.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
          </Button>
        </div>

        <p
          className="whitespace-pre-wrap mb-4"
          style={{ fontSize: '1.0625rem', lineHeight: 1.65 }}
        >
          {recap.summary}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {highlights?.cities?.slice(0, 6).map((city) => (
            <Badge key={city} variant="outline" className="gap-1">
              <MapPin size={12} />
              {city}
            </Badge>
          ))}
          {highlights?.favourite_day && (
            <Badge variant="outline" className="gap-1">
              <Calendar size={12} />
              {t('trips.recap.favouriteDay', 'Fullest day: {{date}}', {
                date: format(new Date(highlights.favourite_day.date), 'MMM d'),
              })}
            </Badge>
          )}
          {totalSpentLabel && (
            <Badge variant="outline" className="gap-1">
              <Wallet size={12} />
              {totalSpentLabel}
            </Badge>
          )}
        </div>

        <span className="block text-xs text-muted-foreground mt-3">
          {t('trips.recap.generatedAt', 'Generated {{date}}', {
            date: format(new Date(recap.generated_at), 'MMM d, yyyy'),
          })}
        </span>
      </CardContent>
    </Card>
  );
}
