/**
 * Which fallback template line a city gets when it has no committed transit
 * geometry — derived from its slug, never from its position in a list.
 *
 * `CityNetwork` takes the choice as a prop rather than making it, because the two
 * call sites need different answers. The homepage renders eight fixed cards where
 * the card index is fine. `/cities` renders 2,142 in a responsive grid, and there
 * `index % 4` is actively wrong twice over: every card in column 1 of a
 * four-column grid would draw the same shape in the same colour (the page reads as
 * vertical monochrome stripes, diagonal banding at two and three columns), and
 * because sorting or filtering reshuffles positions, every card's shape and colour
 * would change under the reader as they typed.
 *
 * Lives in its own module so `CityNetwork.tsx` stays component-only (react-refresh)
 * and so this cannot drift into the GENERATED `cityNetworkGeometry.ts`.
 */

/**
 * FNV-1a. Small, dependency-free, and it spreads short ASCII strings far better
 * than a length or character sum would — `berlin` and `boston` must not collide
 * into the same shape merely because they are the same length.
 */
export function templateIndexFor(slug: string | null | undefined): number {
  if (!slug) return 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash);
}
