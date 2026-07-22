/**
 * Milestone `image_url` doubles as og:image and often points at GENERATED share
 * cards (/og/history/*.png — 1200x630 with the title baked in). Those are meta
 * art, not editorial photography: cropped by object-cover they render as
 * clipped text, and most don't exist at all. Only genuine photos may display.
 */
export function displayableMilestoneImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('/og/')) return null;
  return url;
}
