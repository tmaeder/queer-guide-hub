/**
 * TagsEndOfLine — the closing ink panel.
 *
 * This is where the deleted crisis strip's one legitimate job survives: a
 * single link to /help. The strip used to re-render four callable hotlines,
 * a country selector and an emergency number on a page about vocabulary,
 * duplicating the directory that /help already owns in full. A link is the
 * correct amount of that on a glossary index; the duplication was the problem,
 * not the pointer.
 */

import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

const LINK =
  'border inline-flex items-center gap-2 border-background px-4 py-2 text-13 font-bold text-background no-underline transition-colors hover:bg-background hover:text-foreground';

export function TagsEndOfLine() {
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="tags-end-of-line"
      className="mt-16 bg-foreground p-6 text-background md:p-8"
    >
      <p className="text-2xs font-bold uppercase tracking-label text-background/70">
        {t('tags.endOfLine.eyebrow', 'End of line')}
      </p>
      <h2 id="tags-end-of-line" className="mt-1 font-display text-headline leading-tight">
        {t('tags.endOfLine.title', 'Looking for something else?')}
      </h2>
      <p className="mt-2 max-w-reading text-13 leading-relaxed text-background/80">
        {t(
          'tags.endOfLine.body',
          'The glossary defines the words. These are the places that use them.',
        )}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <LocalizedLink to="/help" className={LINK}>
          {t('tags.endOfLine.helpCta', 'Crisis lines and support')}
        </LocalizedLink>
        <LocalizedLink to="/organizations" className={LINK}>
          {t('tags.endOfLine.orgsCta', 'Organisations')}
        </LocalizedLink>
        <LocalizedLink to="/guides" className={LINK}>
          {t('tags.endOfLine.guidesCta', 'Guides')}
        </LocalizedLink>
      </div>
    </section>
  );
}
