import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import { Luggage, Check, Plus, Users, Calendar } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTrips, useTrip, useTripMutations } from '@/hooks/useTrips';

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
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: trips, isLoading: tripsLoading } = useTrips();
  const { addPlace, createTrip } = useTripMutations();

  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
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

      const tripName =
        trips?.find((t) => t.id === selectedTripId)?.title || 'trip';
      toast({
        title: `Added to ${tripName}`,
        description: `${entity.name} has been added to your trip.`,
      });
      handleOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Failed to add',
        description: err?.message || 'Something went wrong.',
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
        title: `Added to ${trip.title}`,
        description: `${entity.name} has been added to your new trip.`,
      });
      handleOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to create trip.',
        variant: 'destructive',
      });
    }
  };

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Trip</DialogTitle>
          </DialogHeader>
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Luggage style={{ width: 40, height: 40, margin: '0 auto 12px', opacity: 0.4 }} />
            <Typography variant="body1" sx={{ mb: 1 }}>
              Sign in to plan trips
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Create an account to save places to your travel plans.
            </Typography>
          </Box>
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Luggage style={{ width: 20, height: 20 }} />
              Add to Trip
            </Box>
          </DialogTitle>
        </DialogHeader>

        <Box sx={{ py: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Adding <strong>{entity.name}</strong>
          </Typography>

          {tripsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : hasTrips && !showCreateForm ? (
            <>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                {trips.map((trip) => (
                  <Box
                    key={trip.id}
                    onClick={() => {
                      setSelectedTripId(trip.id);
                      setSelectedDayId('');
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1.5,
                      borderRadius: 2,
                      border: 2,
                      borderColor:
                        selectedTripId === trip.id ? 'primary.main' : 'divider',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s',
                      '&:hover': {
                        borderColor:
                          selectedTripId === trip.id
                            ? 'primary.main'
                            : 'text.secondary',
                      },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {trip.title}
                      </Typography>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          mt: 0.5,
                        }}
                      >
                        {trip.start_date && (
                          <Typography variant="caption" color="text.secondary">
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
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary">
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
                        </Typography>
                      </Box>
                    </Box>
                    {selectedTripId === trip.id && (
                      <Check style={{ width: 18, height: 18, flexShrink: 0 }} />
                    )}
                  </Box>
                ))}
              </Box>

              {/* Day selector for selected trip */}
              {selectedTrip && selectedTrip.trip_days.length > 0 && (
                <TextField
                  label="Assign to Day (optional)"
                  select
                  fullWidth
                  size="small"
                  value={selectedDayId}
                  onChange={(e) => setSelectedDayId(e.target.value)}
                  sx={{ mb: 2 }}
                >
                  <MenuItem value="">Unassigned</MenuItem>
                  {selectedTrip.trip_days.map((d) => (
                    <MenuItem key={d.id} value={d.id}>
                      {new Date(d.date).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                      {d.title ? ` -- ${d.title}` : ''}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateForm(true)}
                style={{ width: '100%' }}
              >
                <Plus style={{ width: 16, height: 16, marginRight: 8 }} />
                Create New Trip
              </Button>
            </>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {hasTrips && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateForm(false)}
                >
                  Back to trips
                </Button>
              )}
              {!hasTrips && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Create your first trip to start planning.
                </Typography>
              )}
              <TextField
                label="Trip Title"
                value={newTripTitle}
                onChange={(e) => setNewTripTitle(e.target.value)}
                required
                fullWidth
                size="small"
                autoFocus
                placeholder="e.g. Pride Week Berlin 2026"
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField
                  label="Start Date"
                  type="date"
                  value={newTripStart}
                  onChange={(e) => setNewTripStart(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="End Date"
                  type="date"
                  value={newTripEnd}
                  onChange={(e) => setNewTripEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: newTripStart || undefined }}
                  fullWidth
                  size="small"
                />
              </Box>
            </Box>
          )}
        </Box>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
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
                <CircularProgress size={16} sx={{ mr: 1, color: 'inherit' }} />
              )}
              Create & Add
            </Button>
          ) : (
            <Button
              onClick={handleAddToTrip}
              disabled={!selectedTripId || addPlace.isPending}
            >
              {addPlace.isPending && (
                <CircularProgress size={16} sx={{ mr: 1, color: 'inherit' }} />
              )}
              Add to Trip
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
