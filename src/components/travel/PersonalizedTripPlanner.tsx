import { useMemo, useState, type FormEvent } from 'react';
import { addDays, format, isValid, parseISO } from 'date-fns';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarDays, Shield, Ticket } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { CityCountryAutocomplete } from '@/components/trips/create/CityCountryAutocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAccessibilityNeeds } from '@/hooks/useAccessibilityMatches';
import { useOptionalActiveTrip } from '@/hooks/useActiveTrip';
import { useAuth } from '@/hooks/useAuth';
import type { RightsCountry } from '@/hooks/useIntentData';
import { useItineraryPool } from '@/hooks/useItineraryPool';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTripMutations } from '@/hooks/useTrips';
import { useUserTravelPreferences } from '@/hooks/useUserTravelPreferences';
import { generateItinerary } from '@/lib/itinerary/generateItinerary';
import { VIBE_IDS } from '@/lib/lines/generateLine';
import {
  MAX_PLAN_ADULTS,
  MAX_PLAN_DAYS,
  PLAN_BUDGETS,
  PLAN_PACES,
  clearPlanPreview,
  planDays,
  readPlanPreview,
  selectedPlanStops,
  storePlanPreview,
  type PlanInputs,
} from '@/lib/trips/personalizedPlan';
import { hasAnyCriminalizationSignal, hasDeathPenalty } from '@/utils/equalityScore';

type Draft = Omit<PlanInputs, 'destination' | 'budget'> & {
  destination: PlanInputs['destination'] | null;
  budget: PlanInputs['budget'] | 'saved';
};

const INITIAL_DRAFT: Draft = {
  destination: null,
  startDate: '',
  endDate: '',
  adults: 1,
  budget: 'saved',
  pace: 'steady',
  vibe: null,
};

const selectClass =
  'min-h-11 w-full rounded-element border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function PersonalizedTripPlanner({ countries }: { countries?: RightsCountry[] }) {
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { data: preferences, isPending: preferencesLoading } = useUserTravelPreferences();
  const { data: accessibilityNeeds, isPending: needsLoading } = useAccessibilityNeeds();
  const { createTripWithStops } = useTripMutations();
  const activeTrip = useOptionalActiveTrip();
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  const [restored] = useState(readPlanPreview);
  const [draft, setDraft] = useState<Draft>(restored?.inputs ?? INITIAL_DRAFT);
  const [restoredPreview, setRestoredPreview] = useState(restored);
  const [request, setRequest] = useState<{
    inputs: PlanInputs;
    requestId: string;
    accessibilityNeeds: string[];
    seed: number;
  } | null>(null);
  const [excludedIds, setExcludedIds] = useState<string[]>(restored?.excludedIds ?? []);
  const [saveStarted, setSaveStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputs = request?.inputs;
  const {
    data: pool,
    isFetching,
    isError,
    refetch,
  } = useItineraryPool(
    inputs ? [inputs.destination.cityId] : [],
    inputs?.startDate ?? null,
    inputs?.endDate ?? null,
  );
  const generated = useMemo(() => {
    if (!request || !pool) return null;
    const { inputs, seed, accessibilityNeeds } = request;
    return generateItinerary(pool, {
      days: planDays(inputs.startDate, inputs.endDate, inputs.destination),
      vibe: inputs.vibe,
      pace: inputs.pace,
      budget: inputs.budget,
      accessibilityNeeds,
      group: inputs.adults === 1 ? 'solo' : 'group',
      seed,
    });
  }, [request, pool]);
  const preview =
    request && generated
      ? { inputs: request.inputs, days: generated.days, requestId: request.requestId, excludedIds }
      : restoredPreview && { ...restoredPreview, excludedIds };
  const country = countries?.find((entry) => entry.id === preview?.inputs.destination.countryId);
  const today = format(new Date(), 'yyyy-MM-dd');
  const start = parseISO(draft.startDate);
  const maxEnd = isValid(start)
    ? format(addDays(start, MAX_PLAN_DAYS - 1), 'yyyy-MM-dd')
    : undefined;
  const selectedCount = preview?.days.reduce(
    (count, day) =>
      count +
      day.slots.filter(({ candidate }) => candidate && !excludedIds.includes(candidate.id)).length,
    0,
  );

  function updateDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setRequest(null);
    setRestoredPreview(null);
    setError(null);
    clearPlanPreview();
  }

  function buildPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveStarted) return;
    const { destination, startDate, endDate, adults, budget, pace, vibe } = draft;
    if (!destination) {
      setError(t('pages.travel.personalized.destinationError'));
      return;
    }
    if (startDate < today || !planDays(startDate, endDate, destination).length) {
      setError(t('pages.travel.personalized.dateError', { max: MAX_PLAN_DAYS }));
      return;
    }
    if (!Number.isInteger(adults) || adults < 1 || adults > MAX_PLAN_ADULTS) {
      setError(t('pages.travel.personalized.partyError', { max: MAX_PLAN_ADULTS }));
      return;
    }
    setError(null);
    setRestoredPreview(null);
    setExcludedIds([]);
    setRequest({
      inputs: {
        destination,
        startDate,
        endDate,
        adults,
        budget: budget === 'saved' ? (preferences?.budget_tier ?? null) : budget,
        pace,
        vibe,
      },
      requestId: crypto.randomUUID(),
      accessibilityNeeds: accessibilityNeeds ?? [],
      seed: Math.floor(Math.random() * 1e9),
    });
  }

  async function savePreview() {
    if (!preview || authLoading || createTripWithStops.isPending) return;
    setError(null);
    if (!user) {
      if (!storePlanPreview(preview)) {
        setError(t('pages.travel.personalized.storageError'));
        return;
      }
      const params = new URLSearchParams(location.search);
      params.set('section', 'plan');
      const returnTo = `${location.pathname}?${params.toString()}#personalized-planner`;
      navigate(`/auth?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }

    const { inputs, requestId } = preview;
    if (inputs.startDate < today) {
      setError(t('pages.travel.personalized.dateError', { max: MAX_PLAN_DAYS }));
      return;
    }
    const { destination, startDate, endDate, adults, pace, vibe, budget } = inputs;
    setSaveStarted(true);
    try {
      const trip = await createTripWithStops.mutateAsync({
        requestId,
        trip: {
          title: t('pages.travel.personalized.tripTitle', { city: destination.cityName }),
          primary_city_id: destination.cityId,
          primary_country_id: destination.countryId,
          primary_city_name: destination.cityName,
          primary_country_code: destination.countryCode ?? undefined,
          timezone: destination.timezone ?? undefined,
          start_date: startDate,
          end_date: endDate,
          adult_count: adults,
          traveler_type: adults === 1 ? 'solo' : 'group',
          vibe_tags: [`vibe:${vibe ?? 'any'}`, `pace:${pace}`, `budget:${budget ?? 'any'}`],
        },
        stops: selectedPlanStops(preview),
      });
      clearPlanPreview();
      activeTrip?.setActiveTripId(trip.id);
      navigate(`/trips/${trip.id}?view=plan&section=plan`);
    } catch {
      setError(t('pages.travel.personalized.saveError'));
    }
  }

  const dateLabel = new Intl.DateTimeFormat(i18n?.resolvedLanguage, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <section
      id="personalized-planner"
      aria-labelledby="personalized-planner-title"
      className="scroll-mt-32 rounded-container border bg-background"
    >
      <div className="rounded-t-container border-b bg-surface-container px-6 py-6 sm:px-8">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CalendarDays size={16} aria-hidden /> {t('pages.travel.personalized.kicker')}
        </p>
        <h2 id="personalized-planner-title" className="text-headline font-bold">
          {t('pages.travel.personalized.heading')}
        </h2>
        <p className="mt-2 max-w-prose text-muted-foreground">
          {t('pages.travel.personalized.description')}
        </p>
      </div>
      <div className="space-y-6 px-6 py-6 sm:px-8">
        <form onSubmit={buildPreview}>
          <fieldset
            disabled={saveStarted}
            className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="sm:col-span-2">
              <CityCountryAutocomplete
                id="personalized-city"
                label={t('pages.travel.personalized.destination')}
                value={draft.destination}
                onChange={(destination) => updateDraft({ destination })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="personalized-start">{t('pages.travel.personalized.arrival')}</Label>
              <Input
                id="personalized-start"
                type="date"
                required
                min={today}
                value={draft.startDate}
                onChange={(event) => updateDraft({ startDate: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="personalized-end">{t('pages.travel.personalized.departure')}</Label>
              <Input
                id="personalized-end"
                type="date"
                required
                min={draft.startDate || today}
                max={maxEnd}
                value={draft.endDate}
                onChange={(event) => updateDraft({ endDate: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="personalized-adults">{t('pages.travel.personalized.adults')}</Label>
              <select
                id="personalized-adults"
                className={selectClass}
                value={draft.adults}
                onChange={(event) => updateDraft({ adults: Number(event.target.value) })}
              >
                {Array.from({ length: MAX_PLAN_ADULTS }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="personalized-budget">{t('pages.travel.personalized.budget')}</Label>
              <select
                id="personalized-budget"
                className={selectClass}
                value={draft.budget ?? (preferences?.budget_tier ? '' : 'saved')}
                onChange={(event) =>
                  updateDraft({ budget: (event.target.value || null) as Draft['budget'] })
                }
              >
                <option value="saved">
                  {preferences?.budget_tier
                    ? t('pages.travel.personalized.savedBudget', {
                        budget: t(`pages.travel.personalized.budgets.${preferences.budget_tier}`),
                      })
                    : t('pages.travel.personalized.anyBudget')}
                </option>
                {preferences?.budget_tier && (
                  <option value="">{t('pages.travel.personalized.anyBudget')}</option>
                )}
                {PLAN_BUDGETS.map((budget) => (
                  <option key={budget} value={budget}>
                    {t(`pages.travel.personalized.budgets.${budget}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="personalized-pace">{t('pages.travel.personalized.pace')}</Label>
              <select
                id="personalized-pace"
                className={selectClass}
                value={draft.pace}
                onChange={(event) => updateDraft({ pace: event.target.value as Draft['pace'] })}
              >
                {PLAN_PACES.map((pace) => (
                  <option key={pace} value={pace}>
                    {t(`trips.discover.picker.pace.${pace}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="personalized-interest">
                {t('pages.travel.personalized.interest')}
              </Label>
              <select
                id="personalized-interest"
                className={selectClass}
                value={draft.vibe ?? ''}
                onChange={(event) =>
                  updateDraft({ vibe: (event.target.value || null) as Draft['vibe'] })
                }
              >
                <option value="">{t('pages.travel.personalized.anyInterest')}</option>
                {VIBE_IDS.map((vibe) => (
                  <option key={vibe} value={vibe}>
                    {t(`trips.discover.picker.vibe.${vibe}`)}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
          <Button
            type="submit"
            className="mt-6"
            disabled={
              saveStarted ||
              (isFetching && !preview) ||
              authLoading ||
              (!!user && (preferencesLoading || needsLoading))
            }
          >
            {t('pages.travel.personalized.preview')}{' '}
            <ArrowRight size={16} className="ms-2" aria-hidden />
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {request && isFetching && !preview && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrackLoader size={16} /> {t('pages.travel.personalized.loading')}
          </p>
        )}
        {request && isError && !preview && (
          <div className="flex flex-wrap items-center gap-4">
            <p role="alert" className="text-sm text-destructive">
              {t('pages.travel.personalized.loadError')}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t('pages.travel.personalized.retry')}
            </Button>
          </div>
        )}
        {preview && (
          <div className="space-y-4 border-t pt-6">
            <h3 className="text-title font-bold">
              {t('pages.travel.personalized.previewTitle', {
                city: preview.inputs.destination.cityName,
              })}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Shield size={16} aria-hidden />
              <LocalizedLink to={country?.slug ? `/country/${country.slug}` : '/rights'}>
                {t('pages.travel.personalized.rights', {
                  country: preview.inputs.destination.countryName,
                })}
              </LocalizedLink>
              {country && hasDeathPenalty(country.lgbti_criminalization) ? (
                <span className="text-destructive">
                  {t('pages.travel.personalized.deathPenalty')}
                </span>
              ) : country && hasAnyCriminalizationSignal(country.lgbti_criminalization) ? (
                <span className="text-destructive">
                  {t('pages.travel.personalized.criminalized')}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {t('pages.travel.personalized.reviewHint')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {preview.days.map((day) => (
                <article key={day.date} className="min-w-0 rounded-element border p-4">
                  <h4 className="mb-4 font-semibold">
                    <time dateTime={day.date}>{dateLabel.format(parseISO(day.date))}</time>
                  </h4>
                  <ul className="space-y-2">
                    {day.slots.map(({ dayPart, candidate, matchedNeeds }) => (
                      <li key={dayPart} className="text-sm">
                        {candidate ? (
                          <label className="flex min-h-10 cursor-pointer items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-0.5 size-4 shrink-0 accent-primary"
                              checked={!excludedIds.includes(candidate.id)}
                              disabled={saveStarted}
                              onChange={(event) => {
                                const keep = event.target.checked;
                                setExcludedIds((current) =>
                                  keep
                                    ? current.filter((id) => id !== candidate.id)
                                    : [...current, candidate.id],
                                );
                              }}
                            />
                            <span className="min-w-0 break-words">
                              <span className="block text-xs text-muted-foreground">
                                {t(`pages.travel.personalized.dayPart.${dayPart}`)}
                              </span>
                              {candidate.name}
                              {matchedNeeds.length > 0 && (
                                <span className="block text-xs text-muted-foreground">
                                  {t('pages.travel.personalized.accessMatch')}
                                </span>
                              )}
                            </span>
                          </label>
                        ) : (
                          <span className="text-muted-foreground">
                            {t(`pages.travel.personalized.dayPart.${dayPart}`)} ·{' '}
                            {t('pages.travel.personalized.openTime')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Ticket size={16} className="mt-0.5 shrink-0" aria-hidden />{' '}
              {t('pages.travel.personalized.bookingHint')}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                onClick={() => void savePreview()}
                disabled={authLoading || createTripWithStops.isPending}
              >
                {createTripWithStops.isPending && <TrackLoader size={16} className="me-2" />}
                {t(user ? 'pages.travel.personalized.save' : 'pages.travel.personalized.signIn')}
              </Button>
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {t('pages.travel.personalized.selected', { count: selectedCount ?? 0 })}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
