export const validInvitationId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
type InvitationRequest =
  | { action: "tick"; source_id?: string }
  | {
    action: "create";
    trip_id: string;
    username: string;
    role: "viewer" | "editor";
  }
  | { action: "respond"; invitation_id: string; decision: "accept" | "decline" }
  | { action: "revoke"; invitation_id: string };
export function parseTripInvitationRequest(
  value: unknown,
): InvitationRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const b = value as Record<string, unknown>;
  const keys = Object.keys(b);
  const only = (allowed: string[]) => keys.every((k) => allowed.includes(k));
  if (
    b.action === "tick" && only(["action", "source_id"]) &&
    (b.source_id === undefined || validInvitationId(b.source_id))
  ) return b as InvitationRequest;
  if (
    b.action === "create" && only(["action", "trip_id", "username", "role"]) &&
    validInvitationId(b.trip_id) && typeof b.username === "string" &&
    b.username.trim().length >= 2 && b.username.length <= 40 &&
    (b.role === "viewer" || b.role === "editor")
  ) return b as InvitationRequest;
  if (
    b.action === "respond" && only(["action", "invitation_id", "decision"]) &&
    validInvitationId(b.invitation_id) &&
    (b.decision === "accept" || b.decision === "decline")
  ) return b as InvitationRequest;
  if (
    b.action === "revoke" && only(["action", "invitation_id"]) &&
    validInvitationId(b.invitation_id)
  ) return b as InvitationRequest;
  return null;
}
