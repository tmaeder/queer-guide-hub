/** Search ranking and search terms are never independent discovery evidence.
 * Known canonical identities may still receive source updates. New discoveries
 * need an explicit signal before entering the independent-review workflow.
 */
export const FOURSQUARE_DISCOVERY_TERM = /\b(lgbt(?:q(?:ia?)?|iq?)?|queer|gay|lesbian|transgender|bisexual|drag|leather\s*(bar|club))\b/i
export function hasFoursquareDiscoveryEvidence(place: Record<string, unknown>): boolean {
  const social = place.social_media as Record<string, unknown> | undefined
  const categories = Array.isArray(place.categories) ? place.categories.flatMap(c => typeof c === 'string' ? [c] : ['name', 'short_name', 'category_name', 'category_label'].map(key => (c as Record<string, unknown> | null)?.[key])) : []
  const labels = Array.isArray(place.fsq_category_labels) ? place.fsq_category_labels : []
  const tastes = Array.isArray(place.tastes) ? place.tastes : []
  const values = [place.name, place.description, place.website, place.instagram, social?.instagram, ...categories, ...labels, ...tastes]
  return values.some(value => typeof value === 'string' && FOURSQUARE_DISCOVERY_TERM.test(value))
}
export function filterFoursquareDiscoveries<T extends { sourceId: string; data: Record<string, unknown> }>(items: T[], existing: ReadonlySet<string>): T[] {
  return items.filter(item => existing.has(item.sourceId) || hasFoursquareDiscoveryEvidence(item.data))
}
