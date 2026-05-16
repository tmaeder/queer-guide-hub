import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Copy, Inbox, Mail, Trash2, RefreshCw, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useTripInbox, type TripInboxItem } from '@/hooks/useTripInbox';

interface Props {
  tripId: string;
}

export function TripBookingInbox({ tripId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    address,
    inbox,
    inboxLoading,
    items,
    itemsLoading,
    enable,
    revoke,
    regenerate,
    slotItem,
    dismissItem,
    pasteConfirmation,
  } = useTripInbox(tripId);

  const [pasteText, setPasteText] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);

  const parsedItems = items.filter((i) => i.parse_status === 'parsed');
  const failedItems = items.filter((i) => i.parse_status === 'failed');

  // Pre-enable CTA. Only render the heavy UI once the user opts in.
  if (!inboxLoading && !inbox && parsedItems.length === 0 && failedItems.length === 0) {
    return (
      <section
        aria-label={t('trips.inbox.label', 'Booking inbox')}
        className="border border-border bg-background p-4 mb-4"
      >
        <div className="flex items-start gap-3">
          <Inbox className="h-5 w-5 mt-0.5 text-muted-foreground" aria-hidden />
          <div className="flex-1">
            <h3 className="text-sm font-bold uppercase tracking-wide">
              {t('trips.inbox.cta.title', 'Forward booking emails')}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                'trips.inbox.cta.body',
                'Get a private address for this trip. Forward Booking.com, Airbnb, airlines — we parse and slot automatically.',
              )}
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button
                size="sm"
                onClick={() => enable.mutate()}
                disabled={enable.isPending}
              >
                {t('trips.inbox.cta.enable', 'Enable email forwarding')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPasteOpen((v) => !v)}
              >
                {t('trips.inbox.cta.paste', 'Paste confirmation instead')}
              </Button>
            </div>
            {pasteOpen && (
              <PasteBox
                value={pasteText}
                onChange={setPasteText}
                onSubmit={async () => {
                  await pasteConfirmation.mutateAsync(pasteText);
                  setPasteText('');
                  toast({
                    title: t('trips.inbox.paste.parsed', 'Confirmation parsed'),
                  });
                }}
                disabled={pasteConfirmation.isPending}
              />
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={t('trips.inbox.label', 'Booking inbox')}
      className="border border-border bg-background p-4 mb-4"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Inbox className="h-4 w-4" aria-hidden />
          {t('trips.inbox.title', 'Booking inbox')}
        </h3>
      </div>

      {address && (
        <div className="border border-border p-3 mb-3 bg-muted/30">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            {t('trips.inbox.address.label', 'Forwarding address')}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-mono break-all">{address}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(address);
                toast({ title: t('trips.inbox.copied', 'Copied') });
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1" aria-hidden />
              {t('common.copy', 'Copy')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => regenerate()}
              disabled={enable.isPending || revoke.isPending}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden />
              {t('trips.inbox.regenerate', 'Regenerate')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => revoke.mutate()}
              disabled={revoke.isPending}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" aria-hidden />
              {t('trips.inbox.revoke', 'Revoke address')}
            </Button>
          </div>
        </div>
      )}

      <div className="mb-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setPasteOpen((v) => !v)}
        >
          <Mail className="h-3.5 w-3.5 mr-1" aria-hidden />
          {t('trips.inbox.cta.paste', 'Paste confirmation instead')}
        </Button>
        {pasteOpen && (
          <PasteBox
            value={pasteText}
            onChange={setPasteText}
            onSubmit={async () => {
              await pasteConfirmation.mutateAsync(pasteText);
              setPasteText('');
              toast({ title: t('trips.inbox.paste.parsed', 'Confirmation parsed') });
            }}
            disabled={pasteConfirmation.isPending}
          />
        )}
      </div>

      {itemsLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading', 'Loading…')}</p>
      ) : parsedItems.length === 0 && failedItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('trips.inbox.empty', 'No forwarded bookings yet.')}
        </p>
      ) : (
        <ul className="space-y-2">
          {parsedItems.map((item) => (
            <li key={item.id}>
              <InboxItemRow
                item={item}
                onSlot={() => slotItem.mutate(item.id)}
                onDismiss={() => dismissItem.mutate(item.id)}
                slotting={slotItem.isPending}
                dismissing={dismissItem.isPending}
              />
            </li>
          ))}
          {failedItems.map((item) => (
            <li key={item.id} className="text-sm border border-border p-3 bg-muted/20">
              <div className="font-medium">{item.raw_subject ?? '(no subject)'}</div>
              <div className="text-xs text-muted-foreground">
                {t('trips.inbox.parseFailed', 'Could not parse this email.')}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => dismissItem.mutate(item.id)}
              >
                {t('common.dismiss', 'Dismiss')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PasteBox({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 space-y-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder={t(
          'trips.inbox.paste.placeholder',
          'Paste the full confirmation email body here…',
        )}
        className="text-sm font-mono"
      />
      <Button size="sm" disabled={disabled || !value.trim()} onClick={onSubmit}>
        {t('trips.inbox.paste.submit', 'Parse confirmation')}
      </Button>
    </div>
  );
}

function InboxItemRow({
  item,
  onSlot,
  onDismiss,
  slotting,
  dismissing,
}: {
  item: TripInboxItem;
  onSlot: () => void;
  onDismiss: () => void;
  slotting: boolean;
  dismissing: boolean;
}) {
  const { t } = useTranslation();
  const start = item.parsed_start_at ? new Date(item.parsed_start_at) : null;
  const end = item.parsed_end_at ? new Date(item.parsed_end_at) : null;
  const conf = item.parse_confidence == null ? null : Math.round(item.parse_confidence * 100);

  return (
    <div className="border border-border p-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
            {item.parsed_type && <span>{item.parsed_type}</span>}
            {item.parsed_vendor && <span>· {item.parsed_vendor}</span>}
            {conf !== null && <span>· {conf}%</span>}
          </div>
          <div className="text-sm font-medium mt-0.5">
            {item.parsed_title || item.raw_subject || '(no title)'}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {start && format(start, 'PP p')}
            {start && end && ' → '}
            {end && format(end, 'PP p')}
            {item.parsed_location && <span> · {item.parsed_location}</span>}
            {item.parsed_price != null && (
              <span>
                {' '}· {item.parsed_price}
                {item.parsed_currency ? ` ${item.parsed_currency}` : ''}
              </span>
            )}
            {item.parsed_confirmation && <span> · #{item.parsed_confirmation}</span>}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" onClick={onSlot} disabled={slotting}>
            <Check className="h-3.5 w-3.5 mr-1" aria-hidden />
            {t('trips.inbox.slot', 'Slot it')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={dismissing}>
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
