import { useState } from 'react';
import {
  MapPin,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Sparkles,
  GitFork,
  Bookmark,
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Card, CardImage, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useTripMutations } from '@/hooks/useTrips';
import { useToast } from '@/hooks/use-toast';
import type { DiscoverableTrip } from '@/hooks/useDiscoverableTrips';
import { resolveTripTitle } from '@/components/trips/tripTitle';
import { SaveTripButton } from '@/components/trips/SaveTripButton';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Props {
  trip: DiscoverableTrip;
}

type SafetyLevel = 'safe' | 'caution' | 'danger';

function safetyLevelFromScore(score: number | null | undefined): SafetyLevel | null {
  if (score == null) return null;
  if (score >= 70) return 'safe';
  if (score >= 40) return 'caution';
  return 'danger';
}

/**
 * Compact card for the public discovery feed. Differs from `TripCard`
 * (owner-focused with mutation menus) by surfacing what a stranger
 * needs to decide whether the trip is worth reading: cover, title,
 * dates, owner, cities visited, place count, plus the platform's
 * differentiator — min equality score for the trip's countries — and
 * a fork CTA that seeds a new draft trip from the public trip's
 * dates and primary city.
 */
export function PublicTripCard({ trip }: Props) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const { createTrip } = useTripMutations();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [forking, setForking] = useState(false);

  const title = resolveTripTitle(
    { title: trip.title, primary_city_name: trip.cities[0] ?? null },
    t,
  );
  const safetyLevel = safetyLevelFromScore(trip.min_equality_score);
  const safetyBg =
    safetyLevel === 'safe'
      ? 'bg-foreground'
      : safetyLevel === 'caution'
        ? 'bg-muted-foreground'
        : 'bg-destructive';

  const dateRange = (() => {
    if (!trip.start_date || !trip.end_date) return null;
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      return `${format(start, 'MMM d')}–${format(end, 'd, yyyy')}`;
    }
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  })();

  const onOpen = () => navigate(`/trips/${trip.id}`);

  const handleFork = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      navigate('/auth');
      return;
    }
    setForking(true);
    try {
      // Preferred path: server-side RPC clones places + days atomically.
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'fork_public_trip',
        { p_source_trip_id: trip.id },
      );

      if (!rpcError && typeof rpcData === 'string') {
        toast({
          title: t('trips.discover.forked', 'Trip forked'),
          description: t(
            'trips.discover.forkedDescription',
            'Your copy is ready — edit days and places freely.',
          ),
        });
        queryClient.invalidateQueries({ queryKey: ['trips'] });
        queryClient.invalidateQueries({ queryKey: ['discoverable-trips'] });
        navigate(`/trips/${rpcData}`);
        return;
      }

      // Fallback: RPC not deployed yet → create a draft trip with the
      // same geo anchor + dates so the user gets a usable starting point.
      console.warn('[PublicTripCard] fork RPC unavailable, falling back', rpcError);
      if (!trip.primary_city_id || !trip.primary_country_id) {
        onOpen();
        return;
      }
      const inspiredTitle = t('trips.discover.inspiredTitle', {
        title: trip.title,
        defaultValue: 'Inspired by: {{title}}',
      });
      const created = await createTrip.mutateAsync({
        title: inspiredTitle,
        start_date: trip.start_date ?? undefined,
        end_date: trip.end_date ?? undefined,
        currency: 'EUR',
        primary_city_id: trip.primary_city_id,
        primary_country_id: trip.primary_country_id,
        primary_city_name: trip.cities[0],
      });
      toast({
        title: t('trips.discover.forked', 'Trip created'),
        description: t(
          'trips.discover.forkedDescription',
          'Your new trip is ready — add places to fill it out.',
        ),
      });
      navigate(`/trips/${created.id}`);
    } catch (err) {
      toast({
        title: t('trips.discover.forkError', 'Could not create trip'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setForking(false);
    }
  };

  return (
    <Card
      hoverable
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      className="group/ptc"
    >
      {trip.cover_image_url && (
        <CardImage src={trip.cover_image_url} alt={title} height={160}>
          {safetyLevel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label={t(`trips.card.safety.${safetyLevel}`)}
                  className={cn(
                    'absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center text-white shadow cursor-help',
                    safetyBg,
                  )}
                >
                  {safetyLevel === 'safe' && (
                    <ShieldCheck style={{ width: 16, height: 16 }} />
                  )}
                  {safetyLevel === 'caution' && (
                    <ShieldAlert style={{ width: 16, height: 16 }} />
                  )}
                  {safetyLevel === 'danger' && (
                    <AlertTriangle style={{ width: 16, height: 16 }} />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>{t(`trips.card.safety.${safetyLevel}`)}</TooltipContent>
            </Tooltip>
          )}
        </CardImage>
      )}
      <CardContent>
        <h6 className="text-lg font-bold tracking-tight mb-1 truncate">{title}</h6>

        {trip.description && (
          <p
            className="text-muted-foreground mb-2 overflow-hidden"
            style={{
              fontSize: 13,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {trip.description}
          </p>
        )}

        <div className="flex flex-col gap-1 mt-2">
          {dateRange && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar size={12} />
              <span className="text-xs">{dateRange}</span>
            </div>
          )}
          {trip.cities.length > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin size={12} />
              <span className="text-xs truncate">
                {trip.cities.slice(0, 4).join(', ')}
                {trip.cities.length > 4 && ` +${trip.cities.length - 4}`}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          <Avatar style={{ width: 22, height: 22 }}>
            <AvatarImage
              src={trip.owner?.avatar_url ?? undefined}
              alt={trip.owner?.display_name ?? ''}
            />
            <AvatarFallback style={{ fontSize: 11 }}>
              {(trip.owner?.display_name ?? '?').slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground flex-1 truncate">
            {trip.owner?.display_name ?? t('trips.discover.anonymous', 'A QG traveler')}
          </span>
          <span className="text-xs text-muted-foreground">
            {t('trips.discover.placeCount', {
              count: trip.place_count,
              defaultValue: '{{count}} places',
            })}
          </span>
        </div>

        {(trip.fork_count > 0 || trip.save_count > 0) && (
          <div
            className="flex items-center gap-3 mt-2 text-[0.6875rem] text-muted-foreground"
            aria-label={t('trips.discover.signalsAria', 'Trip activity')}
          >
            {trip.fork_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <GitFork style={{ width: 11, height: 11 }} />
                {t('trips.discover.forkCount', {
                  count: trip.fork_count,
                  defaultValue: '{{count}} forks',
                })}
              </span>
            )}
            {trip.save_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Bookmark style={{ width: 11, height: 11 }} />
                {t('trips.discover.saveCount', {
                  count: trip.save_count,
                  defaultValue: '{{count}} saves',
                })}
              </span>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFork}
            disabled={forking || createTrip.isPending}
            className="flex-1"
            aria-label={t('trips.discover.forkAria', 'Fork this trip')}
          >
            <Sparkles style={{ width: 14, height: 14, marginRight: 6 }} />
            {forking
              ? t('trips.discover.forking', 'Forking…')
              : t('trips.discover.fork', 'Fork into my trips')}
          </Button>
          <SaveTripButton tripId={trip.id} compact />
        </div>
      </CardContent>
    </Card>
  );
}
