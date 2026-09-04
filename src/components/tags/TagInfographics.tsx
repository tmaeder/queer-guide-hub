/**
 * The `#figure` band on a glossary entry.
 *
 * Sits between `#about` and `TagInterchange`, always, for every term that has
 * a figure. The definition is the page's contract — someone arriving from
 * search needs the sentence before the diagram — and the taxonomy comes after,
 * so the reader gets the picture and then where it sits. Module order is fixed
 * across a type (src/config/singleModules.ts, rule 1), so there is no
 * conditional placement for a figure's `subject` term.
 *
 * This asserts a DIFFERENT thing from its two neighbours, which is why it is
 * its own band and not folded into either: `TagInterchange` says "an editor
 * connected these", the end-of-line panel says "an embedding thinks these are
 * close", and a figure says "these terms are parts of one picture".
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useSafeMode } from '@/providers/SafeModeProvider';
import { useInfographicsForTag } from '@/hooks/useInfographicsForTag';
import { InfographicFigure } from './infographics/InfographicFigure';
import {
  MAX_INLINE_FIGURES,
  allReferencedSlugs,
  figuresForSlug,
} from './infographics/registry';

export function TagInfographics({
  slug,
  pageAlreadyGated,
}: {
  slug: string;
  pageAlreadyGated: boolean;
}) {
  const { t } = useTranslation();
  const { enabled: safeMode } = useSafeMode();

  // One memo for the whole derivation. Splitting it left `inline` as a fresh
  // array each render, which the React compiler flags as a dependency it
  // cannot prove stable — and it would also re-key the terms query every pass.
  const { inline, overflow } = useMemo(() => {
    const visible = figuresForSlug(slug).filter((f) => !(f.gate.adult && safeMode));
    return {
      inline: visible.slice(0, MAX_INLINE_FIGURES),
      overflow: visible.slice(MAX_INLINE_FIGURES),
    };
  }, [slug, safeMode]);

  const slugs = useMemo(() => allReferencedSlugs(inline), [inline]);
  const { data: terms } = useInfographicsForTag(slugs);

  if (inline.length === 0) return null;

  return (
    <section
      id="figure"
      aria-labelledby="figure-heading"
      className="border-y-4 border-foreground py-8"
    >
      <Eyebrow as="p">{t('tags.figures.bandEyebrow', 'Drawn')}</Eyebrow>
      <h2 id="figure-heading" className="mt-2 font-display text-headline leading-tight md:text-display">
        {inline.length > 1
          ? t('tags.figures.bandTitlePlural', 'Diagrams')
          : t('tags.figures.bandTitle', 'The diagram')}
      </h2>

      <div className="mt-6 grid gap-8">
        {inline.map((figure) => (
          <InfographicFigure
            key={figure.id}
            figure={figure}
            terms={terms ?? {}}
            currentSlug={slug}
            pageAlreadyGated={pageAlreadyGated}
            safeMode={safeMode}
          />
        ))}
      </div>

      {overflow.length > 0 && (
        <ul className="mt-6 flex list-none flex-wrap gap-2 p-0">
          {overflow.map((figure) => (
            <li key={figure.id}>
              <LocalizedLink
                to={`/tags/${encodeURIComponent(
                  figure.teaches.find((x) => x.role === 'subject')?.slug ?? slug,
                )}#figure-${figure.id}`}
                className="inline-block border-2 border-foreground px-2 py-1 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background"
              >
                {t(figure.titleKey, figure.titleFallback)}
              </LocalizedLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
