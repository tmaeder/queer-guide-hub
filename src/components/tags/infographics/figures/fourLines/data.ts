/**
 * Four Lines — the data.
 *
 * A rebuild of the Genderbread / Gender-Unicorn idea as four strip maps. The
 * widely-circulated versions are wrong in ways this file corrects by
 * STRUCTURE rather than by caption:
 *
 * 1. **The lines never meet.** Identity, expression, sex assigned at birth and
 *    attraction are independent: a stop on one predicts nothing on another.
 *    An earlier draft of this figure ran all four into one interchange, which
 *    drew the opposite claim. Each line is now its own strip.
 * 2. **Identity and attraction are pick-any, not sliders.** A single
 *    Woman↔Man bar forces a tradeoff — more of one is less of the other —
 *    which is false. Letting a reader pick several stops states that directly,
 *    without the two unlabelled "how much woman / how much man" rails the
 *    earlier draft needed to make the same point.
 * 3. **"Sex assigned at birth", never "biological sex"**, and an intersex
 *    variation is a stop of its own, not "a combination of the two".
 *
 * Stops are named categories, not points on a scale, so no stop means
 * "halfway". Every line carries an explicit "rather not say" stop.
 * Expression has no glossary slugs on purpose: presenting feminine is not
 * being transfeminine, and linking the two would teach exactly that error.
 */

import type { StripLine, StripStop } from '../../primitives/lineStripModel';

const RATHER_NOT: StripStop = {
  id: 'rather-not',
  labelKey: 'tags.figures.fourLines.stop.ratherNot',
  labelFallback: 'Rather not say',
  exclusive: true,
};

export const LINES: readonly StripLine[] = [
  {
    id: 'identity',
    track: 'pink',
    select: 'any',
    labelKey: 'tags.figures.fourLines.line.identity',
    labelFallback: 'Gender identity',
    questionKey: 'tags.figures.fourLines.question.identity',
    questionFallback:
      'Who you know yourself to be. More than one stop can fit: being a woman does not use up room for anything else.',
    stops: [
      { id: 'woman', labelKey: 'tags.figures.fourLines.stop.woman', labelFallback: 'Woman' },
      { id: 'man', labelKey: 'tags.figures.fourLines.stop.man', labelFallback: 'Man' },
      {
        id: 'non-binary',
        labelKey: 'tags.figures.fourLines.stop.nonBinary',
        labelFallback: 'Non-binary',
        slug: 'non-binary',
      },
      {
        id: 'agender',
        labelKey: 'tags.figures.fourLines.stop.agender',
        labelFallback: 'Agender',
        slug: 'agender',
      },
      {
        id: 'fluid',
        labelKey: 'tags.figures.fourLines.stop.fluid',
        labelFallback: 'Genderfluid',
        slug: 'gender-fluid',
      },
      {
        id: 'questioning',
        labelKey: 'tags.figures.fourLines.stop.questioning',
        labelFallback: 'Still working it out',
      },
      RATHER_NOT,
    ],
  },
  {
    id: 'expression',
    track: 'blue',
    select: 'any',
    labelKey: 'tags.figures.fourLines.line.expression',
    labelFallback: 'Gender expression',
    questionKey: 'tags.figures.fourLines.question.expression',
    questionFallback:
      'How you present: clothes, voice, hair, the way you carry yourself. Named stops, not a scale with a middle.',
    stops: [
      {
        id: 'feminine',
        labelKey: 'tags.figures.fourLines.stop.feminine',
        labelFallback: 'Feminine',
      },
      {
        id: 'androgynous',
        labelKey: 'tags.figures.fourLines.stop.androgynous',
        labelFallback: 'Androgynous',
      },
      {
        id: 'masculine',
        labelKey: 'tags.figures.fourLines.stop.masculine',
        labelFallback: 'Masculine',
      },
      {
        id: 'changes',
        labelKey: 'tags.figures.fourLines.stop.changes',
        labelFallback: 'It changes',
      },
      RATHER_NOT,
    ],
  },
  {
    id: 'assigned',
    track: 'green',
    select: 'one',
    labelKey: 'tags.figures.fourLines.line.assigned',
    labelFallback: 'Sex assigned at birth',
    questionKey: 'tags.figures.fourLines.question.assigned',
    questionFallback:
      'What was written down when you were born, often after a glance. It does not decide the other three lines.',
    stops: [
      { id: 'female', labelKey: 'tags.figures.fourLines.stop.female', labelFallback: 'Female' },
      { id: 'male', labelKey: 'tags.figures.fourLines.stop.male', labelFallback: 'Male' },
      {
        id: 'intersex',
        labelKey: 'tags.figures.fourLines.stop.intersex',
        labelFallback: 'Intersex variation',
        slug: 'intersex',
      },
      RATHER_NOT,
    ],
  },
  {
    id: 'attraction',
    track: 'yellow',
    select: 'any',
    labelKey: 'tags.figures.fourLines.line.attraction',
    labelFallback: 'Attraction',
    questionKey: 'tags.figures.fourLines.question.attraction',
    questionFallback:
      'Who you are drawn to. Who you are and who you are drawn to are separate questions.',
    // "Rarely or no one" is an ANSWER — it is where a-spec readers get off —
    // and folding it into "rather not say" would erase exactly the people most
    // used to being left off a diagram like this.
    stops: [
      { id: 'women', labelKey: 'tags.figures.fourLines.stop.women', labelFallback: 'Women' },
      { id: 'men', labelKey: 'tags.figures.fourLines.stop.men', labelFallback: 'Men' },
      {
        id: 'non-binary-people',
        labelKey: 'tags.figures.fourLines.stop.nonBinaryPeople',
        labelFallback: 'Non-binary people',
      },
      {
        id: 'regardless',
        labelKey: 'tags.figures.fourLines.stop.regardless',
        labelFallback: 'Regardless of gender',
        slug: 'pansexual',
      },
      {
        id: 'no-one',
        labelKey: 'tags.figures.fourLines.stop.noOne',
        labelFallback: 'Rarely or no one',
        slug: 'asexual',
        exclusive: true,
      },
      RATHER_NOT,
    ],
  },
];
