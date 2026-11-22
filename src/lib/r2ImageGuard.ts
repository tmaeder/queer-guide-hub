import { toR2ImageUrl, toR2SrcSet } from '@/utils/imageHost';

/**
 * The single browser choke point that keeps every image load on R2. It pairs
 * with CSP `img-src 'self' data: blob: https://img.queer.guide`
 * (functions/_lib/securityHeaders.ts): the guard rewrites, the CSP refuses
 * anything the guard missed.
 *
 * Covered, before the browser starts fetching:
 *   - `src`/`srcset`/`poster` written via `setAttribute` (React) or the
 *     property setters (`new Image()`, hand-written DOM code);
 *   - HTML strings assigned to `innerHTML` (dangerouslySetInnerHTML, map
 *     popups): an image's fetch only starts once the current task yields, so
 *     rewriting synchronously after the assignment replaces the URL before it
 *     is requested.
 * Not covered (handled at the call site): CSS `background-image`.
 */
const REWRITTEN = new Set(['src', 'srcset', 'poster']);
const isMediaEl = (el: Element) =>
  el instanceof HTMLImageElement ||
  el instanceof HTMLSourceElement ||
  el instanceof HTMLVideoElement;

function rewrite(name: string, value: string): string {
  const n = name.toLowerCase();
  if (n === 'srcset') return toR2SrcSet(value);
  return REWRITTEN.has(n) ? toR2ImageUrl(value) : value;
}

export function installR2ImageGuard(): void {
  const w = window as { __r2ImageGuard?: boolean };
  if (typeof window === 'undefined' || w.__r2ImageGuard) return;
  w.__r2ImageGuard = true;

  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    return setAttribute.call(this, name, isMediaEl(this) ? rewrite(name, String(value)) : value);
  };

  const wrapSetter = (proto: object, prop: string, after?: (el: Element) => void) => {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc?.set) return;
    Object.defineProperty(proto, prop, {
      ...desc,
      set(this: Element, value: string) {
        desc.set!.call(this, after ? value : rewrite(prop, String(value)));
        after?.(this);
      },
    });
  };
  wrapSetter(HTMLImageElement.prototype, 'src');
  wrapSetter(HTMLImageElement.prototype, 'srcset');
  wrapSetter(HTMLSourceElement.prototype, 'srcset');
  wrapSetter(HTMLVideoElement.prototype, 'poster');

  wrapSetter(Element.prototype, 'innerHTML', (root) => {
    for (const el of root.querySelectorAll('img, source, video')) {
      for (const attr of REWRITTEN) {
        const v = el.getAttribute(attr);
        if (v) el.setAttribute(attr, v);
      }
    }
  });
}
