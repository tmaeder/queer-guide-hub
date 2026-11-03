/** How long the body must stay unchanged before an empty body counts as empty. */
export const EXPLORE_SETTLE_MS = 2500;

/** True when an explore body holds nothing a reader can see. */
export function isExploreBodyEmpty(body: HTMLElement): boolean {
  if (body.textContent?.trim()) return false;
  return !body.querySelector('img, svg, canvas, video, iframe, a, button, input');
}
