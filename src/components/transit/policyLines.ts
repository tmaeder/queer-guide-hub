import type { Track } from './routeBulletMap';

export interface PolicyLine {
  slug: string;
  letter: string;
  /** `'ink'` = monochrome line. */
  track: Track | 'ink';
  /** Short line name for the bullet's accessible label and the hub index. */
  label: string;
}

/**
 * Line identity for the policy pages.
 *
 * Deliberately NOT in ROUTE_BULLET_MAP. That table is keyed to the
 * `search_documents` entity vocab and doubles as the source of truth for the
 * map's layer colours (`mapPalette.test.ts` asserts the two agree), so
 * policies do not belong in it — and would collide if they were: `T`-blue is
 * already `trip`, `C`-yellow is already `country`.
 *
 * Accessibility runs on an ink line with no track colour. A page about not
 * depending on colour should not depend on colour to identify itself, and it
 * is also the only one of the five that is not a contract.
 */
export const POLICY_LINES: Record<string, PolicyLine> = {
  terms: { slug: 'terms', letter: 'T', track: 'blue', label: 'Terms' },
  privacy: { slug: 'privacy', letter: 'P', track: 'green', label: 'Privacy' },
  cookies: { slug: 'cookies', letter: 'C', track: 'yellow', label: 'Cookies' },
  dmca: { slug: 'dmca', letter: '©', track: 'pink', label: 'Copyright' },
  accessibility: { slug: 'accessibility', letter: 'A', track: 'ink', label: 'Accessibility' },
};

/** The four contract pages, in the order they appear on the hub. */
export const LEGAL_LINE_ORDER = ['terms', 'privacy', 'cookies', 'dmca'] as const;

export function policyLine(slug: string): PolicyLine | undefined {
  return POLICY_LINES[slug];
}

/** The track a RouteStrip should draw for a slug — `undefined` means ink. */
export function policyTrack(slug: string): Track | undefined {
  const line = POLICY_LINES[slug];
  return line && line.track !== 'ink' ? line.track : undefined;
}
