/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const state = vi.hoisted(() => ({
  result: {} as Record<string, unknown>,
  user: { id: 'owner' } as { id: string } | null,
  share: vi.fn(),
}));

vi.mock('@/hooks/useWishlists', () => ({ useWishlistBySlug: () => state.result }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/hooks/useEntityImageAssets', () => ({
  useEntityImageAssets: () => ({ assets: new Map() }),
}));
vi.mock('@/lib/share', () => ({ shareOrCopy: state.share }));
vi.mock('@/components/marketplace/MarketplaceCard', () => ({
  MarketplaceCard: ({ listing }: { listing: { title: string } }) => (
    <article>{listing.title}</article>
  ),
}));

import Wishlist from '../Wishlist';

const base = {
  id: 'w1',
  user_id: 'owner',
  slug: 'saved-abc',
  title: 'Saved',
  description: null,
  visibility: 'private',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/wishlists/saved-abc']}>
      <Routes>
        <Route path="/wishlists/:slug" element={<Wishlist />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.user = { id: 'owner' };
  state.share.mockReset();
  state.result = {
    wishlist: base,
    listings: [{ id: 'l1', title: 'Pride mug' }],
    loading: false,
    notFound: false,
    failed: false,
    itemsFailed: false,
    retry: vi.fn(),
  };
});

describe('Wishlist', () => {
  it('explains who can open a private list and offers no share link', () => {
    renderPage();
    expect(
      screen.getByText(
        'Only you can open this list. Anyone else who follows the link sees a not-found page.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Share/ })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Add items from the marketplace' }).getAttribute('href'),
    ).toBe('/marketplace');
  });

  it('shares an unlisted list and says anyone with the link can open it', () => {
    state.result = { ...state.result, wishlist: { ...base, visibility: 'unlisted' } };
    renderPage();
    expect(screen.getByText(/Anyone with the link can open this list/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Share link' }));
    expect(state.share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved' }));
  });

  it('does not show owner controls or the access note to a visitor', () => {
    state.user = { id: 'someone-else' };
    state.result = { ...state.result, wishlist: { ...base, visibility: 'public' } };
    renderPage();
    expect(screen.queryByRole('link', { name: 'Add items from the marketplace' })).toBeNull();
    expect(screen.queryByText('Anyone can open this list.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Share link' })).toBeTruthy();
  });

  it('uses one message for missing and private lists', () => {
    state.result = { ...state.result, wishlist: null, notFound: true };
    renderPage();
    expect(screen.getByText('Wishlist not found')).toBeTruthy();
    expect(screen.getByText(/may be private or no longer exists/)).toBeTruthy();
  });

  it('tells a failed load apart from a missing list', () => {
    const retry = vi.fn();
    state.result = { ...state.result, wishlist: null, failed: true, retry };
    renderPage();
    expect(screen.getByText('This wishlist did not load')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('does not call a list empty when its items failed to load', () => {
    state.result = { ...state.result, listings: [], itemsFailed: true };
    renderPage();
    expect(screen.getByText('The items in this list did not load')).toBeTruthy();
    expect(screen.queryByText('No items yet.')).toBeNull();
  });
});
