/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
vi.mock('@/components/profile/ActivityStrip', () => ({ ActivityStrip: () => <div>ACTIVITY</div> }));
vi.mock('@/components/profile/SocialSummaryRow', () => ({ SocialSummaryRow: () => null }));
vi.mock('@/components/profile/SecureProfileViewer', () => ({ SecureProfileViewer: () => null }));
vi.mock('@/components/profile/PhotoGallery', () => ({ PhotoGallery: () => null }));
vi.mock('@/components/profile/BodyProfileCard', () => ({ BodyProfileCard: () => null }));
vi.mock('@/components/profile/GapPromptCard', () => ({ GapPromptCard: () => null }));
vi.mock('@/components/messaging/StartConversationButton', () => ({
  StartConversationButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
import { OverviewTab } from '../OverviewTab';
const profile = { user_id: 'u1', privacy_settings: { activity_visibility: 'private' } };

describe('activity audience preview', () => {
  it('hides private activity from the owner’s public preview', () => {
    render(
      <MemoryRouter>
        <OverviewTab profile={profile} isOwnProfile lens="public" />
      </MemoryRouter>,
    );
    expect(screen.queryByText('ACTIVITY')).toBeNull();
  });
  it('keeps the owner’s own activity visible', () => {
    render(
      <MemoryRouter>
        <OverviewTab profile={profile} isOwnProfile lens="you" />
      </MemoryRouter>,
    );
    expect(screen.getByText('ACTIVITY')).toBeTruthy();
  });
  it('leaves other profiles’ activity to the server-enforced visibility gate', () => {
    render(
      <MemoryRouter>
        <OverviewTab profile={profile} isOwnProfile={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText('ACTIVITY')).toBeTruthy();
  });
  it('says when a member has no bio', () => {
    render(
      <MemoryRouter>
        <OverviewTab profile={{ ...profile, username: 'sam' }} isOwnProfile={false} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/hasn’t written a bio yet. Say hi and ask./)).toBeTruthy();
  });
  it('does not tell owners their own bio is missing this way', () => {
    render(
      <MemoryRouter>
        <OverviewTab profile={profile} isOwnProfile lens="you" />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/hasn’t written a bio/)).toBeNull();
  });
});
