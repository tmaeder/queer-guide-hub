/**
 * Prepend `https://` if the value lacks an http(s) protocol.
 * Returns the input unchanged for empty / non-string values.
 */
export function ensureProtocol(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
