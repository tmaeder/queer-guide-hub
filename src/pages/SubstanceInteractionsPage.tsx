import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PageContainer } from '@/components/layout/PageContainer';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useMeta } from '@/hooks/useMeta';
import { interactionVisual, INTERACTION_ORDER } from '@/lib/substanceRisk';

/**
 * /tags/interactions — the whole grid, plus a two-substance checker.
 *
 * WHY THE CHECKER IS FIRST
 *
 * The poster this is modelled on is a browsing artifact: 30x30 cells you scan
 * with a finger. On a phone that is close to unusable, and the actual question
 * is nearly always about a specific pair. So the checker leads and the grid
 * follows for people who want the overview.
 *
 * THE GRID IS RENDERED, NOT SIMULATED
 *
 * One <table> with real <th> row/column headers, so a screen reader announces
 * "MDMA, Alcohol, Caution" instead of reading 900 unlabelled cells. Each cell
 * carries its status as text in the accessible name; the colour is decoration
 * on top of that, never the message. It scrolls inside its own container —
 * `overflow-x: auto` on the wrapper, never on the page body.
 */

interface MatrixAxis {
  id: string;
  slug: string;
  name: string;
}
interface MatrixCell {
  a: string;
  b: string;
  status: string;
  severity: number;
  note: string | null;
}
interface Matrix {
  axis: MatrixAxis[];
  cells: MatrixCell[];
  source: string;
  source_url: string;
}

function useInteractionMatrix() {
  return useQuery({
    queryKey: ['substance-interaction-matrix'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<Matrix> => {
      const { data, error } = await supabase.rpc('substance_interaction_matrix');
      if (error) throw error;
      return data as unknown as Matrix;
    },
  });
}

/** Undirected lookup key. The RPC returns one row per pair, in uuid order. */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function Legend() {
  const { t } = useTranslation();
  return (
    <div className="bg-muted rounded-element p-4">
      <Eyebrow>{t('interactions.legend', 'What the colours mean')}</Eyebrow>
      <ul className="mt-4 flex list-none flex-col gap-2 p-0">
        {INTERACTION_ORDER.map((s) => {
          const v = interactionVisual(s);
          const Icon = v.Icon;
          return (
            <li key={s} className="flex items-start gap-2">
              <span
                className="mt-0.5 inline-flex shrink-0 items-center gap-2 bg-muted rounded-element px-2 py-1.5"
                style={{ backgroundColor: `hsl(${v.tint})`, color: `hsl(${v.ink})` }}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="text-2xs font-bold uppercase tracking-label">{v.label}</span>
              </span>
              <span className="text-13 leading-relaxed text-muted-foreground">{v.meaning}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function SubstanceInteractionsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useInteractionMatrix();
  const [a, setA] = useState('');
  const [b, setB] = useState('');

  useMeta({
    title: 'Drug interaction chart',
    description:
      'Which substances are dangerous to combine. A harm-reduction reference covering 421 combinations, with data from TripSit.',
    canonicalPath: '/tags/interactions',
  });

  const axis = useMemo(() => data?.axis ?? [], [data]);
  const byPair = useMemo(() => {
    const m = new Map<string, MatrixCell>();
    for (const c of data?.cells ?? []) m.set(pairKey(c.a, c.b), c);
    return m;
  }, [data]);

  const selected = a && b && a !== b ? byPair.get(pairKey(a, b)) : undefined;
  const selectedNames =
    a && b
      ? {
          a: axis.find((x) => x.id === a)?.name ?? '',
          b: axis.find((x) => x.id === b)?.name ?? '',
        }
      : null;

  if (isLoading) {
    return (
      <PageContainer>
        <TrackLoader />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Eyebrow>{t('interactions.eyebrow', 'Harm reduction')}</Eyebrow>
      <h1 className="mt-2 font-display text-display">
        {t('interactions.title', 'Drug interaction chart')}
      </h1>
      <p className="mt-4 max-w-[68ch] text-body-lg leading-relaxed text-muted-foreground">
        {t(
          'interactions.intro',
          'What happens when two substances are combined. Check a pair, or read the whole grid. This is a quick reference and not medical advice — a combination that is not listed is one the chart says nothing about, which is not the same as safe.',
        )}
      </p>

      {/* ── Pair checker ─────────────────────────────────────────────── */}
      <section className="mt-8 bg-muted rounded-element p-4" aria-labelledby="checker-h">
        <h2 id="checker-h" className="text-title font-bold">
          {t('interactions.checkTitle', 'Check a combination')}
        </h2>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          {(
            [
              ['a', a, setA, t('interactions.first', 'First substance')],
              ['b', b, setB, t('interactions.second', 'Second substance')],
            ] as const
          ).map(([key, value, set, label]) => (
            <label key={key} className="flex flex-1 flex-col gap-2">
              <span className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                {label}
              </span>
              <select
                value={value}
                onChange={(e) => set(e.target.value)}
                className="bg-card p-2 text-13 font-bold rounded-container shadow-soft"
              >
                <option value="">{t('interactions.choose', 'Choose…')}</option>
                {axis.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div aria-live="polite" className="mt-4">
          {a && b && a === b && (
            <p className="text-13 text-muted-foreground">
              {t('interactions.same', 'Pick two different substances.')}
            </p>
          )}
          {a && b && a !== b && !selected && (
            // Not in the data is its own answer, and it is not "safe".
            <p className="bg-muted rounded-element p-4 text-13 leading-relaxed">
              {t(
                'interactions.noData',
                'This chart has no entry for that pair. That means no information, not a clean bill of health.',
              )}
            </p>
          )}
          {selected &&
            selectedNames &&
            (() => {
              const v = interactionVisual(selected.status);
              const Icon = v.Icon;
              return (
                <div
                  className="bg-muted rounded-element p-4"
                  style={{ backgroundColor: `hsl(${v.tint})`, color: `hsl(${v.ink})` }}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                    <p className="text-title font-bold">
                      {selectedNames.a} + {selectedNames.b}: {v.label}
                    </p>
                  </div>
                  <p className="mt-2 text-13 leading-relaxed">{v.meaning}</p>
                  {selected.note && <p className="mt-2 text-13 leading-relaxed">{selected.note}</p>}
                </div>
              );
            })()}
        </div>
      </section>

      <div className="mt-8">
        <Legend />
      </div>

      {/* ── Full grid ────────────────────────────────────────────────── */}
      <section className="mt-8" aria-labelledby="grid-h">
        <h2 id="grid-h" className="text-title font-bold">
          {t('interactions.gridTitle', 'Every combination')}
        </h2>
        <p className="mt-2 text-13 text-muted-foreground">
          {t('interactions.gridHint', 'Scroll sideways. {{n}} substances, {{c}} combinations.', {
            n: axis.length,
            c: data?.cells.length ?? 0,
          })}
        </p>
        <div className="mt-4 overflow-x-auto bg-muted rounded-element">
          <table className="border-collapse text-2xs">
            <caption className="sr-only">
              {t(
                'interactions.tableCaption',
                'Drug interaction matrix. Each cell gives the risk of combining the row substance with the column substance.',
              )}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-background p-2 text-left">
                  <span className="sr-only">{t('interactions.substance', 'Substance')}</span>
                </th>
                {axis.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    className="h-28 whitespace-nowrap border-b border-border-hairline p-1 align-bottom"
                  >
                    <span className="block origin-bottom-left translate-x-4 -rotate-45 text-left font-bold">
                      {c.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {axis.map((row) => (
                <tr key={row.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap border-r border-border-hairline bg-background p-2 text-left font-bold"
                  >
                    <LocalizedLink
                      to={`/tags/${encodeURIComponent(row.slug)}`}
                      className="text-foreground no-underline hover:underline"
                    >
                      {row.name}
                    </LocalizedLink>
                  </th>
                  {axis.map((col) => {
                    if (row.id === col.id) {
                      return (
                        <td key={col.id} className="border border-border bg-muted p-2">
                          <span className="sr-only">{row.name}</span>
                        </td>
                      );
                    }
                    const cell = byPair.get(pairKey(row.id, col.id));
                    if (!cell) {
                      return (
                        <td key={col.id} className="border border-border p-2">
                          <span className="sr-only">
                            {row.name}, {col.name}: {t('interactions.noEntry', 'no entry')}
                          </span>
                        </td>
                      );
                    }
                    const v = interactionVisual(cell.status);
                    const Icon = v.Icon;
                    return (
                      <td
                        key={col.id}
                        className="bg-muted rounded-element p-2 text-center"
                        style={{ backgroundColor: `hsl(${v.tint})`, color: `hsl(${v.ink})` }}
                      >
                        {/* The status is text in the accessible name; the tint
                            and glyph are the visual layer on top of it. */}
                        <Icon className="mx-auto h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">
                          {row.name}, {col.name}: {v.label}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-8 text-13 leading-relaxed text-muted-foreground">
        {t('interactions.credit', 'Interaction data researched and published by')}{' '}
        <a
          href={data?.source_url ?? 'https://combo.tripsit.me/'}
          target="_blank"
          rel="noopener noreferrer"
        >
          TripSit
        </a>
        .{' '}
        {t('interactions.creditTail', 'Reproduced with attribution as a harm-reduction reference.')}
      </p>
    </PageContainer>
  );
}
