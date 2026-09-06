import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { Competition, RosterEntry } from '@/types/competition';

import { airedYear } from './formatters';

/**
 * Four read-outs over the competition corpus.
 *
 * INLINE SVG AND CSS BARS ONLY — NO CHART LIBRARY. `check-bundle-shape.mjs`
 * treats recharts as HEAVY_UNREACHABLE and fails the build the moment it
 * becomes statically reachable from a public route; a bar chart of ~20 integers
 * does not justify 342 KB. Same call as `MarketplacePriceHistory`.
 *
 * EVERY CHART CARRIES ITS NUMBERS AS TEXT. Bar length is the fast read, but it
 * is never the only one: each figure is repeated in `tabular-nums` beside the
 * bar, and each SVG has a `role="img"` label naming the real values rather than
 * describing the picture. That satisfies WCAG 1.4.1 by construction and means
 * the section still answers its question printed in greyscale.
 *
 * Monochrome throughout. The placement palette in `dragPlacement.ts` is a
 * documented functional-scale exception for the GRID, where a reader follows one
 * run across ten thousand cells; a bar chart of counts has no such argument, so
 * it takes ink like every other chart in the product.
 */

const W = 600;
const H = 160;
const PAD_X = 8;
const PAD_TOP = 8;
const PAD_BOTTOM = 20;

/** One horizontal CSS bar with its number stated in text beside it. */
function BarRow({
  label,
  value,
  max,
  total,
}: {
  label: string;
  value: number;
  max: number;
  total: number;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const share = total > 0 ? (value / total) * 100 : 0;
  return (
    <li className="flex items-center gap-2 py-1 text-13">
      <span className="w-40 shrink-0 truncate" title={label}>
        {label}
      </span>
      <span aria-hidden="true" className="inline-block h-2 flex-1 bg-muted">
        <span className="block h-full bg-foreground/70" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-24 shrink-0 text-right tabular-nums">
        {value} · {share.toFixed(1)}%
      </span>
    </li>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-container bg-card p-4">
      <h3 className="text-title">{title}</h3>
      {note ? <p className="mt-1 text-13 text-muted-foreground">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function CompetitionCharts({
  competitions,
  entries,
}: {
  competitions: Competition[];
  entries: RosterEntry[];
}) {
  const { t } = useTranslation();

  // ── Editions per year ────────────────────────────────────────────────────
  // An edition with no first_aired date is COUNTED NOWHERE rather than dropped
  // into an "unknown" year: an announced season has no year yet, and inventing
  // one would put it on the chart as though it had already happened. The count
  // of undated editions is stated in words underneath instead.
  const perYear = useMemo(() => {
    const counts = new Map<number, number>();
    let undated = 0;
    for (const c of competitions) {
      for (const e of c.editions) {
        const y = airedYear(e.first_aired);
        if (y == null) {
          undated += 1;
          continue;
        }
        counts.set(y, (counts.get(y) ?? 0) + 1);
      }
    }
    const years = [...counts.keys()].sort((a, b) => a - b);
    if (years.length === 0) return { series: [], undated, max: 0, total: 0 };
    const first = years[0];
    const last = years[years.length - 1];
    const series: { year: number; count: number }[] = [];
    for (let y = first; y <= last; y += 1) series.push({ year: y, count: counts.get(y) ?? 0 });
    const max = Math.max(...series.map((s) => s.count), 1);
    const total = series.reduce((sum, s) => sum + s.count, 0);
    return { series, undated, max, total };
  }, [competitions]);

  const yearGeom = useMemo(() => {
    const n = perYear.series.length;
    if (n === 0) return null;
    const usable = W - PAD_X * 2;
    const step = usable / n;
    const barW = Math.max(1, step * 0.7);
    const plotH = H - PAD_TOP - PAD_BOTTOM;
    return {
      step,
      barW,
      x: (i: number) => PAD_X + i * step + (step - barW) / 2,
      y: (v: number) => PAD_TOP + plotH - (v / perYear.max) * plotH,
      h: (v: number) => (v / perYear.max) * plotH,
      baseline: PAD_TOP + plotH,
    };
  }, [perYear]);

  const peakYear = useMemo(() => {
    let best: { year: number; count: number } | null = null;
    for (const s of perYear.series) if (!best || s.count > best.count) best = s;
    return best;
  }, [perYear]);

  // ── Entrants per competition (top 15) ────────────────────────────────────
  const perCompetition = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.competition, (counts.get(e.competition) ?? 0) + 1);
    const all = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { top: all.slice(0, 15), all };
  }, [entries]);

  // ── Age distribution ─────────────────────────────────────────────────────
  // Only rows that HAVE an age. The count with no age on file is reported as a
  // number, not folded into a bucket — the distribution is of what we know.
  const ages = useMemo(() => {
    const buckets = [
      { key: 'u20', label: t('competitions.charts.ageUnder', 'Under 20'), min: 0, max: 19 },
      { key: '20', label: '20–24', min: 20, max: 24 },
      { key: '25', label: '25–29', min: 25, max: 29 },
      { key: '30', label: '30–34', min: 30, max: 34 },
      { key: '35', label: '35–39', min: 35, max: 39 },
      { key: '40', label: '40–44', min: 40, max: 44 },
      { key: '45', label: t('competitions.charts.ageOver', '45 and over'), min: 45, max: 999 },
    ];
    const counts = buckets.map((b) => ({ ...b, count: 0 }));
    let known = 0;
    let unknown = 0;
    let sum = 0;
    let min: number | null = null;
    let max: number | null = null;
    for (const e of entries) {
      const age = e.age;
      if (age == null) {
        unknown += 1;
        continue;
      }
      known += 1;
      sum += age;
      min = min == null ? age : Math.min(min, age);
      max = max == null ? age : Math.max(max, age);
      const bucket = counts.find((b) => age >= b.min && age <= b.max);
      if (bucket) bucket.count += 1;
    }
    return {
      buckets: counts,
      known,
      unknown,
      mean: known > 0 ? sum / known : null,
      min,
      max,
      peak: Math.max(...counts.map((b) => b.count), 1),
    };
  }, [entries, t]);

  // ── Linked to a personality page, or not ─────────────────────────────────
  const linkage = useMemo(() => {
    let linked = 0;
    for (const e of entries) if (e.personality_slug) linked += 1;
    return { linked, unlinked: entries.length - linked, total: entries.length };
  }, [entries]);

  return (
    <div className="flex flex-col gap-8">
      <Panel
        title={t('competitions.charts.perYear', 'Seasons per year')}
        note={t(
          'competitions.charts.perYearNote',
          'Counted by the date the first episode aired. Seasons with no air date yet are left off and counted below.',
        )}
      >
        {yearGeom && perYear.series.length > 0 ? (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="block w-full"
              style={{ height: H }}
              role="img"
              aria-label={t(
                'competitions.charts.perYearAlt',
                '{{total}} seasons aired between {{first}} and {{last}}. The busiest year is {{peakYear}} with {{peakCount}}.',
                {
                  total: perYear.total,
                  first: perYear.series[0].year,
                  last: perYear.series[perYear.series.length - 1].year,
                  peakYear: peakYear?.year ?? '—',
                  peakCount: peakYear?.count ?? 0,
                },
              )}
            >
              <line
                x1={PAD_X}
                y1={yearGeom.baseline}
                x2={W - PAD_X}
                y2={yearGeom.baseline}
                stroke="hsl(var(--border))"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {perYear.series.map((s, i) =>
                s.count > 0 ? (
                  <rect
                    key={s.year}
                    x={yearGeom.x(i)}
                    y={yearGeom.y(s.count)}
                    width={yearGeom.barW}
                    height={yearGeom.h(s.count)}
                    fill="hsl(var(--foreground))"
                    opacity={0.75}
                  />
                ) : null,
              )}
            </svg>
            {/* The numbers, in text. Bar height is the fast read; this is the
                authoritative one. */}
            <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-13 tabular-nums text-muted-foreground">
              {perYear.series.map((s) => (
                <li key={s.year}>
                  <span className="font-bold text-foreground">{s.year}</span> {s.count}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-13 tabular-nums text-muted-foreground">
              {t('competitions.charts.perYearTotal', '{{n}} seasons dated', {
                n: perYear.total,
              })}
              {perYear.undated > 0
                ? ` · ${t('competitions.charts.perYearUndated', '{{n}} with no air date', {
                    n: perYear.undated,
                  })}`
                : null}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            {t('competitions.charts.noDates', 'No season carries an air date.')}
          </p>
        )}
      </Panel>

      <Panel
        title={t('competitions.charts.perCompetition', 'Entrants per competition')}
        note={
          perCompetition.all.length > perCompetition.top.length
            ? t(
                'competitions.charts.perCompetitionNote',
                'The 15 largest of {{n}} competitions. Percentages are of all entrants.',
                { n: perCompetition.all.length },
              )
            : t('competitions.charts.perCompetitionNoteAll', 'Percentages are of all entrants.')
        }
      >
        <ul className="m-0 list-none p-0">
          {perCompetition.top.map((c) => (
            <BarRow
              key={c.name}
              label={c.name}
              value={c.count}
              max={perCompetition.top[0]?.count ?? 1}
              total={entries.length}
            />
          ))}
        </ul>
        {perCompetition.top.length === 0 ? (
          <p className="text-muted-foreground">
            {t('competitions.charts.noEntrants', 'No entrants on file.')}
          </p>
        ) : null}
      </Panel>

      <Panel
        title={t('competitions.charts.ages', 'Age at the time of competing')}
        note={t(
          'competitions.charts.agesNote',
          'Only entrants whose age is on file. Percentages are of that group, not of everyone.',
        )}
      >
        {ages.known > 0 ? (
          <>
            <ul className="m-0 list-none p-0">
              {ages.buckets.map((b) => (
                <BarRow
                  key={b.key}
                  label={b.label}
                  value={b.count}
                  max={ages.peak}
                  total={ages.known}
                />
              ))}
            </ul>
            <p className="mt-2 text-13 tabular-nums text-muted-foreground">
              {t(
                'competitions.charts.agesSummary',
                '{{known}} of {{total}} entrants have an age on file. Youngest {{min}}, oldest {{max}}, mean {{mean}}.',
                {
                  known: ages.known,
                  total: entries.length,
                  min: ages.min ?? '—',
                  max: ages.max ?? '—',
                  mean: ages.mean != null ? ages.mean.toFixed(1) : '—',
                },
              )}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            {t('competitions.charts.noAges', 'No entrant has an age on file.')}
          </p>
        )}
      </Panel>

      <Panel
        title={t('competitions.charts.linkage', 'Entrants with a page on this site')}
        note={t(
          'competitions.charts.linkageNote',
          'An entrant is linked only when a public personality page exists. The rest are named here and nowhere else.',
        )}
      >
        <ul className="m-0 list-none p-0">
          <BarRow
            label={t('competitions.charts.linked', 'Has a page')}
            value={linkage.linked}
            max={Math.max(linkage.linked, linkage.unlinked, 1)}
            total={linkage.total}
          />
          <BarRow
            label={t('competitions.charts.unlinked', 'No page')}
            value={linkage.unlinked}
            max={Math.max(linkage.linked, linkage.unlinked, 1)}
            total={linkage.total}
          />
        </ul>
        <p className="mt-2 text-13 tabular-nums text-muted-foreground">
          {t(
            'competitions.charts.linkageSummary',
            '{{linked}} of {{total}} entrants have a page.',
            {
              linked: linkage.linked,
              total: linkage.total,
            },
          )}
        </p>
      </Panel>
    </div>
  );
}

export default CompetitionCharts;
