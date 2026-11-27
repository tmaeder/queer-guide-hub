/**
 * normalizeCmsBody — make an authored CMS body fit under the template's header.
 *
 * Every cms_pages renderer prints the page title as the one <h1> and the
 * subtitle as a paragraph. All 15 published bodies (measured 2026-11-27) ALSO
 * open with their own <h1>, and most follow it with a paragraph repeating the
 * subtitle, so the page read: H1 title, subtitle, H1 title again, subtitle
 * again. The legal layout hid the second <h1> with CSS; /p/:slug printed both.
 *
 * Rules, applied to already-sanitised HTML:
 *   1. A leading <h1> is the authored copy of the document title. The template
 *      owns that slot, so it is removed.
 *   2. A paragraph right at the start (after rule 1) that repeats the subtitle
 *      is removed.
 *   3. Remaining headings never outrank the template: <h1> becomes <h2>.
 *   4. Levels never skip: each heading is at most one level below the previous
 *      one (h2 then h4 becomes h2 then h3).
 * Ids and every other attribute are kept, so existing deep links still land.
 *
 * DOM-based, browser only, like htmlSections. Callers memoize.
 */

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?:;\s]+$/, '')
    .toLowerCase();

function retag(el: Element, level: number): Element {
  const tag = `h${level}`;
  if (el.tagName.toLowerCase() === tag) return el;
  const next = el.ownerDocument.createElement(tag);
  for (const attr of Array.from(el.attributes)) next.setAttribute(attr.name, attr.value);
  while (el.firstChild) next.appendChild(el.firstChild);
  el.replaceWith(next);
  return next;
}

export function normalizeCmsBody(
  html: string,
  { subtitle }: { subtitle?: string | null } = {},
): string {
  if (!html) return '';
  // DOMParser builds an inert document: nothing in it loads or runs, even if
  // the caller forgot to sanitise first.
  const root = new DOMParser().parseFromString(html, 'text/html').body;

  let first = root.firstElementChild;
  if (first && first.tagName === 'H1') {
    first.remove();
    first = root.firstElementChild;
  }
  if (first && first.tagName === 'P' && subtitle && norm(first.textContent) === norm(subtitle)) {
    first.remove();
  }

  let prev = 1; // the template's <h1>
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
    const authored = Number(el.tagName[1]);
    const level = Math.min(Math.max(authored, 2), prev + 1);
    retag(el, level);
    prev = level;
  });

  return root.innerHTML;
}
