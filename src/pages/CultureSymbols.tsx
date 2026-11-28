import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { useMeta } from '@/hooks/useMeta';
import { useCulturalSymbols } from '@/hooks/useCulturalSymbols';

/**
 * /culture — historic queer symbols, from cultural_nodes. One page, no per-symbol
 * detail pages: each entry holds a single sentence, so a page per symbol would be
 * thin. Where the glossary has a fuller entry, the row links to it.
 */
export default function CultureSymbols() {
  const { t } = useTranslation();
  const { data = [], isLoading, isError } = useCulturalSymbols();

  useMeta({
    title: t('culture.metaTitle', 'Queer Symbols and Their History'),
    description: t(
      'culture.metaDescription',
      'The pink triangle, lambda, labrys, green carnation, violets and other queer symbols: what each one means and when it came into use.',
    ),
    canonicalPath: '/culture',
  });

  return (
    <PageContainer>
      <Eyebrow>{t('culture.eyebrow', 'Culture')}</Eyebrow>
      <h1 className="text-display font-display">{t('culture.title', 'Queer symbols')}</h1>
      <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
        {t(
          'culture.intro',
          'Signs the community has used to find, mark and defend itself, with when each came into use. Some were imposed on queer people first and reclaimed later.',
        )}
      </p>

      {isLoading && (
        <div className="mt-12 flex justify-center">
          <TrackLoader />
        </div>
      )}
      {isError && (
        <p className="mt-12 text-body-lg">
          {t('culture.loadFailed', 'This list could not be loaded right now.')}
        </p>
      )}

      {data.length > 0 && (
        <section aria-labelledby="culture-symbols" className="mt-12">
          <h2 id="culture-symbols" className="text-headline font-display">
            {t('culture.symbols', 'Symbols')}
          </h2>
          <ul className="mt-4 list-none p-0">
            {data.map((s) => (
              <li key={s.slug} className="relative border-b border-border-hairline">
                <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-6">
                  <span className="font-bold sm:w-56 sm:shrink-0">{s.name}</span>
                  <span className="min-w-0 flex-1">
                    {s.meaning && <span className="block">{s.meaning}</span>}
                    {s.era && <span className="block text-13 text-muted-foreground">{s.era}</span>}
                  </span>
                  {s.glossarySlug && (
                    <span className="text-13 font-bold sm:shrink-0">
                      {t('culture.readMore', 'Glossary entry')}
                    </span>
                  )}
                </div>
                {s.glossarySlug && (
                  // Row-wide link as an overlay sibling, never a wrapper.
                  <LocalizedLink
                    to={`/tags/${encodeURIComponent(s.glossarySlug)}`}
                    aria-label={t('culture.readMoreAbout', 'Glossary entry: {{name}}', {
                      name: s.name,
                    })}
                    className="absolute inset-0 rounded-element no-underline"
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="culture-flags" className="mt-12">
        <h2 id="culture-flags" className="text-headline font-display">
          {t('culture.flags', 'Pride flags')}
        </h2>
        <p className="mt-2 max-w-reading text-muted-foreground">
          {t(
            'culture.flagsIntro',
            'Every pride flag, with its designer, year and what each stripe stands for.',
          )}
        </p>
        <LocalizedLink to="/tags/c/symbols-flags" className="mt-4 inline-block font-bold">
          {t('culture.flagsLink', 'See all pride flags')}
        </LocalizedLink>
      </section>
    </PageContainer>
  );
}
