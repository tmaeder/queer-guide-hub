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
  hotel: { letter: 'H', track: 'blue', label: 'Hotel' },
  organization: { letter: 'O', track: 'green', label: 'Organization' },
  landmark: { letter: 'L', track: 'green', label: 'Landmark' },
  milestone: { letter: 'M', track: 'pink', label: 'Milestone' },
  trip: { letter: 'T', track: 'blue', label: 'Trip' },
};

/** INK text on every track fill.
 *
 *  The source mock puts paper type on the pink and cyan bullets. Measured,
 *  paper-on-cyan is 2.32:1 and paper-on-pink 3.43:1 — the first fails even the
 *  3:1 graphical-object bar and the second fails AA for anything under
 *  18.66px bold, which a 17px bullet letter is. Ink clears on all four
 *  (5.22 / 7.72 / 10.67 / 13.15), so the whole set takes ink and the rule
 *  stays one sentence instead of a per-track exception. */
export const TRACK_TEXT: Record<Track, string> = {
  pink: 'text-foreground',
  blue: 'text-foreground',
  green: 'text-foreground',
  yellow: 'text-foreground',
};
export const TRACK_BG: Record<Track, string> = {
  pink: 'bg-track-pink',
  blue: 'bg-track-blue',
  green: 'bg-track-green',
  yellow: 'bg-track-yellow',
};
