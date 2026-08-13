/**
 * htmlSections — turn an HTML body into a list of linkable stations.
 *
 * Extracted from CMSRoutePage so the tag wiki can share it. The tag page had
 * its own copy of this idea and both of its shortcuts were bugs:
 *
 * 1. Its ids were positional (`section-0`, `section-1`, …), so inserting a
 *    heading silently retargeted every deep link below it. Ids here are
 *    slugified from the heading text and stay put.
 * 2. It matched headings with `/<(h[23])[^>]*>(.*?)<\/\1>/gi` — no `s` flag, so
 *    any heading containing a newline was skipped entirely. Parsing the DOM
 *    cannot miss one.
 *
 * DOM-based, so it only runs in the browser. Callers memoize on the html
 * string; there is no server-side path that needs this.
 */

import type { RouteStation } from '@/components/transit/RouteStrip';

/** Headings in the CMS corpus carry hand-typed section numbers ("1. Overview").
 *  The layout numbers stations itself, from a CSS counter, so the typed prefix
 *  is stripped here as well as in the DB — that way the frontend is correct
 *  whether or not the normalisation migration has run, and stays correct if an
 *  editor types "1." into the CMS again. */
const TYPED_NUMBER = /^\s*\d{1,2}\.\s+/;

export function stripTypedNumber(el: HTMLElement): string {
  const text = el.textContent?.trim() ?? '';
  if (!TYPED_NUMBER.test(text)) return text;
  // Rewrite the first text node only, so inline markup inside the heading
  // survives.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode();
  if (first?.nodeValue) first.nodeValue = first.nodeValue.replace(TYPED_NUMBER, '');
  return text.replace(TYPED_NUMBER, '');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Index `<h2>` as stations and `<h3>` as sub-stations, giving every heading a
 * stable id so each section is linkable. Only `<h2>` was indexed before, so the
 * Cookie Policy's three cookie categories — the part a reader is actually
 * hunting for — could not be navigated to at all.
 *
 * Returns the rewritten html alongside the stations: the ids only exist because
 * this function put them there, so rendering the ORIGINAL html would leave
 * every anchor pointing at nothing.
 */
export function extractSections(html: string): {
  sections: RouteStation[];
  htmlWithIds: string;
} {
  const div = document.createElement('div');
  div.innerHTML = html;
  const sections: RouteStation[] = [];
  const seen = new Set<string>();

  div.querySelectorAll('h2, h3').forEach((el) => {
    const heading = el as HTMLElement;
    const text = stripTypedNumber(heading);
    if (!text) return;
    let id = heading.id || slugify(text);
    if (!id) return;
    // Two sections can legitimately share a title ("Contact"). Ids must not.
    let n = 2;
    while (seen.has(id)) id = `${slugify(text)}-${n++}`;
    seen.add(id);
    heading.setAttribute('id', id);
    sections.push({ id, title: text, depth: heading.tagName === 'H3' ? 2 : 1 });
  });

  return { sections, htmlWithIds: div.innerHTML };
}
