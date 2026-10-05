import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PLACEMENT_ORDER, placementVisual } from '@/lib/dragPlacement';
import type { CompetitionGrid as CompetitionGridData, GridCell } from '@/types/competition';

/**
 * The episode-by-episode placement matrix.
 *
 * Cells use separated rounded plates rather than a ruled grid. The outcome
 * glyph and short code carry the state even when the quiet tint is unavailable.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. Each cell carries the outcome's glyph, its
 * short code as visible text, and an `sr-only` sentence naming the entrant, the
 * episode and the outcome in words. Strip the colour and the grid still reads.
 *
 * A MISSING CELL IS NOT AN ELIMINATION. Absence of a row means "not in this
 * episode" — which is what every cell after a queen goes home looks like, and
 * also what a season we have not fully imported looks like. It renders as a
 * muted blank with its own `sr-only` wording, visually and audibly distinct
 * from `elim`, because collapsing the two would turn our ignorance into a
 * claim about someone's run.
 *
 * The wrapper scrolls horizontally on its own; the page body must not. The row
 * header is sticky so an entrant's name stays visible while their row scrolls.
 */

function cellKey(name: string, n: number): string {
  return `${name}\u0000${n}`;
}

function Legend() {
  const { t } = useTranslation();
  return (
    <div className="mt-4">
      <p className="mb-2 text-2xs uppercase tracking-wide text-muted-foreground">
        {t('competitions.grid.legend', 'What each mark means')}
      </p>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {PLACEMENT_ORDER.map((outcome) => {
          const v = placementVisual(outcome);
          const Icon = v.Icon;
          return (
            <li
              key={outcome}
              className="flex items-center gap-2 rounded-element px-2 py-1 text-13 shadow-soft"
              style={{ backgroundColor: `hsl(${v.tint})`, color: `hsl(${v.ink})` }}
              title={v.meaning}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="font-bold">{v.code}</span>
              <span>{v.label}</span>
            </li>
          );
        })}
        <li className="flex items-center gap-2 rounded-element bg-muted px-2 py-1 text-13 text-muted-foreground">
          {t('competitions.grid.legendAbsent', 'Blank: not in this episode')}
        </li>
      </ul>
    </div>
  );
}

export function CompetitionGrid({ grid }: { grid: CompetitionGridData }) {
  const { t } = useTranslation();

  const byCell = useMemo(() => {
    const map = new Map<string, GridCell>();
    for (const c of grid.cells) map.set(cellKey(c.name, c.n), c);
    return map;
  }, [grid.cells]);

  return (
    <div>
      <div className="overflow-x-auto">
        <table style={{ borderCollapse: 'separate', borderSpacing: 4 }}>
          <caption className="sr-only">
            {t(
              'competitions.grid.caption',
              'Episode by episode placements for {{edition}}. Each row is one entrant, each column one episode.',
              { edition: grid.edition.title },
            )}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 rounded-element bg-background p-2 text-left"
              >
                <span className="sr-only">{t('competitions.grid.entrant', 'Entrant')}</span>
              </th>
              {grid.axis.map((ep) => (
                <th
                  key={ep.n}
                  scope="col"
                  className="rounded-badge bg-surface-container p-1 text-13 font-bold tabular-nums"
                  title={[ep.title, ep.date].filter(Boolean).join(' · ') || undefined}
                >
                  {ep.n}
                  <span className="sr-only">
                    {' '}
                    {t('competitions.grid.episodeN', 'Episode {{n}}', { n: ep.n })}
                    {ep.title ? `: ${ep.title}` : ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.entrants.map((entrant) => (
              <tr key={entrant.name}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap rounded-element bg-surface-container p-2 text-left"
                >
                  {/* A null slug means this person has no public page — plain
                      text, never a synthesised link. */}
                  {entrant.personality_slug ? (
                    <LocalizedLink
                      to={`/personalities/${entrant.personality_slug}`}
                      className="font-bold text-foreground no-underline hover:underline"
                    >
                      {entrant.name}
                    </LocalizedLink>
                  ) : (
                    <span className="font-bold">{entrant.name}</span>
                  )}
                  <span className="block text-2xs tabular-nums text-muted-foreground">
                    {entrant.placement_label ??
                      (entrant.placement != null
                        ? t('competitions.roster.place', 'Place {{n}}', { n: entrant.placement })
                        : '—')}
                  </span>
                </th>
                {grid.axis.map((ep) => {
                  const cell = byCell.get(cellKey(entrant.name, ep.n));
                  if (!cell) {
                    return (
                      <td key={ep.n} className="rounded-badge bg-muted p-1">
                        <span className="sr-only">
                          {entrant.name},{' '}
                          {t('competitions.grid.episodeN', 'Episode {{n}}', { n: ep.n })}:{' '}
                          {t('competitions.grid.absent', 'not in this episode')}
                        </span>
                      </td>
                    );
                  }
                  const v = placementVisual(cell.o);
                  const Icon = v.Icon;
                  return (
                    <td
                      key={ep.n}
                      // The 1px ink edge is what border-gates the tint, and it
                      // is a WCAG 1.4.11 obligation rather than decoration: the
                      // placement tints measure under 3:1 against the page, so
                      // the edge is the cell's only perceivable boundary. The
                      // rounding and the soft elevation stay; only the border
                      // comes back. Never render one of these fills borderless.
                      className="rounded-badge border border-foreground/70 p-1 text-center align-middle shadow-soft"
                      style={{ backgroundColor: `hsl(${v.tint})`, color: `hsl(${v.ink})` }}
                      title={cell.raw ? `${v.label} (${cell.raw})` : v.label}
                    >
                      <Icon className="mx-auto h-4 w-4" aria-hidden="true" />
                      <span className="block text-3xs font-bold uppercase tracking-tight">
                        {v.code}
                      </span>
                      <span className="sr-only">
                        {entrant.name},{' '}
                        {t('competitions.grid.episodeN', 'Episode {{n}}', { n: ep.n })}: {v.label}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Legend />
    </div>
  );
}

export default CompetitionGrid;
