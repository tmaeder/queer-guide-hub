/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({
  preferences: { post_likes: true, post_comments: false, post_mentions: true },
  setPreference: vi.fn(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k }),
}));
vi.mock('@/hooks/useInboxPreferences', () => ({
  useInboxPreferences: () => ({ ...state, isLoading: false, error: null }),
}));

import { InboxPostSettings } from '../InboxPostSettings';

describe('InboxPostSettings', () => {
  it('shows each setting as saved', () => {
    render(<InboxPostSettings />);
    expect(screen.getByRole('switch', { name: 'Likes on my posts' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Comments on my posts' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
  it('saves the one setting that was switched', () => {
    render(<InboxPostSettings />);
    fireEvent.click(screen.getByRole('switch', { name: 'Mentions and replies' }));
    expect(state.setPreference).toHaveBeenCalledWith({ post_mentions: false });
  });
});
