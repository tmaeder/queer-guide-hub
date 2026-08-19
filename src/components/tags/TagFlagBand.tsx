/**
 * TagFlagBand — the full flag treatment on the tag page that IS a flag
 * (/tags/transgender-pride-flag and friends).
 *
 * Self-selecting like TagDiagnosticCodes: renders only when the slug resolves
 * in `flagByTagSlug`, so nothing in the UI decides "is this a flag tag" — the
 * curated data does. Stripe meanings render as TEXT rows beside their colour
 * chips; the meaning is never carried by colour alone (colour-blind safe by
 * construction). Flags whose designers assigned no stripe meanings (leather,
 * bear) render the swatch + the designer's-intent note and no meaning list —
 * inventing meanings would be curation fraud.
 */

import { useTranslation } from 'react-i18next';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { FlagSwatch } from '@/components/tags/FlagSwatch';
import { flagByTagSlug } from '@/lib/flags';

export function TagFlagBand({ tagSlug }: { tagSlug: string }) {
  const { t } = useTranslation();
  const flag = flagByTagSlug.get(tagSlug);
  if (!flag) return null;

  const meaningStripes = flag.stripes.filter((s) => s.meaningEn);
  // Repeated stripes (trans blue/pink, agender mirror) would repeat their
  // meaning row; collapse to first occurrence, preserving order.
  const seen = new Set<string>();
  const meanings = meaningStripes.filter((s) => {
    const key = `${s.hex}:${s.meaningEn}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <section
      id="flag"
      aria-labelledby="flag-heading"
      className="scroll-mt-24 border-y border-border-hairline py-8"
    >
      <Eyebrow as="p">{t('tags.detail.flag.eyebrow', 'Symbol')}</Eyebrow>
      <h2
        id="flag-heading"
        className="mt-2 font-display text-headline leading-tight md:text-display"
      >
        {t('tags.detail.flag.title', 'The flag')}
      </h2>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <FlagSwatch flag={flag} className="max-w-md" />
          {(flag.designer || flag.year) && (
            <dl className="mt-4 grid grid-cols-2 gap-4 max-w-md">
              {flag.designer && (
                <div>
                  <dt className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                    {t('tags.detail.flag.designer', 'Designed by')}
                  </dt>
                  <dd className="m-0 mt-1 text-13 font-bold">{flag.designer}</dd>
                </div>
              )}
              {flag.year && (
                <div>
                  <dt className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                    {t('tags.detail.flag.year', 'Year')}
                  </dt>
                  <dd className="m-0 mt-1 text-13 font-bold">{flag.year}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        <div>
          {meanings.length > 0 && (
            <>
              <h3 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                {t('tags.detail.flag.stripes', 'What the stripes mean')}
              </h3>
              <ul className="mt-2 list-none p-0">
                {meanings.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-4 border-b border-foreground/15 py-2 last:border-b-0"
                  >
                    <span
                      aria-hidden="true"
                      className="h-4 w-8 shrink-0 border border-border-hairline"
                      style={{ backgroundColor: s.hex }}
                    />
                    <span className="text-13">{t(s.meaningKey ?? '', s.meaningEn ?? '')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {flag.noteEn && (
            <p className="mt-4 text-13 leading-relaxed opacity-75">
              {t(flag.noteKey ?? '', flag.noteEn)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
