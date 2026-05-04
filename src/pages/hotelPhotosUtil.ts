/**
 * Returns deduplicated, hero-excluded photos for the Photos tab.
 * Hero is `images[0]`. Empty array means the Photos tab should be hidden.
 */
export function getHotelPhotosToShow(images: string[] | null | undefined): string[] {
  if (!images || images.length === 0) return [];
  const hero = images[0];
  const seen = new Set<string>([hero]);
  const out: string[] = [];
  for (const img of images.slice(1)) {
    if (!img || seen.has(img)) continue;
    seen.add(img);
    out.push(img);
  }
  return out;
}
