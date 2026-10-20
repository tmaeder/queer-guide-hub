import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnBluesky, bskyPostUrl } from '../OnBluesky';

const mention = {
  at_uri: 'at://did:plc:abc/app.bsky.feed.post/3k',
  author_did: 'did:plc:abc',
  author_handle: 'alex.bsky.social',
  author_name: 'Alex',
  author_avatar: null,
  text: 'Great night at the bar',
  post_created_at: '2026-10-01T00:00:00Z',
};
const useMentions = vi.fn();
const moderation = new Map<string, { filter: boolean }>();

vi.mock('@/hooks/useBlueskyMentions', () => ({
  useBlueskyMentions: (...a: unknown[]) => useMentions(...a),
  useHideBlueskyMention: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useSocialModeration', () => ({ usePostModeration: () => moderation }));
vi.mock('@/hooks/useAdminRoles', () => ({
  useAdminRoles: () => ({ isAdmin: false, isModerator: false }),
}));

describe('OnBluesky', () => {
  it('links posts to bsky.app', () => {
    expect(bskyPostUrl(mention.at_uri)).toBe('https://bsky.app/profile/did:plc:abc/post/3k');
    expect(bskyPostUrl('https://x')).toBeNull();
  });

  it('renders posts with a link out', () => {
    useMentions.mockReturnValue({ data: [mention] });
    render(<OnBluesky entityType="venue" entityId="v1" />);
    expect(screen.getByRole('heading', { name: 'On Bluesky' })).toBeInTheDocument();
    expect(screen.getByText('Great night at the bar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View on Bluesky' })).toHaveAttribute(
      'rel',
      expect.stringContaining('nofollow'),
    );
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull();
  });

  it('renders nothing and does not even query for a gated entity', () => {
    useMentions.mockReturnValue({ data: [mention] });
    const { container } = render(<OnBluesky entityType="event" entityId="e1" gated />);
    expect(container).toBeEmptyDOMElement();
    expect(useMentions).toHaveBeenLastCalledWith('event', undefined);
  });

  it('drops posts the viewer has muted', () => {
    useMentions.mockReturnValue({ data: [mention] });
    moderation.set(mention.at_uri, { filter: true });
    const { container } = render(<OnBluesky entityType="venue" entityId="v1" />);
    expect(container).toBeEmptyDOMElement();
    moderation.clear();
  });
});
