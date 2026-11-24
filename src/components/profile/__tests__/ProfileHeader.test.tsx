/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/profile/TrustTierBadge', () => ({ TrustTierBadge: () => null }));
vi.mock('@/components/profile/UserRelationshipActions', () => ({
  UserRelationshipActions: () => null,
}));
vi.mock('@/components/messaging/StartConversationButton', () => ({
  StartConversationButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
vi.mock('@/components/profile/AvatarDisplay', () => ({ AvatarDisplay: () => <span>avatar</span> }));

import { ProfileHeader } from '../ProfileHeader';
import { trackForUser } from '@/components/transit/routeBulletMap';

const profile = {
  user_id: 'c7aef91f-774e-45d4-88ba-898994f76a36',
  username: 'sam',
  pronouns: 'they/them',
  location: 'Zürich',
};

describe('ProfileHeader', () => {
  it('gives each member a stable track of the four', () => {
    expect(trackForUser(profile.user_id)).toBe(trackForUser(profile.user_id));
    const seen = new Set(Array.from({ length: 40 }, (_, i) => trackForUser(`user-${i}`)));
    expect([...seen].sort()).toEqual(['blue', 'green', 'pink', 'yellow']);
  });

  it('draws the member’s line and lists their facts as stops', () => {
    const { container } = render(
      <MemoryRouter>
        <ProfileHeader profile={profile} isOwnProfile={false} />
      </MemoryRouter>,
    );
    const band = container.querySelector('[data-track]');
    expect(band?.getAttribute('data-track')).toBe(trackForUser(profile.user_id));
    expect(band).toHaveAttribute('aria-hidden', 'true');
    const stops = screen.getByRole('list', { name: 'About' });
    expect(stops.textContent).toContain('they/them');
    expect(stops.textContent).toContain('Zürich');
    expect(screen.getByRole('button', { name: 'Say hi' })).toBeTruthy();
  });
});
