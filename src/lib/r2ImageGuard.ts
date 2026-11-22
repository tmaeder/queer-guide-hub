import { toR2ImageUrl, toR2SrcSet } from '@/utils/imageHost';

/**
 * The single browser choke point that keeps every `<img>`/`<picture>` load on
 * R2. React writes `src`/`srcset` through `setAttribute`, `new Image()` and
 * hand-written DOM code through the property setters — both are wrapped so an
 * external URL is rewritten to the img.queer.guide pull-through BEFORE the
 * browser starts fetching it. Covers all ~130 render sites without each one
 * having to remember. Not covered (handled at their call sites): CSS
 * `background-image` and HTML strings parsed via `innerHTML`.
 */
export function installR2ImageGuard(): void {
  if (typeof window === 'undefined' || (window as { __r2ImageGuard?: boolean }).__r2ImageGuard)
    return;
  (window as { __r2ImageGuard?: boolean }).__r2ImageGuard = true;

  const isImageEl = (el: Element) =>
    el instanceof HTMLImageElement || el instanceof HTMLSourceElement;
  const rewrite = (name: string, value: string) => {
    const n = name.toLowerCase();
    if (n === 'src') return toR2ImageUrl(value);
    if (n === 'srcset') return toR2SrcSet(value);
    return value;
  };

  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    return setAttribute.call(this, name, isImageEl(this) ? rewrite(name, String(value)) : value);
  };

  const wrap = (proto: object, prop: 'src' | 'srcset') => {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc?.set) return;
    Object.defineProperty(proto, prop, {
      ...desc,
      set(value: string) {
        desc.set!.call(this, rewrite(prop, String(value)));
      },
    });
  };
  wrap(HTMLImageElement.prototype, 'src');
  wrap(HTMLImageElement.prototype, 'srcset');
  wrap(HTMLSourceElement.prototype, 'srcset');
}
