/**
 * FlagWall — the visual index of the pride-flag vocabulary, mounted ONLY on
 * the Symbols & Flags category hub (/tags/c/symbols-flags). One mount point
 * by design (2026-08-16 brainstorm): the four-track monochrome tag system
 * stays monochrome everywhere else.
 *
 * Every cell is a text-labelled link to the flag's own glossary page — the
 * swatch is decorative, the name is the accessible target.
 */

import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { FlagSwatch } from '@/components/tags/FlagSwatch';
import { PRIDE_FLAGS } from '@/lib/flags';

export function FlagWall() {
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="flag-wall-heading"
      className="mb-8 bg-muted rounded-container p-6 md:p-8"
    >
      <Eyebrow as="p">{t('tags.flagWall.eyebrow', 'Symbols')}</Eyebrow>
      <h2 id="flag-wall-heading" className="mt-2 font-display text-headline leading-tight">
        {t('tags.flagWall.title', 'The flags')}
      </h2>
      <ul className="mt-6 grid list-none grid-cols-2 gap-x-6 gap-y-8 p-0 sm:grid-cols-3 md:grid-cols-4">
        {PRIDE_FLAGS.map((flag) => {
          const name = t(flag.nameKey, flag.nameEn);
          const cell = (
            <>
              <FlagSwatch flag={flag} decorative />
              <span className="mt-2 block text-13 font-bold leading-tight">
                {name}
                {flag.year && (
                  <span className="ml-2 font-normal text-muted-foreground">{flag.year}</span>
                )}
              </span>
            </>
          );
          return (
            <li key={flag.id}>
              {flag.flagTagSlug ? (
                <LocalizedLink
                  to={`/tags/${encodeURIComponent(flag.flagTagSlug)}`}
                  className="block no-underline"
                  aria-label={name}
                >
                  {cell}
                </LocalizedLink>
              ) : (
                cell
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
