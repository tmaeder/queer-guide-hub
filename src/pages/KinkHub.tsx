import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { AgeAffirmationModal } from '@/components/age-gate/AgeAffirmationModal';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';
import { useKinkFilterTerms, type KinkFilterTerm } from '@/hooks/useKinkFilterTerms';
import { useMeta } from '@/hooks/useMeta';

/**
 * /kinks — every kink & feature filter term with live counts, each linking to
 * its glossary page (/tags/:slug), which lists the parties and venues. Not
 * indexed. Without the 18+ confirmation only the public feature terms show.
 */
export default function KinkHub() {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { affirmed, checking } = useAgeAffirmation();
  const { data: terms, isLoading } = useKinkFilterTerms();

  useMeta({
    title: t('kinkHub.title', 'Kinks & features'),
    description: t(
      'kinkHub.description',
      'Parties, events and venues by feature (darkroom, sling, sauna) and by kink.',
    ),
    canonicalPath: '/kinks',
    noIndex: true,
  });

  const visible = (terms ?? []).filter((term) => affirmed || term.public_without_18);

  const group = (g: KinkFilterTerm['term_group'], title: string) => {
    const items = visible.filter((term) => term.term_group === g);
    if (items.length === 0) return null;
    return (
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-headline">{title}</h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((term) => (
            <li key={term.slug} className="relative rounded-container bg-card p-4 shadow-soft">
              <h3 className="text-title font-bold">{term.label}</h3>
              {term.short_description && (
                <p className="mt-1 text-13 text-muted-foreground">{term.short_description}</p>
              )}
              <p className="mt-2 text-13 tabular-nums">
                {t('kinkHub.counts', '{{events}} upcoming events · {{venues}} venues', {
                  events: term.event_count,
                  venues: term.venue_count,
                })}
              </p>
              <LocalizedLink
                to={`/tags/${term.slug}`}
                aria-label={term.label}
                className="absolute inset-0 no-underline"
              />
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <PageContainer data-testid="kink-hub" className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-display">{t('kinkHub.title', 'Kinks & features')}</h1>
        <p className="text-body-lg text-muted-foreground">
          {t(
            'kinkHub.lead',
            'Find parties and venues by what they have and what happens there. Each term opens its glossary page with upcoming events and venues.',
          )}
        </p>
      </header>
      {isLoading ? (
        <TrackLoader label={t('kinkHub.loading', 'Loading')} />
      ) : (
        <>
          {group('feature', t('kinkFilters.features', 'Features'))}
          {group('kink', t('kinkFilters.kinks', 'Kinks'))}
        </>
      )}
      <AgeAffirmationModal active={!checking && !affirmed} onDecline={() => navigate('/events')} />
    </PageContainer>
  );
}
