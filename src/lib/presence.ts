// Supabase Realtime Presence helpers — channel naming + visibility gating.
//
// This module owns the channel-name contract and the privacy gate logic, so
// new presence-aware features (groups, conversations, discovery) all reach
// for the same primitives.

export type PresenceScope = 'global' | 'group' | 'conversation' | 'discovery';

export interface PresenceVisibility {
  global_dot: boolean;
  in_directory: boolean;
  in_groups: boolean;
  in_discovery: boolean;
}

export const DEFAULT_PRESENCE_VISIBILITY: PresenceVisibility = {
  global_dot: false,
  in_directory: false,
  in_groups: false,
  in_discovery: false,
};

export function channelName(scope: PresenceScope, id?: string): string {
  switch (scope) {
    case 'global':
      return 'presence:global';
    case 'group':
      if (!id) throw new Error('group presence requires a group id');
      return `presence:group:${id}`;
    case 'conversation':
      if (!id) throw new Error('conversation presence requires a conversation id');
      return `presence:conversation:${id}`;
    case 'discovery':
      if (!id) throw new Error('discovery presence requires a city id');
      return `presence:discovery:${id}`;
  }
}

/**
 * Decide whether the current user should *broadcast* their presence on a
 * given scope. Reading the channel (seeing others) is always allowed — only
 * appearing requires opt-in. This pairs with profile_status_v on the server:
 * even if a stale client broadcasts, other clients won't render a status
 * unless the row exists in the view.
 */
export function shouldBroadcast(
  scope: PresenceScope,
  visibility: PresenceVisibility | null | undefined,
): boolean {
  if (!visibility) return false;
  switch (scope) {
    case 'global':
      return Boolean(visibility.global_dot);
    case 'group':
      return Boolean(visibility.in_groups);
    case 'conversation':
      // Conversation presence is always-on for participants — the act of
      // being in a thread already implies presence to the other party.
      return true;
    case 'discovery':
      return Boolean(visibility.in_discovery);
  }
}
