import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockStartConversation = vi.fn();
const mockNavigate = vi.fn();
const mockToast = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));

vi.mock('@/hooks/useMessaging', () => ({
  useMessaging: () => ({ startConversation: mockStartConversation }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual<any>('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { StartConversationButton } from '../StartConversationButton';

describe('StartConversationButton', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should render Send DM button for different user', () => {
    render(<StartConversationButton userId="other-user" />);
    expect(screen.getByText('Send DM')).toBeInTheDocument();
  });

  it('should not render for own profile', () => {
    const { container } = render(<StartConversationButton userId="me" />);
    expect(container.innerHTML).toBe('');
  });

  it('should start conversation and navigate on click', async () => {
    mockStartConversation.mockResolvedValue('conv-123');
    render(<StartConversationButton userId="other" userName="Alex" />);
    fireEvent.click(screen.getByText('Send DM'));
    await waitFor(() => expect(mockStartConversation).toHaveBeenCalledWith('other'));
    expect(mockNavigate).toHaveBeenCalledWith('/messages?conversation=conv-123');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Success' }));
  });

  it('should show error toast on failure', async () => {
    mockStartConversation.mockRejectedValue(new Error('fail'));
    render(<StartConversationButton userId="other" />);
    fireEvent.click(screen.getByText('Send DM'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    ));
  });

  it('should show loading text while starting', async () => {
    let resolve: any;
    mockStartConversation.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<StartConversationButton userId="other" />);
    fireEvent.click(screen.getByText('Send DM'));
    expect(screen.getByText('Sliding into DMs...')).toBeInTheDocument();
    resolve('conv-1');
  });
});
