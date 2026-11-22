import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { EventCard } from '@/components/events/EventCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import {
  useObservance,
  useObservanceDates,
  useObservanceEvents,
  useObservanceGatedCount,
} from '@/hooks/useObservances';
import { eventWindow, previousOccurrence, type ObservanceDateRow } from '@/lib/observanceWindow';

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

function daysUntil(iso: string) {
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((new Date(`${iso}T00:00:00Z`).getTime() - today) / 86_400_000);
}

function EventsByCountry({ events }: { events: ObservanceEvents }) {
  const { t } = useTranslation();
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
          <h3 className="text-title font-bold">{country}</h3>
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

export default function ObservanceDetail() {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: obs, isLoading } = useObservance(slug);
  const { data: dates = [] } = useObservanceDates(obs?.id);
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
  const { data: events = [], isLoading: eventsLoading } = useObservanceEvents(obs?.id, win);
  const { data: prevEvents = [] } = useObservanceEvents(obs?.id, prevWin);
  const { data: gated = 0 } = useObservanceGatedCount(obs?.id, win);

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
        <h1>{t('observances.notFound', 'Observance not found')}</h1>
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
          {t(
            `observances.kind.${obs.kind}`,
            obs.kind === 'day' ? 'Awareness day' : 'Awareness month',
          )}
        </Eyebrow>
        <h1 className="mt-2">{obs.name}</h1>
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
        {!user && gated > 0 && (
          <p className="mt-2 text-15">
            <LocalizedLink to="/auth">
              {t('observances.gated', 'Sign in to see {{count}} more events.', { count: gated })}
            </LocalizedLink>
          </p>
        )}
        {eventsLoading ? (
          <Skeleton className="mt-6 h-40 w-full" />
        ) : events.length === 0 ? (
          <p className="mt-4">
            {t('observances.empty', 'No events listed for {{year}} yet.', { year })}{' '}
            <LocalizedLink to="/submit">{t('observances.submit', 'Submit an event')}</LocalizedLink>
          </p>
        ) : (
          <EventsByCountry events={events} />
        )}
      </PageContainer>

      {prevEvents.length > 0 && (
        <PageContainer as="section" flush className="pb-12" aria-labelledby="obs-last-time">
          <h2 id="obs-last-time" className="text-headline">
            {t('observances.lastTime', '{{year}}', { year: prevYear })}
          </h2>
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
    </>
  );
}
