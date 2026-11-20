/**
 * The hanky-code pocket illustration (design system: "Hanky Codes", The pocket).
 * Denim and stitching are fixed artwork; only the hanky takes the code colour.
 * Literals live here because the colour IS the content and the outline is ink
 * in both themes (polarity belongs to the artwork, like --track-ring).
 */
export const HANKY_POCKET = {
  denim: '#2E4A7D',
  denimBand: '#3E5F9B',
  stitch: '#8FB0DD',
  ink: '#111111',
} as const;

/** Hanky folds in a 100×95 viewBox: two triangles per side, the second shaded. */
export const HANKY_FOLD = {
  left: { a: '10,5 48,46 14,44', b: '10,5 48,46 38,14' },
  right: { a: '90,5 52,46 86,44', b: '90,5 52,46 62,14' },
} as const;
