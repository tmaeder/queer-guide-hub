import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { NotFoundMeta } from '@/components/seo/NotFoundMeta';
import { EventProgramme } from '@/components/events/EventProgramme';
import { FestivalCard } from '@/components/festivals/FestivalCard';
import { useFestivalTypeLabel } from '@/components/festivals/useFestivalTypeLabel';
import { ArrowRight, CalendarPlus, ExternalLink, Globe, Ticket } from '@/components/icons';
import { FactGrid } from '@/components/transit/FactGrid';
import { PhotoInset } from '@/components/transit/PhotoInset';
import { SinglePage, SingleSection } from '@/components/transit/SinglePage';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Button } from '@/components/ui/button';
import { dateFnsLocaleFor } from '@/i18n/dateFnsLocale';
import { useEventProgramme } from '@/hooks/useEventProgramme';
import {
  nextEdition,
  useFestival,
  useFestivalDirectory,
  type Festival,
  type FestivalEdition,
} from '@/hooks/useFestivals';
import { useMeta } from '@/hooks/useMeta';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import {
  festivalDateSpan,
  festivalLengthDays,
  festivalPlace,
  festivalTiming,
  festivalTypeKey,
} from '@/lib/festivals';
import { buildProgrammeIcs, downloadIcs } from '@/utils/prideIcs';

/**
 * /festivals/:slug — a festival brand ("Folsom Europe") and its editions.
 *
 * Brands carry little of their own (no description, no photo on any row as of
 * 2026-11), so the page is built from the NEXT EDITION: its dates, photo,
 * description, tickets and programme lead, and the brand contributes its name,
 * type, place and website. Editions are ordinary events, so each keeps its own
 * page, tickets and attendees.
 */

const httpUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : null);

/** Other brands whose next edition starts within three weeks of this one. */
function useAroundTheSameTime(festival: Festival | null | undefined, next: FestivalEdition | null) {
  const { data } = useFestivalDirectory();
  return useMemo(() => {
    if (!festival || !next || !data) return [];
    const at = new Date(next.start_date).getTime();
    const window = 21 * 24 * 60 * 60 * 1000;
    return data
      .filter((r) => r.festival.id !== festival.id)
      .filter((r) => Math.abs(new Date(r.next.start_date).getTime() - at) <= window)
      .sort((a, b) => {
        // Same type first, then nearest in time.
        const same = (r: typeof a) =>
          festivalTypeKey(r.festival.festival_type) === festivalTypeKey(festival.festival_type)
            ? 0
            : 1;
        return (
          same(a) - same(b) ||
          Math.abs(new Date(a.next.start_date).getTime() - at) -
            Math.abs(new Date(b.next.start_date).getTime() - at)
        );
      })
      .slice(0, 4);
  }, [data, festival, next]);
}

export default function FestivalDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const locale = dateFnsLocaleFor(i18n.language);
  const { data: festival, isLoading } = useFestival(slug);
  const next = festival ? nextEdition(festival) : null;
  const { data: programme } = useEventProgramme(next?.id, !!next);
  const typeLabel = useFestivalTypeLabel(festivalTypeKey(festival?.festival_type));
  const around = useAroundTheSameTime(festival, next);

  const now = new Date();
  const later = festival
    ? festival.editions.filter((e) => e.id !== next?.id && new Date(e.start_date) >= now)
    : [];
  const past = festival
    ? festival.editions.filter((e) => e.id !== next?.id && new Date(e.start_date) < now).reverse()
    : [];
  const place = festival ? festivalPlace(festival, i18n.language) : '';

  useMeta({
    title: festival
      ? `${festival.name}${festival.city ? ` · ${festival.city}` : ''} | Queer Guide`
      : 'Festival | Queer Guide',
    description: festival
      ? next
        ? t(
            'festivals.detail.metaNext',
            '{{name}} in {{place}}: next edition {{dates}}, with the full programme.',
            { name: festival.name, place, dates: festivalDateSpan(next, undefined, true) },
          )
        : t('festivals.detail.metaPast', '{{name}} in {{place}}: past editions.', {
            name: festival.name,
            place,
          })
      : undefined,
    canonicalPath: slug ? `/festivals/${slug}` : undefined,
  });

  if (isLoading) {
    return (
      <PageContainer className="flex justify-center">
        <TrackLoader />
      </PageContainer>
    );
  }

  if (!festival) {
    return (
      <PageContainer className="text-center">
        <NotFoundMeta />
        <h1 className="mb-4 text-headline font-display">
          {t('festivals.detail.notFound', 'Festival not found')}
        </h1>
        <Button asChild variant="outline">
          <LocalizedLink to="/festivals">
            {t('festivals.detail.back', 'All festivals')}
          </LocalizedLink>
        </Button>
      </PageContainer>
    );
  }

  const timing = next ? festivalTiming(next, now) : null;
  const status =
    !timing || timing.kind === 'past'
      ? t('festivals.detail.statusNone', 'No dates announced')
      : timing.kind === 'now'
        ? t('festivals.card.now', 'On now')
        : timing.kind === 'soon'
          ? timing.inDays === 1
            ? t('festivals.card.tomorrow', 'Tomorrow')
            : t('festivals.card.inDays', 'In {{count}} days', { count: timing.inDays })
          : format(new Date(next!.start_date), 'MMMM yyyy', { locale });

  const image = next ? resolveEntityImage('event', next).url : null;
  const days = next ? festivalLengthDays(next) : 0;
  const tickets = httpUrl(next?.ticket_url);
  const website = httpUrl(festival.website) ?? httpUrl(next?.website);
  const children = programme?.children ?? [];
  // A description that only restates the name says nothing.
  const about =
    next?.description && next.description.trim().toLowerCase() !== next.title.trim().toLowerCase()
      ? next.description.trim()
      : festival.description;

  const lead = next ? (
    <>
      <strong className="font-bold">{festivalDateSpan(next, locale, true)}</strong>
      {place && (
        <>
          {' · '}
          {place}
        </>
      )}
    </>
  ) : (
    place || null
  );

  const exportCalendar = () => {
    if (!next) return;
    downloadIcs(
      `${festival.slug}-${next.start_date.slice(0, 4)}.ics`,
      buildProgrammeIcs(next, children, [next.venue_name, place].filter(Boolean).join(', ')),
    );
  };

  return (
    <SinglePage
      type="event"
      eyebrow={[t('festivals.eyebrow', 'Festivals'), typeLabel].join(' · ')}
      title={festival.name}
      status={status}
      lead={lead}
      headerMedia={
        image ? (
          <PhotoInset
            src={image}
            alt=""
            fallbackKey={festival.id}
            fallbackEntityType="event"
            priority
          />
        ) : undefined
      }
      tags={
        next ? (
          <FactGrid
            variant="strip"
            className="w-fit max-w-full sm:flex sm:flex-wrap sm:gap-x-12"
            facts={[
              {
                label: t('festivals.detail.factDates', 'Dates'),
                value: festivalDateSpan(next, locale),
              },
              {
                label: t('festivals.detail.factLength', 'Length'),
                value: t('festivals.days', { count: days }),
              },
              {
                label: t('festivals.detail.factWhere', 'Where'),
                value: next.venue_name || festival.city || null,
              },
              {
                label: t('festivals.detail.factProgramme', 'Programme'),
                value: children.length
                  ? t('festivals.editionEvents', { count: children.length })
                  : null,
              },
            ]}
          />
        ) : undefined
      }
      action={
        next ? (
          <>
            {tickets && (
              <Button asChild>
                <a href={tickets} target="_blank" rel="noopener noreferrer nofollow">
                  <Ticket size={16} aria-hidden />
                  {t('festivals.detail.tickets', 'Tickets')}
                </a>
              </Button>
            )}
            <Button asChild variant={tickets ? 'outline' : 'default'}>
              <LocalizedLink to={`/events/${next.slug}`}>
                {t('festivals.detail.editionPage', 'Event page')}
                <ArrowRight size={16} aria-hidden />
              </LocalizedLink>
            </Button>
            <Button variant="outline" onClick={exportCalendar}>
              <CalendarPlus size={16} aria-hidden />
              {t('festivals.detail.addCalendar', 'Add to calendar')}
            </Button>
            {website && (
              <Button asChild variant="ghost">
                <a href={website} target="_blank" rel="noopener noreferrer">
                  <Globe size={16} aria-hidden />
                  {t('festivals.detail.website', 'Website')}
                  <ExternalLink size={14} aria-hidden />
                </a>
              </Button>
            )}
          </>
        ) : website ? (
          <Button asChild variant="outline">
            <a href={website} target="_blank" rel="noopener noreferrer">
              <Globe size={16} aria-hidden />
              {t('festivals.detail.website', 'Website')}
            </a>
          </Button>
        ) : undefined
      }
      body={
        <>
          {about && (
            <SingleSection id="about" title={t('festivals.detail.about', 'About')}>
              <p className="max-w-reading whitespace-pre-line text-body-lg leading-relaxed">
                {about}
              </p>
            </SingleSection>
          )}

          {next ? (
            <SingleSection id="programme" title={t('festivals.detail.programme', 'Programme')}>
              <p className="-mt-2 mb-4 text-13 text-muted-foreground">
                <LocalizedLink to={`/events/${next.slug}`} className="font-bold text-foreground">
                  {next.title}
                </LocalizedLink>
                {' · '}
                {festivalDateSpan(next, locale, true)}
                {children.length > 0 &&
                  ` · ${t('festivals.editionEvents', { count: children.length })}`}
              </p>
              {children.length > 0 ? (
                <EventProgramme entries={children} />
              ) : (
                <div className="rounded-container bg-muted p-6">
                  <p className="font-bold">
                    {t('festivals.detail.noProgramme', 'No programme listed yet.')}
                  </p>
                  <p className="mt-1 text-13 text-muted-foreground">
                    {t(
                      'festivals.detail.noProgrammeHint',
                      'Parties, parades and workshops appear here once they are announced. Dates, tickets and attendees are on the event page.',
                    )}
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <LocalizedLink to={`/events/${next.slug}`}>
                      {t('festivals.detail.editionPage', 'Event page')}
                      <ArrowRight size={16} aria-hidden />
                    </LocalizedLink>
                  </Button>
                </div>
              )}
            </SingleSection>
          ) : (
            <div className="rounded-container bg-muted p-6">
              <p className="font-bold">
                {t('festivals.detail.noNext', 'No upcoming edition listed yet.')}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <LocalizedLink to="/festivals">
                  {t('festivals.detail.back', 'All festivals')}
                </LocalizedLink>
              </Button>
            </div>
          )}

          {(later.length > 0 || past.length > 0) && (
            <SingleSection id="editions" title={t('festivals.detail.editions', 'Editions')}>
              <ol className="m-0 list-none border-t border-border-hairline p-0">
                {[...later, ...past].map((e) => {
                  const isPast = new Date(e.end_date ?? e.start_date) < now;
                  return (
                    <li
                      key={e.id}
                      className="relative flex items-baseline gap-4 border-b border-border-hairline py-4"
                    >
                      <span className="w-14 shrink-0 font-display text-title tabular-nums">
                        {e.start_date.slice(0, 4)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <LocalizedLink
                          to={`/events/${e.slug}`}
                          className="font-bold no-underline after:absolute after:inset-0 hover:underline"
                        >
                          {e.title}
                        </LocalizedLink>
                        <span className="block text-13 text-muted-foreground">
                          {festivalDateSpan(e, locale)}
                          {e.programme_size
                            ? ` · ${t('festivals.editionEvents', { count: e.programme_size })}`
                            : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-2xs font-bold uppercase tracking-label text-muted-foreground">
                        {isPast
                          ? t('festivals.detail.past', 'Past')
                          : t('festivals.detail.upcoming', 'Upcoming')}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </SingleSection>
          )}

          {around.length > 0 && (
            <SingleSection id="around" title={t('festivals.detail.around', 'Around the same time')}>
              <ul className="m-0 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
                {around.map((r) => (
                  <li key={r.festival.id} className="min-w-0">
                    <FestivalCard festival={r.festival} edition={r.next} />
                  </li>
                ))}
              </ul>
            </SingleSection>
          )}
        </>
      }
    />
  );
}
