/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updateProfile = vi.fn().mockResolvedValue({ error: null });
const toggleLookingFor = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: { vibe_emoji: '🌈', vibe_text: 'good day', looking_for: ['friends'] },
    updateProfile,
  }),
}));
vi.mock('@/hooks/useUserIntent', async () => {
  const actual =
    await vi.importActual<typeof import('@/hooks/useUserIntent')>('@/hooks/useUserIntent');
  return {
    LOOKING_FOR_OPTIONS: actual.LOOKING_FOR_OPTIONS,
    LOOKING_FOR_LABELS: actual.LOOKING_FOR_LABELS,
    useUserIntent: () => ({
      lookingFor: ['friends'],
      toggleLookingFor,
    }),
  };
});
vi.mock('@/components/messaging/EmojiPicker', () => ({
  EmojiPicker: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

import { StatusEditor } from '../StatusEditor';

describe('StatusEditor', () => {
  beforeEach(() => {
    updateProfile.mockClear();
    toggleLookingFor.mockClear();
  });

  it('renders both sections: vibe input and intent chips', () => {
    render(<StatusEditor />);
    expect(screen.getByPlaceholderText("What's your vibe?")).toBeTruthy();
    expect(screen.getByText('Looking for')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dating/ })).toBeTruthy();
    // Active chip is pressed
    expect(screen.getByRole('button', { name: /Friends/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('Save persists vibe without expiry and calls onDone', async () => {
    const onDone = vi.fn();
    render(<StatusEditor onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    const arg = updateProfile.mock.calls[0][0];
    expect(arg.vibe_text).toBe('good day');
    expect(arg.vibe_expires_at).toBeNull();
    expect(onDone).toHaveBeenCalled();
  });

  it('4h sets a future expiry', async () => {
    render(<StatusEditor />);
    fireEvent.click(screen.getByRole('button', { name: '4h' }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    const arg = updateProfile.mock.calls[0][0];
    expect(arg.vibe_expires_at).toBeTruthy();
    expect(new Date(arg.vibe_expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('Clear nulls all vibe fields', async () => {
    render(<StatusEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    expect(updateProfile.mock.calls[0][0]).toMatchObject({
      vibe_emoji: null,
      vibe_text: null,
      vibe_set_at: null,
      vibe_expires_at: null,
    });
  });

  it('chip toggle delegates to useUserIntent', () => {
    render(<StatusEditor />);
    fireEvent.click(screen.getByRole('button', { name: /Dating/ }));
    expect(toggleLookingFor).toHaveBeenCalledWith('dating');
  });
});
