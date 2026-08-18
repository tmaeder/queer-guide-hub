/** Content-type → route bullet (letter + track line). Colors distinguish
 *  duplicate letters (country C-yellow vs city C-green). This table is the
 *  single point of change; keys follow the search_documents entity vocab. */
export type Track = 'pink' | 'blue' | 'green' | 'yellow';
export interface BulletDef {
  letter: string;
  track: Track;
  label: string;
}

export const ROUTE_BULLET_MAP: Record<string, BulletDef> = {
  venue: { letter: 'V', track: 'pink', label: 'Venue' },
  event: { letter: 'E', track: 'blue', label: 'Event' },
  group: { letter: 'G', track: 'green', label: 'Group' },
  guide: { letter: 'Q', track: 'yellow', label: 'Guide' },
  city: { letter: 'C', track: 'green', label: 'City' },
  country: { letter: 'C', track: 'yellow', label: 'Country' },
  queer_village: { letter: 'D', track: 'green', label: 'District' },
  personality: { letter: 'P', track: 'pink', label: 'Person' },
  news: { letter: 'N', track: 'blue', label: 'News' },
  marketplace: { letter: 'M', track: 'yellow', label: 'Marketplace' },
  // Hotel moved blue → yellow on 2026-08-10 so the map's four POINT layers
  // (venue / event / hotel / restroom) get four distinct track colours and no
  // two pin types share a hue. Duplicate colours distinguished by letter is
  // already how this table works — see city C-green vs country C-yellow, which
  // is the same trick in the other direction.
  hotel: { letter: 'H', track: 'yellow', label: 'Hotel' },
  // Restrooms are a map layer with no single-type page, but they need a track
  // like every other pin type; without an entry here the map would have to
  // invent a colour outside this table.
  restroom: { letter: 'R', track: 'green', label: 'Restroom' },
  organization: { letter: 'O', track: 'green', label: 'Organization' },
  landmark: { letter: 'L', track: 'green', label: 'Landmark' },
  milestone: { letter: 'M', track: 'pink', label: 'Milestone' },
  trip: { letter: 'T', track: 'blue', label: 'Trip' },
  // The content model (src/config/singleModules.ts) declares thirteen single
  // types, and rule 4 — "cross-type links use the other type's bullet and
  // colour" — is unsatisfiable for any type missing here. These two were the
  // gap; a test in singleModules.test.ts now keeps the two lists in step.
  // `#` is the spec's own bullet for a tag wiki, not a letter.
  tag: { letter: '#', track: 'pink', label: 'Tag' },
  page: { letter: 'P', track: 'blue', label: 'Page' },
};

/** INK text on every track fill.
 *
 *  The source mock puts paper type on the pink and cyan bullets. Measured,
 *  paper-on-cyan is 2.32:1 and paper-on-pink 3.43:1 — the first fails even the
 *  3:1 graphical-object bar and the second fails AA for anything under
 *  18.66px bold, which a 17px bullet letter is. Ink clears on all four
 *  (5.22 / 7.72 / 10.67 / 13.15), so the whole set takes ink and the rule
 *  stays one sentence instead of a per-track exception.
 *
 *  It is `--track-ring`, NOT `--foreground`. The two are the same ink in light
 *  mode, which is why this said `text-foreground` until dark mode landed — and
 *  why the difference is invisible until you switch themes. `--foreground`
 *  flips to paper in dark, so every bullet letter, badge and accent button
 *  would have gone paper-on-cyan (2.32:1) in exactly one mode.
 *
 *  A track fill is IDENTITY, not theme: the same four hexes in both modes. So
 *  the type on it has to be the same ink in both modes, and `--track-ring` is
 *  already that — it had to be mode-independent to gate the fill's border, and
 *  type-on-fill is the same problem wearing a different hat. */
export const TRACK_TEXT: Record<Track, string> = {
  pink: 'text-track-ring',
  blue: 'text-track-ring',
  green: 'text-track-ring',
  yellow: 'text-track-ring',
};
export const TRACK_BG: Record<Track, string> = {
  pink: 'bg-track-pink',
  blue: 'bg-track-blue',
  green: 'bg-track-green',
  yellow: 'bg-track-yellow',
};
