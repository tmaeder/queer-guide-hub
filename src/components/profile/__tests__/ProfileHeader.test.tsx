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
const auth = vi.hoisted(() => ({ user: { id: 'viewer' } as { id: string } | null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }));
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

  it('puts who the member is before the contact actions and explains them', () => {
    auth.user = { id: 'viewer' };
    render(
      <MemoryRouter>
        <ProfileHeader profile={{ ...profile, bio: 'Hiking and zines.' }} isOwnProfile={false} />
      </MemoryRouter>,
    );
    const heading = screen.getByRole('heading', { level: 1, name: '@sam' });
    const sayHi = screen.getByRole('button', { name: 'Say hi' });
    const bio = screen.getByText('Hiking and zines.');
    // DOCUMENT_POSITION_FOLLOWING = 4: the action comes after identity and bio.
    expect(heading.compareDocumentPosition(sayHi) & 4).toBeTruthy();
    expect(bio.compareDocumentPosition(sayHi) & 4).toBeTruthy();
    expect(screen.getByText(/Say hi opens a private message now/)).toBeTruthy();
  });

  it('shows no contact actions to a signed-out visitor', () => {
    auth.user = null;
    render(
      <MemoryRouter>
        <ProfileHeader profile={profile} isOwnProfile={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Say hi' })).toBeNull();
    expect(screen.queryByText(/Say hi opens/)).toBeNull();
    auth.user = { id: 'viewer' };
  });
});
