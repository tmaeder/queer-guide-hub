import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PageContainer } from '@/components/layout/PageContainer';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useMeta } from '@/hooks/useMeta';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { transmissionRiskVisual, TRANSMISSION_RISK_ORDER, BloodIcon } from '@/lib/stiRisk';

/**
 * /tags/sti-guide — the full sexual-health reference: the transmission-mode
 * matrix, Match & Protect (which method protects against which STI), and the
 * testing-window timeline.
 *
 * Same accessibility contract as /tags/interactions: real <table>s with row
 * and column headers, the risk always as text in the accessible name, colour
 * and glyphs as decoration on top, and every wide surface scrolling inside
 * its own container — never the page body.
 */

interface MatrixSti {
  id: string;
  slug: string;
  name: string;
  pathogen: 'virus' | 'bacteria';
  vaccine_note?: string | null;
}
interface MatrixPractice {
  slug: string;
  label: string;
  group: string;
}
interface MatrixCell {
  tag: string;
  practice: string;
  risk: string;
  severity: number;
  blood: boolean;
}
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

function Legend() {
  const { t } = useTranslation();
  return (
    <div className="bg-muted rounded-element p-4">
      <Eyebrow>{t('stiGuide.legend', 'What the marks mean')}</Eyebrow>
      <ul className="mt-4 flex list-none flex-col gap-2 p-0">
        {TRANSMISSION_RISK_ORDER.map((risk) => {
          const v = transmissionRiskVisual(risk);
          const Icon = v.Icon;
          return (
            <li key={risk} className="flex items-start gap-2">
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
        <li className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-2 bg-muted rounded-element px-2 py-1.5">
            <BloodIcon className="h-4 w-4" aria-hidden="true" />
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

/** Testing-window bar on a 0–16 week scale. */
const SCALE_WEEKS = 16;

export default function StiGuidePage() {
  const { t } = useTranslation();
  const { data: matrix, isLoading: loadingMatrix } = useTransmissionMatrix();
  const { data: protection, isLoading: loadingProtection } = useProtectionMatrix();

  useMeta({
    title: 'STI guide — transmission, testing, protection',
    description:
      'How sexually transmitted infections spread, when a test can detect them, and which prevention method protects against which STI. A harm-reduction reference.',
    canonicalPath: '/tags/sti-guide',
  });

  const cellByKey = useMemo(() => {
    const m = new Map<string, MatrixCell>();
    for (const c of matrix?.cells ?? []) m.set(`${c.tag}|${c.practice}`, c);
    return m;
  }, [matrix]);

  const protects = useMemo(() => {
    const s = new Set<string>();
    for (const l of protection?.links ?? []) s.add(`${l.tag}|${l.method}`);
    return s;
  }, [protection]);

  const testingByTag = useMemo(() => {
    const m = new Map<string, TestingRow[]>();
    for (const row of protection?.testing ?? []) {
      const list = m.get(row.tag) ?? [];
      list.push(row);
      m.set(row.tag, list);
    }
    return m;
  }, [protection]);

  const groups = useMemo(() => {
    const out: { group: string; practices: MatrixPractice[] }[] = [];
    for (const p of matrix?.practices ?? []) {
      const last = out[out.length - 1];
      if (last && last.group === p.group) last.practices.push(p);
      else out.push({ group: p.group, practices: [p] });
    }
    return out;
  }, [matrix]);

  if (loadingMatrix || loadingProtection) {
    return (
      <PageContainer>
        <TrackLoader />
      </PageContainer>
    );
  }

  const stis = matrix?.stis ?? [];
  const practices = matrix?.practices ?? [];
  const methods = protection?.methods ?? [];

  return (
    <PageContainer>
      <Eyebrow>{t('stiGuide.eyebrow', 'Sexual health')}</Eyebrow>
      <h1 className="mt-2 font-display text-display">{t('stiGuide.title', 'The STI guide')}</h1>
      <p className="mt-4 max-w-[68ch] text-body-lg leading-relaxed text-muted-foreground">
        {t(
          'stiGuide.intro',
          'How infections spread during unprotected sex, when a test can detect them, and which prevention method covers which infection. A quick reference, not medical advice — and a practice that is not marked is one this data says nothing about, which is not the same as no risk.',
        )}
      </p>

      <div className="mt-8">
        <Legend />
      </div>

      {/* ── Transmission matrix ──────────────────────────────────────────── */}
      <section className="mt-8" aria-labelledby="transmission-h">
        <h2 id="transmission-h" className="text-title font-bold">
          {t('stiGuide.matrixTitle', 'How STIs are transmitted')}
        </h2>
        <p className="mt-2 text-13 text-muted-foreground">
          {t('stiGuide.matrixHint', 'Scroll sideways. {{s}} infections, {{p}} practices.', {
            s: stis.length,
            p: practices.length,
          })}
        </p>
        <div className="mt-4 overflow-x-auto bg-muted rounded-element">
          <table className="border-collapse text-2xs">
            <caption className="sr-only">
              {t(
                'stiGuide.matrixCaption',
                'STI transmission matrix. Each cell gives the transmission risk of the column practice for the row infection during unprotected sex.',
              )}
            </caption>
            <thead>
              <tr>
                <td className="sticky left-0 z-10 bg-background" />
                {groups.map((g) => (
                  <th
                    key={g.group}
                    scope="colgroup"
                    colSpan={g.practices.length}
                    className="border-b border-l border-foreground/40 px-2 pt-2 text-left font-bold uppercase tracking-label text-muted-foreground"
                  >
                    {GROUP_LABELS[g.group] ?? g.group}
                  </th>
                ))}
              </tr>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-background p-2 text-left">
                  <span className="sr-only">{t('stiGuide.sti', 'Infection')}</span>
                </th>
                {practices.map((p) => (
                  <th
                    key={p.slug}
                    scope="col"
                    className="h-32 whitespace-nowrap border-b border-border-hairline p-1 align-bottom"
                  >
                    <span className="block origin-bottom-left translate-x-4 -rotate-45 text-left font-bold">
                      {p.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stis.map((sti) => (
                <tr key={sti.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap border-r border-border-hairline bg-background p-2 text-left font-bold"
                  >
                    <LocalizedLink
                      to={`/tags/${encodeURIComponent(sti.slug)}`}
                      className="text-foreground no-underline hover:underline"
                    >
                      {sti.name}
                    </LocalizedLink>
                    <span className="ml-2 font-normal uppercase tracking-label text-muted-foreground">
                      {sti.pathogen === 'virus'
                        ? t('stiGuide.virus', 'virus')
                        : t('stiGuide.bacteria', 'bacteria')}
                    </span>
                  </th>
                  {practices.map((p) => {
                    const cell = cellByKey.get(`${sti.id}|${p.slug}`);
                    if (!cell) {
                      return (
                        <td key={p.slug} className="border border-foreground/20 p-2">
                          <span className="sr-only">
                            {sti.name}, {p.label}: {t('stiGuide.noEntry', 'no documented route')}
                          </span>
                        </td>
                      );
                    }
                    const v = transmissionRiskVisual(cell.risk);
                    const Icon = v.Icon;
                    return (
                      <td
                        key={p.slug}
                        className="bg-muted rounded-element p-2 text-center"
                        style={{ backgroundColor: `hsl(${v.tint})`, color: `hsl(${v.ink})` }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {cell.blood && <BloodIcon className="h-3 w-3" aria-hidden="true" />}
                        </span>
                        <span className="sr-only">
                          {sti.name}, {p.label}: {v.label}
                          {cell.blood ? ` — ${t('stiGuide.bloodNote', 'risk with blood')}` : ''}
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

      {/* ── Match & Protect ─────────────────────────────────────────────── */}
      <section className="mt-12" aria-labelledby="protect-h">
        <h2 id="protect-h" className="text-title font-bold">
          {t('stiGuide.protectTitle', 'Match & protect')}
        </h2>
        <p className="mt-2 max-w-[68ch] text-13 leading-relaxed text-muted-foreground">
          {t(
            'stiGuide.protectIntro',
            'No single method covers everything — combining them is what the promotion of sexual health calls combination prevention. A dot means the method meaningfully protects against that infection.',
          )}
        </p>
        <div className="mt-4 overflow-x-auto bg-muted rounded-element">
          <table className="border-collapse text-2xs">
            <caption className="sr-only">
              {t('stiGuide.protectCaption', 'Which prevention method protects against which STI.')}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-background p-2 text-left">
                  <span className="sr-only">{t('stiGuide.sti', 'Infection')}</span>
                </th>
                {methods.map((m) => (
                  <th
                    key={m.slug}
                    scope="col"
                    className="h-32 whitespace-nowrap border-b border-border-hairline p-1 align-bottom"
                  >
                    <span className="block origin-bottom-left translate-x-4 -rotate-45 text-left font-bold">
                      {m.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(protection?.stis ?? []).map((sti) => (
                <tr key={sti.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 whitespace-nowrap border-r border-border-hairline bg-background p-2 text-left font-bold"
                  >
                    <LocalizedLink
                      to={`/tags/${encodeURIComponent(sti.slug)}`}
                      className="text-foreground no-underline hover:underline"
                    >
                      {sti.name}
                    </LocalizedLink>
                  </th>
                  {methods.map((m) => {
                    const on = protects.has(`${sti.id}|${m.slug}`);
                    return (
                      <td key={m.slug} className="border border-foreground/20 p-2 text-center">
                        {on && (
                          <span
                            className="mx-auto block h-3 w-3 rounded-full bg-foreground"
                            aria-hidden="true"
                          />
                        )}
                        <span className="sr-only">
                          {sti.name}, {m.label}:{' '}
                          {on
                            ? t('stiGuide.protects', 'protects')
                            : t('stiGuide.noProtection', 'no meaningful protection')}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 grid list-none gap-2 p-0 sm:grid-cols-2">
          {methods.map((m) => (
            <li key={m.slug} className="border border-foreground/40 p-2">
              <span className="text-13 font-bold">{m.label}</span>
              <p className="mt-1 text-13 leading-relaxed text-muted-foreground">{m.description}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Testing windows ─────────────────────────────────────────────── */}
      <section className="mt-12" aria-labelledby="testing-h">
        <h2 id="testing-h" className="text-title font-bold">
          {t('stiGuide.testingTitle', 'When to test')}
        </h2>
        <p className="mt-2 max-w-[68ch] text-13 leading-relaxed text-muted-foreground">
          {t(
            'stiGuide.testingIntro',
            'Every STI needs an incubation period before a test can detect it. The bar shows from how many weeks after a risk a test is reliable; testing earlier can miss a real infection.',
          )}
        </p>
        <div className="mt-4 overflow-x-auto bg-muted rounded-element">
          <table className="w-full border-collapse text-2xs">
            <caption className="sr-only">
              {t(
                'stiGuide.testingCaption',
                'Testing windows per STI: earliest reliable test moment, test kind and sample.',
              )}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="p-2 text-left">
                  {t('stiGuide.sti', 'Infection')}
                </th>
                <th scope="col" className="w-1/2 border-l border-foreground/40 p-2 text-left">
                  {t('stiGuide.window', 'Reliable from (weeks after the risk)')}
                </th>
                <th scope="col" className="border-l border-foreground/40 p-2 text-left">
                  {t('stiGuide.sample', 'Sample')}
                </th>
                <th scope="col" className="border-l border-foreground/40 p-2 text-left">
                  {t('stiGuide.vaccineCol', 'Vaccine?')}
                </th>
              </tr>
            </thead>
            <tbody>
              {(protection?.stis ?? []).map((sti) => {
                const rows = testingByTag.get(sti.id) ?? [];
                return rows.map((row, i) => (
                  <tr key={`${sti.id}-${i}`} className="border-t border-foreground/15">
                    {i === 0 && (
                      <th
                        scope="row"
                        rowSpan={rows.length}
                        className="whitespace-nowrap border-r border-border-hairline p-2 text-left align-top font-bold"
                      >
                        <LocalizedLink
                          to={`/tags/${encodeURIComponent(sti.slug)}`}
                          className="text-foreground no-underline hover:underline"
                        >
                          {sti.name}
                        </LocalizedLink>
                      </th>
                    )}
                    <td className="p-2">
                      {row.symptoms_only ? (
                        <span className="font-bold uppercase tracking-label text-muted-foreground">
                          {t('stiGuide.symptomsOnly', 'Only when symptoms are present')}
                        </span>
                      ) : (
                        <div className="relative h-6 min-w-[240px] border border-foreground/40 bg-muted">
                          <div
                            className="absolute inset-y-0 right-0 flex items-center bg-foreground px-2 text-3xs font-bold text-background"
                            style={{
                              left: `${Math.min(((row.earliest_weeks ?? 0) / SCALE_WEEKS) * 100, 90)}%`,
                            }}
                          >
                            {row.test_kind} · {row.earliest_weeks}w+
                          </div>
                          <span className="sr-only">
                            {t('stiGuide.reliableFrom', '{{kind}} reliable from {{n}} weeks', {
                              kind: row.test_kind,
                              n: row.earliest_weeks,
                            })}
                          </span>
                        </div>
                      )}
                      {row.note && (
                        <p className="mt-1 text-3xs text-muted-foreground">{row.note}</p>
                      )}
                    </td>
                    <td className="border-l border-foreground/15 p-2">{row.sample}</td>
                    {i === 0 && (
                      <td
                        rowSpan={rows.length}
                        className="border-l border-foreground/15 p-2 align-top"
                      >
                        {sti.vaccine_note ?? t('stiGuide.noVaccine', '—')}
                      </td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-8 text-13 leading-relaxed text-muted-foreground">
        {t('stiGuide.credit', 'Based on')}{' '}
        <a
          href={matrix?.source_url ?? 'https://depistage.be/'}
          target="_blank"
          rel="noopener noreferrer"
        >
          Depistage.be
        </a>{' '}
        {t('stiGuide.creditVia', 'as presented by Kink Responsibly, Darklands.')}{' '}
        {t('stiGuide.testFinder', 'Find a testing location near you at')}{' '}
        <a href="https://testfinder.info/" target="_blank" rel="noopener noreferrer">
          testfinder.info
        </a>
        .
      </p>
    </PageContainer>
  );
}
