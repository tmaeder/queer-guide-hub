import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  initialTitle?: string;
  initialType?: typeof TYPES[number];
  onCreated?: (reservation: Reservation) => void;
}

export function AddReservationDialog({
  open,
  onClose,
  tripId,
  existing,
  initialTitle,
  initialType,
  onCreated,
}: Props) {
  const { toast } = useToast();
  const { addReservation, updateReservation } = useReservationMutations(tripId);
  const isEdit = !!existing;

  const [type, setType] = useState(existing?.type || initialType || 'hotel');
  const [title, setTitle] = useState(existing?.title || initialTitle || '');
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
        const created = await addReservation.mutateAsync(payload);
        toast({ title: 'Reservation added' });
        onCreated?.(created);
      }
      resetAndClose();
    } catch (err) {
      toast({
        title: 'Failed to save reservation',
        description: String(err),
        variant: 'destructive',
      });
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

        <div className="flex flex-col gap-2.5 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="res-type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="res-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="res-status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="res-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="res-title">Title</Label>
            <Input
              id="res-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'flight' ? 'e.g. LHR to BCN' : 'e.g. Hotel Rainbow'}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="res-code">Confirmation Code</Label>
            <Input
              id="res-code"
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              placeholder="e.g. ABC123"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="res-checkin">{dateLabels[0]}</Label>
              <Input
                id="res-checkin"
                type="datetime-local"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="res-checkout">{dateLabels[1]}</Label>
              <Input
                id="res-checkout"
                type="datetime-local"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="res-provider">Provider</Label>
            <Input
              id="res-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="e.g. Booking.com, Ryanair"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="res-url">Booking URL</Label>
            <Input
              id="res-url"
              value={bookingUrl}
              onChange={(e) => setBookingUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="res-amount">Amount</Label>
              <Input
                id="res-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="res-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="res-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="res-notes">Notes</Label>
            <Textarea
              id="res-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
            {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-label="Loading" />}
            {isEdit ? 'Save' : 'Add Reservation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
