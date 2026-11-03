/**
 * The Line That Stops — the data.
 *
 * A rebuild of the consent flowchart, with four deliberate departures from
 * every version of it in circulation:
 *
 * 1. **A stop is drawn as an ending, not coloured as a warning.** Each "no"
 *    leaves the main line on an off-ramp that ends at a buffer stop. The line
 *    never turns red because an answer changed; only the outcome carries the
 *    locked risk icon, because it is a risk statement, not because it is "the
 *    no branch".
 * 2. **It ends in a loop, not a verdict.** The circulating charts finish at
 *    "DO THE SEX!", which quietly teaches that consent is a gate you pass once.
 *    Ours runs back to the check-in and stays there. Consent being ongoing and
 *    revocable is the shape of the diagram, not a footnote.
 * 3. **Capacity is a speed restriction, not a signal.** "Is anyone drunk or
 *    high — yes/no" is a binary the world does not have, and a hard NO branch
 *    on it is both wrong and easy to argue past. A section of track you pass
 *    through slowly, with the reason stated, is what capacity actually is.
 * 4. **The register is plain.** The sources are jokey — "don't be a rapist",
 *    "do the sex". That voice does not belong on a definition page.
 *
 * What this is NOT: a legal test. Age of consent, capacity thresholds and
 * whether "affirmative consent" is the statutory standard all vary by country,
 * which is said on the figure rather than left for the reader to assume.
 */

import { flatStops, type LoopBack, type MainStation } from '../../primitives/branchLineModel';

const K = 'tags.figures.consentFlow';

export const STATIONS: readonly MainStation[] = [
  {
    id: 'start',
    kind: 'start',
    labelKey: `${K}.node.start`,
    labelFallback: 'You want to do something with someone',
  },
  {
    id: 'asked',
    kind: 'question',
    labelKey: `${K}.node.asked`,
    labelFallback: 'Have you asked?',
    noteKey: `${K}.note.asked`,
    noteFallback: 'Out loud, or in a way you have both already agreed reads as asking.',
    slug: 'consent',
    branch: {
      labelKey: `${K}.edge.no`,
      labelFallback: 'No',
      to: {
        id: 'not-asked',
        tier: 'high',
        labelKey: `${K}.node.notAsked`,
        labelFallback: 'Guessing is not consent',
        noteKey: `${K}.note.notAsked`,
        noteFallback: 'Not objecting is not agreeing. The line does not start here.',
      },
    },
    continueLabelKey: `${K}.edge.yes`,
    continueLabelFallback: 'Yes',
  },
  {
    id: 'clear-yes',
    kind: 'question',
    labelKey: `${K}.node.clearYes`,
    labelFallback: 'Was the answer a clear yes?',
    noteKey: `${K}.note.clearYes`,
    noteFallback: 'Theirs, not one you talked them into.',
    branch: {
      labelKey: `${K}.edge.notAYes`,
      labelFallback: 'Not a yes',
      to: {
        id: 'not-a-yes',
        tier: 'critical',
        labelKey: `${K}.node.notAYes`,
        labelFallback: 'No, maybe, or nothing',
        noteKey: `${K}.note.notAYes`,
        noteFallback: 'Anything that is not a yes is a no. This is the end of the line.',
        slug: 'hard-limit',
      },
    },
    continueLabelKey: `${K}.edge.yes`,
    continueLabelFallback: 'Yes',
  },
  {
    id: 'capacity',
    kind: 'restriction',
    labelKey: `${K}.node.capacity`,
    labelFallback: 'Can everyone actually decide?',
    noteKey: `${K}.note.capacity`,
    noteFallback:
      'Drink, drugs, exhaustion, being half asleep. Not a switch. If you cannot tell, you do not have an answer yet.',
    slug: 'chemsex',
  },
  {
    id: 'checkin',
    kind: 'question',
    labelKey: `${K}.node.checkin`,
    labelFallback: 'Still yes, right now?',
    noteKey: `${K}.note.checkin`,
    noteFallback: 'The signal you come back to. Agreeing earlier is not agreeing now.',
    slug: 'safeword',
    branch: {
      labelKey: `${K}.edge.noOrUnsure`,
      labelFallback: 'No, or unsure',
      to: {
        id: 'stop-now',
        tier: 'critical',
        labelKey: `${K}.node.stopNow`,
        labelFallback: 'Stop',
        noteKey: `${K}.note.stopNow`,
        noteFallback:
          'Anyone can stop anything at any point, for no reason. Then look after each other.',
        slug: 'aftercare',
      },
    },
    continueLabelKey: `${K}.edge.yes`,
    continueLabelFallback: 'Yes',
  },
  {
    id: 'go',
    kind: 'outcome',
    tier: 'low',
    labelKey: `${K}.node.go`,
    labelFallback: 'Clear to proceed, for now',
    noteKey: `${K}.note.go`,
    noteFallback: 'And back to the check-in, which is why this line is a loop.',
  },
];

// The correction, drawn: the line returns to the check-in and stays in
// service. It is not collapsible and not dismissable.
export const LOOP: LoopBack = {
  from: 'go',
  to: 'checkin',
  labelKey: `${K}.edge.again`,
  labelFallback: 'And again, any time',
};

/** Every stop in reading order — the table's rows. */
export const STOPS = flatStops(STATIONS);
