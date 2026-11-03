/**
 * One slug per amenity. Imports store the same amenity in two spellings
 * ("clothing-optional-accepted" and "clothing optional accepted"), which
 * rendered it twice in the grid.
 */
export function canonicalAmenities(list: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const slug = raw
      ?.trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-');
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}
