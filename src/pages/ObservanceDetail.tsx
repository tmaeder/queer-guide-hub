import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EventCard } from '@/components/events/EventCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import {
  useObservance,
  useObservanceDates,
  useObservanceEvents,
  useObservanceGatedCount,
} from '@/hooks/useObservances';
import { eventWindow, previousOccurrence, type ObservanceDateRow } from '@/lib/observanceWindow';
import {
  ObservanceEventsMap,
  ObservanceNews,
  ObservancePastYears,
} from '@/components/observances/ObservanceHubExtras';

type ObservanceEvents = NonNullable<ReturnType<typeof useObservanceEvents>['data']>;

function formatDate(iso: string, lang: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function dateLine(row: ObservanceDateRow, kind: 'day' | 'month', lang: string) {
  if (kind === 'month') {
    return new Date(`${row.starts}T12:00:00Z`).toLocaleDateString(lang, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return formatDate(row.starts, lang);
}

// ponytail: client UTC date vs the DB's current_date; can be a day off near midnight far from UTC.
function daysUntil(iso: string) {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((new Date(`${iso}T00:00:00Z`).getTime() - today) / 86_400_000);
}

// events.country holds ISO2 codes; show the region name, fall back to the raw value.
function countryLabel(key: string, lang: string) {
  if (!/^[A-Z]{2}$/.test(key)) return key;
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(key) ?? key;
  } catch {
    return key;
  }
}

function EventsByCountry({ events }: { events: ObservanceEvents }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const byCountry = useMemo(() => {
    const groups = new Map<string, ObservanceEvents>();
    for (const e of events) {
      const key = e.country || t('observances.unknownCountry', 'Location not listed');
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [events, t]);

  return (
    <>
      {byCountry.map(([country, list]) => (
        <section key={country} className="mt-8">
          <h3 className="text-title font-bold">{countryLabel(country, lang)}</h3>
          <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function GatedNotice({ count, visible }: { count: number; visible: number }) {
  const { t } = useTranslation();
  return (
    <p className="mt-2 text-15">
      <LocalizedLink to="/auth">
        {visible === 0
          ? t('observances.gatedOnly', 'Sign in to see {{count}} events.', { count })
          : t('observances.gated', 'Sign in to see {{count}} more events.', { count })}
      </LocalizedLink>
    </p>
  );
}

export default function ObservanceDetail() {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: obs, isLoading } = useObservance(slug);
  const {
    data: rawDates = [],
    isLoading: datesLoading,
    isError: datesError,
  } = useObservanceDates(obs?.id);
  const dates = useMemo(
    () => [...rawDates].sort((a, b) => a.starts.localeCompare(b.starts)),
    [rawDates],
  );
  const win = useMemo(
    () => (obs ? eventWindow(dates, obs.window_days_before, obs.window_days_after) : null),
    [obs, dates],
  );
  const prevDates = useMemo(() => previousOccurrence(dates), [dates]);
  const prevWin = useMemo(
    () =>
      obs ? eventWindow(prevDates, obs.window_days_before + 7, obs.window_days_after + 7) : null,
    [obs, prevDates],
  );
  const {
    data: events = [],
    isLoading: eventsLoading,
    isError: eventsError,
  } = useObservanceEvents(obs?.id, win);
  const { data: rawPrevEvents = [], isError: prevError } = useObservanceEvents(obs?.id, prevWin);
  // Signed-in users already see every event, so the gated count is only for anon.
  const { data: gated = 0 } = useObservanceGatedCount(obs?.id, user ? null : win);
  const { data: prevGated = 0 } = useObservanceGatedCount(obs?.id, user ? null : prevWin);
  const prevEvents = useMemo(() => {
    const seen = new Set(events.map((e) => e.id));
    return rawPrevEvents.filter((e) => !seen.has(e.id));
  }, [events, rawPrevEvents]);

  useMeta({
    title: obs?.name,
    description: obs?.summary,
    noIndex: !isLoading && !obs,
  });

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-12 w-2/3" />
      </PageContainer>
    );
  }
  if (!obs) {
    return (
      <PageContainer>
        <h1 className="mt-2 font-display text-headline leading-tight md:text-display">
          {t('observances.notFound', 'Observance not found')}
        </h1>
      </PageContainer>
    );
  }

  const primary = dates[0];
  const year = primary?.starts.slice(0, 4) ?? String(new Date().getUTCFullYear());
  const prevYear = prevDates[0]?.starts.slice(0, 4) ?? String(Number(year) - 1);
  const lang = i18n.language || 'en';
  const until = primary ? daysUntil(primary.starts) : null;

  return (
    <>
      <PageContainer as="header" size="reading" className="pb-6">
        <Eyebrow variant="kicker">
          {obs.tone === 'memorial'
            ? t('observances.kind.memorial', 'Day of remembrance')
            : t(
                `observances.kind.${obs.kind}`,
                obs.kind === 'day' ? 'Awareness day' : 'Awareness month',
              )}
        </Eyebrow>
        <h1 className="mt-2 font-display text-headline leading-tight md:text-display">
          {obs.name}
        </h1>
        {dates.length > 0 && (
          <ul className="m-0 mt-4 list-none space-y-2 p-0 text-title font-bold">
            {dates.map((d) => (
              <li key={d.country_id ?? 'global'}>
                {d.country_name ? `${d.country_name}: ` : ''}
                {dateLine(d, obs.kind, lang)}
              </li>
            ))}
          </ul>
        )}
        {obs.tone !== 'memorial' && until !== null && until > 0 && (
          <p className="mt-2 text-13 text-muted-foreground">
            {t('observances.inDays', 'in {{count}} days', { count: until })}
          </p>
        )}
        <p className="mt-4 text-body-lg">{obs.summary}</p>
        {obs.tone === 'memorial' && (
          <p className="mt-4 text-15">
            <LocalizedLink to="/help">
              {t('observances.support', 'Need support? Crisis and support lines')}
            </LocalizedLink>
          </p>
        )}
      </PageContainer>

      <PageContainer as="section" flush className="pb-12" aria-labelledby="obs-events">
        <h2 id="obs-events" className="text-headline">
          {t('observances.thisYear', '{{year}} events', { year })}
        </h2>
        {!user && gated > 0 && <GatedNotice count={gated} visible={events.length} />}
        {eventsError || datesError ? (
          <p className="mt-4">{t('observances.loadError', 'Could not load events.')}</p>
        ) : datesLoading || eventsLoading ? (
          <Skeleton className="mt-6 h-40 w-full" />
        ) : events.length === 0 ? (
          <p className="mt-4">
            {t('observances.empty', 'No events listed for {{year}} yet.', { year })}{' '}
            <LocalizedLink to="/submit">{t('observances.submit', 'Submit an event')}</LocalizedLink>
          </p>
        ) : (
          <>
            <ObservanceEventsMap events={events} />
            <EventsByCountry events={events} />
          </>
        )}
      </PageContainer>

      {!prevError && (prevEvents.length > 0 || (!user && prevGated > 0)) && (
        <PageContainer as="section" flush className="pb-12" aria-labelledby="obs-last-time">
          <h2 id="obs-last-time" className="text-headline">
            {t('observances.lastTime', '{{year}} events', { year: prevYear })}
          </h2>
          {!user && prevGated > 0 && <GatedNotice count={prevGated} visible={prevEvents.length} />}
          <EventsByCountry events={prevEvents} />
        </PageContainer>
      )}

      {(obs.body || obs.founded_milestone) && (
        <PageContainer as="section" size="reading" className="pb-12">
          <h2 className="text-headline">{t('observances.about', 'About')}</h2>
          {obs.body && <p className="mt-4 whitespace-pre-line">{obs.body}</p>}
          {obs.founded_milestone && (
            <p className="mt-4">
              <LocalizedLink to={`/history/${obs.founded_milestone.slug}`}>
                {obs.founded_milestone.date.slice(0, 4)} · {obs.founded_milestone.title}
              </LocalizedLink>
            </p>
          )}
        </PageContainer>
      )}

      <ObservanceNews observanceId={obs.id} />
      <ObservancePastYears observanceId={obs.id} beforeYear={Number(year)} />
    </>
  );
}
