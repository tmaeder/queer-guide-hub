import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import { Sparkles, Check, X, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTripMutations, type TripWithDetails } from '@/hooks/useTrips';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface DraftPlace {
  venue_id?: string;
  event_id?: string;
  custom_name?: string;
  notes?: string;
}
interface DraftDay {
  date: string;
  places: DraftPlace[];
}
interface AiDraft {
  days: DraftDay[];
}
interface AiDraftResponse {
  draft: AiDraft;
  candidates_used: number;
  note?: string;
}

interface Props {
  trip: TripWithDetails;
}

/**
 * AI Plan tab.
 *
 * Calls the `ai-plan-trip` edge function with the user's prompt, displays
 * the proposed itinerary as a diff against the current one, and applies
 * accepted days via the standard `addPlace` mutation. Generation is
 * stateless — each prompt is a fresh draft.
 */
export function AiPlanTab({ trip }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { addPlace } = useTripMutations();

  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [applying, setApplying] = useState(false);

  const tripDayByDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of trip.trip_days) m.set(d.date, d.id);
    return m;
  }, [trip.trip_days]);

  const generate = useMutation({
    mutationFn: async (p: string): Promise<AiDraftResponse> => {
      const { data, error } = await supabase.functions.invoke('ai-plan-trip', {
        body: { trip_id: trip.id, prompt: p },
      });
      if (error) throw error;
      return data as AiDraftResponse;
    },
    onSuccess: (res) => {
      setDraft(res.draft);
      if (!res.draft.days.length) {
        toast({
          title: t('trips.ai.emptyTitle', 'No draft produced'),
          description: res.note ?? t('trips.ai.emptyHint', 'Try a more specific prompt or add dates to the trip.'),
        });
      }
    },
    onError: (err) =>
      toast({
        title: t('trips.ai.errorTitle', 'AI plan failed'),
        description: String(err),
        variant: 'destructive',
      }),
  });

  const apply = async () => {
    if (!draft || !user) return;
    setApplying(true);
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
      setDraft(null);
      setPrompt('');
      void queryClient.invalidateQueries({ queryKey: ['trip', trip.id] });
    } catch (err) {
      toast({
        title: t('trips.ai.applyFailedTitle', 'Apply failed'),
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const discard = () => {
    setDraft(null);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Sparkles size={18} style={{ color: 'var(--primary)' }} />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {t('trips.ai.title', 'AI plan')}
        </Typography>
      </Box>
      <Typography color="text.secondary" sx={{ fontSize: '0.875rem' }}>
        {t(
          'trips.ai.hint',
          'Describe the trip you want and AI will draft a day-by-day itinerary from QG-vetted venues and events. You review before anything is added.',
        )}
      </Typography>

      <TextField
        multiline
        minRows={3}
        maxRows={6}
        placeholder={t(
          'trips.ai.placeholder',
          '5 days of queer Lisbon under €1500, more nightlife than daytime, at least one sober option',
        )}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
        fullWidth
        disabled={generate.isPending}
      />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="brand"
          disabled={!prompt.trim() || generate.isPending}
          onClick={() => generate.mutate(prompt.trim())}
        >
          {generate.isPending ? (
            <>
              <CircularProgress size={14} sx={{ color: 'currentColor', mr: 1 }} />
              {t('trips.ai.generating', 'Drafting…')}
            </>
          ) : (
            <>
              <Sparkles size={14} style={{ marginRight: 6 }} />
              {t('trips.ai.generate', 'Draft itinerary')}
            </>
          )}
        </Button>
      </Box>

      {draft && draft.days.length > 0 && (
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {t('trips.ai.draftTitle', 'Proposed itinerary')}
            </Typography>
            <Chip
              label={t('trips.ai.draftCount', {
                count: draft.days.reduce((sum, d) => sum + d.places.length, 0),
                defaultValue: '{{count}} places',
              })}
              size="small"
            />
          </Box>

          {draft.days.map((day) => (
            <Card key={day.date}>
              <CardContent>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
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
                <Box component="ul" sx={{ pl: 2, m: 0 }}>
                  {day.places.map((p, i) => (
                    <Box component="li" key={i} sx={{ fontSize: '0.875rem' }}>
                      {p.custom_name ?? p.venue_id ?? p.event_id ?? '—'}
                      {p.notes && (
                        <Typography
                          component="span"
                          sx={{ color: 'text.secondary', ml: 1, fontSize: '0.8125rem' }}
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

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="brand" onClick={apply} disabled={applying}>
              {applying ? (
                <CircularProgress size={14} sx={{ color: 'currentColor', mr: 1 }} />
              ) : (
                <Check size={14} style={{ marginRight: 6 }} />
              )}
              {t('trips.ai.apply', 'Apply to trip')}
            </Button>
            <Button variant="outline" onClick={discard} disabled={applying}>
              <X size={14} style={{ marginRight: 6 }} />
              {t('trips.ai.discard', 'Discard')}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}
