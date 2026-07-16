import { describe, it, expect } from 'vitest';
import { resolveTeamMailbox, TEAM_LOCAL_PARTS } from '../src/recipient';

const DOMAIN = 'queer.guide';

describe('resolveTeamMailbox', () => {
  it('accepts each configured team address', () => {
    for (const lp of TEAM_LOCAL_PARTS) {
      expect(resolveTeamMailbox(`${lp}@${DOMAIN}`, DOMAIN)).toBe(lp);
    }
  });

  it('is case-insensitive', () => {
    expect(resolveTeamMailbox('Support@Queer.Guide', DOMAIN)).toBe('support');
  });

  it('strips +subaddress tags', () => {
    expect(resolveTeamMailbox('support+ticket-42@queer.guide', DOMAIN)).toBe('support');
  });

  it('drops non-team local parts (usernames, system, unknown)', () => {
    for (const addr of ['tobias@queer.guide', 'noreply@queer.guide', 'random@queer.guide']) {
      expect(resolveTeamMailbox(addr, DOMAIN)).toBeNull();
    }
  });

  it('drops other domains', () => {
    expect(resolveTeamMailbox('support@example.com', DOMAIN)).toBeNull();
  });

  it('handles malformed input', () => {
    expect(resolveTeamMailbox('not-an-email', DOMAIN)).toBeNull();
    expect(resolveTeamMailbox('', DOMAIN)).toBeNull();
  });
});
