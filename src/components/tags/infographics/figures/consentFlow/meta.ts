import { lazyRetry } from '@/utils/lazyRetry';
import type { InfographicMeta } from '../../types';
import { EDGES, NODES } from './data';

export const consentFlowMeta: InfographicMeta = {
  id: 'consent-flow',
  archetype: 'flow-graph',
  // The outcome plates ARE risk statements, so the figure takes the locked
  // trip-safety palette and — by construction of the type — cannot also name
  // a track. The LINE still has a colour; `track` is set on the renderer,
  // because drawing a route is not encoding a risk.
  encodesRisk: true,
  titleKey: 'tags.figures.consentFlow.title',
  titleFallback: 'The line that stops',
  captionKey: 'tags.figures.consentFlow.caption',
  captionFallback:
    'Consent as a route with signals, one speed restriction and no final destination — it loops back to the check-in and stays there. Not a legal test: the law differs by country.',
  summaryKey: 'tags.figures.consentFlow.summary',
  summaryFallback:
    'A branching line. Asking without an answer, and anything that is not a clear yes, end at buffer stops. Capacity is a hatched speed-restriction section rather than a yes/no signal. The line does not terminate in approval — it loops back to a check-in signal that can be answered again at any time.',
  checkedOn: '2026-09-02',
  // Not adult, and not flagged sensitive: a content note on the definition of
  // consent would be the wrong instinct. The test `TagSafetyCallout` applies
  // is "would a reader be harmed by not noticing this?", and this page fails
  // it in the other direction.
  gate: { adult: false, sensitive: false },
  teaches: [
    { slug: 'consent', role: 'subject', anchor: 'asked' },
    { slug: 'aftercare', role: 'taught', anchor: 'stop-now' },
    { slug: 'chemsex', role: 'taught', anchor: 'capacity' },
    { slug: 'power-exchange', role: 'mentioned' },
    // Deprecated. The chip renders without the affordance rather than
    // pretending the term is live.
    { slug: 'negotiation', role: 'mentioned' },
    // Neither of these exists yet — which is the point of teaching them here.
    // The resolver renders an unknown slug as plain text, never a dead link.
    { slug: 'safeword', role: 'taught', anchor: 'checkin' },
    { slug: 'hard-limit', role: 'taught', anchor: 'not-a-yes' },
  ],
  sources: [
    {
      kind: 'organisation',
      publisher: 'Rape Crisis England & Wales',
      title: 'What is consent?',
      url: 'https://rapecrisis.org.uk/get-informed/types-of-sexual-violence/what-is-consent/',
      supports:
        'Consent as freely given, ongoing and revocable; the absence of a "no" is not agreement.',
    },
    {
      kind: 'organisation',
      publisher: 'RAINN',
      title: 'What consent looks like',
      url: 'https://rainn.org/articles/what-is-consent',
      supports:
        'Capacity: someone incapacitated by drink or drugs, or asleep, cannot consent — and that agreeing once does not carry forward.',
    },
    {
      kind: 'organisation',
      publisher: 'National Coalition for Sexual Freedom',
      title: 'Consent counts',
      url: 'https://www.ncsfreedom.org/key-programs/consent-counts',
      supports:
        'Withdrawal at any point, and the check-in as an ongoing signal rather than a one-time gate — the framing kink communities already use.',
    },
  ],
  View: lazyRetry(() => import('./ConsentFlow')),
  dataTable: () => ({
    captionKey: 'tags.figures.consentFlow.tableCaption',
    captionFallback: 'Every stop on the line, and where it leads',
    columns: [
      { key: 'tags.figures.table.stop', fallback: 'Stop' },
      { key: 'tags.figures.table.kind', fallback: 'Kind' },
      { key: 'tags.figures.table.detail', fallback: 'Detail' },
      { key: 'tags.figures.table.leadsTo', fallback: 'Leads to' },
    ],
    rows: NODES.map((n) => [
      n.labelFallback,
      n.kind,
      n.noteFallback ?? '',
      EDGES.filter((e) => e.from === n.id)
        .map((e) => {
          const target = NODES.find((x) => x.id === e.to)?.labelFallback ?? e.to;
          return e.labelFallback ? `${e.labelFallback} → ${target}` : target;
        })
        .join('; ') || 'End of the line',
    ]),
  }),
};
