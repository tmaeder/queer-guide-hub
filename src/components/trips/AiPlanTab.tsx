import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Check, Send, Info, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useTripMutations, type TripWithDetails } from '@/hooks/useTrips';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  useTripConcierge,
  useSendConciergeMessage,
  type ConciergeDraft,
  type ConciergeMessage,
} from '@/hooks/useTripConcierge';

interface Props {
  trip: TripWithDetails;
}

/**
 * AI concierge — multi-turn conversational planner.
 *
 * Replaces the previous one-shot "draft itinerary" UI: the thread is
 * persisted in `trip_concierge_messages`, so refining ("add a sober
 * brunch", "move museum to Tuesday") happens over many turns and
 * survives reloads. Assistant turns may carry a structured draft the
 * user can apply with one click.
 */
export function AiPlanTab({ trip }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { addPlace } = useTripMutations();

  const { data: messages, isLoading } = useTripConcierge(trip.id);
  const send = useSendConciergeMessage(trip.id);

  const [input, setInput] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const tripDayByDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of trip.trip_days) m.set(d.date, d.id);
    return m;
  }, [trip.trip_days]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length, send.isPending]);

  const onSend = () => {
    const text = input.trim();
    if (!text || send.isPending) return;
    send.mutate(text, {
      onSuccess: () => setInput(''),
      onError: (err) =>
        toast({
          title: t('trips.ai.errorTitle', 'Concierge failed'),
          description: String(err),
          variant: 'destructive',
        }),
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const applyDraft = async (msg: ConciergeMessage, draft: ConciergeDraft) => {
    if (!user) return;
    setApplyingId(msg.id);
    try {
      for (const day of draft.days) {
        const dayId = tripDayByDate.get(day.date) ?? null;
        let sortOrder = 1000;
        for (const p of day.places) {
          await addPlace.mutateAsync({
            trip_id: trip.id,
            day_id: dayId,
            venue_id: p.venue_id ?? null,
            event_id: p.event_id ?? null,
            hotel_id: null,
            custom_name: p.custom_name ?? null,
            custom_address: null,
            latitude: null,
            longitude: null,
            city_id: null,
            country_id: null,
            start_time: null,
            end_time: null,
            duration_minutes: null,
            notes: p.notes ?? null,
            category: null,
            sort_order: sortOrder,
            created_by: user.id,
          });
          sortOrder += 10;
        }
      }
      toast({ title: t('trips.ai.applied', 'Itinerary applied') });
      void queryClient.invalidateQueries({ queryKey: ['trip', trip.id] });
    } catch (err) {
      toast({
        title: t('trips.ai.applyFailedTitle', 'Apply failed'),
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="flex flex-col h-[520px] md:h-[640px]">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={18} style={{ color: 'var(--primary)' }} />
        <h6 className="font-bold text-lg">
          {t('trips.ai.conciergeTitle', 'AI concierge')}
        </h6>
      </div>
      <p className="text-sm mb-4 text-muted-foreground">
        {t(
          'trips.ai.conciergeHint',
          'Ask anything about this trip — the concierge remembers the conversation and can propose places you can apply with one click.',
        )}
      </p>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto flex flex-col gap-3 pr-2 mb-4"
      >
        {isLoading && (
          <div className="py-4 text-center text-muted-foreground">
            <Loader2 size={16} className="animate-spin inline" />
          </div>
        )}

        {!isLoading && (!messages || messages.length === 0) && (
          <div className="text-sm text-muted-foreground">
            {t(
              'trips.ai.startHint',
              'Try: "5 days of queer Lisbon under €1500, more nightlife than daytime, at least one sober option".',
            )}
          </div>
        )}

        {(messages ?? []).map((m) => {
          const mine = m.role === 'user';
          const draft = m.draft;
          const placeCount =
            draft?.days.reduce((sum, d) => sum + d.places.length, 0) ?? 0;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`max-w-[85%] p-3 ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}
              >
                <p className="text-sm whitespace-pre-wrap">
                  {m.content}
                </p>

                {!mine && draft && draft.days.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">
                        {t('trips.ai.draftTitle', 'Proposed itinerary')}
                      </span>
                      <Badge variant="secondary">
                        {t('trips.ai.draftCount', {
                          count: placeCount,
                          defaultValue: '{{count}} places',
                        })}
                      </Badge>
                    </div>
                    {draft.days.map((day) => (
                      <Card key={day.date} className="border border-border">
                        <CardContent className="p-3">
                          <span className="text-xs font-bold flex items-center gap-2">
                            {day.date}
                            {!tripDayByDate.has(day.date) && (
                              <Badge variant="secondary" className="ml-1 inline-flex items-center gap-1">
                                <Info size={12} />
                                {t('trips.ai.outsideDates', 'out of range')}
                              </Badge>
                            )}
                          </span>
                          <ul className="pl-4 m-0 mt-1 list-disc">
                            {day.places.map((p, i) => (
                              <li key={i} className="text-[0.8125rem]">
                                {p.custom_name ?? p.venue_id ?? p.event_id ?? '—'}
                                {p.notes && (
                                  <span className="text-muted-foreground ml-2 text-xs">
                                    — {p.notes}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    ))}
                    <div>
                      <Button
                        variant="brand"
                        onClick={() => applyDraft(m, draft)}
                        disabled={applyingId === m.id}
                      >
                        {applyingId === m.id ? (
                          <Loader2 size={14} className="animate-spin mr-1.5" />
                        ) : (
                          <Check size={14} style={{ marginRight: 6 }} />
                        )}
                        {t('trips.ai.apply', 'Apply to trip')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {send.isPending && (
          <div className="flex">
            <div className="p-3 bg-muted text-muted-foreground text-sm flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              {t('trips.ai.thinking', 'Concierge is thinking…')}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 items-end">
        <Textarea
          rows={1}
          placeholder={t(
            'trips.ai.inputPlaceholder',
            'Ask the concierge anything about this trip…',
          )}
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 2000))}
          onKeyDown={onKeyDown}
          disabled={send.isPending}
          className="flex-1 min-h-[40px] max-h-[120px]"
        />
        <Button
          variant="brand"
          onClick={onSend}
          disabled={!input.trim() || send.isPending}
          aria-label={t('trips.ai.send', 'Send')}
        >
          <Send size={14} />
        </Button>
      </div>
    </div>
  );
}
