/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('../TripChat', () => ({ TripChat: (p: { tripId: string }) => <div data-testid="chat">{p.tripId}</div> }));
vi.mock('../TripNotes', () => ({ TripNotes: (p: { tripId: string }) => <div data-testid="notes">{p.tripId}</div> }));
vi.mock('../TripPolls', () => ({ TripPolls: (p: { tripId: string }) => <div data-testid="polls">{p.tripId}</div> }));

import { CollaborationTab } from '../CollaborationTab';

describe('CollaborationTab', () => {
  it('defaults to the chat tab and shows TripChat with tripId', () => {
    render(<CollaborationTab tripId="t1" />);
    expect(screen.getByTestId('chat')).toHaveTextContent('t1');
  });

  it('renders notes + polls triggers', () => {
    render(<CollaborationTab tripId="t1" />);
    expect(screen.getByRole('tab', { name: /trips.collaborate.notes/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /trips.collaborate.polls/i })).toBeInTheDocument();
  });

  it('keyboard navigation switches active tab', async () => {
    render(<CollaborationTab tripId="t1" />);
    const chat = screen.getByRole('tab', { name: /trips.collaborate.chat/i });
    chat.focus();
    fireEvent.keyDown(chat, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /trips.collaborate.notes/i })).toHaveAttribute(
        'data-state',
        'active',
      ),
    );
  });
});
