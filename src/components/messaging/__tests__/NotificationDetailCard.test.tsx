/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { NotificationDetailCard } from '../NotificationDetailCard';

vi.mock('@/hooks/useSubmissionNotifMeta', () => ({
  useSubmissionNotifMeta: () => ({ data: null }),
}));

const item = {
  id: 'n1',
  kind: 'notification',
  subtype: 'submission_update',
  title: '6 submissions reviewed',
  preview: 'Your contributions have updates',
  avatar_url: null,
  ts: new Date().toISOString(),
  unread: true,
  open_target: '/me/contributions',
  other_user_id: null,
  is_muted: false,
  is_pinned: false,
  is_archived: false,
  unread_count: 1,
  last_sender_is_me: null,
  last_message_subtype: null,
} as const;

describe('NotificationDetailCard', () => {
  it('uses client-side links for internal notification targets', () => {
    render(
      <MemoryRouter>
        <NotificationDetailCard item={item} />
      </MemoryRouter>,
    );

    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('href', '/me/contributions');
    }
  });
});
