/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({ isFavorited: () => false, toggleFavorite: vi.fn() }),
}));
vi.mock('@/hooks/useHaptics', () => ({ useHaptics: () => ({ trigger: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { FavoriteButton } from '../favorite-button';

describe('FavoriteButton', () => {
  it('renders', () => {
    const { container } = render(<FavoriteButton itemId="v1" type="venue" />);
    expect(container.querySelector('button')).toBeTruthy();
  });
});
