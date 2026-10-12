import { describe, expect, it } from 'vitest';
import { previewFilterProfile } from '../profileLens';

const accounts = ['public', 'community', 'friends', 'private'].map((visibility) => ({
  platform: 'website',
  url: `https://example.test/${visibility}`,
  visibility,
}));
const profile = {
  user_id: 'u1',
  privacy_settings: { contact_visibility: 'public' },
  social_accounts: accounts,
};

describe('profile social-account audience preview', () => {
  it('shows only public accounts to a public audience', () => {
    expect(previewFilterProfile(profile, 'public').social_accounts).toEqual([accounts[0]]);
  });
  it('includes community accounts for signed-in members, while keeping friends/private hidden', () => {
    expect(previewFilterProfile(profile, 'community').social_accounts).toEqual(
      accounts.slice(0, 2),
    );
  });
  it('applies the profile contact tier before each account tier', () => {
    expect(
      previewFilterProfile(
        { ...profile, privacy_settings: { contact_visibility: 'private' } },
        'public',
      ).social_accounts,
    ).toBeUndefined();
  });
  it('preserves the complete owner view', () => {
    expect(previewFilterProfile(profile, 'you')).toBe(profile);
  });
});
