const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const boundedString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 254;
export function parseCloudflareEmailEvent(raw: unknown) {
  if (
    !record(raw) || !record(raw.source) || !record(raw.payload) ||
    !record(raw.metadata)
  ) return null;
  const kinds = [
    "delivered",
    "deferred",
    "bounced",
    "failed",
    "rejected",
    "complained",
  ];
  const prefix = "cf.email.sending.message.";
  if (
    typeof raw.type !== "string" || !raw.type.startsWith(prefix) ||
    !kinds.includes(raw.type.slice(prefix.length)) ||
    raw.source.type !== "email.sending"
  ) return null;
  const p = raw.payload, at = raw.metadata.eventTimestamp;
  if (
    !boundedString(p.eventId) || !boundedString(p.messageId) ||
    !boundedString(p.recipient) || typeof at !== "string" ||
    !Number.isFinite(Date.parse(at))
  ) return null;
  return {
    p_event_id: p.eventId,
    p_provider_id: p.messageId,
    p_recipient: p.recipient,
    p_type: raw.type.slice(prefix.length),
    p_at: at,
    p_hard_bounce: record(p.bounce) && p.bounce.type === "hard",
    p_suppression: record(p.rejection) && p.rejection.reason === "suppressed",
  };
}
