import { useState } from 'react';
import { X, Star, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BookingResult } from '@/lib/booking/types';
import { formatPrice, hasValidPrice } from '@/lib/booking/price';
import { supabase } from '@/integrations/supabase/client';
import { insertRow, insertReturningId } from '@/hooks/usePageFetchers';
import { useAuth } from '@/hooks/useAuth';

interface HotelBookingFlowProps {
  hotel: BookingResult | null;
  open: boolean;
  onClose: () => void;
  tripId?: string;
  onBooked?: (bookingId: string) => void;
}

const STEPS = ['Review', 'Guest Details', 'Confirm'];

function Stepper({ activeStep }: { activeStep: number }) {
  return (
    <div className="mb-6 flex items-center">
      {STEPS.map((label, idx) => (
        <div key={label} className="flex flex-1 items-center">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border text-sm font-medium',
                idx < activeStep
                  ? 'border-primary bg-primary text-primary-foreground'
                  : idx === activeStep
                    ? 'border-primary text-primary'
                    : 'border-muted text-muted-foreground',
              )}
            >
              {idx < activeStep ? <Check className="h-4 w-4" /> : idx + 1}
            </div>
            <span
              className={cn(
                'mt-1 text-xs',
                idx === activeStep ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div
              className={cn(
                'mx-2 h-0.5 flex-1',
                idx < activeStep ? 'bg-primary' : 'bg-muted',
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function HotelBookingFlow({ hotel, open, onClose, tripId, onBooked }: HotelBookingFlowProps) {
  const { user } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [_bookingId, setBookingId] = useState<string | null>(null);

  if (!hotel) return null;

  const handleNext = () => setActiveStep((s) => s + 1);
  const handleBack = () => setActiveStep((s) => s - 1);

  const handleConfirm = async () => {
    if (!user) return;
    setSubmitting(true);

    try {
      if (hotel.supportsInApp) {
        const { data, error } = await supabase.functions.invoke('hotel-booking', {
          body: {
            hotelId: hotel.providerData?.hotelId,
            provider: hotel.provider,
            checkIn: hotel.providerData?.checkIn,
            checkOut: hotel.providerData?.checkOut,
            guestName,
            guestEmail,
            specialRequests,
            tripId,
          },
        });

        if (error) throw error;
        setBookingId(data.bookingId);

        if (tripId) {
          await insertRow('reservations', {
            user_id: user.id,
            trip_id: tripId,
            source: 'provider_api',
            type: 'hotel',
            title: hotel.title,
            provider: hotel.provider,
            booking_url: hotel.bookingUrl,
            provider_booking_id: data.bookingId,
            status: 'confirmed',
          });
        }

        onBooked?.(data.bookingId);
      } else {
        const { id: bookingIdNew } = await insertReturningId('reservations', {
          user_id: user.id,
          trip_id: tripId || null,
          source: 'provider_api',
          type: 'hotel',
          title: hotel.title,
          status: 'pending',
          provider: hotel.provider,
          booking_url: hotel.bookingUrl,
          total_amount: hotel.price,
          currency: hotel.currency,
          raw_provider_data: { ...(hotel.providerData || {}), guest_name: guestName },
        });

        if (bookingIdNew) setBookingId(bookingIdNew);

        if (hotel.bookingUrl) {
          window.open(hotel.bookingUrl, '_blank', 'noopener,noreferrer');
        }
      }

      setActiveStep(2);
    } catch (err) {
      console.error('Booking error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setActiveStep(0);
    setGuestName('');
    setGuestEmail('');
    setSpecialRequests('');
    setBookingId(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Book Hotel</DialogTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7 p-0" onClick={handleClose} aria-label="Close">
            <X style={{ height: 20, width: 20 }} />
          </Button>
        </DialogHeader>
        <div>
          <Stepper activeStep={activeStep} />

          {activeStep === 0 && (
            <div>
              {hotel.imageUrl && (
                <img
                  src={hotel.imageUrl}
                  alt={hotel.title}
                  className="mb-4 h-[200px] w-full object-cover"
                />
              )}
              <h3 className="mb-1 text-lg font-bold">{hotel.title}</h3>
              {hotel.starRating && (
                <div className="mb-2 flex items-center gap-0.5">
                  {Array.from({ length: hotel.starRating }).map((_, i) => (
                    <Star
                      key={i}
                      style={{ height: 14, width: 14, fill: 'currentColor', color: 'hsl(var(--primary))' }}
                    />
                  ))}
                </div>
              )}
              {hotel.rating && (
                <div className="mb-2">
                  <Badge variant="secondary">Rating: {hotel.rating.toFixed(1)}</Badge>
                </div>
              )}
              <p className="mt-4 text-2xl font-extrabold text-primary">
                {formatPrice(hotel.price, hotel.currency)}
                {hasValidPrice(hotel.price) && (
                  <span className="text-sm font-normal text-muted-foreground"> / night</span>
                )}
              </p>
              <div className="mt-6 flex justify-end">
                <Button onClick={handleNext}>Continue</Button>
              </div>
            </div>
          )}

          {activeStep === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="hbf-guest-name">Guest Name</Label>
                <Input
                  id="hbf-guest-name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="hbf-guest-email">Email</Label>
                <Input
                  id="hbf-guest-email"
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="hbf-special">Special Requests</Label>
                <Textarea
                  id="hbf-special"
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  rows={3}
                  placeholder="Any special requirements..."
                />
              </div>
              <div className="mt-2 flex justify-between">
                <Button variant="outline" onClick={handleBack}>Back</Button>
                <Button
                  onClick={handleConfirm}
                  disabled={!guestName.trim() || !guestEmail.trim() || submitting}
                >
                  {submitting ? 'Processing...' : hotel.supportsInApp ? 'Confirm Booking' : 'Continue to Partner'}
                  {!hotel.supportsInApp && <ExternalLink style={{ height: 14, width: 14, marginLeft: 6 }} />}
                </Button>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background">
                <Check className="h-7 w-7" />
              </div>
              <h3 className="mb-2 text-lg font-bold">
                {hotel.supportsInApp ? 'Booking Confirmed!' : 'Reservation Saved'}
              </h3>
              <p className="mb-2 text-muted-foreground">
                {hotel.supportsInApp
                  ? `Your booking at ${hotel.title} has been confirmed.`
                  : `We've saved ${hotel.title} to your reservations. Complete your booking on the partner site.`}
              </p>
              {tripId && (
                <p className="text-sm text-muted-foreground">
                  Added to your trip reservations automatically.
                </p>
              )}
              <div className="mt-6">
                <Button onClick={handleClose}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
