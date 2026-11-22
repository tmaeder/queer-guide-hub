import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { NotFoundMeta } from '@/components/seo/NotFoundMeta';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { EventProgramme } from '@/components/events/EventProgramme';
import { useEventProgramme } from '@/hooks/useEventProgramme';
import { useFestival, nextEdition, type FestivalEdition } from '@/hooks/useFestivals';
import { useMeta } from '@/hooks/useMeta';

/**
 * /festivals/:slug — a festival brand ("Folsom Europe") and its editions.
 *
 * The next edition leads with its full programme (the umbrella's children);
 * earlier editions are listed below. Editions are ordinary events, so each one
 * keeps its own page, tickets and attendees.
 */

function span(e: FestivalEdition): string {
  const s = new Date(e.start_date);
  const end = new Date(e.end_date ?? e.start_date);
  return format(s, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')
    ? format(s, 'd MMM yyyy')
    : `${format(s, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
}

export default function FestivalDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { data: festival, isLoading } = useFestival(slug);
  const next = festival ? nextEdition(festival) : null;
  const { data: programme } = useEventProgramme(next?.id, !!next);
  const past = festival
    ? festival.editions
        .filter((e) => e.id !== next?.id && new Date(e.start_date) < new Date())
        .reverse()
    : [];
  const place = festival ? [festival.city, festival.country].filter(Boolean).join(', ') : '';

  useMeta({
    title: festival
      ? `${festival.name}${festival.city ? ` · ${festival.city}` : ''} | Queer Guide`
      : 'Festival | Queer Guide',
    description: festival
      ? next
        ? t(
            'festivals.detail.metaNext',
            '{{name}} in {{place}}: next edition {{dates}}, with the full programme.',
            {
              name: festival.name,
              place,
              dates: span(next),
            },
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

  return (
    <PageContainer>
      <LocalizedLink
        to="/festivals"
        className="mb-4 inline-flex text-13 font-bold text-muted-foreground no-underline hover:text-foreground"
      >
        {t('festivals.detail.backArrow', '← Festivals')}
      </LocalizedLink>
      <Eyebrow>{place}</Eyebrow>
      <h1 className="text-display font-display">{festival.name}</h1>
      {festival.description && (
        <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
          {festival.description}
        </p>
      )}

      {next ? (
        <section aria-labelledby="festival-next" className="mt-12">
          <h2 id="festival-next" className="text-headline font-display">
            {t('festivals.detail.next', 'Next edition')}
          </h2>
          <p className="mt-2 text-body-lg">
            <LocalizedLink to={`/events/${next.slug}`} className="font-bold">
              {next.title}
            </LocalizedLink>
            <span className="text-muted-foreground"> · {span(next)}</span>
          </p>
          {programme && programme.children.length > 0 ? (
            <div className="mt-8">
              <EventProgramme entries={programme.children} />
            </div>
          ) : (
            <p className="mt-4 text-13 text-muted-foreground">
              {t('festivals.detail.noProgramme', 'No programme listed yet.')}
            </p>
          )}
        </section>
      ) : (
        <p className="mt-12 text-body-lg">
          {t('festivals.detail.noNext', 'No upcoming edition listed yet.')}
        </p>
      )}

      {past.length > 0 && (
        <section aria-labelledby="festival-past" className="mt-16">
          <h2 id="festival-past" className="text-headline font-display">
            {t('festivals.detail.past', 'Past editions')}
          </h2>
          <ul className="mt-4 list-none p-0">
            {past.map((e) => (
              <li key={e.id} className="border-b border-border-hairline py-2">
                <LocalizedLink to={`/events/${e.slug}`} className="font-bold">
                  {e.title}
                </LocalizedLink>
                <span className="text-13 text-muted-foreground"> · {span(e)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageContainer>
  );
}
