/**
 * Shared UUID helpers. Used to gate slug→id fallbacks (a slug that doesn't
 * resolve must not be sent as `id=eq.<slug>` against a uuid column — PostgREST
 * 400s) and to reject a UUID that has leaked into a `slug` field so we never
 * build a non-canonical `/type/<uuid>` detail link.
 */

/** Strict UUID v1–v5 shape. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a canonical UUID string. */
export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}
