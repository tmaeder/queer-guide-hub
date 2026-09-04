/**
 * English defaults for the seven legal-gender-recognition regimes.
 *
 * Its own module because three surfaces render these — the `HumanityBand`
 * readout, the `RecognitionWorldMap` aria summary and the map legend — and a
 * map whose legend disagrees with the band directly under it is worse than no
 * legend. Keeping them beside either component would also trip
 * `react-refresh/only-export-components` on a file that exports a component.
 *
 * The page's convention is inline `t(key, 'English default')` rather than a
 * populated locale file (no `rights.trans.*` keys exist in en.json), so these
 * are the defaults those calls pass.
 */
export const REGIME_LABEL_FALLBACK: Record<string, string> = {
  selfDetermination: 'Recognition by self-determination',
  gatekept: 'Possible, with conditions',
  nominal: 'Possible only on paper',
  surgery: 'Surgery required first',
  impossible: 'No marker change possible',
  unclear: 'Unclear or varies',
  noRecord: 'Nothing recorded',
};

export const REGIME_NOTE_FALLBACK: Record<string, string> = {
  selfDetermination: 'A marker change with no medical or judicial gatekeeper.',
  gatekept: 'A marker change exists but something stands in front of it.',
  nominal: 'A procedure exists in law that people cannot in practice complete.',
  surgery: 'The law will not change the marker until you have been sterilised.',
  impossible: 'The law provides no route at all.',
  unclear: 'Recorded, but not in a form that gives one national answer.',
  noRecord: 'Our source holds no entry. That is not a finding that the law is hostile.',
};
