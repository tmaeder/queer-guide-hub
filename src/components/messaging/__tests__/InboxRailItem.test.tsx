/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { InboxItem } from '@/hooks/useInboxFeed';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrVars?: string | Record<string, unknown>) => {
      if (typeof defaultOrVars === 'string') return defaultOrVars;
      if (defaultOrVars && typeof defaultOrVars === 'object' && 'defaultValue' in defaultOrVars) {
        return defaultOrVars.defaultValue as string;
      }
      return key;
    },
  }),
}));

import { InboxRailItem } from '../InboxRailItem';

const baseItem: InboxItem = {
  id: 'conv_1',
  kind: 'chat',
  subtype: 'direct',
  title: 'Alex',
  preview: 'hey!',
  avatar_url: null,
  ts: '2026-07-01T00:00:00Z',
  unread: false,
  open_target: '/hub/messages?conversation=1',
  other_user_id: 'u2',
  is_muted: false,
  is_pinned: false,
  is_archived: false,
  unread_count: 0,
  last_sender_is_me: false,
  last_message_subtype: 'text',
};

describe('InboxRailItem — match indicator', () => {
  it('does not show a Match tag for a regular chat', () => {
    render(<InboxRailItem item={baseItem} active={false} onSelect={() => {}} />);
    expect(screen.queryByText('Match')).toBeNull();
  });

  it('shows a Match tag for a match-subtype chat', () => {
    render(
      <InboxRailItem
        item={{ ...baseItem, subtype: 'match' }}
        active={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('Match')).toBeTruthy();
  });
});
