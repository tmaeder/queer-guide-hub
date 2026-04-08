import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';
import { Plus, Trash2, Plane, Building, Ticket, Car, Package, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useTripReservations, useReservationMutations, type Reservation } from '@/hooks/useTripReservations';
import { AddReservationDialog } from './AddReservationDialog';

const TYPE_ICONS: Record<string, typeof Plane> = {
  flight: Plane,
  hotel: Building,
  activity: Ticket,
  transport: Car,
  other: Package,
};

const TYPE_LABELS: Record<string, string> = {
  flight: 'Flights',
  hotel: 'Hotels',
  activity: 'Activities',
  transport: 'Transport',
  other: 'Other',
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
  const theme = useTheme();
  const { toast } = useToast();
  const { data: reservations, isLoading } = useTripReservations(tripId);
  const { deleteReservation } = useReservationMutations(tripId);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Reservation | undefined>(undefined);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    deleteReservation.mutate(id, {
      onSuccess: () => toast({ title: 'Reservation deleted' }),
      onError: (err) => toast({ title: 'Failed to delete', description: String(err), variant: 'destructive' }),
    });
    setDeleteConfirmId(null);
  };

  if (isLoading) return <PageLoadingState count={3} variant="list" />;

  const items = reservations || [];
  const types = ['flight', 'hotel', 'activity', 'transport', 'other'];

  const grouped: Record<string, Reservation[]> = {};
  for (const type of types) {
    const typeItems = items.filter((r) => r.type === type);
    if (typeItems.length > 0) grouped[type] = typeItems;
  }

  const statusBadge = (status: string) => {
    if (status === 'confirmed') {
      return (
        <Badge variant="outline">
          <Box
            component="span"
            sx={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: 'success.main',
              mr: 0.5,
            }}
          />
          Confirmed
        </Badge>
      );
    }
    if (status === 'cancelled') return <Badge variant="destructive">Cancelled</Badge>;
    return <Badge variant="outline">Pending</Badge>;
  };

  if (items.length === 0) {
    return (
      <>
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2,
            }}
          >
            <Ticket size={28} style={{ opacity: 0.5 }} />
          </Box>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            No reservations yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Add flights, hotels, and activities to keep everything organized
          </Typography>
          <Button variant="outline" className="w-full" onClick={() => { setEditItem(undefined); setAddOpen(true); }}>
            <Plus size={16} />
            Add Reservation
          </Button>
        </Box>
        <AddReservationDialog
          open={addOpen}
          onClose={() => { setAddOpen(false); setEditItem(undefined); }}
          tripId={tripId}
          existing={editItem}
        />
      </>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {types.map((type) => {
        const typeItems = grouped[type];
        if (!typeItems) return null;

        const Icon = TYPE_ICONS[type] || Package;
        return (
          <Box key={type}>
            <Box className="flex items-center gap-2 mb-1.5">
              <Icon size={16} style={{ color: theme.palette.text.secondary }} />
              <Typography variant="subtitle2" fontWeight={600}>
                {TYPE_LABELS[type]}
              </Typography>
              <Badge variant="secondary">{typeItems.length}</Badge>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
            {typeItems.map((res) => (
              <Card
                key={res.id}
                hoverable
                className="mb-1"
                onClick={() => { setEditItem(res); setAddOpen(true); }}
              >
                <CardContent>
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
                        {statusBadge(res.status)}
                      </Box>
                      <Box className="flex items-center gap-2 mt-0.5">
                        {res.check_in && (
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(res.check_in), 'MMM d, HH:mm')}
                          </Typography>
                        )}
                        {res.check_in && res.check_out && (
                          <Typography variant="caption" color="text.secondary">-</Typography>
                        )}
                        {res.check_out && (
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(res.check_out), 'MMM d, HH:mm')}
                          </Typography>
                        )}
                        {res.provider && (
                          <Typography variant="caption" color="text.secondary">
                            {res.provider}
                          </Typography>
                        )}
                        {res.confirmation_code && (
                          <Badge variant="outline">
                            <Box component="span" sx={{ fontFamily: 'monospace', fontSize: 10 }}>
                              {res.confirmation_code}
                            </Box>
                          </Badge>
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
                          sx={{ minWidth: 44, minHeight: 44 }}
                        >
                          <ExternalLink size={14} />
                        </IconButton>
                      )}
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(res.id);
                        }}
                        sx={{ opacity: 0.5, '&:hover': { opacity: 1 }, minWidth: 44, minHeight: 44 }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
            </Box>
          </Box>
        );
      })}

      <Button variant="outline" className="w-full" onClick={() => { setEditItem(undefined); setAddOpen(true); }}>
        <Plus size={16} />
        Add Reservation
      </Button>

      <AddReservationDialog
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditItem(undefined); }}
        tripId={tripId}
        existing={editItem}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Reservation</DialogTitle>
          </DialogHeader>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Are you sure you want to delete this reservation? This cannot be undone.
          </Typography>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
