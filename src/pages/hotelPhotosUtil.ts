/**
 * Photo order for a hotel page. `gallery[0]` is the hero; the rest fill the
 * Photos tab.
 *
 * The stored `images` array comes mostly from the misterb&b import and is not
 * a gallery as-is (measured on prod, 262 of 324 hotels):
 *   - `images[1]` is usually the HOST's face: a 100×68 Cloudinary thumbnail
 *     cropped with `g_face`. It was upscaled into the 200px Photos grid and
 *     published a private person's portrait as a picture of the room. Dropped.
 *   - `images[0]` is a `misterbandb.com/get_image/…` URL, which browsers do not
 *     load (the site answers a browser request with an HTML page, so Chrome
 *     blocks it), so the hero fell back to stock art on almost every hotel
 *     while the room's own Cloudinary photos sat unused in the Photos tab.
 *     These now go last, behind the Cloudinary photos, so the hero is a real
 *     photo of the place whenever one exists.
 *   - The same get_image photo is stored at two sizes; deduped by photo id.
 */
const FACE_CROP = /[,/]g_face[,/]/;
const GET_IMAGE = /^https?:\/\/(www\.)?misterbandb\.com\/get_image\//i;

export function getHotelGallery(images: string[] | null | undefined): string[] {
  if (!images || images.length === 0) return [];
  const seen = new Set<string>();
  const primary: string[] = [];
  const late: string[] = [];
  for (const raw of images) {
    const img = raw?.trim();
    if (!img || FACE_CROP.test(img)) continue;
    const isGetImage = GET_IMAGE.test(img);
    const key = isGetImage ? `get_image:${img.split('/').pop()}` : img;
    if (seen.has(key)) continue;
    seen.add(key);
    (isGetImage ? late : primary).push(img);
  }
  return [...primary, ...late];
}

/**
 * Returns deduplicated, hero-excluded photos for the Photos tab.
 * Empty array means the Photos tab should be hidden.
 */
export function getHotelPhotosToShow(images: string[] | null | undefined): string[] {
  return getHotelGallery(images).slice(1);
}
