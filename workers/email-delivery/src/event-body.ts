/** Native JSON envelopes can arrive decoded or as JSON text. Never double-encode them. */
export function encodeEventBody(body: unknown): string {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  if (typeof raw !== 'string' || raw.length > 32000) throw new Error('Invalid event body');
  const event: unknown = typeof body === 'string' ? JSON.parse(raw) : body;
  if (!event || typeof event !== 'object' || Array.isArray(event))
    throw new Error('Invalid event body');
  return JSON.stringify(event);
}
