import { lazyRetry } from '@/utils/lazyRetry';
import type { InfographicMeta } from '../../types';
import { ENTRY, STATIONS, STOP } from './data';

export const consentFlowMeta: InfographicMeta = {
  id: 'consent-flow',
  archetype: 'loop-line',
  // Stopping is an instruction, not a hazard rating, so this figure no longer
  // takes the trip-safety palette: one track colour, the loop's.
  encodesRisk: false,
  accent: 'pink',
  // Still claims a reader acts on, so the figure shows how old its check is.
  claimBearing: true,
  titleKey: 'tags.figures.consentFlow.title',
  titleFallback: 'The line that stops',
  captionKey: 'tags.figures.consentFlow.caption',
  captionFallback:
    'Consent as a loop line you go round for as long as you are together. Every station connects straight to Stop. Not a legal test; the law differs by country.',
  summaryKey: 'tags.figures.consentFlow.summary',
  summaryFallback:
    'A circular line with four stations: ask, hear a clear yes, everyone can decide, and go for now, which runs straight on round to asking again. Every station has its own link to Stop in the centre, which anyone can take at any moment.',
  checkedOn: '2026-11-03',
  // Not adult, and not flagged sensitive: a content note on the definition of
  // consent would be the wrong instinct. The test `TagSafetyCallout` applies
  // is "would a reader be harmed by not noticing this?", and this page fails
  // it in the other direction.
  gate: { adult: false, sensitive: false },
  teaches: [
    { slug: 'consent', role: 'subject', anchor: 'ask' },
    { slug: 'aftercare', role: 'taught', anchor: 'stop' },
    { slug: 'chemsex', role: 'taught', anchor: 'capacity' },
    { slug: 'power-exchange', role: 'mentioned' },
    // Deprecated. The chip renders without the affordance rather than
    // pretending the term is live.
    { slug: 'negotiation', role: 'mentioned' },
    // Neither of these exists yet — which is the point of teaching them here.
    // The resolver renders an unknown slug as plain text, never a dead link.
    { slug: 'safeword', role: 'taught', anchor: 'go' },
    { slug: 'hard-limit', role: 'taught', anchor: 'clear-yes' },
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
    captionFallback: 'Every station on the loop, and where each answer goes',
    columns: [
      { key: 'tags.figures.table.stop', fallback: 'Stop' },
      { key: 'tags.figures.table.detail', fallback: 'Detail' },
      { key: 'tags.figures.consentFlow.table.ifYes', fallback: 'If yes' },
      { key: 'tags.figures.consentFlow.table.ifNot', fallback: 'Anything else' },
    ],
    rows: [
      [ENTRY.labelFallback, 'Where you join the line', STATIONS[0].labelFallback, '—'],
      ...STATIONS.map((s, i) => [
        s.labelFallback,
        s.noteFallback,
        STATIONS[(i + 1) % STATIONS.length].labelFallback,
        `${STOP.labelFallback}: ${s.whyFallback}`,
      ]),
      [STOP.labelFallback, STOP.noteFallback, 'End of the line', 'End of the line'],
    ],
  }),
};
