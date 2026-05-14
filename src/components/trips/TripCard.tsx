import { useState, type KeyboardEvent } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import {
  MoreVertical,
  Calendar,
  Luggage,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Pin,
  PinOff,
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Card, CardImage, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { phaseStatusText, getTripPhase } from './tripPhase';
import { resolveTripTitle } from './tripTitle';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Trip, TripMember } from '@/hooks/useTrips';
import { useTripMutations } from '@/hooks/useTrips';
import { cn } from '@/lib/utils';

interface Props {
  trip: Trip & {
    member_count: number;
    place_count?: number;
    day_count?: number;
    /** Minimum equality score across countries on the trip (null if unknown). */
    min_equality_score?: number | null;
    trip_members?: TripMember[];
  };
}

type SafetyLevel = 'safe' | 'caution' | 'danger';

function safetyLevelFromScore(score: number | null | undefined): SafetyLevel | null {
  if (score == null) return null;
  if (score >= 70) return 'safe';
  if (score >= 40) return 'caution';
  return 'danger';
}

export function TripCard({ trip }: Props) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { deleteTrip } = useTripMutations();
  const { toast } = useToast();
  const { activeTrip, setActiveTripId } = useActiveTrip();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isActive = activeTrip?.id === trip.id;
  const displayTitle = resolveTripTitle(trip, t);
  const phase = getTripPhase(trip);
  const phaseStatus = phaseStatusText(trip, undefined, t);

  const handleTogglePin = () => {
    setActiveTripId(isActive ? null : trip.id);
    toast({
      title: isActive ? t('trips.toast.unpinned', 'Trip unpinned') : t('trips.toast.pinned', 'Trip pinned'),
      description: isActive
        ? t('trips.toast.unpinnedDescription', 'No longer your active trip context.')
        : t('trips.toast.pinnedDescription', '{{title}} is now your active trip context.', { title: displayTitle }),
    });
  };

  const dateRange =
    trip.start_date && trip.end_date
      ? `${format(new Date(trip.start_date), 'MMM d')} – ${format(
          new Date(trip.end_date),
          'MMM d, yyyy',
        )}`
      : trip.start_date
        ? t('trips.card.fromDate', {
            date: format(new Date(trip.start_date), 'MMM d, yyyy'),
          })
        : t('trips.card.noDates');

  const placeCount = trip.place_count ?? 0;
  const dayCount = trip.day_count ?? 0;
  const safetyLevel = safetyLevelFromScore(trip.min_equality_score);

  const isActiveToday = (() => {
    if (!trip.start_date || !trip.end_date) return false;
    const now = new Date();
    const start = new Date(trip.start_date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(trip.end_date);
    end.setHours(23, 59, 59, 999);
    return now >= start && now <= end;
  })();

  const handleNavigate = () => navigate(`/trips/${trip.id}`);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNavigate();
    }
  };

  const handleEdit = () => {
    navigate(`/trips/${trip.id}`);
  };

  const handleDeleteClick = () => {
    setDeleteOpen(true);
  };

  const handleConfirmDelete = () => {
    deleteTrip.mutate(trip.id, {
      onSuccess: () => {
        toast({
          title: t('trips.toast.deleted'),
          description: t('trips.toast.deletedDescription', { title: displayTitle }),
        });
        setDeleteOpen(false);
      },
      onError: (err) => {
        toast({
          title: t('trips.toast.error'),
          description: err.message,
          variant: 'destructive',
        });
        setDeleteOpen(false);
      },
    });
  };

  const members = trip.trip_members || [];

  const statusConfig: Record<
    Trip['status'],
    { label: string; variant: 'default' | 'secondary' | 'outline'; brand?: boolean }
  > = {
    planning: { label: t('trips.status.planning'), variant: 'outline' },
    active: { label: t('trips.status.active'), variant: 'default', brand: true },
    completed: { label: t('trips.status.completed'), variant: 'secondary' },
    archived: { label: t('trips.status.archived'), variant: 'outline' },
  };

  const status = statusConfig[trip.status];

  const safetyBg =
    safetyLevel === 'safe'
      ? 'bg-foreground'
      : safetyLevel === 'caution'
        ? 'bg-muted-foreground'
        : 'bg-destructive';

  const visibleMembers = members.slice(0, 4);
  const overflowMembers = members.length - visibleMembers.length;

  return (
    <>
      <Card
        hoverable
        role="link"
        tabIndex={0}
        aria-label={t('trips.card.ariaLabel', { title: displayTitle })}
        onClick={handleNavigate}
        onKeyDown={handleKeyDown}
      >
        <CardImage
          src={trip.cover_image_url}
          alt={displayTitle}
          height={180}
          fallbackIcon={Luggage}
        >
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
                  {safetyLevel === 'safe' && <ShieldCheck style={{ width: 16, height: 16 }} />}
                  {safetyLevel === 'caution' && <ShieldAlert style={{ width: 16, height: 16 }} />}
                  {safetyLevel === 'danger' && <AlertTriangle style={{ width: 16, height: 16 }} />}
                </span>
              </TooltipTrigger>
              <TooltipContent>{t(`trips.card.safety.${safetyLevel}`)}</TooltipContent>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                aria-label={t('trips.card.menuAria')}
                className="trip-card-menu absolute top-2 right-2 h-7 w-7 p-0 bg-background shadow"
              >
                <MoreVertical style={{ width: 16, height: 16 }} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={handleEdit}>
                {t('trips.card.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleTogglePin} className="flex items-center gap-2">
                {isActive ? (
                  <PinOff style={{ width: 14, height: 14 }} aria-hidden />
                ) : (
                  <Pin style={{ width: 14, height: 14 }} aria-hidden />
                )}
                {isActive
                  ? t('trips.card.unpin', 'Unpin from active')
                  : t('trips.card.pin', 'Set as active trip')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDeleteClick} className="text-destructive">
                {t('trips.card.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardImage>

        <CardContent>
          <h3
            className="text-lg font-bold mb-2 overflow-hidden tracking-tight"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              letterSpacing: '-0.01em',
            }}
          >
            {displayTitle}
          </h3>

          <div className="flex items-center gap-3 mb-3 flex-wrap text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar
                style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.7 }}
              />
              <span className="text-[0.8125rem]">{dateRange}</span>
            </span>
            {phase !== 'live' && phase !== 'memory' && (
              <span
                className="text-xs opacity-70"
                aria-label={t('trips.card.phaseStatus', 'Phase status')}
              >
                · {phaseStatus}
              </span>
            )}
            {isActiveToday && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/trips/${trip.id}/today`);
                }}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground text-background text-[0.6875rem] font-bold uppercase tracking-wider shadow-sm hover:shadow-md transition-shadow border-none cursor-pointer"
                aria-label={t('trips.card.viewToday', 'View today')}
              >
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-background animate-pulse" />
                {t('trips.card.activeToday', 'Active · Today')}
              </button>
            )}
            {(placeCount > 0 || dayCount > 0) && (
              <span className="inline-flex items-center gap-1">
                <span
                  className="rounded-full"
                  style={{ width: 3, height: 3, background: 'hsl(var(--muted-foreground))', opacity: 0.5 }}
                />
                <MapPin
                  style={{ width: 13, height: 13, flexShrink: 0, opacity: 0.7 }}
                />
                <span className="text-[0.8125rem]">
                  {t('trips.card.placeCount', { count: placeCount })}
                  {dayCount > 0 &&
                    ` · ${t('trips.card.dayCount', { count: dayCount })}`}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Badge
              variant={status.variant}
              className={status.brand ? 'border-transparent text-white' : undefined}
              style={
                status.brand
                  ? {
                      background: 'hsl(var(--foreground))',
                      color: 'hsl(var(--background))',
                    }
                  : undefined
              }
            >
              {status.label}
            </Badge>

            {members.length > 1 && (
              <div className="flex -space-x-2">
                {visibleMembers.map((m) => (
                  <Avatar key={m.id} className="w-7 h-7 text-xs border-2 border-background">
                    {m.profiles?.avatar_url && (
                      <AvatarImage
                        src={m.profiles.avatar_url}
                        alt={m.profiles?.display_name || 'Member'}
                      />
                    )}
                    <AvatarFallback>
                      {(m.profiles?.display_name || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {overflowMembers > 0 && (
                  <Avatar className="w-7 h-7 text-xs border-2 border-background">
                    <AvatarFallback>+{overflowMembers}</AvatarFallback>
                  </Avatar>
                )}
              </div>
            )}
            {!members.length && trip.member_count > 1 && (
              <span className="text-xs text-muted-foreground">
                {t('trips.card.memberCount', { count: trip.member_count })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trips.card.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('trips.card.deleteConfirm', { title: displayTitle })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t('trips.card.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteTrip.isPending}
            >
              {deleteTrip.isPending
                ? t('trips.card.deleting')
                : t('trips.card.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
