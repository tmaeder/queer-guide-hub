/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/components/posts/PostCard', () => ({ PostCard: () => null }));
vi.mock('@/components/posts/CreatePostDialog', () => ({ CreatePostDialog: () => null }));
vi.mock('@/hooks/useCommunityPosts', () => ({ useCommunityPosts: () => ({ posts: [], isLoading: false, fetchNextPage: vi.fn(), hasNextPage: false }) }));
vi.mock('@/components/layout/AuthGate', () => ({ AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/layout/PageLoadingState', () => ({ PageLoadingState: () => null }));
vi.mock('@/components/effects/ColourfulText', () => ({ ColourfulText: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/effects/SpotlightV2', () => ({ SpotlightV2: () => null }));

import Feed from '../Feed';

describe('Feed', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Feed /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
