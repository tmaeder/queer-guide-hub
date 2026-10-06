/**
 * Recognises the database refusing a DM because the two members are in a block
 * relationship (migration 99991791260404_dm_block_enforcement): either the
 * `get_or_create_direct_conversation` RPC ("cannot message this user") or the
 * restrictive `messages` INSERT policy. Both raise SQLSTATE 42501.
 *
 * The copy deliberately does not say WHO blocked whom — telling someone they
 * were blocked is itself a disclosure the blocker did not choose to make.
 */
export const BLOCKED_MESSAGE = "You can't message this member.";

export function isMessagingBlockedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code !== '42501' || typeof message !== 'string') return false;
  return (
    message.includes('cannot message this user') ||
    message.includes('Blocked users cannot send direct messages')
  );
}
