/**
 * Ambient trip layer rollout stage.
 *
 * 1 — shared capture actions, authentication resume and instrumentation
 * 2 — Trip Dock, contextual Travel and the persistent Hub trip portfolio
 * 3 — URL-backed Plan / Prepare / Together workspace sections
 *
 * Release one is the safe floor because later UI depends on the shared capture
 * contract. Set VITE_AMBIENT_TRIP_RELEASE to 1, 2 or 3 at build time. Unknown
 * values fail closed to release one; the default is the fully shipped release.
 */
export type AmbientTripRelease = 1 | 2 | 3;

function readAmbientTripRelease(value: unknown): AmbientTripRelease {
  if (value === '1' || value === 1) return 1;
  if (value === '2' || value === 2) return 2;
  if (value === '3' || value === 3 || value === undefined || value === '') return 3;
  return 1;
}

export const AMBIENT_TRIP_RELEASE = readAmbientTripRelease(
  import.meta.env.VITE_AMBIENT_TRIP_RELEASE,
);

export const AMBIENT_TRIP_CONTEXT_ENABLED = AMBIENT_TRIP_RELEASE >= 2;
export const AMBIENT_TRIP_WORKSPACE_ENABLED = AMBIENT_TRIP_RELEASE >= 3;

export { readAmbientTripRelease };
