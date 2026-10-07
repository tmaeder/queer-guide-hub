/**
 * WebGL2 availability check shared by every MapLibre map component.
 * MapLibre GL JS 6 requires WebGL2. Treating a WebGL1-only browser as
 * supported lets the guard pass and then makes the Map constructor throw from
 * an effect, outside React error boundaries. Callers should skip map init and
 * render their non-map fallback when this returns false.
 */
let cached: boolean | null = null;

export function isWebglSupported(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    cached = Boolean(gl);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }
  if (!cached) console.warn('WebGL2 not available — map disabled');
  return cached;
}
