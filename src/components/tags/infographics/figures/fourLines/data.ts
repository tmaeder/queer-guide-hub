/**
 * Four Lines — the data.
 *
 * A rebuild of the Genderbread/Gender-Unicorn idea, corrected in two places
 * where the widely-circulated versions are wrong, and drawn as a transit map
 * because the corrections ARE geometry:
 *
 * 1. **Identity is two rails in one corridor, not one bipolar slider.**
 *    A single Woman↔Man bar forces a tradeoff — more of one is less of the
 *    other — which is false, and it is why the v2 Genderbread was superseded.
 *    Two services running the same trunk can be any length independently, so
 *    the diagram states the correction instead of captioning it.
 * 2. **"Sex assigned at birth", never "biological sex", and it is a terminus
 *    stub.** The line records where you started and runs on to nothing. The
 *    older diagrams point an arrow at a body part and put "male/female with
 *    intersex as a combination of the two" on it, which is both wrong and
 *    something intersex communities have objected to for years.
 *
 * Expression and attraction are deliberately NOT poles-with-a-middle either;
 * their stops are named categories, so no station means "halfway".
 *
 * Every line carries an explicit "prefer not to say" stop. Leaving the empty
 * state to do that job silently makes not answering look like not finishing.
 *
 * Geometry: stations are points; `axisPath` chains one cubic per segment so
 * every station is an endpoint by construction (see axisGeometry.ts).
 */

import type { AxisSpec } from '../../primitives/AxisSet';

export const VIEW = { w: 300, h: 210 } as const;
export const JUNCTION = { x: 268, y: 105 } as const;

/** Shared x ladder, so stations line up across lines like a real map. */
const X = [64, 108, 152, 196, 234] as const;

export const AXES: readonly AxisSpec[] = [
  {
    id: 'identity-woman',
    track: 'pink',
    corridorKey: 'tags.figures.fourLines.corridor.identity',
    corridorFallback: 'Gender identity: two independent services',
    labelKey: 'tags.figures.fourLines.axis.identityWoman',
    labelFallback: 'How much woman',
    helpKey: 'tags.figures.fourLines.help.identityWoman',
    helpFallback:
      'Who you know yourself to be. This runs independently of the line below it. You can be a lot of both, a little of both, or neither.',
    runIn: { x: 0, y: 20 },
    runOut: JUNCTION,
    stations: [
      {
        id: 'not-at-all',
        labelKey: 'tags.figures.fourLines.amount.notAtAll',
        labelFallback: 'Not at all',
        at: { x: X[0], y: 18 },
      },
      {
        id: 'a-little',
        labelKey: 'tags.figures.fourLines.amount.aLittle',
        labelFallback: 'A little',
        at: { x: X[1], y: 24 },
      },
      {
        id: 'a-lot',
        labelKey: 'tags.figures.fourLines.amount.aLot',
        labelFallback: 'A lot',
        at: { x: X[2], y: 20 },
      },
      {
        id: 'entirely',
        labelKey: 'tags.figures.fourLines.amount.entirely',
        labelFallback: 'Entirely',
        at: { x: X[3], y: 26 },
      },
      {
        id: 'rather-not',
        labelKey: 'tags.figures.fourLines.amount.ratherNot',
        labelFallback: 'Rather not say',
        at: { x: X[4], y: 46 },
      },
    ],
  },
  {
    id: 'identity-man',
    track: 'pink',
    corridorKey: 'tags.figures.fourLines.corridor.identity',
    corridorFallback: 'Gender identity: two independent services',
    labelKey: 'tags.figures.fourLines.axis.identityMan',
    labelFallback: 'How much man',
    helpKey: 'tags.figures.fourLines.help.identityMan',
    helpFallback:
      'The second rail on the same corridor. Answering this one does not subtract from the one above.',
    runIn: { x: 0, y: 42 },
    runOut: JUNCTION,
    stations: [
      {
        id: 'not-at-all',
        labelKey: 'tags.figures.fourLines.amount.notAtAll',
        labelFallback: 'Not at all',
        at: { x: X[0], y: 40 },
        slug: 'agender',
      },
      {
        id: 'a-little',
        labelKey: 'tags.figures.fourLines.amount.aLittle',
        labelFallback: 'A little',
        at: { x: X[1], y: 46 },
        slug: 'non-binary',
      },
      {
        id: 'a-lot',
        labelKey: 'tags.figures.fourLines.amount.aLot',
        labelFallback: 'A lot',
        at: { x: X[2], y: 42 },
      },
      {
        id: 'entirely',
        labelKey: 'tags.figures.fourLines.amount.entirely',
        labelFallback: 'Entirely',
        at: { x: X[3], y: 48 },
      },
      {
        id: 'rather-not',
        labelKey: 'tags.figures.fourLines.amount.ratherNot',
        labelFallback: 'Rather not say',
        at: { x: X[4], y: 62 },
      },
    ],
  },
  {
    id: 'expression',
    track: 'blue',
    labelKey: 'tags.figures.fourLines.axis.expression',
    labelFallback: 'Gender expression',
    helpKey: 'tags.figures.fourLines.help.expression',
    helpFallback:
      'How you present: clothes, voice, hair, the way you carry yourself. Stops, not a scale. Nothing here is halfway between two others.',
    runIn: { x: 0, y: 90 },
    runOut: JUNCTION,
    stations: [
      {
        id: 'feminine',
        labelKey: 'tags.figures.fourLines.expression.feminine',
        labelFallback: 'Feminine',
        at: { x: X[0], y: 88 },
        slug: 'transfeminine',
      },
      {
        id: 'androgynous',
        labelKey: 'tags.figures.fourLines.expression.androgynous',
        labelFallback: 'Androgynous',
        at: { x: X[1], y: 94 },
      },
      {
        id: 'masculine',
        labelKey: 'tags.figures.fourLines.expression.masculine',
        labelFallback: 'Masculine',
        at: { x: X[2], y: 88 },
        slug: 'transmasculine',
      },
      {
        id: 'changes',
        labelKey: 'tags.figures.fourLines.expression.changes',
        labelFallback: 'It changes',
        at: { x: X[3], y: 94 },
        slug: 'gender-fluid',
      },
      {
        id: 'rather-not',
        labelKey: 'tags.figures.fourLines.amount.ratherNot',
        labelFallback: 'Rather not say',
        at: { x: X[4], y: 100 },
      },
    ],
  },
  {
    id: 'assigned',
    track: 'green',
    terminus: true,
    labelKey: 'tags.figures.fourLines.axis.assigned',
    labelFallback: 'Sex assigned at birth',
    helpKey: 'tags.figures.fourLines.help.assigned',
    helpFallback:
      'What someone wrote down when you were born. It is a starting point on the record, which is why this line stops instead of running on to the others.',
    runIn: { x: 0, y: 140 },
    runOut: { x: 0, y: 140 },
    stations: [
      {
        id: 'female',
        labelKey: 'tags.figures.fourLines.assigned.female',
        labelFallback: 'Female',
        at: { x: X[0], y: 138 },
      },
      {
        id: 'male',
        labelKey: 'tags.figures.fourLines.assigned.male',
        labelFallback: 'Male',
        at: { x: X[1], y: 144 },
      },
      {
        id: 'intersex',
        labelKey: 'tags.figures.fourLines.assigned.intersex',
        labelFallback: 'Intersex variation',
        at: { x: X[2], y: 138 },
        slug: 'intersex',
      },
      {
        id: 'rather-not',
        labelKey: 'tags.figures.fourLines.amount.ratherNot',
        labelFallback: 'Rather not say',
        at: { x: X[3], y: 144 },
      },
    ],
  },
  {
    id: 'attraction',
    track: 'yellow',
    labelKey: 'tags.figures.fourLines.axis.attraction',
    labelFallback: 'Attraction',
    helpKey: 'tags.figures.fourLines.help.attraction',
    helpFallback:
      'Who you are drawn to. Who you are and who you are drawn to are separate lines. That is the whole point of the map.',
    runIn: { x: 0, y: 186 },
    runOut: JUNCTION,
    // Six stops, so this line keeps its own spacing rather than the shared
    // ladder. "No one, or rarely" is an ANSWER — it is where a-spec readers
    // get off — and collapsing it into the decline-to-answer stop would erase
    // exactly the people most used to being erased on a diagram like this.
    stations: [
      {
        id: 'women',
        labelKey: 'tags.figures.fourLines.attraction.women',
        labelFallback: 'Women',
        at: { x: 56, y: 184 },
      },
      {
        id: 'men',
        labelKey: 'tags.figures.fourLines.attraction.men',
        labelFallback: 'Men',
        at: { x: 92, y: 190 },
      },
      {
        id: 'more-than-one',
        labelKey: 'tags.figures.fourLines.attraction.moreThanOne',
        labelFallback: 'More than one gender',
        at: { x: 128, y: 184 },
        slug: 'bisexual',
      },
      {
        id: 'regardless',
        labelKey: 'tags.figures.fourLines.attraction.regardless',
        labelFallback: 'Regardless of gender',
        at: { x: 164, y: 190 },
        slug: 'pansexual',
      },
      {
        id: 'no-one',
        labelKey: 'tags.figures.fourLines.attraction.noOne',
        labelFallback: 'No one, or rarely',
        at: { x: 200, y: 176 },
        slug: 'aromantic',
      },
      {
        id: 'rather-not',
        labelKey: 'tags.figures.fourLines.amount.ratherNot',
        labelFallback: 'Rather not say',
        at: { x: 236, y: 182 },
      },
    ],
  },
];

/** Every term the figure links out to, in the order it teaches them. */
export const FOUR_LINES_TERMS = [
  'gender-identity',
  'gender-expression',
  'sexual-orientation',
  'non-binary',
  'agender',
  'gender-fluid',
  'transfeminine',
  'transmasculine',
  'cisgender',
  'transgender',
  'two-spirit',
  'intersex',
  'bisexual',
  'pansexual',
  'aromantic',
] as const;
