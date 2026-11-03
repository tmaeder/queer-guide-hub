/**
 * The Line That Stops — the data.
 *
 * Consent drawn as a LOOP LINE: four stations on a ring, run round for as
 * long as you are together, with every station wired straight to Stop in the
 * middle. Two earlier drafts drew it as a line read top to bottom (first as
 * boxes on a flowchart, then as a strip map with off-ramps), and both said the
 * opposite of the thesis: a line that runs downward is a checklist you finish.
 *
 * What the shape says, so a caption does not have to:
 *
 * 1. **There is no last station.** "Go, for now" runs straight on round to
 *    "Ask" again. The circulating charts finish at "DO THE SEX!", which
 *    teaches that consent is a gate passed once. A ring cannot finish.
 * 2. **Stop is one step from everywhere.** Every station has its own spoke to
 *    Stop, including "Go, for now". Anyone can take it at any moment, for no
 *    reason, which is drawn rather than footnoted.
 * 3. **Capacity is a speed restriction, not a signal.** "Is anyone drunk or
 *    high — yes/no" is a binary the world does not have. A section of track
 *    you pass through slowly, with the reason stated, is what it actually is.
 * 4. **Stopping is an instruction, not a risk tier.** The earlier drafts
 *    painted each "no" outcome in the trip-safety traffic light. A no is not a
 *    hazard rating; it is where you get off. So the figure carries one track
 *    colour and no risk palette.
 * 5. **The register is plain.** The sources are jokey — "don't be a rapist",
 *    "do the sex". That voice does not belong on a definition page.
 *
 * What this is NOT: a legal test. Age of consent, capacity thresholds and
 * whether "affirmative consent" is the statutory standard all vary by country,
 * which is said on the figure rather than left for the reader to assume.
 */

const K = 'tags.figures.consentFlow';

export interface LoopStation {
  id: string;
  /** Short name drawn on the map's legend. */
  labelKey: string;
  labelFallback: string;
  noteKey: string;
  noteFallback: string;
  /** Speed restriction: drawn as cross-ties on the ring approaching it. */
  restriction?: boolean;
  /** "Ride the line": the question asked at this station. */
  askKey: string;
  askFallback: string;
  /** The answer that carries on round the ring. */
  yesKey: string;
  yesFallback: string;
  /** Every other answer, which goes to Stop. */
  noKey: string;
  noFallback: string;
  /** Why that answer is Stop, shown on arrival there. */
  whyKey: string;
  whyFallback: string;
  /** Glossary term this station IS, if any. */
  slug?: string;
}

/** Ring order, clockwise from the top. The last runs on to the first. */
export const STATIONS: readonly LoopStation[] = [
  {
    id: 'ask',
    labelKey: `${K}.station.ask`,
    labelFallback: 'Ask',
    noteKey: `${K}.note.ask`,
    noteFallback:
      'Out loud, or in a way you have both agreed counts as asking. You come back here every time round: agreeing earlier is not agreeing now.',
    askKey: `${K}.ride.ask.q`,
    askFallback: 'Have you asked?',
    yesKey: `${K}.ride.ask.yes`,
    yesFallback: 'Yes, I asked',
    noKey: `${K}.ride.ask.no`,
    noFallback: 'No, I assumed',
    whyKey: `${K}.ride.ask.why`,
    whyFallback: 'Guessing is not consent. Not objecting is not agreeing.',
    slug: 'consent',
  },
  {
    id: 'clear-yes',
    labelKey: `${K}.station.clearYes`,
    labelFallback: 'Hear a clear yes',
    noteKey: `${K}.note.clearYes`,
    noteFallback: 'Theirs, not one you talked them into. No, maybe, or silence is a no.',
    askKey: `${K}.ride.clearYes.q`,
    askFallback: 'Was the answer a clear yes?',
    yesKey: `${K}.ride.clearYes.yes`,
    yesFallback: 'A clear yes',
    noKey: `${K}.ride.clearYes.no`,
    noFallback: 'No, maybe, or nothing',
    whyKey: `${K}.ride.clearYes.why`,
    whyFallback: 'Anything that is not a yes is a no.',
    slug: 'hard-limit',
  },
  {
    id: 'capacity',
    restriction: true,
    labelKey: `${K}.station.capacity`,
    labelFallback: 'Everyone can decide',
    noteKey: `${K}.note.capacity`,
    noteFallback:
      'Speed restriction. Drink, drugs, exhaustion, being half asleep. Not a switch: if you cannot tell, you do not have an answer yet.',
    askKey: `${K}.ride.capacity.q`,
    askFallback: 'Can everyone actually decide right now?',
    yesKey: `${K}.ride.capacity.yes`,
    yesFallback: 'Yes, everyone can',
    noKey: `${K}.ride.capacity.no`,
    noFallback: 'No, or I cannot tell',
    whyKey: `${K}.ride.capacity.why`,
    whyFallback: 'If you cannot tell, you do not have an answer yet.',
    slug: 'chemsex',
  },
  {
    id: 'go',
    labelKey: `${K}.station.go`,
    labelFallback: 'Go, for now',
    noteKey: `${K}.note.go`,
    noteFallback: 'Not a finish line. The line runs straight on round to asking again.',
    askKey: `${K}.ride.go.q`,
    askFallback: 'You are going ahead, for now. Still good for everyone?',
    yesKey: `${K}.ride.go.yes`,
    yesFallback: 'Carry on, and ask again',
    noKey: `${K}.ride.go.no`,
    noFallback: 'Someone wants to stop',
    whyKey: `${K}.ride.go.why`,
    whyFallback: 'Anyone can stop anything at any point, for no reason.',
    slug: 'safeword',
  },
];

/** Where the line is joined from: drawn as a spur into the first station. */
export const ENTRY = {
  labelKey: `${K}.entry`,
  labelFallback: 'You want to do something with someone',
} as const;

/** The hub every station is wired to. */
export const STOP = {
  id: 'stop',
  labelKey: `${K}.stop.label`,
  labelFallback: 'Stop',
  noteKey: `${K}.stop.note`,
  noteFallback:
    'One step from every station, at any moment, for no reason. Then look after each other.',
  slug: 'aftercare',
} as const;
