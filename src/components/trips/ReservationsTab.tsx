import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import {
  Plus,
  Trash2,
  Plane,
  Building,
  Ticket,
  Car,
  Package,
  ExternalLink,
  CalendarClock,
} from 'lucide-react';
import { format, isAfter, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useTripReservations,
  useReservationMutations,
  type Reservation,
} from '@/hooks/useTripReservations';
import { AddReservationDialog } from './AddReservationDialog';

const TYPE_ICONS: Record<string, typeof Plane> = {
  flight: Plane,
  hotel: Building,
  activity: Ticket,
  transport: Car,
  other: Package,
};

const TYPE_ORDER = ['flight', 'hotel', 'activity', 'transport', 'other'] as const;

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
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: reservations, isLoading } = useTripReservations(tripId);
  const { deleteReservation } = useReservationMutations(tripId);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Reservation | undefined>(undefined);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    deleteReservation.mutate(id, {
      onSuccess: () => toast({ title: t('trips.reservations.deleted') }),
      onError: (err) =>
        toast({
          title: t('trips.reservations.deleteFailed'),
          description: String(err),
          variant: 'destructive',
        }),
    });
    setDeleteConfirmId(null);
  };

  const items = useMemo(() => reservations ?? [], [reservations]);

  // Compute "next up" — the reservation with the soonest future check-in
  const nextUp = useMemo(() => {
    const now = new Date();
    const upcoming = items
      .filter((r) => r.check_in && r.status !== 'cancelled')
      .map((r) => ({ res: r, when: parseISO(r.check_in as string) }))
      .filter((x) => isAfter(x.when, now))
      .sort((a, b) => a.when.getTime() - b.when.getTime());
    return upcoming[0]?.res;
  }, [items]);

  if (isLoading) return <PageLoadingState count={3} variant="list" />;

  const grouped: Record<string, Reservation[]> = {};
  for (const type of TYPE_ORDER) {
    const typeItems = items.filter((r) => r.type === type);
    if (typeItems.length > 0) grouped[type] = typeItems;
  }

  const typeLabel = (type: string) => t(`trips.reservations.type.${type}`);

  const statusBadge = (status: string) => {
    if (status === 'confirmed') {
      return (
        <Badge variant="outline">
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <Box
              component="span"
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: '#10B981',
              }}
            />
            {t('trips.reservations.status.confirmed')}
          </Box>
        </Badge>
      );
    }
    if (status === 'cancelled')
      return (
        <Badge variant="destructive">
          {t('trips.reservations.status.cancelled')}
        </Badge>
      );
    return (
      <Badge variant="outline">{t('trips.reservations.status.pending')}</Badge>
    );
  };

  if (items.length === 0) {
    return (
      <>
        <Box
          sx={{
            textAlign: 'center',
            py: { xs: 6, md: 10 },
            px: 3,
            border: '1.5px dashed',
            borderColor: 'divider',
            borderRadius: 3,
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 2,
              bgcolor: (theme) =>
                `${theme.palette.brand?.main || '#DB2777'}1a`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 1.5,
            }}
          >
            <Ticket
              size={26}
              style={{ color: 'var(--brand-magenta, #DB2777)' }}
            />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t('trips.reservations.emptyTitle')}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 3, maxWidth: 360, mx: 'auto' }}
          >
            {t('trips.reservations.emptyDescription')}
          </Typography>
          <Button
            variant="brand"
            onClick={() => {
              setEditItem(undefined);
              setAddOpen(true);
            }}
          >
            <Plus size={16} style={{ marginRight: 6 }} />
            {t('trips.reservations.add')}
          </Button>
        </Box>
        <AddReservationDialog
          open={addOpen}
          onClose={() => {
            setAddOpen(false);
            setEditItem(undefined);
          }}
          tripId={tripId}
          existing={editItem}
        />
      </>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Next up card */}
      {nextUp && (
        <Box
          sx={{
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'brand.main',
            bgcolor: (theme) =>
              `${theme.palette.brand?.main || '#DB2777'}14`,
            p: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 1.5,
              bgcolor: 'brand.main',
              color: 'brand.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CalendarClock size={18} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="caption"
              sx={{
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 700,
                color: 'brand.main',
                fontSize: '0.68rem',
                display: 'block',
              }}
            >
              {t('trips.reservations.nextUp')}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
              {nextUp.title}
            </Typography>
            {nextUp.check_in && (
              <Typography variant="caption" color="text.secondary">
                {format(new Date(nextUp.check_in), 'EEE, MMM d · HH:mm')}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {TYPE_ORDER.map((type) => {
        const typeItems = grouped[type];
        if (!typeItems) return null;

        const Icon = TYPE_ICONS[type] || Package;
        return (
          <Box key={type}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: 1.25,
                  bgcolor: 'action.hover',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={14} />
              </Box>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                {typeLabel(type)}
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

      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          setEditItem(undefined);
          setAddOpen(true);
        }}
      >
        <Plus size={16} style={{ marginRight: 6 }} />
        {t('trips.reservations.add')}
      </Button>

      <AddReservationDialog
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setEditItem(undefined);
        }}
        tripId={tripId}
        existing={editItem}
      />

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('trips.reservations.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('trips.reservations.deleteConfirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              {t('trips.card.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
            >
              {t('trips.card.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
