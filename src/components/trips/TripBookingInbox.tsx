import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { Inbox, Mail, Check, X, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useProfile } from '@/hooks/useProfile';
import { useTripInbox, type TripInboxItem } from '@/hooks/useTripInbox';

interface Props {
  tripId: string;
}

export function TripBookingInbox({ tripId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { profile } = useProfile();
  const {
    inbox,
    inboxLoading,
    items,
    itemsLoading,
    slotItem,
    dismissItem,
    pasteConfirmation,
  } = useTripInbox(tripId);

  const [pasteText, setPasteText] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);

  const mailboxAddress = profile?.username ? `${profile.username}@queer.guide` : null;
  const parsedItems = items.filter((i) => i.parse_status === 'parsed');
  const failedItems = items.filter((i) => i.parse_status === 'failed');

  // Bookings forwarded to the user's own queer.guide address land in their
  // Travel Inbox (see MailboxForwardingSettings) — no separate per-trip
  // address. Here we offer the direct-to-this-trip paste path plus a pointer.
  const forwardHint = mailboxAddress
    ? t('trips.inbox.forwardHint', {
        defaultValue:
          'Forward Booking.com, Airbnb or airline confirmations to {{address}} — they appear in your Travel Inbox, ready to add to a trip. Or paste one here to add it straight to this trip.',
        address: mailboxAddress,
      })
    : t('trips.inbox.forwardHintNoAddress', {
        defaultValue:
          'Forward booking confirmations to your queer.guide address and they appear in your Travel Inbox. Or paste one here to add it straight to this trip.',
      });

  // Empty state — no forwarded/pasted items yet.
  if (!inboxLoading && !inbox && parsedItems.length === 0 && failedItems.length === 0) {
    return (
      <section
        aria-label={t('trips.inbox.label', 'Booking inbox')}
        className="border border-border bg-background p-4 mb-4"
      >
        <div className="flex items-start gap-4">
          <Inbox className="h-5 w-5 mt-0.5 text-muted-foreground" aria-hidden />
          <div className="flex-1">
            <h3 className="text-sm font-bold uppercase tracking-wide">
              {t('trips.inbox.cta.title', 'Forward booking emails')}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{forwardHint}</p>
            <div className="flex gap-2 mt-4 flex-wrap">
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
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Inbox className="h-4 w-4" aria-hidden />
          {t('trips.inbox.title', 'Booking inbox')}
        </h3>
      </div>

      <p className="text-sm text-muted-foreground mb-4">{forwardHint}</p>

      <div className="mb-4">
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
            <li key={item.id} className="text-sm border border-border p-4 bg-muted/20">
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
    <div className="mt-4 space-y-2">
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
    <div className="border border-border p-4">
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
          <Button size="sm" variant="outline" asChild>
            <LocalizedLink to={`/hub?tripmail=${item.id}`} className="no-underline">
              <MessageCircle className="h-3.5 w-3.5 mr-1" aria-hidden />
              {t('trips.inbox.openThread', 'Review in chat')}
            </LocalizedLink>
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={dismissing}>
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
