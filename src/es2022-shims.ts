/**
 * Minimal ES2022 runtime shims for pre-2022 browsers.
 *
 * The build targets es2022 (vite.config.ts), and dependencies (maplibre-gl,
 * TanStack) call `.at()` / `Object.hasOwn` natively — older Safari/Chrome
 * sessions crashed with "t.entries.at is not a function" (recurring on the
 * feedback board). Import this FIRST in main.tsx.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function atShim(this: ArrayLike<unknown>, n: number): unknown {
  let i = Math.trunc(n) || 0;
  if (i < 0) i += this.length;
  if (i < 0 || i >= this.length) return undefined;
  return this[i];
}

const arrayLikes: Array<{ prototype: object }> = [Array, String];
if (typeof Uint8Array !== 'undefined') {
  // All typed arrays share one prototype ancestor.
  arrayLikes.push(Object.getPrototypeOf(Uint8Array) as { prototype: object });
}
for (const ctor of arrayLikes) {
  const proto = ctor.prototype as Record<string, unknown>;
  if (typeof proto.at !== 'function') {
    Object.defineProperty(proto, 'at', {
      value: atShim,
      writable: true,
      configurable: true,
    });
  }
}

if (typeof (Object as any).hasOwn !== 'function') {
  Object.defineProperty(Object, 'hasOwn', {
    value: (obj: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(obj, key),
    writable: true,
    configurable: true,
  });
}

export {};
