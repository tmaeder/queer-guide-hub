/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { GroupEventCard } from '../GroupEventCard';

const event = {
  id: 'e1',
  title: 'Event',
  description: '',
  start_date: new Date().toISOString(),
  end_date: null,
  location: '',
  user_attended: false,
  attendees_count: 0,
} as never;

describe('GroupEventCard', () => {
  it('renders', () => {
    const { container } = render(
      <GroupEventCard
        event={event}
        onJoinEvent={vi.fn()}
        onLeaveEvent={vi.fn()}
        isJoining={false}
        isLeaving={false}
        isDeleting={false}
        canManage={false}
      />,
    );
    expect(container).toBeTruthy();
  });
});
