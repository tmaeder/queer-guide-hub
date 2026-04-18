import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import { Sparkles, Check, Send, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useTripMutations, type TripWithDetails } from '@/hooks/useTrips';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: { xs: 520, md: 640 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Sparkles size={18} style={{ color: 'var(--primary)' }} />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {t('trips.ai.conciergeTitle', 'AI concierge')}
        </Typography>
      </Box>
      <Typography color="text.secondary" sx={{ fontSize: '0.875rem', mb: 2 }}>
        {t(
          'trips.ai.conciergeHint',
          'Ask anything about this trip — the concierge remembers the conversation and can propose places you can apply with one click.',
        )}
      </Typography>

      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          pr: 1,
          mb: 2,
        }}
      >
        {isLoading && (
          <Box sx={{ py: 2, textAlign: 'center', color: 'text.secondary' }}>
            <CircularProgress size={16} />
          </Box>
        )}

        {!isLoading && (!messages || messages.length === 0) && (
          <Box sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
            {t(
              'trips.ai.startHint',
              'Try: "5 days of queer Lisbon under €1500, more nightlife than daytime, at least one sober option".',
            )}
          </Box>
        )}

        {(messages ?? []).map((m) => {
          const mine = m.role === 'user';
          const draft = m.draft;
          const placeCount =
            draft?.days.reduce((sum, d) => sum + d.places.length, 0) ?? 0;
          return (
            <Box
              key={m.id}
              sx={{
                display: 'flex',
                flexDirection: mine ? 'row-reverse' : 'row',
              }}
            >
              <Box
                sx={{
                  maxWidth: '85%',
                  p: 1.25,
                  bgcolor: mine ? 'primary.main' : 'action.hover',
                  color: mine ? 'primary.contrastText' : 'text.primary',
                }}
              >
                <Typography sx={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                  {m.content}
                </Typography>

                {!mine && draft && draft.days.length > 0 && (
                  <Box sx={{ mt: 1.25, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {t('trips.ai.draftTitle', 'Proposed itinerary')}
                      </Typography>
                      <Chip
                        size="small"
                        label={t('trips.ai.draftCount', {
                          count: placeCount,
                          defaultValue: '{{count}} places',
                        })}
                      />
                    </Box>
                    {draft.days.map((day) => (
                      <Card key={day.date} variant="outlined">
                        <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>
                            {day.date}
                            {!tripDayByDate.has(day.date) && (
                              <Chip
                                size="small"
                                label={t('trips.ai.outsideDates', 'out of range')}
                                sx={{ ml: 1 }}
                                icon={<Info size={12} />}
                              />
                            )}
                          </Typography>
                          <Box component="ul" sx={{ pl: 2, m: 0, mt: 0.5 }}>
                            {day.places.map((p, i) => (
                              <Box component="li" key={i} sx={{ fontSize: '0.8125rem' }}>
                                {p.custom_name ?? p.venue_id ?? p.event_id ?? '—'}
                                {p.notes && (
                                  <Typography
                                    component="span"
                                    sx={{
                                      color: 'text.secondary',
                                      ml: 1,
                                      fontSize: '0.75rem',
                                    }}
                                  >
                                    — {p.notes}
                                  </Typography>
                                )}
                              </Box>
                            ))}
                          </Box>
                        </CardContent>
                      </Card>
                    ))}
                    <Box>
                      <Button
                        variant="brand"
                        onClick={() => applyDraft(m, draft)}
                        disabled={applyingId === m.id}
                      >
                        {applyingId === m.id ? (
                          <CircularProgress size={14} sx={{ color: 'currentColor', mr: 1 }} />
                        ) : (
                          <Check size={14} style={{ marginRight: 6 }} />
                        )}
                        {t('trips.ai.apply', 'Apply to trip')}
                      </Button>
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          );
        })}

        {send.isPending && (
          <Box sx={{ display: 'flex' }}>
            <Box
              sx={{
                p: 1.25,
                bgcolor: 'action.hover',
                color: 'text.secondary',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <CircularProgress size={12} />
              {t('trips.ai.thinking', 'Concierge is thinking…')}
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
        <TextField
          multiline
          maxRows={5}
          fullWidth
          placeholder={t(
            'trips.ai.inputPlaceholder',
            'Ask the concierge anything about this trip…',
          )}
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 2000))}
          onKeyDown={onKeyDown}
          disabled={send.isPending}
          size="small"
        />
        <Button
          variant="brand"
          onClick={onSend}
          disabled={!input.trim() || send.isPending}
          aria-label={t('trips.ai.send', 'Send')}
        >
          <Send size={14} />
        </Button>
      </Box>
    </Box>
  );
}
