/**
 * The citation strip, rendered INSIDE the figure's ink frame — the same
 * treatment TagDetail already gives `image_attribution`.
 *
 * Every figure here replaces a plate that is copyrighted, watermarked or
 * licensed non-commercially, so "this is a rebuild from cited data" has to be
 * visible rather than asserted in a commit message. `supports` is required by
 * the type for the same reason: a citation that cannot say which part of the
 * picture it backs is decoration.
 *
 * `checkedOn` is printed for claim-bearing figures. On a prevention or
 * harm-reduction diagram staleness is itself a harm, and a reader deserves to
 * see how old the last check is rather than trust that one happened.
 */

import { useTranslation } from 'react-i18next';
import type { InfographicSource } from './types';

export function InfographicSources({
  sources,
  checkedOn,
  showChecked,
}: {
  sources: readonly InfographicSource[];
  checkedOn: string;
  /** Set for figures that make health, safety or legal claims. */
  showChecked: boolean;
}) {
  const { t, i18n } = useTranslation();
  if (sources.length === 0) return null;

  const checked = new Date(checkedOn);
  const checkedLabel = Number.isNaN(checked.getTime())
    ? checkedOn
    : new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(checked);

  return (
    <div className="border-t-2 border-foreground px-4 py-4 text-2xs text-muted-foreground">
      <p className="font-semibold uppercase tracking-label">
        {t('tags.figures.sources', 'Drawn from')}
      </p>
      <ul className="mt-1.5 grid list-none gap-1.5 p-0">
        {sources.map((s) => (
          <li key={`${s.publisher}-${s.title}`} className="leading-snug">
            <span className="font-bold text-foreground">{s.publisher}</span>
            {', '}
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.title}
              </a>
            ) : (
              s.title
            )}
            {s.date ? ` (${s.date})` : null} — {s.supports}
          </li>
        ))}
      </ul>
      {showChecked && (
        <p className="mt-2">
          {t('tags.figures.checkedOn', 'Claims last checked against these sources on {{date}}.', {
            date: checkedLabel,
          })}
        </p>
      )}
    </div>
  );
}
