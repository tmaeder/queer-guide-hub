/**
 * Recipient → team mailbox resolution.
 *
 * The team-inbox worker only accepts the small, fixed set of publicly-published
 * role addresses. Everything else is dropped (the apex catch-all + the per-user
 * travel-inbox worker own `{username}@queer.guide`; we must never swallow those).
 *
 * Pure + side-effect-free so it can be unit-tested without the worker runtime.
 */

/** The team inboxes we sync into Twenty. Extend here + add a CF routing rule. */
export const TEAM_LOCAL_PARTS = ['contact', 'support', 'legal', 'press'] as const;

export type TeamLocalPart = (typeof TEAM_LOCAL_PARTS)[number];

const TEAM_SET = new Set<string>(TEAM_LOCAL_PARTS);

/**
 * Resolve a recipient address to a team local-part, or null when it is not a
 * team inbox on this domain. A `+subaddress` tag is stripped
 * (`support+ticket@` → `support`).
 */
export function resolveTeamMailbox(toAddress: string, domain: string): TeamLocalPart | null {
  const at = toAddress.indexOf('@');
  if (at < 0) return null;
  let local = toAddress.slice(0, at).toLowerCase().trim();
  const host = toAddress.slice(at + 1).toLowerCase().trim();
  if (host !== domain.toLowerCase()) return null;
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (!TEAM_SET.has(local)) return null;
  return local as TeamLocalPart;
}
