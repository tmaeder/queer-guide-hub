/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
vi.mock('@/components/profile/ActivityStrip', () => ({ ActivityStrip: () => <div>ACTIVITY</div> }));
vi.mock('@/components/profile/SocialSummaryRow', () => ({ SocialSummaryRow: () => null }));
vi.mock('@/components/profile/SecureProfileViewer', () => ({ SecureProfileViewer: () => null }));
vi.mock('@/components/profile/GapPromptCard', () => ({ GapPromptCard: () => null }));
vi.mock('@/components/profile/CompletionNudge', () => ({ CompletionNudge: () => null }));
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
});
