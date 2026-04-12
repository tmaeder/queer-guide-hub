import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useReservationMutations, type Reservation } from '@/hooks/useTripReservations';

const TYPES = ['flight', 'hotel', 'activity', 'transport', 'other'] as const;
const STATUSES = ['pending', 'confirmed', 'cancelled'] as const;
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY', 'THB', 'MXN', 'BRL'];

const DATE_LABELS: Record<string, [string, string]> = {
  flight: ['Departure', 'Arrival'],
  hotel: ['Check-in', 'Check-out'],
  activity: ['Start', 'End'],
  transport: ['Departure', 'Arrival'],
  other: ['Start', 'End'],
};

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
  existing?: Reservation;
}

export function AddReservationDialog({ open, onClose, tripId, existing }: Props) {
  const { toast } = useToast();
  const { addReservation, updateReservation } = useReservationMutations(tripId);
  const isEdit = !!existing;

  const [type, setType] = useState(existing?.type || 'hotel');
  const [title, setTitle] = useState(existing?.title || '');
  const [confirmationCode, setConfirmationCode] = useState(existing?.confirmation_code || '');
  const [checkIn, setCheckIn] = useState(existing?.check_in?.slice(0, 16) || '');
  const [checkOut, setCheckOut] = useState(existing?.check_out?.slice(0, 16) || '');
  const [provider, setProvider] = useState(existing?.provider || '');
  const [bookingUrl, setBookingUrl] = useState(existing?.booking_url || '');
  const [amount, setAmount] = useState(existing?.amount != null ? String(existing.amount) : '');
  const [currency, setCurrency] = useState(existing?.currency || 'EUR');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [status, setStatus] = useState(existing?.status || 'pending');

  useEffect(() => {
    if (existing) {
      setType(existing.type);
      setTitle(existing.title);
      setConfirmationCode(existing.confirmation_code || '');
      setCheckIn(existing.check_in?.slice(0, 16) || '');
      setCheckOut(existing.check_out?.slice(0, 16) || '');
      setProvider(existing.provider || '');
      setBookingUrl(existing.booking_url || '');
      setAmount(existing.amount != null ? String(existing.amount) : '');
      setCurrency(existing.currency || 'EUR');
      setNotes(existing.notes || '');
      setStatus(existing.status);
    }
  }, [existing]);

  const resetAndClose = () => {
    if (!isEdit) {
      setType('hotel');
      setTitle('');
      setConfirmationCode('');
      setCheckIn('');
      setCheckOut('');
      setProvider('');
      setBookingUrl('');
      setAmount('');
      setCurrency('EUR');
      setNotes('');
      setStatus('pending');
    }
    onClose();
  };

  const dateLabels = DATE_LABELS[type] || DATE_LABELS.other;

  const handleSubmit = async () => {
    if (!title.trim() || !type) return;

    const payload = {
      trip_id: tripId,
      type,
      title: title.trim(),
      confirmation_code: confirmationCode.trim() || null,
      check_in: checkIn ? new Date(checkIn).toISOString() : null,
      check_out: checkOut ? new Date(checkOut).toISOString() : null,
      provider: provider.trim() || null,
      booking_url: bookingUrl.trim() || null,
      amount: amount ? parseFloat(amount) : null,
      currency: amount ? currency : null,
      notes: notes.trim() || null,
      status,
      place_id: null,
      attachment_urls: null,
    };

    try {
      if (isEdit && existing) {
        const { _trip_id, _place_id, _attachment_urls, ...updatePayload } = payload;
        await updateReservation.mutateAsync({ id: existing.id, ...updatePayload });
        toast({ title: 'Reservation updated' });
      } else {
        await addReservation.mutateAsync(payload);
        toast({ title: 'Reservation added' });
      }
      resetAndClose();
    } catch (err) {
      toast({ title: 'Failed to save reservation', description: String(err), variant: 'destructive' });
    }
  };

  const isPending = addReservation.isPending || updateReservation.isPending;
  const canSubmit = title.trim().length > 0 && type;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Reservation' : 'Add Reservation'}</DialogTitle>
        </DialogHeader>

        <Box className="flex flex-col gap-2.5 mt-2">
          <Box className="grid grid-cols-2 gap-3">
            <TextField
              label="Type"
              select
              required
              fullWidth
              size="small"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Status"
              select
              fullWidth
              size="small"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <TextField
            label="Title"
            required
            fullWidth
            size="small"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'flight' ? 'e.g. LHR to BCN' : 'e.g. Hotel Rainbow'}
          />

          <TextField
            label="Confirmation Code"
            fullWidth
            size="small"
            value={confirmationCode}
            onChange={(e) => setConfirmationCode(e.target.value)}
            placeholder="e.g. ABC123"
          />

          <Box className="grid grid-cols-2 gap-3">
            <TextField
              label={dateLabels[0]}
              type="datetime-local"
              fullWidth
              size="small"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label={dateLabels[1]}
              type="datetime-local"
              fullWidth
              size="small"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>

          <TextField
            label="Provider"
            fullWidth
            size="small"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="e.g. Booking.com, Ryanair"
          />

          <TextField
            label="Booking URL"
            fullWidth
            size="small"
            value={bookingUrl}
            onChange={(e) => setBookingUrl(e.target.value)}
            placeholder="https://..."
          />

          <Box className="grid grid-cols-2 gap-3">
            <TextField
              label="Amount"
              type="number"
              fullWidth
              size="small"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputProps={{ min: 0, step: '0.01' }}
            />
            <TextField
              label="Currency"
              select
              fullWidth
              size="small"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </TextField>
          </Box>

          <TextField
            label="Notes"
            fullWidth
            size="small"
            multiline
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Box>

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
            {isPending && <CircularProgress size={16} sx={{ mr: 1 }} />}
            {isEdit ? 'Save' : 'Add Reservation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
