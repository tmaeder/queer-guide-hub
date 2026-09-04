import { lazyRetry } from '@/utils/lazyRetry';
import type { InfographicMeta } from '../../types';
import { AXES } from './data';

/**
 * Sources are the rebuild's provenance. The reference plate for this idea is
 * copyrighted and its model is out of date, so nothing was traced — the two
 * corrections below are the reason to build our own rather than license one.
 */
export const fourLinesMeta: InfographicMeta = {
  id: 'four-lines',
  archetype: 'axis-set',
  encodesRisk: false,
  // Four tracks, one per line: this is a diagram whose CONTENT is lines, and
  // the band is bordered top and bottom so it reads as its own context rather
  // than as four accents on the page.
  accent: undefined,
  titleKey: 'tags.figures.fourLines.title',
  titleFallback: 'Four lines',
  captionKey: 'tags.figures.fourLines.caption',
  captionFallback:
    'Gender identity, gender expression, sex assigned at birth and attraction are four separate lines. Pick a stop on each. Nothing is stored or sent.',
  summaryKey: 'tags.figures.fourLines.summary',
  summaryFallback:
    'A transit map with four lines: gender identity drawn as two independent services on one corridor, gender expression, sex assigned at birth as a terminus that runs on to nothing, and attraction. They meet at a single interchange.',
  checkedOn: '2026-09-02',
  gate: { adult: false, sensitive: false },
  teaches: [
    { slug: 'gender-identity', role: 'subject', anchor: 'identity-woman' },
    { slug: 'gender-expression', role: 'taught', anchor: 'expression' },
    { slug: 'sexual-orientation', role: 'taught', anchor: 'attraction' },
    { slug: 'non-binary', role: 'taught', anchor: 'identity-man' },
    { slug: 'agender', role: 'taught', anchor: 'identity-man' },
    { slug: 'gender-fluid', role: 'taught', anchor: 'expression' },
    { slug: 'transfeminine', role: 'taught', anchor: 'expression' },
    { slug: 'transmasculine', role: 'taught', anchor: 'expression' },
    { slug: 'intersex', role: 'taught', anchor: 'assigned' },
    { slug: 'bisexual', role: 'taught', anchor: 'attraction' },
    { slug: 'pansexual', role: 'taught', anchor: 'attraction' },
    { slug: 'aromantic', role: 'taught', anchor: 'attraction' },
    // Named in the caption and the corrections note rather than drawn as a
    // stop, so they get a rail line and not a band of their own.
    { slug: 'transgender', role: 'mentioned' },
    { slug: 'cisgender', role: 'mentioned' },
    { slug: 'two-spirit', role: 'mentioned' },
    // Does not exist as a term yet. The resolver renders it as plain text
    // rather than a dead link, and it is on the backfill list precisely
    // because this figure needs it.
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
    captionFallback: 'Every line on the map and the stops it carries',
    columns: [
      { key: 'tags.figures.table.line', fallback: 'Line' },
      { key: 'tags.figures.table.stops', fallback: 'Stops' },
      { key: 'tags.figures.table.runsTo', fallback: 'Runs to' },
    ],
    rows: AXES.map((axis) => [
      axis.labelFallback,
      axis.stations.map((s) => s.labelFallback).join(', '),
      axis.terminus ? 'Ends here. A starting point, not a destination' : 'The interchange',
    ]),
  }),
};
