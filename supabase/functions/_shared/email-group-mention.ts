/** Group mail accepts only persisted sources; caller-authored content is rejected. */
export function parseGroupMentionRequest(
  body: unknown,
): { action: "tick"; source_id?: string } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const item = body as Record<string, unknown>;
  if (
    Object.keys(item).some((key) => !["action", "source_id"].includes(key)) ||
    item.action !== "tick"
  ) return null;
  if (
    item.source_id !== undefined &&
    (typeof item.source_id !== "string" ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(item.source_id))
  ) return null;
  return item as { action: "tick"; source_id?: string };
}
