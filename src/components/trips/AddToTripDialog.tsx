import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Luggage, Check, Plus, Users, Calendar } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTrips, useTrip, useTripMutations } from '@/hooks/useTrips';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { resolveTripTitle } from '@/components/trips/tripTitle';
import { cn } from '@/lib/utils';

export interface AddToTripDialogProps {
  open: boolean;
  onClose: () => void;
  entity: {
    type: 'venue' | 'event' | 'hotel';
    id: string;
    name: string;
    latitude?: number | null;
    longitude?: number | null;
    city_id?: string | null;
    country_id?: string | null;
    address?: string | null;
    category?: string | null;
  };
}

export function AddToTripDialog({ open, onClose, entity }: AddToTripDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: trips, isLoading: tripsLoading } = useTrips();
  const { addPlace, createTrip } = useTripMutations();
  const { activeTrip } = useActiveTrip();

  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  // Pre-select active trip when dialog opens
  useEffect(() => {
    if (open && activeTrip && !selectedTripId) {
      setSelectedTripId(activeTrip.id);
    }
  }, [open, activeTrip, selectedTripId]);
  const [selectedDayId, setSelectedDayId] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTripTitle, setNewTripTitle] = useState('');
  const [newTripStart, setNewTripStart] = useState('');
  const [newTripEnd, setNewTripEnd] = useState('');

  const { data: selectedTrip } = useTrip(selectedTripId ?? undefined);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedTripId(null);
      setSelectedDayId('');
      setShowCreateForm(false);
      setNewTripTitle('');
      setNewTripStart('');
      setNewTripEnd('');
      onClose();
    }
  };

  const handleAddToTrip = async () => {
    if (!selectedTripId) return;

    try {
      await addPlace.mutateAsync({
        trip_id: selectedTripId,
        day_id: selectedDayId || null,
        venue_id: entity.type === 'venue' ? entity.id : null,
        event_id: entity.type === 'event' ? entity.id : null,
        hotel_id: entity.type === 'hotel' ? entity.id : null,
        custom_name: null,
        custom_address: entity.address || null,
        latitude: entity.latitude || null,
        longitude: entity.longitude || null,
        city_id: entity.city_id || null,
        country_id: entity.country_id || null,
        start_time: null,
        end_time: null,
        duration_minutes: null,
        notes: null,
        category: entity.category || entity.type,
        sort_order: 0,
        created_by: null,
      });

      const selected = trips?.find((tr) => tr.id === selectedTripId);
      const tripName = selected
        ? resolveTripTitle(selected, t)
        : t('trips.addTo.tripFallback', 'trip');
      toast({
        title: t('trips.addTo.addedTitle', 'Added to {{trip}}', { trip: tripName }),
        description: t('trips.addTo.addedDesc', '{{name}} has been added to your trip.', { name: entity.name }),
      });
      handleOpenChange(false);
    } catch (err: unknown) {
      toast({
        title: t('trips.addTo.failedToAdd', 'Failed to add'),
        description: err instanceof Error ? err.message : t('common.somethingWentWrong', 'Something went wrong.'),
        variant: 'destructive',
      });
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newTripTitle.trim()) return;

    try {
      const trip = await createTrip.mutateAsync({
        title: newTripTitle.trim(),
        start_date: newTripStart || undefined,
        end_date: newTripEnd || undefined,
      });

      await addPlace.mutateAsync({
        trip_id: trip.id,
        day_id: null,
        venue_id: entity.type === 'venue' ? entity.id : null,
        event_id: entity.type === 'event' ? entity.id : null,
        hotel_id: entity.type === 'hotel' ? entity.id : null,
        custom_name: null,
        custom_address: entity.address || null,
        latitude: entity.latitude || null,
        longitude: entity.longitude || null,
        city_id: entity.city_id || null,
        country_id: entity.country_id || null,
        start_time: null,
        end_time: null,
        duration_minutes: null,
        notes: null,
        category: entity.category || entity.type,
        sort_order: 0,
        created_by: null,
      });

      toast({
        title: t('trips.addTo.addedTitle', 'Added to {{trip}}', {
          trip: resolveTripTitle(trip, t),
        }),
        description: t('trips.addTo.addedNewDesc', '{{name}} has been added to your new trip.', { name: entity.name }),
      });
      handleOpenChange(false);
    } catch (err: unknown) {
      toast({
        title: t('common.error', 'Error'),
        description: err instanceof Error ? err.message : t('trips.addTo.failedToCreate', 'Failed to create trip.'),
        variant: 'destructive',
      });
    }
  };

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trips.addTo.title', 'Add to Trip')}</DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">
            <Luggage style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: 0.4 }} />
            <p className="text-base mb-1">
              {t('trips.addTo.signInPrompt', 'Sign in to plan trips')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('trips.addTo.signInDesc', 'Create an account to save places to your travel plans.')}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const hasTrips = trips && trips.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Luggage style={{ width: 20, height: 20 }} />
              {t('trips.addTo.title', 'Add to Trip')}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <p className="text-sm text-muted-foreground mb-4">
            {t('trips.addTo.adding', 'Adding')} <strong>{entity.name}</strong>
          </p>

          {tripsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin" size={24} aria-label="Loading" />
            </div>
          ) : hasTrips && !showCreateForm ? (
            <>
              <div className="flex flex-col gap-2 mb-4">
                {trips.map((trip) => (
                  <div
                    key={trip.id}
                    onClick={() => {
                      setSelectedTripId(trip.id);
                      setSelectedDayId('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedTripId(trip.id);
                        setSelectedDayId('');
                      }
                    }}
                    role="radio"
                    tabIndex={0}
                    aria-checked={selectedTripId === trip.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-element border-2 cursor-pointer transition-colors',
                      selectedTripId === trip.id
                        ? 'border-primary'
                        : 'border-border hover:border-muted-foreground',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {resolveTripTitle(trip, t)}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        {trip.start_date && (
                          <span className="text-xs text-muted-foreground">
                            <Calendar
                              style={{
                                width: 12,
                                height: 12,
                                display: 'inline',
                                verticalAlign: -1,
                                marginRight: 4,
                              }}
                            />
                            {new Date(trip.start_date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                            {trip.end_date &&
                              ` - ${new Date(trip.end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          <Users
                            style={{
                              width: 12,
                              height: 12,
                              display: 'inline',
                              verticalAlign: -1,
                              marginRight: 4,
                            }}
                          />
                          {trip.member_count}
                        </span>
                      </div>
                    </div>
                    {selectedTripId === trip.id && (
                      <Check style={{ width: 18, height: 18, flexShrink: 0 }} />
                    )}
                  </div>
                ))}
              </div>

              {/* Day selector for selected trip */}
              {selectedTrip && selectedTrip.trip_days.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  <Label>
                    {t('trips.addTo.assignToDay', 'Assign to Day (optional)')}
                  </Label>
                  <Select
                    value={selectedDayId || '__none__'}
                    onValueChange={(v) => setSelectedDayId(v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        {t('trips.addPlace.unassigned', 'Unassigned')}
                      </SelectItem>
                      {selectedTrip.trip_days.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {new Date(d.date).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                          {d.title ? ` -- ${d.title}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateForm(true)}
                style={{ width: '100%' }}
              >
                <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
                {t('trips.addTo.createNewTrip', 'Create New Trip')}
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              {hasTrips && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateForm(false)}
                >
                  {t('trips.addTo.backToTrips', 'Back to trips')}
                </Button>
              )}
              {!hasTrips && (
                <p className="text-sm text-muted-foreground mb-1">
                  {t('trips.addTo.firstTripHint', 'Create your first trip to start planning.')}
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="new-trip-title">
                  {t('trips.addTo.tripTitle', 'Trip Title')}
                </Label>
                <Input
                  id="new-trip-title"
                  value={newTripTitle}
                  onChange={(e) => setNewTripTitle(e.target.value)}
                  required
                  autoFocus
                  placeholder={t('trips.addTo.tripTitlePlaceholder', 'e.g. Pride Week Berlin 2026')}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-trip-start">
                    {t('trips.addTo.startDate', 'Start Date')}
                  </Label>
                  <Input
                    id="new-trip-start"
                    type="date"
                    value={newTripStart}
                    onChange={(e) => setNewTripStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-trip-end">
                    {t('trips.addTo.endDate', 'End Date')}
                  </Label>
                  <Input
                    id="new-trip-end"
                    type="date"
                    value={newTripEnd}
                    onChange={(e) => setNewTripEnd(e.target.value)}
                    min={newTripStart || undefined}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          {showCreateForm || !hasTrips ? (
            <Button
              onClick={handleCreateAndAdd}
              disabled={
                !newTripTitle.trim() ||
                createTrip.isPending ||
                addPlace.isPending
              }
            >
              {(createTrip.isPending || addPlace.isPending) && (
                <Loader2 className="animate-spin mr-1" size={16} aria-label="Loading" />
              )}
              {t('trips.addTo.createAndAdd', 'Create & Add')}
            </Button>
          ) : (
            <Button
              onClick={handleAddToTrip}
              disabled={!selectedTripId || addPlace.isPending}
            >
              {addPlace.isPending && (
                <Loader2 className="animate-spin mr-1" size={16} aria-label="Loading" />
              )}
              {t('trips.addTo.title', 'Add to Trip')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
