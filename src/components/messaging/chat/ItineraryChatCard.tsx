import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, isValid, parseISO } from 'date-fns';
import {
  BedDouble,
  Plane,
  TrainFront,
  Utensils,
  Ticket,
  Mail,
  MapPin,
  Check,
  X,
  Plus,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useTrips } from '@/hooks/useTrips';
import type { ItineraryMeta } from '@/components/messaging/chat/itineraryShare';

const TYPE_ICON: Record<string, typeof BedDouble> = {
  lodging: BedDouble,
  flight: Plane,
  rail: TrainFront,
  restaurant: Utensils,
  activity: Ticket,
};

function fmt(iso?: string | null): string | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'MMM d, yyyy') : null;
}

function dateRange(meta: ItineraryMeta): string | null {
  const s = fmt(meta.start);
  const e = fmt(meta.end);
  if (s && e && s !== e) return `${s} – ${e}`;
  return s ?? e ?? null;
}

/**
 * Rich itinerary card for a booking parsed from a forwarded email, rendered
 * inline in the /hub/messages feed. Guessable forwarding address ⇒ the booking
 * lands 'pending' and the user Approves / Rejects it here; once approved it can
 * be slotted into a trip via the existing trip-inbox-slot function.
 */
export function ItineraryChatCard({ meta }: { meta: ItineraryMeta }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ItineraryMeta['status']>(meta.status);
  const [busy, setBusy] = useState<string | null>(null);
  const { data: trips = [] } = useTrips();

  const Icon = (meta.booking_type && TYPE_ICON[meta.booking_type]) || Mail;
  const range = dateRange(meta);
  const priceLine =
    meta.price != null ? `${meta.price}${meta.currency ? ` ${meta.currency}` : ''}` : null;

  async function decide(next: 'approved' | 'rejected') {
    setBusy(next);
    const { error } = await untypedRpc('set_travel_inbox_item_status', {
      p_item: meta.item_id,
      p_status: next,
    });
    setBusy(null);
    if (!error) setStatus(next);
  }

  async function addToTrip(tripId: string) {
    setBusy('slot');
    const { error } = await supabase.functions.invoke('trip-inbox-slot', {
      body: { trip_id: tripId, travel_item_id: meta.item_id },
    });
    setBusy(null);
    if (!error) setStatus('slotted');
  }

  const activeTrips = trips.filter((tr) => tr.status !== 'archived');

  return (
    <div className="flex flex-col gap-2 rounded-container border border-border bg-card p-4" style={{ minWidth: 260, maxWidth: 340 }}>
      <div className="flex items-start gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-element bg-muted shrink-0">
          <Icon size={18} className="text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          {meta.vendor && (
            <p className="text-2xs uppercase tracking-wider text-muted-foreground truncate">{meta.vendor}</p>
          )}
          <p className="text-sm font-medium text-foreground break-words">
            {meta.title || t('chat.itinerary.untitled', { defaultValue: 'Forwarded booking' })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {range && <p>{range}</p>}
        {meta.location && (
          <p className="flex items-center gap-1">
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{meta.location}</span>
          </p>
        )}
        {(priceLine || meta.confirmation) && (
          <p className="flex items-center gap-2">
            {priceLine && <span>{priceLine}</span>}
            {meta.confirmation && <span className="font-mono">{meta.confirmation}</span>}
          </p>
        )}
      </div>

      {status === 'pending' && (
        <>
          <p className="text-2xs text-muted-foreground">
            {t('chat.itinerary.pending', {
              defaultValue: 'Pending — arrived at your forwarding address.',
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8 flex-1" disabled={!!busy} onClick={() => decide('approved')}>
              {busy === 'approved' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} className="mr-1" />}
              {t('chat.itinerary.approve', { defaultValue: 'Approve' })}
            </Button>
            <Button size="sm" variant="outline" className="h-8" disabled={!!busy} onClick={() => decide('rejected')}>
              <X size={14} className="mr-1" />
              {t('chat.itinerary.reject', { defaultValue: 'Reject' })}
            </Button>
          </div>
        </>
      )}

      {status === 'approved' && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-badge">
            {t('chat.itinerary.approved', { defaultValue: 'Approved' })}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8" disabled={!!busy}>
                {busy === 'slot' ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Plus size={14} className="mr-1" />}
                {t('chat.itinerary.addToTrip', { defaultValue: 'Add to a trip' })}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {activeTrips.length === 0 ? (
                <DropdownMenuItem disabled>
                  {t('chat.itinerary.noTrips', { defaultValue: 'No trips yet' })}
                </DropdownMenuItem>
              ) : (
                activeTrips.map((tr) => (
                  <DropdownMenuItem key={tr.id} onClick={() => addToTrip(tr.id)}>
                    {tr.title}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {status === 'rejected' && (
        <Badge variant="outline" className="rounded-badge w-fit text-muted-foreground">
          {t('chat.itinerary.rejected', { defaultValue: 'Rejected' })}
        </Badge>
      )}

      {status === 'slotted' && (
        <Badge variant="outline" className="rounded-badge w-fit">
          {t('chat.itinerary.added', { defaultValue: 'Added to trip' })}
        </Badge>
      )}
    </div>
  );
}
