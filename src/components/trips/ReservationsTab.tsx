import { useMemo, useState } from 'react';
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
import { ReservationSuggestionsPanel } from './reservations/ReservationSuggestionsPanel';

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
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-foreground" />
            {t('trips.reservations.status.confirmed')}
          </span>
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
        <div className="mb-6">
          <ReservationSuggestionsPanel tripId={tripId} />
        </div>
        <div className="rounded-container border border-dashed border-muted px-6 py-12 text-center md:py-20">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-element bg-[hsl(var(--foreground)/0.1)]">
            <Ticket size={26} style={{ color: 'hsl(var(--foreground))' }} />
          </div>
          <h3 className="mb-1 text-lg font-bold">
            {t('trips.reservations.emptyTitle')}
          </h3>
          <p className="mx-auto mb-6 max-w-[360px] text-sm text-muted-foreground">
            {t('trips.reservations.emptyDescription')}
          </p>
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
        </div>
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
    <div className="flex flex-col gap-6">
      {/* Next up card */}
      {nextUp && (
        <div className="flex items-center gap-3 bg-[hsl(var(--foreground)/0.08)] p-4">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-element bg-[hsl(var(--foreground))] text-[hsl(var(--background))]">
            <CalendarClock size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <span
              className="block text-[0.68rem] font-bold uppercase text-[hsl(var(--foreground))]"
              style={{ letterSpacing: '0.06em' }}
            >
              {t('trips.reservations.nextUp')}
            </span>
            <p className="truncate text-sm font-bold">{nextUp.title}</p>
            {nextUp.check_in && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(nextUp.check_in), 'EEE, MMM d · HH:mm')}
              </span>
            )}
          </div>
        </div>
      )}

      {TYPE_ORDER.map((type) => {
        const typeItems = grouped[type];
        if (!typeItems) return null;

        const Icon = TYPE_ICONS[type] || Package;
        return (
          <div key={type}>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-badge bg-accent">
                <Icon size={14} />
              </div>
              <h4
                className="text-sm font-bold"
              >
                {typeLabel(type)}
              </h4>
              <Badge variant="secondary">{typeItems.length}</Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {typeItems.map((res) => (
                <Card
                  key={res.id}
                  hoverable
                  className="mb-1"
                  onClick={() => {
                    setEditItem(res);
                    setAddOpen(true);
                  }}
                >
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
                        <Icon size={15} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-semibold">{res.title}</p>
                          {statusBadge(res.status)}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {res.check_in && (
                            <span>{format(new Date(res.check_in), 'MMM d, HH:mm')}</span>
                          )}
                          {res.check_in && res.check_out && <span>-</span>}
                          {res.check_out && (
                            <span>{format(new Date(res.check_out), 'MMM d, HH:mm')}</span>
                          )}
                          {res.provider && <span>{res.provider}</span>}
                          {res.confirmation_code && (
                            <Badge variant="outline">
                              <span className="font-mono text-[10px]">
                                {res.confirmation_code}
                              </span>
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {res.amount != null && res.currency && (
                          <p className="text-sm font-bold">
                            {formatAmount(Number(res.amount), res.currency)}
                          </p>
                        )}
                        {res.booking_url && (
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <a
                              href={res.booking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Open booking"
                            >
                              <ExternalLink size={14} />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 p-0 opacity-50 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(res.id);
                          }}
                          aria-label="Delete"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      <ReservationSuggestionsPanel tripId={tripId} />

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
    </div>
  );
}
