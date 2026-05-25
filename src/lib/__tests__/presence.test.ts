import { describe, it, expect } from 'vitest';
import {
  channelName,
  shouldBroadcast,
  DEFAULT_PRESENCE_VISIBILITY,
  type PresenceVisibility,
} from '../presence';

describe('channelName', () => {
  it('returns presence:global for global scope', () => {
    expect(channelName('global')).toBe('presence:global');
  });

  it('embeds id for group/conversation/discovery', () => {
    expect(channelName('group', 'g1')).toBe('presence:group:g1');
    expect(channelName('conversation', 'c1')).toBe('presence:conversation:c1');
    expect(channelName('discovery', 'city-1')).toBe('presence:discovery:city-1');
  });

  it('throws if id missing for scoped channels', () => {
    expect(() => channelName('group')).toThrow();
    expect(() => channelName('conversation')).toThrow();
    expect(() => channelName('discovery')).toThrow();
  });
});

describe('shouldBroadcast', () => {
  const off: PresenceVisibility = { ...DEFAULT_PRESENCE_VISIBILITY };
  const on: PresenceVisibility = {
    global_dot: true,
    in_directory: true,
    in_groups: true,
    in_discovery: true,
  };

  it('default visibility means no broadcasts (except conversations)', () => {
    expect(shouldBroadcast('global', off)).toBe(false);
    expect(shouldBroadcast('group', off)).toBe(false);
    expect(shouldBroadcast('discovery', off)).toBe(false);
    // Conversation participants are always present.
    expect(shouldBroadcast('conversation', off)).toBe(true);
  });

  it('respects per-scope flags when set', () => {
    expect(shouldBroadcast('global', on)).toBe(true);
    expect(shouldBroadcast('group', on)).toBe(true);
    expect(shouldBroadcast('discovery', on)).toBe(true);
  });

  it('null/undefined visibility means no broadcasts', () => {
    expect(shouldBroadcast('global', null)).toBe(false);
    expect(shouldBroadcast('global', undefined)).toBe(false);
  });
});
