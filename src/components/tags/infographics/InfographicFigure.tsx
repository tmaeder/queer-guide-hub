/**
 * The frame every figure renders inside.
 *
 * Owns everything that is not the drawing: the ink frame and heading, the
 * accessible wrapper, the data-table fallback, gating, and the citation strip.
 * A figure renderer therefore never has to think about any of it, which is
 * what keeps them to a few dozen lines each.
 *
 * The a11y contract, which is the same for every archetype:
 *
 *   <figure>
 *     <div role="img" aria-label={summary} aria-describedby={tableId}>
 *       …the drawing, with an aria-hidden <svg> and HTML controls…
 *     <button aria-expanded aria-controls={tableId}>Read as a table</button>
 *     <div id={tableId}>…a real <table>…</div>
 *     <figcaption>…caption + sources…</figcaption>
 *   </figure>
 *
 * The table is NOT screen-reader-only. Un-hiding it for everyone serves
 * low-vision readers, print, and anyone who just wants the numbers — and it
 * means the fallback is a thing people see, so it cannot quietly rot. A drift
 * test asserts its row count matches the number of things drawn.
 */

import { Suspense, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { isRtlLocale } from '@/lib/locale';
import { InfographicSources } from './InfographicSources';
import type { InfographicMeta, ResolvedTerm } from './types';

export interface InfographicFigureProps {
  figure: InfographicMeta;
  terms: Readonly<Record<string, ResolvedTerm | undefined>>;
  currentSlug?: string;
  /** True when the whole page is already behind the age gate, so the figure
   *  does not ask a second time for the same thing. */
  pageAlreadyGated: boolean;
  /** Safe mode. An adult figure does not render at all under it — the same
   *  rule `rankSimilarTags` and `TagInterchange` already apply. */
  safeMode: boolean;
}

export function InfographicFigure({
  figure,
  terms,
  currentSlug,
  pageAlreadyGated,
  safeMode,
}: InfographicFigureProps) {
  const { t, i18n } = useTranslation();
  const reducedMotion = useReducedMotion();
  const rtl = isRtlLocale(i18n.language);
  const rawId = useId().replace(/:/g, '');
  const domId = `fig-${figure.id}-${rawId}`;
  const tableId = `${domId}-table`;

  const [tableOpen, setTableOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const View = figure.View;
  const table = useMemo(() => figure.dataTable(), [figure]);

  if (figure.gate.adult && safeMode) return null;

  const needsReveal = figure.gate.adult && !pageAlreadyGated && !revealed;

  return (
    <figure
      id={`figure-${figure.id}`}
      className="m-0 border-[3px] border-foreground"
      aria-labelledby={`${domId}-title`}
    >
      <div className="border-b-2 border-foreground p-4 md:p-6">
        <Eyebrow as="p">{t('tags.figures.eyebrow', 'Diagram')}</Eyebrow>
        <h3 id={`${domId}-title`} className="mt-1 font-display text-headline leading-tight">
          {t(figure.titleKey, figure.titleFallback)}
        </h3>
        <p className="mt-2 max-w-reading text-13 leading-relaxed text-muted-foreground">
          {t(figure.captionKey, figure.captionFallback)}
        </p>
      </div>

      {figure.gate.sensitive && (
        <aside
          role="note"
          aria-label={t('tags.detail.contentNote', 'Content note')}
          className="border-b-2 border-foreground bg-foreground p-4 text-background"
        >
          <p className="text-2xs font-bold uppercase tracking-label text-background/70">
            {t('tags.detail.contentNote', 'Content note')}
          </p>
          <p className="mt-2 text-13 leading-relaxed text-background/90">
            {t(
              'tags.figures.sensitiveBody',
              'This diagram covers a subject some readers find difficult. It is a definition, not advice.',
            )}
          </p>
          {(figure.gate.topics?.length ?? 0) > 0 && (
            <ul className="mt-4 flex list-none flex-wrap gap-2 p-0">
              {figure.gate.topics?.map((topic) => (
                <li
                  key={topic}
                  className="border-2 border-background px-2 py-1 text-2xs font-bold uppercase tracking-label"
                >
                  {topic.replace(/[-_]+/g, ' ')}
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      {needsReveal ? (
        // A closed plate, never an auto-open and never remembered across
        // pages. A figure may be more adult than the term hosting it.
        <div className="p-6 text-center">
          <p className="text-13 text-muted-foreground">
            {t('tags.figures.adultBody', 'This diagram is for adults.')}
          </p>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-4 inline-block border-2 border-foreground px-4 py-2 text-13 font-bold transition-colors hover:bg-foreground hover:text-background"
          >
            {t('tags.figures.adultReveal', '18+ · Show diagram')}
          </button>
        </div>
      ) : (
        <div
          role="img"
          aria-label={t(figure.summaryKey, figure.summaryFallback)}
          aria-describedby={tableId}
          className="p-4 md:p-6"
        >
          <Suspense
            fallback={<TrackLoader label={t('tags.figures.loading', 'Drawing the diagram')} />}
          >
            <View
              terms={terms}
              currentSlug={currentSlug}
              reducedMotion={reducedMotion}
              rtl={rtl}
              domId={domId}
            />
          </Suspense>
        </div>
      )}

      <div className="border-t-2 border-foreground">
        <button
          type="button"
          aria-expanded={tableOpen}
          aria-controls={tableId}
          onClick={() => setTableOpen((v) => !v)}
          className="w-full px-4 py-2 text-start text-2xs font-bold uppercase tracking-label transition-colors hover:bg-surface-container"
        >
          {tableOpen
            ? t('tags.figures.hideTable', 'Hide the table')
            : t('tags.figures.readAsTable', 'Read as a table')}
        </button>
        <div id={tableId} className={cn(!tableOpen && 'sr-only')}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start text-13">
              <caption className="px-4 py-2 text-start text-2xs text-muted-foreground">
                {t(table.captionKey, table.captionFallback)}
              </caption>
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      className="border-t-2 border-foreground px-4 py-2 text-start align-top text-2xs font-bold uppercase tracking-label"
                    >
                      {t(c.key, c.fallback)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.join('|')}>
                    {row.map((cell, i) => (
                      <td
                        key={table.columns[i]?.key ?? String(i)}
                        className="border-t border-border px-4 py-2 align-top leading-snug"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <figcaption>
        <InfographicSources
          sources={figure.sources}
          checkedOn={figure.checkedOn}
          showChecked={figure.encodesRisk}
        />
      </figcaption>
    </figure>
  );
}
