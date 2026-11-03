import { lazyRetry } from '@/utils/lazyRetry';
import type { InfographicMeta } from '../../types';
import { LINES } from './data';

/**
 * Sources are the rebuild's provenance. The reference plate for this idea is
 * copyrighted and its model is out of date, so nothing was traced — the two
 * corrections below are the reason to build our own rather than license one.
 */
export const fourLinesMeta: InfographicMeta = {
  id: 'four-lines',
  archetype: 'line-strip',
  encodesRisk: false,
  // Four tracks, one per line: this is a diagram whose CONTENT is lines, so
  // the four hues are the wayfinding, not accents.
  accent: undefined,
  titleKey: 'tags.figures.fourLines.title',
  titleFallback: 'Four lines',
  captionKey: 'tags.figures.fourLines.caption',
  captionFallback:
    'Gender identity, gender expression, sex assigned at birth and attraction run on four separate lines. A stop on one tells you nothing about a stop on another. Tap the stops that fit. Nothing is stored or sent.',
  summaryKey: 'tags.figures.fourLines.summary',
  summaryFallback:
    'Four parallel transit lines that never meet: gender identity, gender expression, sex assigned at birth and attraction. Each carries named stops, and the stops picked on one line say nothing about the others.',
  checkedOn: '2026-11-03',
  gate: { adult: false, sensitive: false },
  teaches: [
    { slug: 'gender-identity', role: 'subject', anchor: 'identity' },
    { slug: 'gender-expression', role: 'taught', anchor: 'expression' },
    { slug: 'sexual-orientation', role: 'taught', anchor: 'attraction' },
    { slug: 'non-binary', role: 'taught', anchor: 'identity' },
    { slug: 'agender', role: 'taught', anchor: 'identity' },
    { slug: 'gender-fluid', role: 'taught', anchor: 'identity' },
    { slug: 'intersex', role: 'taught', anchor: 'assigned' },
    { slug: 'pansexual', role: 'taught', anchor: 'attraction' },
    { slug: 'asexual', role: 'taught', anchor: 'attraction' },
    // Picking several attraction stops is what these words name; the figure
    // shows the picks rather than labelling them, so they are mentions.
    { slug: 'bisexual', role: 'mentioned' },
    { slug: 'aromantic', role: 'mentioned' },
    { slug: 'transgender', role: 'mentioned' },
    { slug: 'cisgender', role: 'mentioned' },
    { slug: 'two-spirit', role: 'mentioned' },
    // Does not exist as a term yet. The resolver renders it as plain text
    // rather than a dead link.
    { slug: 'sex-assigned-at-birth', role: 'mentioned' },
  ],
  sources: [
    {
      kind: 'organisation',
      publisher: 'Trans Student Educational Resources',
      title: 'The Gender Unicorn',
      url: 'https://transstudent.org/gender/',
      supports:
        'Splitting identity, expression, sex assigned at birth and attraction into independent axes, and separating "sex assigned at birth" from identity.',
    },
    {
      kind: 'organisation',
      publisher: 'interACT: Advocates for Intersex Youth',
      title: 'Intersex definitions',
      url: 'https://interactadvocates.org/intersex-definitions/',
      supports:
        'Treating an intersex variation as a variation in its own right rather than as "a combination of male and female", which is how the older plates word it.',
    },
    {
      kind: 'organisation',
      publisher: 'GLAAD',
      title: 'Media Reference Guide — Transgender terms',
      url: 'https://glaad.org/reference/trans-terms/',
      supports:
        'Terminology: "sex assigned at birth" over "biological sex"; "trans woman"/"trans man" as two words.',
    },
  ],
  View: lazyRetry(() => import('./FourLines')),
  dataTable: () => ({
    captionKey: 'tags.figures.fourLines.tableCaption',
    captionFallback: 'Every line and the stops it carries',
    columns: [
      { key: 'tags.figures.table.line', fallback: 'Line' },
      { key: 'tags.figures.fourLines.tableRule', fallback: 'How to pick' },
      { key: 'tags.figures.table.stops', fallback: 'Stops' },
    ],
    rows: LINES.map((line) => [
      line.labelFallback,
      line.select === 'one' ? 'Pick one' : 'Pick any that fit',
      line.stops.map((s) => s.labelFallback).join(', '),
    ]),
  }),
};
