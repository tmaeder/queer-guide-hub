import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

/**
 * Since 20261110100000 every `cruising` venue is `safety_gated`, so RLS returns
 * nothing for an anonymous session. A chip that can only ever produce an empty
 * list reads as a broken filter, and naming cruising on a signed-out page
 * advertises it to precisely the audience the gate exists to keep it from.
 */

let mockUser: { id: string } | null = null;
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));

import { CategoryChips } from '../CategoryChips';

describe('CategoryChips — auth-gated categories', () => {
  beforeEach(() => {
    mockUser = null;
  });

  it('hides the cruising chip when signed out', () => {
    const { queryByText, getByText } = render(
      <CategoryChips category="" onCategoryClick={() => {}} />,
    );
    expect(queryByText('Cruising')).toBeNull();
    // A control: the rest of the vocabulary must still render, or this test
    // would pass just as well against a component that rendered nothing.
    expect(getByText('Bar')).toBeTruthy();
  });

  it('shows the cruising chip when signed in', () => {
    mockUser = { id: 'u1' };
    const { getByText } = render(<CategoryChips category="" onCategoryClick={() => {}} />);
    expect(getByText('Cruising')).toBeTruthy();
  });

  it('keeps the chip visible when it is the active filter', () => {
    // A shared or bookmarked ?category=cruising URL: dropping the selected chip
    // would leave the results filtered while the control vanished.
    const { getByText } = render(<CategoryChips category="cruising" onCategoryClick={() => {}} />);
    expect(getByText('Cruising')).toBeTruthy();
  });
});
