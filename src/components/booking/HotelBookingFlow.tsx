import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Chip from '@mui/material/Chip';
import { X, Star, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BookingResult } from '@/lib/booking/types';
import { formatPrice, hasValidPrice } from '@/lib/booking/price';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface HotelBookingFlowProps {
  hotel: BookingResult | null;
  open: boolean;
  onClose: () => void;
  tripId?: string;
  onBooked?: (bookingId: string) => void;
}

const STEPS = ['Review', 'Guest Details', 'Confirm'];

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
        // Future: in-app booking via provider API
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
          await supabase.from('reservations').insert({
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
        // Affiliate flow: track in reservations and open the affiliate URL.
        // Single insert replaces the legacy split between trip_reservations
        // (per-trip line item) and bookings (user-wide tracking).
        const { data: booking } = await supabase
          .from('reservations')
          .insert({
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
            // guest_name folded into the provider blob since the unified
            // table doesn't reserve a column for it.
            raw_provider_data: { ...(hotel.providerData || {}), guest_name: guestName },
          })
          .select('id')
          .single();

        if (booking) setBookingId(booking.id);

        // Open affiliate link
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
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Book Hotel
        <IconButton onClick={handleClose} size="small">
          <X style={{ height: 20, width: 20 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step 0: Review */}
        {activeStep === 0 && (
          <Box>
            {hotel.imageUrl && (
              <Box
                component="img"
                src={hotel.imageUrl}
                alt={hotel.title}
                sx={{ width: '100%', height: 200, objectFit: 'cover', mb: 2 }}
              />
            )}
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              {hotel.title}
            </Typography>
            {hotel.starRating && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mb: 1 }}>
                {Array.from({ length: hotel.starRating }).map((_, i) => (
                  <Star key={i} style={{ height: 14, width: 14, fill: 'currentColor', color: 'var(--primary)' }} />
                ))}
              </Box>
            )}
            {hotel.rating && (
              <Chip label={`Rating: ${hotel.rating.toFixed(1)}`} size="small" sx={{ mb: 1 }} />
            )}
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main', mt: 2 }}>
              {formatPrice(hotel.price, hotel.currency)}
              {hasValidPrice(hotel.price) && (
                <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 400, color: 'text.secondary' }}>
                  {' '}/ night
                </Typography>
              )}
            </Typography>
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={handleNext}>Continue</Button>
            </Box>
          </Box>
        )}

        {/* Step 1: Guest Details */}
        {activeStep === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Guest Name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Special Requests"
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              multiline
              rows={3}
              fullWidth
              placeholder="Any special requirements..."
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
              <Button variant="outline" onClick={handleBack}>Back</Button>
              <Button
                onClick={handleConfirm}
                disabled={!guestName.trim() || !guestEmail.trim() || submitting}
              >
                {submitting ? 'Processing...' : hotel.supportsInApp ? 'Confirm Booking' : 'Continue to Partner'}
                {!hotel.supportsInApp && <ExternalLink style={{ height: 14, width: 14, marginLeft: 6 }} />}
              </Button>
            </Box>
          </Box>
        )}

        {/* Step 2: Confirmation */}
        {activeStep === 2 && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Box
              sx={{
                width: 56, height: 56, borderRadius: '50%', bgcolor: 'success.main',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2,
              }}
            >
              <Check style={{ height: 28, width: 28, color: 'white' }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
              {hotel.supportsInApp ? 'Booking Confirmed!' : 'Reservation Saved'}
            </Typography>
            <Typography sx={{ color: 'text.secondary', mb: 2 }}>
              {hotel.supportsInApp
                ? `Your booking at ${hotel.title} has been confirmed.`
                : `We've saved ${hotel.title} to your reservations. Complete your booking on the partner site.`}
            </Typography>
            {tripId && (
              <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                Added to your trip reservations automatically.
              </Typography>
            )}
            <Box sx={{ mt: 3 }}>
              <Button onClick={handleClose}>Done</Button>
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
