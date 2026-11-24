import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { supabase } from '@/integrations/supabase/client';
import { validTravelDates, type TravelMeetContext, type TravelActivity } from '@/lib/travelMeet';
import type { GeoSelection } from '@/components/trips/create/CityCountryAutocomplete';
import { trackConsentedEvent } from '@/utils/consentedAnalytics';

export interface TravelMeetRequest {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  conversation_id: string | null;
  display_name?: string;
  requester_id?: string;
}
export interface TravelMeetPlan {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  city_id: string;
  city_name: string;
  activity: TravelActivity;
  host_kind: 'traveller' | 'local';
  start_date: string;
  end_date: string;
  display_name: string;
  avatar_url: string | null;
  event_id: string | null;
  event_title: string | null;
  event_slug: string | null;
  request: TravelMeetRequest | null;
}
export interface OwnTravelMeetPlan extends Pick<
  TravelMeetPlan,
  'id' | 'title' | 'description' | 'city_name' | 'activity' | 'start_date' | 'end_date'
> {
  cancelled: boolean;
  expired: boolean;
  allowed: boolean;
  requests: TravelMeetRequest[];
}
export interface TravelMeetResults {
  allowed: boolean;
  plans: TravelMeetPlan[];
  own_plans: OwnTravelMeetPlan[];
  alert_id: string | null;
}
export type TravelMeetAction =
  'create' | 'request' | 'accept' | 'decline' | 'withdraw' | 'cancel' | 'alert' | 'remove_alert';

export function useTravelMeet(context: TravelMeetContext) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [
      'travel-meet',
      user?.id,
      context.cityId,
      context.start,
      context.end,
      context.activity,
    ],
    enabled: !!user && (!context.cityId || validTravelDates(context.start, context.end)),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await untypedRpc<TravelMeetResults>('travel_meet_list', {
        p_city: context.cityId || null,
        p_start: context.start || null,
        p_end: context.end || null,
        p_activity: context.activity,
      });
      if (error || !data)
        throw new Error('Travel invitations could not be loaded. Please try again.');
      return data;
    },
  });
  const action = useMutation({
    mutationFn: async ({
      action,
      data,
    }: {
      action: TravelMeetAction;
      data: Record<string, unknown>;
    }) => {
      const { data: result, error } = await untypedRpc<{
        id?: string;
        conversation_id?: string | null;
      }>('travel_meet_action', { p_action: action, p_data: data });
      if (error) {
        const message = error.message;
        throw new Error(
          message.includes('five active')
            ? t(
                'travelMeet.planLimit',
                'You can have five active invitations and publish ten per day.',
              )
            : message.includes('ten requests')
              ? t(
                  'travelMeet.requestLimit',
                  'You can send ten requests per day. Please try again tomorrow.',
                )
              : message.includes('ten active alerts')
                ? t(
                    'travelMeet.alertLimit',
                    'You can save ten active alerts. Turn one off before adding another.',
                  )
                : message.includes('expired') || message.includes('already resolved')
                  ? t(
                      'travelMeet.noLongerAvailable',
                      'This invitation or request is no longer available. Refresh to see the latest plans.',
                    )
                  : message.includes('unavailable for this')
                    ? t(
                        'travelMeet.safetyUnavailable',
                        'Travel connections are unavailable for this destination or trip.',
                      )
                    : message.includes('within your own active trip')
                      ? t(
                          'travelMeet.tripMismatch',
                          'Choose dates and a destination within your own active trip, or start a separate invitation.',
                        )
                      : message.includes('published event')
                        ? t(
                            'travelMeet.eventMismatch',
                            'Choose a published event that overlaps your destination and dates.',
                          )
                        : t(
                            'travelMeet.actionError',
                            'This action could not be completed. Refresh invitations and try again.',
                          ),
        );
      }
      return result;
    },
    onSuccess: (_result, variables) => {
      void client.invalidateQueries({ queryKey: ['travel-meet', user?.id] });
      // No destination, dates, user IDs or free text in behavioural analytics.
      trackConsentedEvent(`travel_meet_${variables.action}`, { surface: 'meet_travel' });
    },
  });
  return { ...query, action };
}

/** Resolve existing trip/event links through their existing RLS; only own trips prefill. */
export function useTravelMeetSeed(context: TravelMeetContext) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['travel-meet-seed', user?.id, context.tripId, context.eventId, context.cityId],
    enabled: !!context.cityId || !!context.eventId || (!!user && !!context.tripId),
    queryFn: async (): Promise<{
      geo: GeoSelection;
      start: string;
      end: string;
      title: string;
    } | null> => {
      let cityId = context.cityId;
      let start = '';
      let end = '';
      let title = '';
      if (context.tripId && user) {
        const { data, error } = await supabase
          .from('trips')
          .select('primary_city_id, start_date, end_date')
          .eq('id', context.tripId)
          .eq('owner_id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          cityId ||= data.primary_city_id ?? '';
          start = data.start_date ?? '';
          end = data.end_date ?? start;
        }
      }
      if (context.eventId) {
        const { data, error } = await supabase
          .from('events')
          .select('title, city_id, start_date, end_date')
          .eq('id', context.eventId)
          .eq('status', 'active')
          .eq('is_public', true)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          cityId ||= data.city_id ?? '';
          start = data.start_date?.slice(0, 10) ?? '';
          end = data.end_date?.slice(0, 10) ?? start;
          title = data.title;
        }
      }
      if (!cityId) return null;
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, country_id, timezone, countries(name, code)')
        .eq('id', cityId)
        .maybeSingle();
      if (error) throw error;
      if (!data || !data.country_id) return null;
      return {
        geo: {
          cityId: data.id,
          cityName: data.name,
          countryId: data.country_id,
          countryName: data.countries?.name ?? '',
          countryCode: data.countries?.code ?? null,
          timezone: data.timezone,
        },
        start,
        end,
        title,
      };
    },
  });
}
