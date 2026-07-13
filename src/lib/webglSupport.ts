/**
 * WebGL availability check shared by every MapLibre map component.
 * Headless browsers, bots and GPU-less environments can't create a WebGL
 * context; constructing `maplibregl.Map` there throws and takes down the
 * whole route via the ErrorBoundary. Callers should skip map init (and
 * render their non-map fallback) when this returns false.
 */
let cached: boolean | null = null;

export function isWebglSupported(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    cached = Boolean(gl);
  } catch {
    cached = false;
  }
  if (!cached) console.warn('WebGL not available — map disabled');
  return cached;
}
