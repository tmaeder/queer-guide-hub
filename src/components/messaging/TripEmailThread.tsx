import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ticket, Check, X, Send, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTripEmailThread } from '@/hooks/useTripEmailThread';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * Detail pane for a forwarded booking-email thread: the live parsed-fields
 * card (updates as the assistant revises), the correction chat, and the
 * explicit Confirm (→ trip-inbox-slot) / Dismiss actions. The assistant can
 * only propose fields — filing is always a user action.
 */
export function TripEmailThread({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { item, itemLoading, turns, send, confirm, dismiss, markRead } =
    useTripEmailThread(itemId);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const markedRef = useRef(false);

  useEffect(() => {
    if (!markedRef.current && item) {
      markedRef.current = true;
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, send.isPending]);

  if (itemLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (!item) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
        {t('inbox.tripmail.gone', { defaultValue: 'This email item is no longer available.' })}
      </div>
    );
  }

  const slotted = item.parse_status === 'slotted';
  const fieldRows: Array<[string, string | null]> = [
    [t('inbox.tripmail.type', { defaultValue: 'Type' }), item.parsed_type],
    [t('inbox.tripmail.vendor', { defaultValue: 'Vendor' }), item.parsed_vendor],
    [t('inbox.tripmail.title', { defaultValue: 'Title' }), item.parsed_title],
    [
      t('inbox.tripmail.dates', { defaultValue: 'Dates' }),
      [item.parsed_start_at, item.parsed_end_at]
        .filter(Boolean)
        .map((d) => new Date(d as string).toLocaleDateString())
        .join(' → ') || null,
    ],
    [t('inbox.tripmail.location', { defaultValue: 'Location' }), item.parsed_location],
    [
      t('inbox.tripmail.price', { defaultValue: 'Price' }),
      item.parsed_price != null
        ? `${item.parsed_price} ${item.parsed_currency ?? ''}`.trim()
        : null,
    ],
    [
      t('inbox.tripmail.confirmation', { defaultValue: 'Confirmation' }),
      item.parsed_confirmation,
    ],
  ];

  const handleSend = () => {
    const message = draft.trim();
    if (!message || send.isPending) return;
    setDraft('');
    send.mutate(message, {
      onError: () =>
        toast({
          title: t('inbox.tripmail.sendFailed', { defaultValue: "Couldn't send that" }),
          variant: 'destructive',
        }),
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="truncate text-sm font-semibold">
            {item.parsed_title || item.raw_subject ||
              t('inbox.tripmail.fallbackTitle', { defaultValue: 'Forwarded email' })}
          </p>
        </div>
        {item.raw_from && (
          <p className="truncate text-2xs text-muted-foreground">{item.raw_from}</p>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          {/* Parsed-fields card — live-updates as the assistant revises. */}
          <div className="rounded-element border border-border p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-13 font-semibold uppercase tracking-wider text-muted-foreground">
                {t('inbox.tripmail.extracted', { defaultValue: 'Extracted booking' })}
              </p>
              {slotted && (
                <span className="inline-flex items-center gap-1 rounded-badge bg-foreground px-1.5 py-0.5 text-2xs font-semibold text-background">
                  <Check className="h-3 w-3" aria-hidden />
                  {t('inbox.tripmail.filed', { defaultValue: 'Filed' })}
                </span>
              )}
            </div>
            <dl className="flex flex-col gap-1">
              {fieldRows
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-sm">
                    <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 break-words">{v}</dd>
                  </div>
                ))}
            </dl>
            {!slotted && item.parse_status !== 'dismissed' && (
              <div className="mt-4 flex items-center gap-2">
                <Button size="sm" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                  <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                  {t('inbox.tripmail.confirm', { defaultValue: 'Add to trip' })}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismiss.mutate()}
                  disabled={dismiss.isPending}
                >
                  <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                  {t('inbox.tripmail.dismiss', { defaultValue: 'Dismiss' })}
                </Button>
              </div>
            )}
            {slotted && (
              <LocalizedLink
                to={`/trips/${item.trip_id}`}
                className="mt-4 inline-flex items-center gap-1 text-13 underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                {t('inbox.tripmail.openTrip', { defaultValue: 'Open trip' })}
              </LocalizedLink>
            )}
          </div>

          {/* Chat turns */}
          {turns.length === 0 && (
            <p className="text-center text-13 text-muted-foreground">
              {t('inbox.tripmail.intro', {
                defaultValue:
                  'Something off in the extracted details? Tell me and I’ll fix it — e.g. “check-in is actually the 12th”.',
              })}
            </p>
          )}
          {turns.map((turn) => (
            <div
              key={turn.id}
              className={cn(
                'max-w-[85%] rounded-element border px-4 py-2 text-sm',
                turn.role === 'user'
                  ? 'self-end border-foreground bg-foreground text-background'
                  : 'self-start border-border',
              )}
            >
              <p className="whitespace-pre-wrap break-words">{turn.content}</p>
            </div>
          ))}
          {send.isPending && (
            <div className="flex items-center gap-2 self-start text-13 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t('inbox.tripmail.thinking', { defaultValue: 'Checking the email…' })}
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Composer */}
      <div className="flex items-center gap-2 border-t p-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={t('inbox.tripmail.placeholder', {
            defaultValue: 'Correct a detail or ask about this booking…',
          })}
          className="h-9 rounded-element"
          disabled={send.isPending}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!draft.trim() || send.isPending}
          aria-label={t('inbox.tripmail.send', { defaultValue: 'Send' })}
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
