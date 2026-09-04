/**
 * The Line That Stops — the data.
 *
 * A rebuild of the consent flowchart, with four deliberate departures from
 * every version of it in circulation:
 *
 * 1. **A stop is drawn as an ending, not coloured as a warning.** The line
 *    terminates at a buffer stop. Nothing turns red because an answer changed;
 *    only the outcome plates carry the locked risk palette, and they carry it
 *    because they are risk statements, not because they are "the no branch".
 * 2. **It ends in a loop, not a verdict.** The circulating charts finish at
 *    "DO THE SEX!", which quietly teaches that consent is a gate you pass once.
 *    Ours returns to the check-in signal and stays there. Consent being
 *    ongoing and revocable is the shape of the diagram, not a footnote.
 * 3. **Capacity is a speed restriction, not a signal.** "Is anyone drunk or
 *    high — yes/no" is a binary the world does not have, and a hard NO branch
 *    on it is both wrong and easy to argue past. A hatched section you pass
 *    through slowly, with the reason stated, is what capacity actually is.
 * 4. **The register is plain.** The sources are jokey — "don't be a rapist",
 *    "do the sex". That voice does not belong on a definition page and it is
 *    the opposite of the house style.
 *
 * What this is NOT: a legal test. Age of consent, capacity thresholds and
 * whether "affirmative consent" is the statutory standard all vary by country,
 * which is said on the figure rather than left for the reader to assume.
 */

import type { FlowEdge, FlowNode } from '../../primitives/flowLayout';

export const VIEW = { w: 300, h: 300 } as const;
export const PAD = { x: 42, y: 24 } as const;

const K = 'tags.figures.consentFlow';

export const NODES: readonly FlowNode[] = [
  {
    id: 'start',
    kind: 'start',
    lane: 0,
    slot: 1,
    labelKey: `${K}.node.start`,
    labelFallback: 'You want to do something with someone',
  },
  {
    id: 'asked',
    kind: 'question',
    lane: 1,
    slot: 1,
    labelKey: `${K}.node.asked`,
    labelFallback: 'Have you asked?',
    noteKey: `${K}.note.asked`,
    noteFallback: 'Out loud, or in a way you have both already agreed reads as asking.',
    slug: 'consent',
  },
  {
    id: 'not-asked',
    kind: 'outcome',
    tier: 'high',
    lane: 2,
    slot: 0,
    labelKey: `${K}.node.notAsked`,
    labelFallback: 'Guessing is not consent',
    noteKey: `${K}.note.notAsked`,
    noteFallback: 'Not objecting is not agreeing. The line does not start here.',
  },
  {
    id: 'clear-yes',
    kind: 'question',
    lane: 2,
    slot: 1,
    labelKey: `${K}.node.clearYes`,
    labelFallback: 'Was the answer a clear yes?',
    noteKey: `${K}.note.clearYes`,
    noteFallback: 'Theirs, not one you talked them into.',
  },
  {
    id: 'not-a-yes',
    kind: 'outcome',
    tier: 'critical',
    lane: 3,
    slot: 0,
    labelKey: `${K}.node.notAYes`,
    labelFallback: 'No, maybe, or nothing',
    noteKey: `${K}.note.notAYes`,
    noteFallback: 'Anything that is not a yes is a no. This is the end of the line.',
    slug: 'hard-limit',
  },
  {
    id: 'capacity',
    kind: 'restriction',
    lane: 3,
    slot: 1,
    labelKey: `${K}.node.capacity`,
    labelFallback: 'Speed restriction: can everyone actually decide?',
    noteKey: `${K}.note.capacity`,
    noteFallback:
      'Drink, drugs, exhaustion, being half asleep. Not a switch. If you cannot tell, you do not have an answer yet.',
    slug: 'chemsex',
  },
  {
    id: 'checkin',
    kind: 'question',
    lane: 4,
    slot: 1,
    labelKey: `${K}.node.checkin`,
    labelFallback: 'Still yes, right now?',
    noteKey: `${K}.note.checkin`,
    noteFallback: 'The signal you come back to. Agreeing earlier is not agreeing now.',
    slug: 'safeword',
  },
  {
    id: 'stop-now',
    kind: 'outcome',
    tier: 'critical',
    lane: 5,
    slot: 0,
    labelKey: `${K}.node.stopNow`,
    labelFallback: 'Stop',
    noteKey: `${K}.note.stopNow`,
    noteFallback: 'Anyone can stop anything at any point, for no reason. Then look after each other.',
    slug: 'aftercare',
  },
  {
    id: 'go',
    kind: 'outcome',
    tier: 'low',
    lane: 5,
    slot: 2,
    labelKey: `${K}.node.go`,
    labelFallback: 'Clear to proceed, for now',
    noteKey: `${K}.note.go`,
    noteFallback: 'And back to the check-in, which is why this line is a loop.',
  },
];

export const EDGES: readonly FlowEdge[] = [
  { from: 'start', to: 'asked' },
  { from: 'asked', to: 'not-asked', labelKey: `${K}.edge.no`, labelFallback: 'No' },
  { from: 'asked', to: 'clear-yes', labelKey: `${K}.edge.yes`, labelFallback: 'Yes' },
  {
    from: 'clear-yes',
    to: 'not-a-yes',
    labelKey: `${K}.edge.notAYes`,
    labelFallback: 'Not a yes',
  },
  { from: 'clear-yes', to: 'capacity', labelKey: `${K}.edge.yes`, labelFallback: 'Yes' },
  { from: 'capacity', to: 'checkin' },
  { from: 'checkin', to: 'stop-now', labelKey: `${K}.edge.noOrUnsure`, labelFallback: 'No, or unsure' },
  { from: 'checkin', to: 'go', labelKey: `${K}.edge.yes`, labelFallback: 'Yes' },
  // The correction, drawn: the line returns to the check-in and stays in
  // service. It is not collapsible and not dismissable.
  {
    from: 'go',
    to: 'checkin',
    kind: 'loop',
    labelKey: `${K}.edge.again`,
    labelFallback: 'And again, any time',
  },
];
