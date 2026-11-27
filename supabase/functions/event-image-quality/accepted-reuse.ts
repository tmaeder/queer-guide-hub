// A changing population count does not change an accepted image-reuse finding.
// Keep this narrow: new evidence fields or different image bytes require review.
export function sameAcceptedReuseEvidence(previous: unknown, current: unknown): boolean {
  const valid = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const e = value as Record<string, unknown>
    return Object.keys(e).length === 3 && ['url', 'content_hash', 'event_count'].every((key) => Object.hasOwn(e, key)) &&
      typeof e.url === 'string' && e.url.startsWith('https://') &&
      typeof e.content_hash === 'string' && /^[a-f0-9]{64}$/.test(e.content_hash) &&
      typeof e.event_count === 'number' && Number.isSafeInteger(e.event_count) && e.event_count >= 10
  }
  return valid(previous) && valid(current) && previous.url === current.url && previous.content_hash === current.content_hash
}
