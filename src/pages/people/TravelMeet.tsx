import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bell, CalendarDays, ShieldCheck } from '@/components/icons';
import { MeetupActivities } from '@/components/meet/MeetupActivities';
import { MeetPageLayout } from '@/components/meet/MeetPageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import {
  CityCountryAutocomplete,
  type GeoSelection,
} from '@/components/trips/create/CityCountryAutocomplete';
import { MeetOpportunities } from '@/components/meet/MeetOpportunities';
import { TravelMeetCard } from '@/components/travel-meet/TravelMeetCard';
import {
  TravelMeetComposer,
  type TravelMeetDraft,
} from '@/components/travel-meet/TravelMeetComposer';
import { useAuth } from '@/hooks/useAuth';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';
import { useMeta } from '@/hooks/useMeta';
import { useCurrentLocale, useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTravelMeet, useTravelMeetSeed, type TravelMeetAction } from '@/hooks/useTravelMeet';
import { useTrips } from '@/hooks/useTrips';
import { useEventsQuery } from '@/hooks/useEvents';
import { useTripSafety } from '@/hooks/useTripSafety';
import {
  localToday,
  formatMeetDates,
  readTravelMeetContext,
  travelMeetHref,
  TRAVEL_ACTIVITIES,
  validTravelDates,
  travelConnectionsAllowed,
  type TravelMeetContext,
} from '@/lib/travelMeet';
import { trackConsentedEvent } from '@/utils/consentedAnalytics';

const DRAFT_KEY = 'qg-travel-meet-draft';
function readDraft(context: TravelMeetContext): TravelMeetDraft | undefined {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
    if (
      !saved ||
      Date.now() - saved.savedAt > 30 * 60_000 ||
      saved.context !== travelMeetHref(context)
    )
      return undefined;
    if (
      typeof saved.draft?.title !== 'string' ||
      typeof saved.draft?.description !== 'string' ||
      !TRAVEL_ACTIVITIES.includes(saved.draft?.activity) ||
      !['local', 'traveller'].includes(saved.draft?.hostKind)
    )
      return undefined;
    return saved.draft;
  } catch {
    return undefined;
  }
}

export default function TravelMeet({ resolvedCityId }: { resolvedCityId?: string } = {}) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  useMeta({
    title: t('meetCompany.metaTitle', 'Meet queer people through shared plans'),
    description: t(
      'travelMeet.metaDescription',
      'Find queer travellers and locals for coffee, culture, a walk or an event. Make a small plan together.',
    ),
    canonicalPath: '/meet',
  });
  return (
    <TravelMeetExperience
      key={`${params.toString()}-${resolvedCityId ?? ''}`}
      resolvedCityId={resolvedCityId}
    />
  );
}

export function TravelMeetExperience({ resolvedCityId }: { resolvedCityId?: string } = {}) {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const age = useAgeAffirmation();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useLocalizedNavigate();
  const locale = useCurrentLocale();
  const client = useQueryClient();
  const context = {
    ...readTravelMeetContext(params),
    ...(resolvedCityId ? { cityId: resolvedCityId } : {}),
  };
  const seed = useTravelMeetSeed(context);
  const today = localToday();
  const upcoming = new Date(`${today}T12:00:00`);
  upcoming.setDate(upcoming.getDate() + 13);
  const effective: TravelMeetContext = {
    ...context,
    cityId: context.cityId || seed.data?.geo.cityId || '',
    start: context.start || seed.data?.start || today,
    end: context.end || seed.data?.end || context.start || seed.data?.start || localToday(upcoming),
  };
  const [geoEdit, setGeoEdit] = useState<GeoSelection | null | undefined>();
  const [startEdit, setStartEdit] = useState<string>();
  const [endEdit, setEndEdit] = useState<string>();
  const [activityEdit, setActivityEdit] = useState(effective.activity);
  const geo = geoEdit === undefined ? (seed.data?.geo ?? null) : geoEdit;
  const start = startEdit ?? effective.start;
  const end = endEdit ?? effective.end;
  const ready =
    !!effective.cityId &&
    !!seed.data?.geo.cityId &&
    !seed.isLoading &&
    !seed.isError &&
    validTravelDates(effective.start, effective.end);
  const composerTrigger = useRef<HTMLButtonElement | null>(null);
  const [composing, setComposing] = useState(params.get('compose') === '1');
  const [draft] = useState(() => readDraft(context));
  const [eventChoice, setEventChoice] = useState<{ id: string; title: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const results = useTravelMeet(effective);
  const trips = useTrips();
  const safety = useTripSafety(seed.data?.geo.countryId ? [seed.data.geo.countryId] : []);
  const publicRestricted = safety.status === 'ready' && !travelConnectionsAllowed(safety);
  const restricted = publicRestricted || (!!user && ready && results.data?.allowed === false);
  const events = useEventsQuery(
    ready && !restricted
      ? {
          cityId: effective.cityId,
          dateRange: { start: `${effective.start}T00:00:00`, end: `${effective.end}T23:59:59` },
          limit: 16,
        }
      : null,
  );
  const publicEvents = events.events
    .filter(
      (event) =>
        event.is_public &&
        (!['18+', '21+'].includes(event.age_restriction ?? '') || (age.affirmed && !age.checking)),
    )
    .slice(0, 4);
  const ownTrips = (trips.data ?? []).filter(
    (trip) =>
      trip.owner_id === user?.id &&
      ['planning', 'active'].includes(trip.status) &&
      trip.primary_city_id,
  );
  const editing =
    geoEdit !== undefined ||
    startEdit !== undefined ||
    endEdit !== undefined ||
    activityEdit !== effective.activity;
  const busy = results.action.isPending;
  const eventId = eventChoice?.id ?? effective.eventId;
  const eventTitle = eventChoice?.title ?? seed.data?.title;
  useEffect(() => {
    if (composing) {
      document.getElementById('travel-meet-compose-heading')?.focus({ preventScroll: true });
      document.getElementById('travel-meet-composer')?.scrollIntoView({ block: 'start' });
    }
  }, [composing, eventId]);
  const closeComposer = () => {
    setComposing(false);
    (composerTrigger.current ?? document.getElementById('meet-open-composer'))?.focus();
  };
  const signIn = (returnContext = effective, compose = false) => {
    const href = travelMeetHref(returnContext);
    const returnPath =
      location.pathname.replace(/\/meet\/travel$/, '/meet') +
      href.slice('/meet'.length) +
      (compose ? `${href.includes('?') ? '&' : '?'}compose=1` : '');
    navigate(`/auth?redirect=${encodeURIComponent(returnPath)}`);
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    if (!geo || !validTravelDates(start, end)) {
      setFormError(
        t('travelMeet.dateError', 'Choose a destination and future dates within a 31-day window.'),
      );
      return;
    }
    const preserveTrip =
      geo.cityId === effective.cityId && start >= effective.start && end <= effective.end;
    const next = {
      cityId: geo.cityId,
      start,
      end,
      activity: activityEdit,
      tripId: preserveTrip ? context.tripId : '',
      eventId: geo.cityId === effective.cityId ? context.eventId : '',
    };
    const nextParams = new URLSearchParams(travelMeetHref(next).split('?')[1]);
    if ((e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'compose') {
      nextParams.set('compose', '1');
      setComposing(true);
    }
    setParams(nextParams);
    trackConsentedEvent('travel_meet_search', { surface: 'meet_travel' });
  };
  const act = async (action: TravelMeetAction, data: Record<string, unknown>) => {
    setNotice('');
    results.action.reset();
    try {
      const response = await results.action.mutateAsync({ action, data });
      if (action === 'accept' && response?.conversation_id)
        navigate(`/messages?conversation=${response.conversation_id}`);
      else
        setNotice(
          action === 'request'
            ? t('travelMeet.requestSent', 'Request sent. The host will decide whether to connect.')
            : t('meetCompany.updated', 'Your invitation has been updated.'),
        );
      return true;
    } catch {
      return false;
    }
  };
  const publish = async (values: TravelMeetDraft) => {
    if (!ready || editing) {
      setFormError(
        t('travelMeet.applyFirst', 'Find plans for your destination and dates before publishing.'),
      );
      return;
    }
    if (!user) {
      const next = { ...effective, eventId };
      try {
        sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ draft: values, context: travelMeetHref(next), savedAt: Date.now() }),
        );
      } catch {
        /* The return URL still preserves destination/dates. */
      }
      signIn(next, true);
      return;
    }
    const saved = await act('create', {
      city_id: effective.cityId,
      start_date: effective.start,
      end_date: effective.end,
      trip_id: effective.tripId || null,
      event_id: eventId || null,
      title: values.title,
      description: values.description,
      activity: values.activity,
      host_kind: values.hostKind,
    });
    if (saved) {
      closeComposer();
      setEventChoice(null);
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* Optional draft storage. */
      }
    }
  };
  const eventsParams = new URLSearchParams({
    city: seed.data?.geo.cityName ?? '',
    from: effective.start,
    to: effective.end,
  });

  return (
    <MeetPageLayout
      title={t('meetCompany.heading', 'Find queer company.')}
      description={t(
        'meetCompany.lede',
        'A coffee, a walk, a night out. Find someone to share it with.',
      )}
      actions={
        ready && !restricted ? (
          <Button
            type="submit"
            form="meet-search"
            name="intent"
            value="compose"
            id="meet-open-composer"
          >
            {t('meetCompany.suggest', 'Suggest a meetup')}
            <ArrowRight size={16} aria-hidden />
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-8">
        <form
          id="meet-search"
          onSubmit={search}
          className="min-w-0 space-y-4 pb-6"
          aria-label={t('meetCompany.searchLabel', 'Find company')}
        >
          <MeetupActivities value={activityEdit} onChange={setActivityEdit} />
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
            <div className="min-w-0 sm:col-span-2 lg:col-span-1">
              <CityCountryAutocomplete
                id="meet-city"
                label={t('meetCompany.where', 'Where?')}
                value={geo}
                onChange={setGeoEdit}
                required
              />
            </div>
            <details className="min-w-0 open:col-span-full" open={composing || undefined}>
              <summary className="min-h-11 cursor-pointer py-2 text-sm underline underline-offset-4">
                {startEdit !== undefined ||
                endEdit !== undefined ||
                params.has('start') ||
                params.has('end') ||
                context.tripId ||
                context.eventId
                  ? formatMeetDates(start, end, locale)
                  : t('meetCompany.nextWeeks', 'Next two weeks · change dates')}
              </summary>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="meet-start">{t('travelMeet.from', 'From')}</Label>
                  <Input
                    id="meet-start"
                    type="date"
                    min={today}
                    required
                    value={start}
                    onChange={(e) => setStartEdit(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meet-end">{t('travelMeet.until', 'Until')}</Label>
                  <Input
                    id="meet-end"
                    type="date"
                    min={start || today}
                    required
                    value={end}
                    onChange={(e) => setEndEdit(e.target.value)}
                  />
                </div>
              </div>
            </details>
            <Button type="submit" variant={ready ? 'outline' : 'default'} className="gap-2">
              {t('meetCompany.find', 'Find meetups')}
              <ArrowRight size={16} aria-hidden />
            </Button>
          </div>
          {user && ownTrips.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm underline underline-offset-4">
                {t('travelMeet.useTrip', 'Use one of your trips')}
              </summary>
              <div className="max-w-md space-y-2">
                <Label htmlFor="meet-existing-trip">
                  {t('travelMeet.useTrip', 'Use one of your trips')}
                </Label>
                <select
                  id="meet-existing-trip"
                  value={context.tripId}
                  className="min-h-11 w-full rounded-element border border-input bg-background px-4"
                  onChange={(e) => {
                    if (e.target.value) navigate(travelMeetHref({ tripId: e.target.value }));
                  }}
                >
                  <option value="">{t('travelMeet.chooseTrip', 'Choose a trip (optional)')}</option>
                  {ownTrips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.title}
                    </option>
                  ))}
                </select>
              </div>
            </details>
          )}
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
            {t(
              'travelMeet.privateBrowse',
              'Browsing keeps you private. Only an invitation you choose to publish is shared with members.',
            )}
          </p>
          {formError && (
            <p role="alert" className="text-destructive">
              {formError}
            </p>
          )}
          {seed.isLoading && (
            <p role="status">{t('travelMeet.loadingContext', 'Loading your destination…')}</p>
          )}
          {(seed.isError || (!!context.cityId && !seed.isLoading && !seed.data)) && (
            <p role="alert">
              {t(
                'travelMeet.contextError',
                'We could not load this trip or destination. Choose a destination above to continue.',
              )}{' '}
              <Button type="button" variant="ghost" onClick={() => void seed.refetch()}>
                {t('travelMeet.retry', 'Try again')}
              </Button>
            </p>
          )}
        </form>

        {notice && (
          <p role="status" className="rounded-element bg-surface-container p-4">
            {notice}
          </p>
        )}
        {results.action.isError && (
          <p role="alert" className="text-destructive">
            {results.action.error.message}
          </p>
        )}
        {authLoading ? (
          <p role="status">{t('travelMeet.loading', 'Loading invitations…')}</p>
        ) : (
          <>
            {restricted ? (
              <section className="space-y-4">
                <h2 className="text-xl font-semibold">
                  {t('meetCompany.restricted', 'Meetups are unavailable for this destination')}
                </h2>
                <p className="max-w-reading text-muted-foreground">
                  {t(
                    'travelMeet.restrictedBody',
                    'We limit travel connections where legal conditions could expose LGBTQ+ travellers or where the legal position is unknown. Your private trip planner is still available.',
                  )}
                </p>
                <LocalizedLink to="/rights" className="underline underline-offset-4">
                  {t('travelMeet.reviewRights', 'Review destination rights')}
                </LocalizedLink>
              </section>
            ) : (
              ready && (
                <section
                  className="space-y-6"
                  aria-label={t('meetCompany.results', 'Meetups to join')}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="text-xl font-semibold">
                      {t('meetCompany.results', 'Meetups to join')}
                    </h2>
                  </div>
                  {!user && !composing && (
                    <div className="flex flex-wrap items-center justify-between gap-4 border-y border-border-hairline py-4 text-sm">
                      <p className="max-w-reading">
                        {t('meetCompany.signInHelp', 'Sign in to see invitations and ask to join.')}
                      </p>
                      <Button variant="outline" onClick={() => signIn()}>
                        {t('travelMeet.signIn', 'Sign in to see invitations')}
                      </Button>
                    </div>
                  )}
                  {user && results.isLoading && (
                    <p role="status">{t('travelMeet.loading', 'Loading invitations…')}</p>
                  )}
                  {user && results.isError && (
                    <div role="alert" className="space-y-4">
                      <p>
                        {t(
                          'travelMeet.loadError',
                          'We could not load invitations. Please try again.',
                        )}
                      </p>
                      <Button variant="outline" onClick={() => void results.refetch()}>
                        {t('travelMeet.retry', 'Try again')}
                      </Button>
                    </div>
                  )}
                  {user && results.isSuccess && results.data.plans.length === 0 && (
                    <div className="space-y-4 py-4">
                      <p className="text-title font-semibold">
                        {t('travelMeet.empty', 'No invitations overlap these dates yet.')}
                      </p>
                      <p className="max-w-reading text-muted-foreground">
                        {t(
                          'meetCompany.emptyHelp',
                          'Suggest a meetup, or browse events and groups below.',
                        )}
                      </p>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        className="gap-2"
                        onClick={() =>
                          void act(
                            results.data.alert_id ? 'remove_alert' : 'alert',
                            results.data.alert_id
                              ? { id: results.data.alert_id }
                              : {
                                  city_id: effective.cityId,
                                  start_date: effective.start,
                                  end_date: effective.end,
                                  activity: effective.activity,
                                },
                          )
                        }
                      >
                        <Bell size={16} aria-hidden />
                        {results.data.alert_id
                          ? t('travelMeet.removeAlert', 'Turn off match alert')
                          : t('travelMeet.saveAlert', 'Notify me in Messages when a plan matches')}
                      </Button>
                    </div>
                  )}
                  {user && results.isSuccess && results.data.plans.length > 0 && (
                    <div className="grid items-stretch gap-4 md:grid-cols-2">
                      {results.data.plans.map((plan) => (
                        <TravelMeetCard
                          key={plan.id}
                          plan={plan}
                          busy={busy}
                          act={(action, id) => void act(action, { id })}
                        />
                      ))}
                    </div>
                  )}
                  {user &&
                    results.isSuccess &&
                    results.data.alert_id &&
                    results.data.plans.length > 0 && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void act('remove_alert', { id: results.data.alert_id })}
                      >
                        {t('travelMeet.removeAlert', 'Turn off match alert')}
                      </Button>
                    )}
                  {composing && (
                    <div id="travel-meet-composer" className="scroll-mt-32 space-y-4">
                      {eventTitle && (
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <span>
                            {t('travelMeet.linkedEvent', 'Linked event')}: {eventTitle}
                          </span>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setEventChoice({ id: '', title: '' });
                            }}
                          >
                            {t('travelMeet.removeEvent', 'Remove event')}
                          </Button>
                        </div>
                      )}
                      <TravelMeetComposer
                        key={eventId || 'new'}
                        initial={
                          draft ?? {
                            title: eventTitle
                              ? `${eventTitle}: ${t('travelMeet.goTogether', 'go together?')}`
                              : '',
                            activity: eventId ? 'event' : effective.activity || 'coffee',
                          }
                        }
                        busy={busy}
                        signedIn={!!user}
                        onSubmit={(values) => void publish(values)}
                        onCancel={closeComposer}
                        summary={`${seed.data?.geo.cityName ?? ''} · ${formatMeetDates(effective.start, effective.end, locale)}`}
                      />
                    </div>
                  )}
                </section>
              )
            )}

            {user && results.data && results.data.own_plans.length > 0 && (
              <section aria-label={t('travelMeet.yours', 'Your invitations')} className="space-y-6">
                <h2 className="text-xl font-semibold">
                  {t('travelMeet.yours', 'Your invitations')}
                </h2>
                <ul className="m-0 list-none divide-y divide-border-hairline p-0">
                  {results.data.own_plans.map((plan) => (
                    <li key={plan.id} className="space-y-4 py-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                          <h3 className="text-title font-bold break-words">{plan.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {plan.city_name} ·{' '}
                            {formatMeetDates(plan.start_date, plan.end_date, locale)}
                          </p>
                          <p className="text-sm">
                            {plan.cancelled
                              ? t('travelMeet.cancelled', 'Cancelled')
                              : plan.expired
                                ? t('travelMeet.expired', 'Expired')
                                : !plan.allowed
                                  ? t('travelMeet.hidden', 'Hidden by destination safety settings')
                                  : t('travelMeet.shared', 'Shared with signed-in members')}
                          </p>
                        </div>
                        {!plan.cancelled && !plan.expired && (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => void act('cancel', { id: plan.id })}
                          >
                            {t('travelMeet.cancelInvitation', 'Cancel invitation')}
                          </Button>
                        )}
                      </div>
                      {plan.requests.length === 0 && !plan.cancelled && !plan.expired && (
                        <p className="text-sm text-muted-foreground">
                          {t(
                            'travelMeet.noRequests',
                            'No requests yet. You will receive an alert in Messages when someone asks to join.',
                          )}
                        </p>
                      )}
                      <ul className="m-0 list-none space-y-4 p-0">
                        {plan.requests.map((request) => (
                          <li
                            key={request.id}
                            className="flex flex-wrap items-center justify-between gap-4 rounded-element bg-surface-container p-4"
                          >
                            <LocalizedLink
                              className="font-semibold underline underline-offset-4"
                              to={`/user/${request.requester_id}`}
                            >
                              {request.display_name}
                            </LocalizedLink>
                            <div className="flex flex-wrap gap-2">
                              {request.status === 'pending' &&
                              !plan.cancelled &&
                              !plan.expired &&
                              plan.allowed ? (
                                <>
                                  <Button
                                    disabled={busy}
                                    onClick={() => void act('accept', { id: request.id })}
                                  >
                                    {t('travelMeet.accept', 'Accept and chat')}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => void act('decline', { id: request.id })}
                                  >
                                    {t('travelMeet.decline', 'Decline')}
                                  </Button>
                                </>
                              ) : request.status === 'accepted' && request.conversation_id ? (
                                <Button asChild variant="outline">
                                  <LocalizedLink
                                    className="no-underline"
                                    to={`/messages?conversation=${request.conversation_id}`}
                                  >
                                    {t('travelMeet.message', 'Open conversation')}
                                  </LocalizedLink>
                                </Button>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  {t(`travelMeet.requestStatus.${request.status}`, request.status)}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {ready && !restricted && (
              <section className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-xl font-semibold">
                    {t('travelMeet.events', 'Something to do together')}
                  </h2>
                  <LocalizedLink
                    className="underline underline-offset-4"
                    to={`/events?${eventsParams}`}
                  >
                    {t('travelMeet.allEvents', 'See events')}
                  </LocalizedLink>
                </div>
                {events.loading ? (
                  <p role="status">
                    {t('travelMeet.eventsLoading', 'Loading events for your dates…')}
                  </p>
                ) : events.error ? (
                  <p>
                    {t(
                      'travelMeet.eventsError',
                      'Event suggestions could not be loaded. You can still use the event directory.',
                    )}
                  </p>
                ) : publicEvents.length === 0 ? (
                  <p className="text-muted-foreground">
                    {t(
                      'meetCompany.eventsEmpty',
                      'No event suggestions for these dates. A coffee or a walk is a good place to start.',
                    )}
                  </p>
                ) : (
                  <ul className="m-0 list-none divide-y divide-border-hairline p-0">
                    {publicEvents.map((event) => (
                      <li
                        key={event.id}
                        className="flex flex-wrap items-center justify-between gap-4 py-4"
                      >
                        <div className="min-w-0 space-y-1">
                          <LocalizedLink
                            className="font-semibold underline underline-offset-4 break-words"
                            to={`/events/${event.slug}`}
                          >
                            {event.title}
                          </LocalizedLink>
                          <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CalendarDays size={14} aria-hidden />
                            {event.start_date && event.start_date.slice(0, 10) < effective.start
                              ? t('travelMeet.duringDates', 'Runs during your dates')
                              : event.start_date
                                ? formatMeetDates(
                                    event.start_date.slice(0, 10),
                                    event.start_date.slice(0, 10),
                                    locale,
                                  )
                                : null}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          disabled={editing}
                          onClick={(click) => {
                            composerTrigger.current = click.currentTarget;
                            setEventChoice({ id: event.id, title: event.title });
                            setComposing(true);
                          }}
                        >
                          {t('travelMeet.inviteEvent', 'Invite someone to this')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            {!ready && !seed.isLoading && (
              <p className="max-w-reading text-muted-foreground">
                {t(
                  'meetCompany.start',
                  'Choose a city to find company. Locals and visitors are welcome; no trip is needed.',
                )}
              </p>
            )}
            {!restricted &&
              (!ready || (results.isSuccess && results.data.plans.length === 0) || !user) && (
                <MeetOpportunities />
              )}
          </>
        )}
        {/* Reports can also block a user. Refresh discovery after returning from their profile/report flow. */}
        {user && (
          <Button
            className="self-start"
            variant="ghost"
            onClick={() => void client.invalidateQueries({ queryKey: ['travel-meet', user.id] })}
          >
            {t('travelMeet.refresh', 'Refresh invitations')}
          </Button>
        )}
      </div>
    </MeetPageLayout>
  );
}
