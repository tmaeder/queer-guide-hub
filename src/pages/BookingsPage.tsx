import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import { Receipt, Plane, Hotel, Ticket, ExternalLink, Calendar } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';

const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'default',
  cancelled: 'error',
  failed: 'error',
};

const TYPE_ICONS = {
  hotel: Hotel,
  flight: Plane,
  activity: Ticket,
};

export default function BookingsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const { data: bookings, isLoading } = useQuery({
    queryKey: ['bookings', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('*, trips(title)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  if (!user) {
    return (
      <Container sx={{ py: { xs: 6, md: 10 }, textAlign: 'center' }}>
        <Receipt style={{ height: 48, width: 48, margin: '0 auto 16px', opacity: 0.3 }} />
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>{t('pages.bookings.signIn', 'Sign in to view bookings')}</Typography>
        <Typography sx={{ color: 'text.secondary' }}>{t('pages.bookings.signInDescription', 'Your flight, hotel, and activity bookings will appear here.')}</Typography>
      </Container>
    );
  }

  return (
    <Container sx={{ py: { xs: 6, md: 10 } }}>
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, mb: 4, bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Receipt style={{ height: 28, width: 28, color: 'var(--primary)' }} />
          <Typography variant="h4" sx={{ fontWeight: 800 }}>{t('pages.bookings.title', 'My Bookings')}</Typography>
        </Box>
        <Typography sx={{ color: 'text.secondary' }}>
          Track your flights, hotels, and activities in one place.
        </Typography>
      </Paper>

      {isLoading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={100} />)}
        </Box>
      ) : bookings && bookings.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {bookings.map((booking) => {
            const Icon = TYPE_ICONS[booking.booking_type as keyof typeof TYPE_ICONS] || Receipt;
            return (
              <Card key={booking.id}>
                <CardContent style={{ padding: 16 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Icon style={{ height: 24, width: 24, color: 'var(--primary)' }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 700 }}>
                          {booking.guest_name || `${booking.booking_type} booking`}
                        </Typography>
                        <Chip
                          label={booking.status}
                          color={STATUS_COLORS[booking.status] || 'default'}
                          size="small"
                          sx={{ textTransform: 'capitalize' }}
                        />
                      </Box>
                      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', mb: 0.5 }}>
                        {booking.provider} &middot; {booking.booking_type}
                      </Typography>
                      {booking.check_in && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                          <Calendar style={{ height: 14, width: 14, color: 'var(--muted-foreground)' }} />
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            {new Date(booking.check_in).toLocaleDateString()}
                            {booking.check_out && ` - ${new Date(booking.check_out).toLocaleDateString()}`}
                          </Typography>
                        </Box>
                      )}
                      {booking.trips?.title && (
                        <LocalizedLink to={`/trips/${booking.trip_id}`}>
                          <Typography sx={{ fontSize: '0.75rem', color: 'primary.main' }}>
                            Trip: {booking.trips.title}
                          </Typography>
                        </LocalizedLink>
                      )}
                    </Box>
                    {booking.total_amount && (
                      <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: 'primary.main', whiteSpace: 'nowrap' }}>
                        {booking.currency === 'EUR' ? '€' : booking.currency} {Math.round(booking.total_amount)}
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ textAlign: 'center', py: 6, bgcolor: 'background.paper' }}>
          <Receipt style={{ height: 40, width: 40, margin: '0 auto 12px', opacity: 0.3 }} />
          <Typography sx={{ fontWeight: 600, mb: 1 }}>{t('pages.bookings.noBookings', 'No bookings yet')}</Typography>
          <Typography sx={{ color: 'text.secondary', mb: 2 }}>
            Search for flights and hotels to start booking.
          </Typography>
          <LocalizedLink to="/travel">
            <Button>{t('pages.bookings.browseTravel', 'Browse Travel')}</Button>
          </LocalizedLink>
        </Paper>
      )}
    </Container>
  );
}
