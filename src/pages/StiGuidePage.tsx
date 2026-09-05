import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PageContainer } from '@/components/layout/PageContainer';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { RouteStrip, type RouteStation } from '@/components/transit/RouteStrip';
import { useActiveStation } from '@/hooks/useActiveStation';
import { useMeta } from '@/hooks/useMeta';
import { useGeoCountry } from '@/hooks/useGeoCountry';
import { TestingSitesBand } from '@/components/health/TestingSitesBand';
import { RiskMark } from '@/components/health/RiskMark';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { TRANSMISSION_RISK_ORDER, transmissionRiskVisual } from '@/lib/stiRisk';
import {
  groupPractices,
  orderedPractices,
  routesFor,
  weekOffsetPercent,
  barStartPercent,
  WEEK_TICKS,
  SCALE_WEEKS,
  type Cell,
  type Practice,
  type Sti,
} from '@/lib/stiGuideModel';

/**
 * /tags/sti-guide — the full sexual-health reference: how infections spread,
 * what prevents them, and when a test can detect them.
 *
 * THE FORM IS A WALL CHART, not a spreadsheet. This descends from a printed
 * harm-reduction card (Depistage.be, handed out by Kink Responsibly at
 * Darklands), and the redesign of 2026-09-04 took it back toward that: numbered
 * plates, upright labels, a key you read once, and one question answered per
 * plate in the order a person actually asks them — what am I at risk of, what
 * protects me, when do I test, where do I go.
 *
 * What that replaced, and why each thing had to go:
 *
 * - **Diagonal column headers.** Both wide tables set their `<th>` to `h-32`
 *   and rotated the label -45°. That spent 128px — 23% of the transmission
 *   table's height and 28% of the protection table's — on labels that are
 *   harder to read than upright ones, overflowed the table box on the right
 *   (measured: last header ended at x=1156 inside a table ending at 1286, and
 *   at mobile "Faecal contact (scat)" simply ran out of the frame), and drifted
 *   left of the columns they name because `origin-bottom-left` moves a rotated
 *   box away from its cell. Upright labels wrapping in a narrow column cost
 *   ~56px and sit over their own data.
 *
 * - **Horizontal scroll as the mobile story.** The transmission grid needed
 *   3.66× the viewport at 375px (1254px of table in 343px of container), so a
 *   phone reader saw 3 of 13 practices at a time under 280px of slanted text.
 *   This is the sexual-health reference linked from the main nav; it cannot be
 *   a chart you have to drag. Below `lg` it is now one block per infection
 *   listing only the routes that exist, worst first — no scroll at all. The
 *   grid is the cross-reference view and appears when it fits.
 *
 * - **"Match & protect" as an 11×8 dot grid followed by the same 8 methods as
 *   a description list.** The grid was 663px wide in a 1376px container — half
 *   empty, never scrolling, its `overflow-x-auto` inert — and answered
 *   "method M covers what?" only by cross-referencing a legend printed
 *   directly beneath it. Folding the two into one block per method puts the
 *   name, the description and the infections it covers in one place. The
 *   inverse question ("what protects me from HIV?") is answered where it is
 *   actually asked: on that infection's own card here, and on /tags/hiv.
 *
 * - **A bar with no scale.** The testing bars varied in length against nothing,
 *   so their length carried no quantity. They now sit on a labelled 0–16 week
 *   axis with ticks behind them.
 *
 * Two invariants this page inherits and must keep:
 *
 * 1. **Every filled mark carries its ink border** — see `RiskMark`, which is
 *    now the only thing allowed to draw one. This page previously drew fills
 *    with `border-width: 0`, against an explicit contract in `stiRisk.ts`.
 * 2. **Motion-free.** Health content one click from the crisis surfaces, so it
 *    follows the /help convention: no reveals, no transitions beyond focus.
 */

/** The RPC payload names these three; the shapes live in `stiGuideModel` so
 *  the pure model and the page cannot describe the same row differently. */
type MatrixSti = Sti;
type MatrixPractice = Practice;
type MatrixCell = Cell;

interface TransmissionMatrix {
  stis: MatrixSti[];
  practices: MatrixPractice[];
  cells: MatrixCell[];
  source: string;
  source_url: string;
}
interface ProtectionLink {
  tag: string;
  method: string;
}
interface TestingRow {
  tag: string;
  test_kind: string;
  sample: string;
  earliest_weeks: number | null;
  symptoms_only: boolean;
  note: string | null;
}
interface ProtectionMatrix {
  stis: MatrixSti[];
  methods: { slug: string; label: string; description: string }[];
  links: ProtectionLink[];
  testing: TestingRow[];
}

function useTransmissionMatrix() {
  return useQuery({
    queryKey: ['sti-transmission-matrix'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<TransmissionMatrix> => {
      const { data, error } = await untypedRpc<TransmissionMatrix>('sti_transmission_matrix');
      if (error) throw new Error(error.message);
      return data as unknown as TransmissionMatrix;
    },
  });
}

function useProtectionMatrix() {
  return useQuery({
    queryKey: ['sti-protection-matrix'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<ProtectionMatrix> => {
      const { data, error } = await untypedRpc<ProtectionMatrix>('sti_protection_matrix');
      if (error) throw new Error(error.message);
      return data as unknown as ProtectionMatrix;
    },
  });
}

const GROUP_LABELS: Record<string, string> = {
  anorectal: 'Anal sex & play',
  oral_touching: 'Oral & touching',
  chems: 'Chems',
  vaginal: 'Vaginal sex',
};

/**
 * A numbered plate. The chart this descends from is a sequence of numbered
 * panels, and the number is doing real work: it is the only thing that tells a
 * reader landing mid-page which of the four questions they are inside. The rule
 * above it is the plate edge — this page has no cards, because a wall chart is
 * one surface with divisions, not a stack of containers.
 */
function Plate({
  n,
  id,
  title,
  lead,
  children,
}: {
  n: string;
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-16 border-t-2 border-foreground pt-6">
      <div className="flex items-baseline gap-4">
        <span aria-hidden="true" className="font-display text-headline">
          {n}
        </span>
        <h2 id={id} className="scroll-mt-24 font-display text-display">
          {title}
        </h2>
      </div>
      {lead && (
        <p className="mt-4 max-w-reading text-body-lg leading-relaxed text-muted-foreground">
          {lead}
        </p>
      )}
      <div className="mt-8">{children}</div>
    </section>
  );
}

/**
 * One testing window: the value as TEXT, then the bar as a pure graphic.
 *
 * The first draft printed `{kind} · {n}w+` INSIDE the bar. The bar is
 * `left:{weeks}% right:0`, so its width is `16 − weeks` — the later the window,
 * the narrower the box that has to hold the longer label. Measured at 375px:
 * HIV's *"Rapid test / self-test · 12w+"* got a 76px box, wrapped to three
 * lines inside a fixed 28px one, and the overflow rendered `text-background` on
 * the page background — paper on paper. The `12w+` was sliced in half and the
 * rest was invisible. The single number a reader opens this plate to get was
 * destroyed on the narrowest layout, i.e. exactly where it matters most.
 *
 * No amount of clamping fixes text inside a box whose width is the inverse of
 * the text's importance, so the text moved out. The bar is now 12px of pure
 * graphic and carries no glyphs at all; it can shrink to nothing without
 * costing a character. Its left edge is the datum — see the plate's lead.
 */
function TestingWindow({ row }: { row: TestingRow }) {
  const { t } = useTranslation();

  if (row.symptoms_only) {
    return (
      <span className="border inline-block rounded-element border-dashed border-foreground px-2 py-1.5 text-2xs font-bold uppercase tracking-label">
        {t('stiGuide.symptomsOnly', 'Only when symptoms are present')}
      </span>
    );
  }

  return (
    <>
      <span className="block text-2xs font-bold">
        {row.test_kind} · {t('stiGuide.fromWeeks', '{{n}}w+', { n: row.earliest_weeks })}
      </span>
      <span aria-hidden="true" className="relative mt-1.5 block h-3">
        {/* Ticks sit behind the bar so a value can be read off the chart
            without a trip back to the axis. */}
        {WEEK_TICKS.map((w) => (
          <span
            key={w}
            className="absolute inset-y-0 w-px bg-border"
            style={{ left: `${weekOffsetPercent(w)}%` }}
          />
        ))}
        <span
          className="absolute inset-y-0 right-0 bg-foreground"
          style={{ left: `${barStartPercent(row.earliest_weeks ?? 0)}%` }}
        />
      </span>
      <span className="sr-only">
        {t('stiGuide.reliableFrom', '{{kind}} reliable from {{n}} weeks', {
          kind: row.test_kind,
          n: row.earliest_weeks,
        })}
      </span>
    </>
  );
}

/** The key. Read once, applies to every mark on the page. */
function Key() {
  const { t } = useTranslation();
  return (
    <div className="mt-10 border-t border-border-hairline pt-4">
      <Eyebrow>{t('stiGuide.legend', 'What the marks mean')}</Eyebrow>
      <ul className="mt-4 grid list-none gap-x-8 gap-y-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
        {TRANSMISSION_RISK_ORDER.map((risk) => (
          <li key={risk} className="flex items-start gap-2">
            <RiskMark risk={risk} label className="mt-0.5 shrink-0" />
            <span className="text-13 leading-relaxed text-muted-foreground">
              {transmissionRiskVisual(risk).meaning}
            </span>
          </li>
        ))}
        {/* The droplet is drawn ON a tinted mark everywhere else on this page —
            it is a modifier, never a standalone chip. The first draft hand-rolled
            a paper swatch here, which broke the row's grammar (1px against every
            real mark's 2px) and taught a mark the chart never draws. It also
            reached for `border-foreground` — the theme token `RISK_MARK_BORDER`
            exists to avoid, inverting in dark mode — inside the very legend that
            defines the vocabulary. It is a real mark now. */}
        <li className="flex items-start gap-2">
          <span className="mt-0.5 flex shrink-0 items-center gap-2">
            <RiskMark risk="high" blood describedByRow />
            <span className="text-2xs font-bold uppercase tracking-label">
              {t('stiGuide.blood', 'With blood')}
            </span>
          </span>
          <span className="text-13 leading-relaxed text-muted-foreground">
            {t(
              'stiGuide.bloodMeaning',
              'Risk exists — or rises sharply — when blood is involved (fisting, menstruation, lesions, slamming).',
            )}
          </span>
        </li>
      </ul>
    </div>
  );
}

/**
 * No stations until the plates exist.
 *
 * `useActiveStation` seeds itself from the inbound fragment, then an effect
 * re-runs the jump once the headings are in the DOM. Handing it the real list
 * while the page is still a `<TrackLoader/>` meant that effect fired against a
 * document with none of those ids: `getElementById` returned null, it never
 * pinned, its dep list (`[sections.length]`) never changed so it never retried,
 * and its scroll spy fell through to `sections[0]` — which differs from the
 * seeded id, so it recorded a USER MOVE and rewrote the hash.
 *
 * Measured: a cold load of `/tags/sti-guide#testing-h` scrolled to the right
 * plate, then relabelled the rail `transmission-h` and rewrote the URL to
 * `#transmission-h`. The rail exists so a reader can send someone one plate;
 * this made every such link decay to plate 01 on arrival. Swapping to the real
 * list only once the data has landed changes `sections.length` 0 → 4, which is
 * exactly the signal that effect waits for.
 */
const NO_PLATES: RouteStation[] = [];

export default function StiGuidePage() {
  const { t } = useTranslation();
  const { data: matrix, isLoading: loadingMatrix, isError: matrixError } = useTransmissionMatrix();
  const {
    data: protection,
    isLoading: loadingProtection,
    isError: protectionError,
  } = useProtectionMatrix();
  const geo = useGeoCountry();

  const ready = !loadingMatrix && !loadingProtection && !matrixError && !protectionError;

  /** Titles go through `t()` like the headings they name. As a module constant
   *  this list could not, so the first translation to land would have put an
   *  English rail over translated plates — and `useActiveStation` matches on
   *  `id`, so nothing would have complained. */
  const plates = useMemo<RouteStation[]>(
    () => [
      { id: 'transmission-h', title: t('stiGuide.matrixTitle', 'How STIs are transmitted') },
      { id: 'protect-h', title: t('stiGuide.protectTitle', 'What protects you') },
      { id: 'testing-h', title: t('stiGuide.testingTitle', 'When to test') },
      // The id `TestingSitesBand` puts on its own heading.
      { id: 'testing-sites', title: t('testing.where_to_test', 'Where to get tested') },
    ],
    [t],
  );

  const { activeId, goToStation } = useActiveStation(ready ? plates : NO_PLATES);

  useMeta({
    title: 'STI guide — transmission, testing, protection',
    description:
      'How sexually transmitted infections spread, when a test can detect them, and which prevention method protects against which STI. A harm-reduction reference.',
    canonicalPath: '/tags/sti-guide',
  });

  /** Grouped by KEY, ordered by the declared vocabulary — never run-length
   *  encoded off arrival order. See the note in `stiGuideModel.ts`: the RPC
   *  does not sort, and the old encoding printed two of the four bands twice. */
  const groups = useMemo(() => groupPractices(matrix?.practices ?? []), [matrix]);
  const practices = useMemo(() => orderedPractices(groups), [groups]);

  const cellByKey = useMemo(() => {
    const m = new Map<string, MatrixCell>();
    for (const c of matrix?.cells ?? []) m.set(`${c.tag}|${c.practice}`, c);
    return m;
  }, [matrix]);

  /**
   * `sti_protection_matrix`'s `links` aggregate carries no ORDER BY — unlike
   * its `methods` and `testing` arrays — so both maps below inherit whatever
   * order Postgres hands back. Left alone that means "Protects against" can
   * reorder between two deploys with no data change, and the same infection's
   * protections print in one order here and another on `/tags/<slug>` (which
   * gets `m.sort` from `get_tag_sti_profile`).
   *
   * Both are therefore sorted against a list that IS ordered: `stis` for the
   * chips, `methods` for the reverse lookup. Client-side, because the fix has
   * to hold for the deployed RPC as it exists today.
   */
  const stiRank = useMemo(
    () => new Map((protection?.stis ?? []).map((s, i) => [s.id, i])),
    [protection],
  );
  const methodRank = useMemo(
    () => new Map((protection?.methods ?? []).map((m, i) => [m.slug, i])),
    [protection],
  );

  /** method slug → the infections it meaningfully protects against. Built in
   *  the methods' direction because that is the direction plate 02 reads. */
  const stisByMethod = useMemo(() => {
    const byId = new Map((protection?.stis ?? []).map((s) => [s.id, s]));
    const m = new Map<string, MatrixSti[]>();
    for (const l of protection?.links ?? []) {
      const sti = byId.get(l.tag);
      if (!sti) continue;
      const list = m.get(l.method) ?? [];
      list.push(sti);
      m.set(l.method, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => (stiRank.get(a.id) ?? 0) - (stiRank.get(b.id) ?? 0));
    }
    return m;
  }, [protection, stiRank]);

  /** The reverse lookup, for the per-infection cards. */
  const methodsBySti = useMemo(() => {
    const bySlug = new Map((protection?.methods ?? []).map((x) => [x.slug, x]));
    const m = new Map<string, { slug: string; label: string }[]>();
    for (const l of protection?.links ?? []) {
      const method = bySlug.get(l.method);
      if (!method) continue;
      const list = m.get(l.tag) ?? [];
      list.push(method);
      m.set(l.tag, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => (methodRank.get(a.slug) ?? 0) - (methodRank.get(b.slug) ?? 0));
    }
    return m;
  }, [protection, methodRank]);

  const testingByTag = useMemo(() => {
    const m = new Map<string, TestingRow[]>();
    for (const row of protection?.testing ?? []) {
      const list = m.get(row.tag) ?? [];
      list.push(row);
      m.set(row.tag, list);
    }
    return m;
  }, [protection]);

  if (loadingMatrix || loadingProtection) {
    return (
      <PageContainer>
        <TrackLoader />
      </PageContainer>
    );
  }

  // Only `isLoading` was consumed before, so a failed RPC rendered the whole
  // chart EMPTY and authoritative — masthead, key, four plates, and a lead
  // reading "0 infections across 0 practices" — with no error and no retry. On
  // a page whose entire subject is which activities carry risk, a blank grid
  // does not read as "we could not load this", it reads as "no risk here". An
  // empty safety chart is worse than no safety chart.
  if (matrixError || protectionError) {
    return (
      <PageContainer>
        <Eyebrow>{t('stiGuide.eyebrow', 'Sexual health')}</Eyebrow>
        <h1 className="mt-2 font-display text-display">{t('stiGuide.title', 'The STI guide')}</h1>
        <p className="mt-6 max-w-reading text-body-lg leading-relaxed">
          {t(
            'stiGuide.loadError',
            'This reference could not be loaded, so nothing below it can be trusted right now. Reload the page, and if it keeps failing, use the source directly rather than assuming an activity is safe.',
          )}
        </p>
        <p className="mt-6">
          <a href="https://depistage.be/" target="_blank" rel="noopener noreferrer">
            Depistage.be
          </a>
        </p>
      </PageContainer>
    );
  }

  const stis = matrix?.stis ?? [];
  const methods = protection?.methods ?? [];
  const pathogenLabel = (p: string) =>
    p === 'virus' ? t('stiGuide.virus', 'virus') : t('stiGuide.bacteria', 'bacteria');

  return (
    <PageContainer>
      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <Eyebrow>{t('stiGuide.eyebrow', 'Sexual health')}</Eyebrow>
      <h1 className="mt-2 font-display text-hero">{t('stiGuide.title', 'The STI guide')}</h1>
      <p className="mt-6 max-w-reading text-body-lg leading-relaxed">
        {t(
          'stiGuide.intro',
          'How infections spread during unprotected sex, when a test can detect them, and which prevention method covers which infection. A quick reference, not medical advice.',
        )}
      </p>
      {/* Stated up here rather than as a footnote by the chart. A gap in the
          grid is the single most misreadable thing on this page, and the
          sentence that disarms it has to arrive before the grid, not after. */}
      <p className="mt-2 max-w-reading text-13 font-bold leading-relaxed">
        {t(
          'stiGuide.unmarked',
          'A practice that is not marked is one this data says nothing about. That is not the same as no risk.',
        )}
      </p>

      <Key />

      {/* The four plates as stations. Earns its place on length alone: the
          per-infection blocks put the narrow layout at ~12,600px, so "when do I
          test" is eleven infection blocks below the fold and a reader who came
          for it would otherwise scroll the whole transmission chart to reach
          it. Anchors, not buttons — see RouteStrip: a section of this page
          becomes linkable, which for a reference someone sends to a partner is
          the difference between "read the STI guide" and "read this bit". */}
      <RouteStrip
        stations={plates}
        activeId={activeId}
        onNavigate={goToStation}
        orientation="horizontal"
        label={t('stiGuide.sections', 'Sections')}
        className="mt-8"
      />

      {/* ── 01 · How it spreads ──────────────────────────────────────────── */}
      <Plate
        n="01"
        id="transmission-h"
        title={t('stiGuide.matrixTitle', 'How STIs are transmitted')}
        lead={t(
          'stiGuide.matrixLead',
          'Every documented route, during sex without protection. {{s}} infections across {{p}} practices.',
          { s: stis.length, p: practices.length },
        )}
      >
        {/* Cross-reference view. Appears only where all 13 columns fit; below
            that the reader gets the per-infection blocks instead, which say the
            same thing without a drag gesture. */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[60rem] border-collapse">
            <caption className="sr-only">
              {t(
                'stiGuide.matrixCaption',
                'STI transmission matrix. Each cell gives the transmission risk of the column practice for the row infection during unprotected sex.',
              )}
            </caption>
            {/* Real <colgroup> elements. `scope="colgroup"` names the group a
                header spans, and with no colgroups in the table there were no
                groups for it to name — the attribute was decoration, and the
                four practice bands existed only as a visual rule. Emitting them
                makes the grouping a structure assistive tech can actually walk,
                which on a 13-column risk chart is the difference between "which
                band am I in" and counting columns. */}
            <colgroup />
            {groups.map((g) => (
              <colgroup key={g.group} span={g.practices.length} />
            ))}
            <thead>
              <tr>
                <td className="w-40" />
                {groups.map((g) => (
                  <th
                    key={g.group}
                    scope="colgroup"
                    colSpan={g.practices.length}
                    className="border-b-2 border-l-2 border-foreground px-2 pb-2 text-left text-2xs font-bold uppercase tracking-label"
                  >
                    {GROUP_LABELS[g.group] ?? g.group}
                  </th>
                ))}
              </tr>
              <tr>
                <th scope="col" className="w-40 align-bottom">
                  <span className="sr-only">{t('stiGuide.sti', 'Infection')}</span>
                </th>
                {groups.flatMap((g) =>
                  g.practices.map((p, i) => (
                    <th
                      key={p.slug}
                      scope="col"
                      className={`w-[7.5%] px-1.5 pb-2 pt-4 align-bottom text-2xs font-bold leading-tight ${
                        i === 0 ? 'border-l-2 border-foreground' : ''
                      }`}
                    >
                      {p.label}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {stis.map((sti) => (
                <tr key={sti.id}>
                  <th
                    scope="row"
                    className="border-r-2 border-t border-border-hairline border-r-foreground py-1.5 pr-4 text-left align-middle"
                  >
                    <LocalizedLink
                      to={`/tags/${encodeURIComponent(sti.slug)}`}
                      className="text-13 font-bold text-foreground no-underline hover:underline"
                    >
                      {sti.name}
                    </LocalizedLink>
                    <span className="ml-2 text-3xs uppercase tracking-label text-muted-foreground">
                      {pathogenLabel(sti.pathogen)}
                    </span>
                  </th>
                  {groups.flatMap((g) =>
                    g.practices.map((p, i) => {
                      const cell = cellByKey.get(`${sti.id}|${p.slug}`);
                      const edge = i === 0 ? 'border-l-2 border-l-foreground' : '';
                      if (!cell) {
                        return (
                          <td
                            key={p.slug}
                            className={`border-t border-border-hairline px-0.5 py-1.5 text-center align-middle ${edge}`}
                          >
                            {/* A gap is a statement, not a void. Prints a mark
                                so the reader can see the cell was considered. */}
                            <span aria-hidden="true" className="text-13 text-muted-foreground/50">
                              ·
                            </span>
                            <span className="sr-only">
                              {sti.name}, {p.label}: {t('stiGuide.noEntry', 'no documented route')}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={p.slug}
                          className={`border-t border-border-hairline px-0.5 py-1.5 align-middle ${edge}`}
                        >
                          <RiskMark
                            risk={cell.risk}
                            blood={cell.blood}
                            fill
                            srLabel={`${sti.name}, ${p.label}: ${transmissionRiskVisual(cell.risk).label}${
                              cell.blood ? ` — ${t('stiGuide.bloodNote', 'risk with blood')}` : ''
                            }`}
                          />
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Narrow view: one block per infection, worst route first. Not a
            degraded table — a different question, asked the way someone on a
            phone asks it. */}
        <ul className="m-0 list-none p-0 lg:hidden">
          {stis.map((sti) => {
            const routes = routesFor(sti, practices, matrix?.cells ?? []);
            const prevention = methodsBySti.get(sti.id) ?? [];
            return (
              <li key={sti.id} className="border-t-2 border-foreground py-6 first:border-t-0">
                <h3 className="flex flex-wrap items-baseline gap-x-2">
                  <LocalizedLink
                    to={`/tags/${encodeURIComponent(sti.slug)}`}
                    className="font-display text-headline text-foreground no-underline hover:underline"
                  >
                    {sti.name}
                  </LocalizedLink>
                  <span className="text-2xs uppercase tracking-label text-muted-foreground">
                    {pathogenLabel(sti.pathogen)}
                  </span>
                </h3>

                {routes.length > 0 ? (
                  <ul className="m-0 mt-4 list-none p-0">
                    {routes.map((r) => (
                      <li
                        key={r.practice.slug}
                        className="flex items-center gap-2 border-b border-border-hairline py-2 last:border-b-0"
                      >
                        <RiskMark
                          risk={r.risk}
                          blood={r.blood}
                          size="sm"
                          srLabel={`${transmissionRiskVisual(r.risk).label}${
                            r.blood ? ` — ${t('stiGuide.bloodNote', 'risk with blood')}` : ''
                          }`}
                          className="shrink-0"
                        />
                        <span className="text-13 font-bold">{r.practice.label}</span>
                        <span className="ml-auto text-3xs uppercase tracking-label text-muted-foreground">
                          {GROUP_LABELS[r.practice.group] ?? r.practice.group}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-13 text-muted-foreground">
                    {t('stiGuide.noRoutes', 'No transmission route is documented here.')}
                  </p>
                )}

                {prevention.length > 0 && (
                  <p className="mt-2 text-13 leading-relaxed">
                    <span className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                      {t('stiGuide.protectedBy', 'Protected by')}
                    </span>{' '}
                    {prevention.map((m) => m.label).join(' · ')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Plate>

      {/* ── 02 · What protects you ───────────────────────────────────────── */}
      <Plate
        n="02"
        id="protect-h"
        title={t('stiGuide.protectTitle', 'What protects you')}
        lead={t(
          'stiGuide.protectIntro',
          'No single method covers everything — stacking them is what public health calls combination prevention.',
        )}
      >
        <ul className="m-0 grid list-none gap-x-12 gap-y-8 p-0 md:grid-cols-2">
          {methods.map((m) => {
            const covered = stisByMethod.get(m.slug) ?? [];
            return (
              <li key={m.slug} className="border-t-2 border-foreground pt-4">
                <h3 className="text-title font-bold">{m.label}</h3>
                <p className="mt-2 max-w-reading text-13 leading-relaxed text-muted-foreground">
                  {m.description}
                </p>
                <p className="mt-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
                  {covered.length > 0
                    ? t('stiGuide.covers', 'Protects against')
                    : t('stiGuide.coversNone', 'Not an infection-specific method')}
                </p>
                {covered.length > 0 && (
                  <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
                    {covered.map((s) => (
                      <li key={s.id}>
                        <LocalizedLink
                          to={`/tags/${encodeURIComponent(s.slug)}`}
                          className="border inline-block border-foreground px-2 py-1.5 text-2xs font-bold text-foreground no-underline hover:bg-foreground hover:text-background"
                        >
                          {s.name}
                        </LocalizedLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </Plate>

      {/* ── 03 · When to test ────────────────────────────────────────────── */}
      <Plate
        n="03"
        id="testing-h"
        title={t('stiGuide.testingTitle', 'When to test')}
        lead={t(
          'stiGuide.testingIntro',
          // The bar spans `weeks → 16`, so its LENGTH encodes 16 minus the
          // window, not the window: chlamydia at 2w draws the longest bar of
          // all. The first draft said "the bar shows how many weeks…", which
          // told a reader to read the exact inverse of the datum. The mark that
          // carries the number is the bar's LEFT EDGE, and the copy now says so.
          'Every infection needs an incubation period before a test can find it. Each bar starts at the point a test becomes reliable and runs to the end of the scale — testing before it starts can miss a real infection.',
        )}
      >
        {/* Wide: one table, all four columns visible, no scroll. */}
        <div className="hidden lg:block">
          <table className="w-full border-collapse">
            <caption className="sr-only">
              {t(
                'stiGuide.testingCaption',
                'Testing windows per STI: earliest reliable test moment, test kind and sample.',
              )}
            </caption>
            <thead>
              <tr className="border-b-2 border-foreground">
                <th scope="col" className="w-40 pb-2 text-left text-2xs uppercase tracking-label">
                  {t('stiGuide.sti', 'Infection')}
                </th>
                <th scope="col" className="w-1/2 pb-2 pl-4 text-left">
                  <span className="text-2xs uppercase tracking-label">
                    {t('stiGuide.window', 'Weeks after the risk')}
                  </span>
                  {/* The axis. A bar length only means a quantity against a
                      scale; the ruler is what makes 6w and 12w comparable.

                      Each label is placed by `weekOffsetPercent` — the SAME
                      function that places the tick rules and the bars below —
                      rather than by `justify-between`. Flex distributes label
                      BOXES while a tick is a point, so the two only coincide by
                      luck at evenly-spaced values; add a tick at 6 and the
                      numbers would silently stop naming the lines they sit
                      above. The end labels are anchored rather than centred so
                      the scale cannot overhang into the next column. */}
                  <span
                    aria-hidden="true"
                    className="relative mt-1 block h-4 text-3xs font-bold text-muted-foreground"
                  >
                    {WEEK_TICKS.map((w, i) => (
                      <span
                        key={w}
                        className="absolute top-0"
                        style={{
                          left: `${weekOffsetPercent(w)}%`,
                          transform:
                            i === 0
                              ? undefined
                              : i === WEEK_TICKS.length - 1
                                ? 'translateX(-100%)'
                                : 'translateX(-50%)',
                        }}
                      >
                        {w}
                      </span>
                    ))}
                  </span>
                </th>
                <th scope="col" className="pb-2 pl-4 text-left text-2xs uppercase tracking-label">
                  {t('stiGuide.sample', 'Sample')}
                </th>
                <th scope="col" className="pb-2 pl-4 text-left text-2xs uppercase tracking-label">
                  {t('stiGuide.vaccineCol', 'Vaccine?')}
                </th>
              </tr>
            </thead>
            {/* One <tbody> per infection so `scope="rowgroup"` on the name is
                true for every row it spans. A `scope="row"` header anchors to
                its OWN row, so on the three infections with two test kinds
                (syphilis, hep C, HIV) rows 2..n lost the association. */}
            {(protection?.stis ?? []).map((sti) => {
              const rows = testingByTag.get(sti.id) ?? [];
              const nameCell = (
                <th
                  scope="rowgroup"
                  rowSpan={Math.max(rows.length, 1)}
                  className="py-2 pr-4 text-left align-top"
                >
                  <LocalizedLink
                    to={`/tags/${encodeURIComponent(sti.slug)}`}
                    className="text-13 font-bold text-foreground no-underline hover:underline"
                  >
                    {sti.name}
                  </LocalizedLink>
                </th>
              );
              const vaccineCell = (
                <td rowSpan={Math.max(rows.length, 1)} className="py-2 pl-4 align-top text-13">
                  {sti.vaccine_note ?? t('stiGuide.noVaccine', '—')}
                </td>
              );

              // An infection with no window row used to vanish from this plate
              // ENTIRELY — `rows.map` on an empty array emits nothing, and both
              // the name and the vaccine note were gated on `i === 0`. Nothing
              // requires a row in `sti_testing_windows`, so deleting one would
              // silently delete an infection from "When to test" and a reader
              // would conclude it cannot be tested. Same class as the `!cell`
              // branch in plate 01, which states absence out loud.
              if (rows.length === 0) {
                return (
                  <tbody key={sti.id}>
                    <tr className="border-b border-border-hairline">
                      {nameCell}
                      <td className="py-2 pl-4 align-top text-13 text-muted-foreground" colSpan={2}>
                        {t('stiGuide.noWindow', 'No testing window recorded.')}
                      </td>
                      {vaccineCell}
                    </tr>
                  </tbody>
                );
              }

              return (
                <tbody key={sti.id}>
                  {rows.map((row, i) => (
                    <tr
                      key={`${sti.id}-${row.test_kind}-${row.sample}-${i}`}
                      className="border-b border-border-hairline"
                    >
                      {i === 0 && nameCell}
                      <td className="py-2 pl-4 align-top">
                        <TestingWindow row={row} />
                        {row.note && (
                          <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
                            {row.note}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pl-4 align-top text-13">{row.sample}</td>
                      {i === 0 && vaccineCell}
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>

        {/* Narrow: blocks, not a 640px drag. The file header calls horizontal
            scroll unacceptable for this page and the first draft then shipped
            it one plate later — measured at 375px, this table needed 640px in a
            343px scroller and pushed "Sample" and "Vaccine?" off-screen. */}
        <ul className="m-0 list-none p-0 lg:hidden">
          {(protection?.stis ?? []).map((sti) => {
            const rows = testingByTag.get(sti.id) ?? [];
            return (
              <li key={sti.id} className="border-t-2 border-foreground py-6 first:border-t-0">
                <h3>
                  <LocalizedLink
                    to={`/tags/${encodeURIComponent(sti.slug)}`}
                    className="font-display text-headline text-foreground no-underline hover:underline"
                  >
                    {sti.name}
                  </LocalizedLink>
                </h3>
                {rows.length === 0 ? (
                  <p className="mt-2 text-13 text-muted-foreground">
                    {t('stiGuide.noWindow', 'No testing window recorded.')}
                  </p>
                ) : (
                  rows.map((row, i) => (
                    <div
                      key={`${sti.id}-${row.test_kind}-${row.sample}-${i}`}
                      className="mt-4 border-t border-border-hairline pt-4 first:border-t-0 first:pt-0"
                    >
                      <TestingWindow row={row} />
                      <p className="mt-2 text-2xs text-muted-foreground">
                        {t('stiGuide.sampleIs', 'Sample: {{sample}}', { sample: row.sample })}
                      </p>
                      {row.note && (
                        <p className="mt-1.5 text-2xs leading-relaxed text-muted-foreground">
                          {row.note}
                        </p>
                      )}
                    </div>
                  ))
                )}
                <p className="mt-4 text-2xs leading-relaxed text-muted-foreground">
                  <span className="font-bold uppercase tracking-label">
                    {t('stiGuide.vaccineCol', 'Vaccine?')}
                  </span>{' '}
                  {sti.vaccine_note ?? t('stiGuide.noVaccineLong', 'None.')}
                </p>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-13 text-muted-foreground">
          {t('stiGuide.axisNote', 'Scale runs 0 to {{n}} weeks after the risk.', {
            n: SCALE_WEEKS,
          })}
        </p>
      </Plate>

      {/* ── 04 · Where to go ─────────────────────────────────────────────── */}
      <TestingSitesBand countryCode={geo.country} limit={8} plate="04" />

      <p className="mt-12 border-t border-border-hairline pt-4 text-13 leading-relaxed text-muted-foreground">
        {t('stiGuide.credit', 'Based on')}{' '}
        <a
          href={matrix?.source_url ?? 'https://depistage.be/'}
          target="_blank"
          rel="noopener noreferrer"
        >
          Depistage.be
        </a>{' '}
        {t('stiGuide.creditVia', 'as presented by Kink Responsibly, Darklands.')}
      </p>
    </PageContainer>
  );
}
