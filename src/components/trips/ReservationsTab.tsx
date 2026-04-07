import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import { Plus, Trash2, Plane, Building, Ticket, Car, Package, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { useTripReservations, useReservationMutations, type Reservation } from '@/hooks/useTripReservations';
import { AddReservationDialog } from './AddReservationDialog';

const TYPE_ICONS: Record<string, typeof Plane> = {
  flight: Plane,
  hotel: Building,
  activity: Ticket,
  transport: Car,
  other: Package,
};

const STATUS_COLOR: Record<string, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  confirmed: 'success',
  cancelled: 'error',
};

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

interface Props {
  tripId: string;
}

export function ReservationsTab({ tripId }: Props) {
  const { data: reservations, isLoading } = useTripReservations(tripId);
  const { deleteReservation } = useReservationMutations(tripId);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Reservation | undefined>(undefined);

  if (isLoading) {
    return (
      <Box className="space-y-3">
        <Skeleton variant="rounded" height={80} />
        <Skeleton variant="rounded" height={80} />
      </Box>
    );
  }

  const items = reservations || [];
  const types = ['flight', 'hotel', 'activity', 'transport', 'other'];

  const grouped: Record<string, Reservation[]> = {};
  for (const type of types) {
    const typeItems = items.filter((r) => r.type === type);
    if (typeItems.length > 0) {
      grouped[type] = typeItems;
    }
  }

  return (
    <div>
      {types.map((type) => {
        const typeItems = grouped[type];
        if (!typeItems) return null;

        const Icon = TYPE_ICONS[type] || Package;
        return (
          <Box key={type} sx={{ mb: 3 }}>
            <Box className="flex items-center gap-2 mb-1.5">
              <Icon size={16} className="text-muted-foreground" />
              <Typography variant="subtitle2" fontWeight={600}>
                {type === 'flight' ? 'Flights' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}
              </Typography>
              <Chip label={typeItems.length} size="small" sx={{ height: 20, fontSize: 11 }} />
            </Box>

            {typeItems.map((res) => (
              <Card
                key={res.id}
                variant="outlined"
                sx={{ mb: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                onClick={() => { setEditItem(res); setAddOpen(true); }}
              >
                <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                  <Box className="flex items-center gap-2">
                    <Box
                      className="rounded-full flex items-center justify-center shrink-0"
                      sx={{ width: 32, height: 32, bgcolor: 'action.hover' }}
                    >
                      <Icon size={15} />
                    </Box>

                    <div className="flex-1 min-w-0">
                      <Box className="flex items-center gap-1.5">
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {res.title}
                        </Typography>
                        <Chip
                          label={res.status}
                          size="small"
                          color={STATUS_COLOR[res.status] || 'default'}
                          sx={{ height: 20, fontSize: 11 }}
                        />
                      </Box>
                      <Box className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {res.check_in && (
                          <span>{format(new Date(res.check_in), 'MMM d, HH:mm')}</span>
                        )}
                        {res.check_in && res.check_out && <span>-</span>}
                        {res.check_out && (
                          <span>{format(new Date(res.check_out), 'MMM d, HH:mm')}</span>
                        )}
                        {res.provider && <span>-- {res.provider}</span>}
                        {res.confirmation_code && (
                          <Chip
                            label={res.confirmation_code}
                            size="small"
                            variant="outlined"
                            sx={{ height: 18, fontSize: 10, fontFamily: 'monospace' }}
                          />
                        )}
                      </Box>
                    </div>

                    <Box className="flex items-center gap-1 shrink-0">
                      {res.amount != null && res.currency && (
                        <Typography variant="body2" fontWeight={700}>
                          {formatAmount(Number(res.amount), res.currency)}
                        </Typography>
                      )}
                      {res.booking_url && (
                        <IconButton
                          size="small"
                          href={res.booking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={14} />
                        </IconButton>
                      )}
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteReservation.mutate(res.id);
                        }}
                        sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        );
      })}

      {items.length === 0 && (
        <Box className="text-center py-12">
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            No reservations yet.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Track your flights, hotels, and bookings here.
          </Typography>
        </Box>
      )}

      <Button
        variant="outlined"
        startIcon={<Plus size={16} />}
        onClick={() => { setEditItem(undefined); setAddOpen(true); }}
        fullWidth
        sx={{ mt: 2 }}
      >
        Add Reservation
      </Button>

      <AddReservationDialog
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditItem(undefined); }}
        tripId={tripId}
        existing={editItem}
      />
    </div>
  );
}
